// Same interface as jira.js, backed by the signed-in user's Atlassian MCP session.
const mcp = require('./mcp');

const DONE_RE = /done|closed|cancel|resolved|complete|released/i;
const FIELDS = ['summary', 'status', 'issuetype', 'priority', 'assignee', 'duedate', 'created', 'updated', 'description'];

function shape(issue, baseUrl) {
  const f = issue.fields || {};
  const status = f.status?.name;
  return {
    key: issue.key,
    url: `${baseUrl}/browse/${issue.key}`,
    summary: f.summary,
    type: f.issuetype?.name,
    status,
    statusCategory: f.status?.statusCategory?.name || (status && DONE_RE.test(status) ? 'Done' : 'In Progress'),
    priority: f.priority?.name,
    assignee: f.assignee?.displayName || 'Unassigned',
    dueDate: f.duedate,
    created: f.created,
    updated: f.updated,
    description: typeof f.description === 'string' ? f.description.trim().slice(0, 2000) : '',
  };
}

function forSession(s) {
  return {
    async search(jql, max = 100) {
      const cloud = await mcp.cloudOf(s);
      const data = await mcp.callTool(s, 'searchJiraIssuesUsingJql', { cloudId: cloud.id, jql, fields: FIELDS, maxResults: max });
      return { issues: (data.issues || []).map((i) => shape(i, cloud.url)), truncated: data.isLast === false };
    },
    async count(jql) {
      const cloud = await mcp.cloudOf(s);
      const data = await mcp.callTool(s, 'searchJiraIssuesUsingJql', { cloudId: cloud.id, jql, maxResults: 1, searchResultMode: 'all' });
      return data.totalCount ?? 0;
    },
    async listProjects() {
      const data = await mcp.callOperation(s, 'listJiraProjects', { maxResults: 100 });
      const list = Array.isArray(data) ? data : data.projects || data.values || [];
      return list.map((p) => ({ key: p.key, name: p.name }));
    },
    async lookupUsers(query) {
      const data = await mcp.callOperation(s, 'lookupJiraAccountId', { query, maxResults: 10 });
      const list = Array.isArray(data) ? data : data.users || data.results || data.values || [];
      return list.filter((u) => u.accountId && u.active !== false).map((u) => ({ accountId: u.accountId, displayName: u.displayName }));
    },
    async getIssue(key) {
      const data = await mcp.callOperation(s, 'getJiraIssue', { issueIdOrKey: key });
      const cloud = await mcp.cloudOf(s);
      return shape(data.issue ?? data, cloud.url);
    },
  };
}

module.exports = { forSession };
