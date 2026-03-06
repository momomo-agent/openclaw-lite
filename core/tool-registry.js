// core/tool-registry.js — Pluggable tool system
// Tools are loaded from tools/ directory, each exports { name, type, definition, execute }

const fs = require('fs');
const path = require('path');

/** @type {Map<string, {name: string, type: string, definition: object, execute: function, start?: function, stop?: function, isRunning?: function}>} */
const tools = new Map();

/**
 * Register a single tool module.
 * @param {object} toolModule - { name, type, definition, execute, [start], [stop], [isRunning] }
 */
function register(toolModule) {
  if (!toolModule?.name || !toolModule?.definition || !toolModule?.execute) {
    console.warn('[tool-registry] Invalid tool module, skipping:', toolModule?.name || 'unknown');
    return;
  }
  if (tools.has(toolModule.name)) {
    console.warn(`[tool-registry] Overwriting tool: ${toolModule.name}`);
  }
  tools.set(toolModule.name, toolModule);
}

/**
 * Load all tool modules from a directory.
 * Each .js file should export a tool module object.
 * @param {string} toolsDir - Absolute path to tools/ directory
 * @returns {number} Number of tools loaded
 */
function loadAll(toolsDir) {
  if (!fs.existsSync(toolsDir)) return 0;
  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.js'));
  let count = 0;
  for (const file of files) {
    try {
      const mod = require(path.join(toolsDir, file));
      if (mod?.name && mod?.definition) {
        register(mod);
        count++;
      }
    } catch (err) {
      console.error(`[tool-registry] Failed to load ${file}:`, err.message);
    }
  }
  console.log(`[tool-registry] Loaded ${count} tools from ${toolsDir}`);
  return count;
}

/**
 * Get Anthropic-format tool definitions array.
 * @param {Set<string>} [allowedNames] - If provided, only include these tools
 * @returns {Array<object>}
 */
function getDefinitions(allowedNames) {
  const defs = [];
  for (const [name, tool] of tools) {
    if (!allowedNames || allowedNames.has(name)) {
      defs.push(tool.definition);
    }
  }
  return defs;
}

/**
 * Execute a tool by name.
 * @param {string} name - Tool name
 * @param {object} input - Tool input parameters
 * @param {object} context - { clawDir, sessionId, agentName, mainWindow, config, sessionStore }
 * @returns {Promise<string>} Tool result as string
 */
async function execute(name, input, context) {
  const tool = tools.get(name);
  if (!tool) return `Error: Unknown tool "${name}"`;
  try {
    return await tool.execute(input, context);
  } catch (err) {
    console.error(`[tool-registry] Error executing ${name}:`, err.message);
    return `Error: ${err.message}`;
  }
}

/**
 * Check if a tool exists.
 */
function has(name) {
  return tools.has(name);
}

/**
 * Get a specific tool module.
 */
function get(name) {
  return tools.get(name);
}

/**
 * Stop all persistent tools (call on app quit).
 */
async function stopAll() {
  for (const [name, tool] of tools) {
    if (tool.type === 'persistent' && typeof tool.stop === 'function') {
      try {
        console.log(`[tool-registry] Stopping persistent tool: ${name}`);
        await tool.stop();
      } catch (err) {
        console.error(`[tool-registry] Error stopping ${name}:`, err.message);
      }
    }
  }
}

/**
 * Get count of registered tools.
 */
function count() {
  return tools.size;
}

module.exports = { register, loadAll, getDefinitions, execute, has, get, stopAll, count };
