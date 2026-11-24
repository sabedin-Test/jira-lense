// Confluence search through the signed-in user's Atlassian MCP session.
const mcp = require('./mcp');
const { shape } = require('./confluence');

function forSession(s) {
  return {
    async search(cql, limit = 25) {
      const cloud = await mcp.cloudOf(s);
      const data = await mcp.callTool(s, 'searchConfluence', { cloudId: cloud.id, cql, limit, expand: 'space' });
      return shape(data, `${cloud.url}/wiki`);
    },
  };
}

module.exports = { forSession };
