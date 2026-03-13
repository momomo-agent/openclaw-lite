// tools/index.js — Load all tools
require('./web-fetch');
require('./web-download');
require('./file-ops');
require('./edit');
require('./exec');
require('./search');
require('./skill');
require('./skill-install');
require('./skill-create');
require('./notify');
require('./ui-status');
require('./memory');
require('./tasks');
require('./agents');
require('./claude-code');
require('./cron');
require('./mcp-config');
require('./session-title');

const { getAllTools, getTool, getAnthropicTools, getToolsPrompt } = require('./registry');

module.exports = {
  getAllTools,
  getTool,
  getAnthropicTools,
  getToolsPrompt
};
