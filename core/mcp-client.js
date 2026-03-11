// core/mcp-client.js — MCP Native Client (Paw-specific, OpenClaw config-aligned)
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

class McpManager {
  constructor() {
    this._clients = new Map();  // serverName -> { client, transport, status, tools }
  }

  /**
   * Validate MCP server config (OpenClaw-aligned isMcpServerConfig)
   */
  _validateConfig(name, cfg) {
    if (!cfg || typeof cfg !== 'object') return `${name}: config must be an object`;
    if (!cfg.command || typeof cfg.command !== 'string') return `${name}: command is required (string)`;
    if (cfg.args !== undefined && !Array.isArray(cfg.args)) return `${name}: args must be string[]`;
    if (cfg.env !== undefined && (typeof cfg.env !== 'object' || Array.isArray(cfg.env))) {
      return `${name}: env must be Record<string, string>`;
    }
    return null;
  }

  /**
   * Connect to all configured MCP servers
   * @param {Object} mcpServers - { serverName: { command, args?, env? } }
   */
  async connectAll(mcpServers) {
    if (!mcpServers || typeof mcpServers !== 'object') return;

    const entries = Object.entries(mcpServers);
    for (const [name, cfg] of entries) {
      const err = this._validateConfig(name, cfg);
      if (err) {
        console.warn(`[MCP] Invalid config: ${err}`);
        continue;
      }

      try {
        await this._connectServer(name, cfg);
      } catch (e) {
        console.warn(`[MCP] Failed to connect ${name}: ${e.message}`);
        this._clients.set(name, { client: null, transport: null, status: 'error', error: e.message, tools: [] });
      }
    }
  }

  async _connectServer(name, cfg) {
    const env = { ...process.env, ...(cfg.env || {}) };

    const transport = new StdioClientTransport({
      command: cfg.command,
      args: cfg.args || [],
      env,
    });

    const client = new Client({
      name: 'paw',
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    await client.connect(transport);

    // List tools from this server
    let tools = [];
    try {
      const result = await client.listTools();
      tools = (result.tools || []).map(t => ({
        serverName: name,
        originalName: t.name,
        // OpenClaw-aligned: mcp__{serverName}__{toolName}, a-z0-9._- max 128
        name: `mcp__${name}__${t.name}`.slice(0, 128),
        description: `[MCP: ${name}] ${t.description || t.name}`,
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      }));
    } catch (e) {
      console.warn(`[MCP] Failed to list tools from ${name}: ${e.message}`);
    }

    this._clients.set(name, { client, transport, status: 'connected', tools });
    console.log(`[MCP] Connected: ${name} (${tools.length} tools)`);
  }

  /**
   * Get all MCP tools in Anthropic format
   * @returns {Array} tool definitions
   */
  listTools() {
    const tools = [];
    for (const [, info] of this._clients) {
      if (info.status === 'connected' && info.tools) {
        for (const t of info.tools) {
          tools.push({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
          });
        }
      }
    }
    return tools;
  }

  /**
   * Call a tool on the appropriate MCP server
   * @param {string} fullName - mcp__{serverName}__{toolName}
   * @param {Object} args - tool arguments
   * @returns {string} result
   */
  async callTool(fullName, args) {
    // Parse mcp__{serverName}__{toolName}
    const match = fullName.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/);
    if (!match) return `Error: Invalid MCP tool name: ${fullName}`;

    // Find the server by looking up registered tools
    for (const [serverName, info] of this._clients) {
      if (info.status !== 'connected') continue;
      const tool = info.tools.find(t => t.name === fullName);
      if (tool) {
        try {
          const result = await info.client.callTool({ name: tool.originalName, arguments: args });
          // MCP returns { content: [{type, text}] }
          if (result.content && Array.isArray(result.content)) {
            return result.content.map(c => c.text || JSON.stringify(c)).join('\n');
          }
          return JSON.stringify(result);
        } catch (e) {
          return `MCP tool error (${serverName}/${tool.originalName}): ${e.message}`;
        }
      }
    }

    return `Error: MCP tool not found: ${fullName}`;
  }

  /**
   * Check if a tool name is an MCP tool
   */
  isMcpTool(name) {
    return name.startsWith('mcp__');
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll() {
    for (const [name, info] of this._clients) {
      try {
        if (info.transport) {
          await info.transport.close();
        }
      } catch (e) {
        console.warn(`[MCP] Error disconnecting ${name}: ${e.message}`);
      }
    }
    this._clients.clear();
  }

  /**
   * Get status of all servers
   */
  getStatus() {
    const status = {};
    for (const [name, info] of this._clients) {
      status[name] = {
        status: info.status,
        toolCount: info.tools?.length || 0,
        error: info.error || null,
      };
    }
    return status;
  }

  /**
   * Reconnect: disconnect all then connect with new config
   */
  async reconnect(mcpServers) {
    await this.disconnectAll();
    await this.connectAll(mcpServers);
  }
}

module.exports = { McpManager };
