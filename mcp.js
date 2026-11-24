// Per-user Atlassian MCP connection using OAuth 2.1 (discovery, dynamic client registration, PKCE) via the MCP SDK.
const { randomUUID } = require('node:crypto');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { UnauthorizedError } = require('@modelcontextprotocol/sdk/client/auth.js');

const MCP_URL = process.env.ATLASSIAN_MCP_URL || 'https://mcp.atlassian.com/v2/mcp';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const sessions = new Map();
let registeredClient; // Dynamic registration is done once per app, not per user.

function redirectUrl() {
  return `${process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`}/auth/callback`;
}

function getSession(sid) {
  const s = sid && sessions.get(sid);
  if (s && Date.now() - s.touched < SESSION_TTL_MS) { s.touched = Date.now(); return s; }
  if (s) sessions.delete(sid);
  return null;
}

function createSession() {
  const sid = randomUUID();
  const s = { sid, touched: Date.now(), tokens: undefined, client: null, transport: null, authUrl: null, oauthState: null, verifier: null, cloud: null };
  sessions.set(sid, s);
  return s;
}

function destroySession(sid) {
  const s = sessions.get(sid);
  s?.client?.close().catch(() => {});
  sessions.delete(sid);
}

function providerFor(s) {
  return {
    get redirectUrl() { return redirectUrl(); },
    get clientMetadata() {
      return {
        client_name: 'Jira Lense',
        redirect_uris: [redirectUrl()],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      };
    },
    state() { s.oauthState = randomUUID(); return s.oauthState; },
    clientInformation: () => registeredClient,
    saveClientInformation: (info) => { registeredClient = info; },
    tokens: () => s.tokens,
    saveTokens: (t) => { s.tokens = t; },
    redirectToAuthorization: (url) => { s.authUrl = url.toString(); },
    saveCodeVerifier: (v) => { s.verifier = v; },
    codeVerifier: () => s.verifier,
    invalidateCredentials: (scope) => { if (scope === 'all' || scope === 'tokens') s.tokens = undefined; },
  };
}

async function connect(s) {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: providerFor(s) });
  const client = new Client({ name: 'jira-lense', version: '0.1.0' });
  try {
    await client.connect(transport);
    s.client = client;
    s.transport = transport;
    return { authenticated: true };
  } catch (e) {
    if (!(e instanceof UnauthorizedError)) throw e;
    s.transport = transport;
    return { authenticated: false, authUrl: s.authUrl };
  }
}

async function finishLogin(s, code, state) {
  if (!code || !s.oauthState || state !== s.oauthState) throw Object.assign(new Error('Invalid OAuth state.'), { status: 400 });
  s.oauthState = null;
  await s.transport.finishAuth(code);
  return connect(s);
}

async function callTool(s, name, args) {
  if (!s.client) throw Object.assign(new Error('Sign in with Atlassian first.'), { status: 401, loginRequired: true });
  let r;
  try {
    r = await s.client.callTool({ name, arguments: args });
  } catch (e) {
    if (e instanceof UnauthorizedError) { s.client = null; throw Object.assign(new Error('Session expired. Sign in again.'), { status: 401, loginRequired: true }); }
    throw e;
  }
  const text = r.content?.find((c) => c.type === 'text')?.text;
  if (r.isError) throw new Error(text || 'Atlassian tool call failed.');
  const parsed = JSON.parse(text);
  return parsed.data ?? parsed;
}

async function cloudOf(s) {
  if (s.cloud) return s.cloud;
  const { resources = [] } = await callTool(s, 'getAccessibleAtlassianResources', {});
  const want = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
  const hit = resources.find((r) => r.url === want) || resources[0];
  if (!hit) throw new Error('No accessible Atlassian site for this account.');
  s.cloud = { id: hit.cloudId, url: hit.url };
  return s.cloud;
}

// Calls a catalog operation directly if the server exposes it as a tool, otherwise through executeRead.
async function callOperation(s, name, inputs) {
  const cloud = await cloudOf(s);
  s.directOps = s.directOps || {};
  if (s.directOps[name] !== false) {
    try {
      const out = await callTool(s, name, { cloudId: cloud.id, ...inputs });
      s.directOps[name] = true;
      return out;
    } catch (e) {
      if (e.loginRequired || s.directOps[name] === true || !/not found|unknown tool|no such tool|-3260[12]/i.test(e.message)) throw e;
      s.directOps[name] = false;
    }
  }
  return callTool(s, 'executeRead', { name, cloudId: cloud.id, inputs });
}

module.exports = { getSession, createSession, destroySession, connect, finishLogin, callTool, callOperation, cloudOf };
