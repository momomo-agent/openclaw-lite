// tools/index.js — Load all tools
require('./web-fetch');
require('./file-ops');
require('./edit');
require('./exec');
require('./search');
require('./skill');
require('./skill-install');
require('./notify');
require('./ui-status');
require('./memory');
require('./tasks');
require('./agents');
require('./claude-code');

const { getAllTools, getTool, getAnthropicTools, getToolsPrompt } = require('./registry');

module.exports = {
  getAllTools,
  getTool,
  getAnthropicTools,
  getToolsPrompt
};
