// Jira Cloud client. Only reads: GETs, plus the POST-only approximate-count query.
const FIELDS = ['summary', 'status', 'issuetype', 'priority', 'assignee', 'duedate', 'created', 'updated', 'resolutiondate', 'description'];

function config() {
  const base = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) throw new Error('Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env');
  return { base, auth: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64') };
}

async function jiraGet(path, params = {}) {
  const { base, auth } = config();
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(res.status === 404 ? 'Not found, or you do not have permission to view it.' : `Jira returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  const inner = (node.content || []).map(adfToText).join(node.type === 'doc' ? '\n' : '');
  return ['paragraph', 'listItem', 'heading'].includes(node.type) ? inner + '\n' : inner;
}

function shape(issue) {
  const f = issue.fields || {};
  return {
    key: issue.key,
    url: `${config().base}/browse/${issue.key}`,
    summary: f.summary,
    type: f.issuetype?.name,
    status: f.status?.name,
    statusCategory: f.status?.statusCategory?.name,
    priority: f.priority?.name,
    assignee: f.assignee?.displayName || 'Unassigned',
    dueDate: f.duedate,
    created: f.created,
    updated: f.updated,
    description: adfToText(f.description).trim().slice(0, 2000),
  };
}

async function search(jql, max = 100) {
  const data = await jiraGet('/rest/api/3/search/jql', { jql, fields: FIELDS.join(','), maxResults: String(max) });
  const issues = (data.issues || []).map(shape);
  return { issues, truncated: data.isLast === false };
}

async function getIssue(key) {
  return shape(await jiraGet(`/rest/api/3/issue/${encodeURIComponent(key)}`, { fields: FIELDS.join(',') }));
}

module.exports = {
  search,
  getIssue,
  async lookupUsers(query) {
    const users = await jiraGet('/rest/api/3/user/search', { query, maxResults: '10' });
    return users.filter((u) => u.accountType !== 'app' && u.active !== false).map((u) => ({ accountId: u.accountId, displayName: u.displayName }));
  },
  async count(jql) {
    const { base, auth } = config();
    const res = await fetch(`${base}/rest/api/3/search/approximate-count`, {
      method: 'POST',
      headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql }),
    });
    if (!res.ok) throw Object.assign(new Error(`Jira returned ${res.status}`), { status: res.status });
    return (await res.json()).count;
  },
  async listProjects() {
    const data = await jiraGet('/rest/api/3/project/search', { maxResults: '100' });
    return (data.values || []).map((p) => ({ key: p.key, name: p.name }));
  },
};
