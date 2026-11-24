// Confluence Cloud search (REST, shared-token mode) plus helpers shared with the MCP adapter.
const ENTITIES = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s = '') => s.replace(/&(quot|amp|lt|gt|nbsp|#39);/g, (m) => ENTITIES[m]);

const STOP = new Set(('i me my we our you your want wanna need like to see show find search look looking for get give tell about on in of the a an and or is are was were be been what whats where which who how do does did can could would should please any all some there their with from that this it its at by as into has have had document documents doc docs page pages file files confluence related regarding information info details latest').split(' '));

function extractTerms(query) {
  const words = String(query).toLowerCase().replace(/["\u201c\u201d?!.,;:()]/g, ' ').split(/\s+/).filter(Boolean);
  const keep = words.filter((w) => !STOP.has(w) && w.length > 1);
  return [...new Set(keep.length ? keep : words)].slice(0, 6);
}

const esc = (s) => s.replace(/(["\\])/g, '\\$1');

const SCOPES = { all: 'page, blogpost, attachment', pages: 'page, blogpost', files: 'attachment' };

// strict = every keyword must appear (title or text); relaxed = any keyword.
function buildCql(query, scope = 'all') {
  const terms = extractTerms(query);
  if (!terms.length) return null;
  const types = SCOPES[scope] || SCOPES.all;
  const hit = (t) => `(title ~ "${esc(t)}" OR text ~ "${esc(t)}")`;
  return {
    terms,
    term: terms.join(' '),
    cql: `type in (${types}) AND ${terms.map(hit).join(' AND ')}`,
    relaxedCql: `type in (${types}) AND (${terms.map(hit).join(' OR ')})`,
  };
}

// Title matches count most, then pages over files, then excerpt matches.
function rank(results, terms) {
  const count = (text, t) => (text.toLowerCase().includes(t) ? 1 : 0);
  const scored = results.map((r, i) => {
    const inTitle = terms.reduce((n, t) => n + count(r.title, t), 0);
    const inText = terms.reduce((n, t) => n + count(r.excerpt, t), 0);
    const score = inTitle * 5 + inText + (r.type === 'attachment' ? 0 : 2) + (inTitle === terms.length ? 10 : 0);
    return { r, score, i };
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.r);
}

const safeUrl = (base, path) => {
  const url = path?.startsWith('http') ? path : `${base}${path || ''}`;
  return /^https:\/\//.test(url) ? url : null;
};

function shape(data, wikiBase) {
  const base = data._links?.base || wikiBase;
  return {
    total: data.totalSize ?? data.size ?? 0,
    results: (data.results || []).map((r) => ({
      id: r.content?.id,
      type: r.content?.type || r.entityType || 'content',
      title: decode(r.title),
      excerpt: decode(r.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 320),
      space: r.resultGlobalContainer?.title,
      url: safeUrl(base, r.url || r.content?._links?.webui),
      modified: r.lastModified,
    })),
  };
}

function config() {
  const base = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) throw new Error('Confluence is not configured. Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env');
  return { base: `${base}/wiki`, auth: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64') };
}

async function search(cql, limit = 25) {
  const { base, auth } = config();
  const url = new URL(`${base}/rest/api/search`);
  url.searchParams.set('cql', cql);
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
  if (!res.ok) throw Object.assign(new Error(`Confluence returned ${res.status}`), { status: res.status });
  return shape(await res.json(), base);
}

module.exports = { search, buildCql, shape, rank };
