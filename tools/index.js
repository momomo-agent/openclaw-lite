// tools/index.js — Load all tools
require('./web-fetch');
require('./file-ops');
require('./exec');
require('./search');
require('./skill');
require('./skill-install');
require('./notify');
require('./ui-status');
require('./memory');
require('./tasks');
require('./agents');

const { getAllTools, getTool, getAnthropicTools, getToolsPrompt } = require('./registry');

module.exports = {
  getAllTools,
  getTool,
  getAnthropicTools,
  getToolsPrompt
};
