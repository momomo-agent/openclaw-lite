// tools/index.js — 加载所有工具
require('./web-fetch');
require('./file-ops');
require('./exec');
require('./search');
require('./skill');
require('./skill-install');

const { getAllTools, getTool, getAnthropicTools, getToolsPrompt } = require('./registry');

module.exports = {
  getAllTools,
  getTool,
  getAnthropicTools,
  getToolsPrompt
};
