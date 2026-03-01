// tools/registry.js — 统一工具注册机制
const tools = new Map();

/**
 * Tool 定义
 * @typedef {Object} Tool
 * @property {string} name - 工具名称
 * @property {string} description - 工具描述（注入 prompt）
 * @property {Object} parameters - JSON Schema 参数定义
 * @property {Function} handler - 工具执行函数 async (args, context) => result
 */

/**
 * 注册工具
 * @param {Tool} tool
 */
function registerTool(tool) {
  if (!tool.name || !tool.description || !tool.handler) {
    throw new Error('Tool must have name, description, and handler');
  }
  tools.set(tool.name, tool);
}

/**
 * 获取所有工具
 * @returns {Tool[]}
 */
function getAllTools() {
  return Array.from(tools.values());
}

/**
 * 获取工具
 * @param {string} name
 * @returns {Tool|undefined}
 */
function getTool(name) {
  return tools.get(name);
}

/**
 * 生成 Anthropic tool schema
 * @returns {Array}
 */
function getAnthropicTools() {
  return getAllTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters || { type: 'object', properties: {} }
  }));
}

/**
 * 生成工具描述（用于 system prompt）
 * @returns {string}
 */
function getToolsPrompt() {
  const toolList = getAllTools();
  if (toolList.length === 0) return '';
  
  return `## Available Tools

You have access to the following tools:

${toolList.map(tool => `- **${tool.name}**: ${tool.description}`).join('\n')}

Use these tools to help the user accomplish their tasks.`;
}

module.exports = {
  registerTool,
  getAllTools,
  getTool,
  getAnthropicTools,
  getToolsPrompt
};
