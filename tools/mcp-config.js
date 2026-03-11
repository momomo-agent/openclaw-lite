// tools/mcp-config.js — MCP server management tool (Paw-specific enhancement)
// Allows agent to add/remove/update MCP servers via conversation
const { registerTool } = require('./registry');
const fs = require('fs');

registerTool({
  name: 'mcp_config',
  description: 'Manage MCP (Model Context Protocol) servers. Actions: list, add, remove, update, status. Changes take effect immediately (auto-reconnect).',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'add', 'remove', 'update', 'status'],
        description: 'Action to perform'
      },
      name: {
        type: 'string',
        description: 'Server name (for add/remove/update)'
      },
      command: {
        type: 'string',
        description: 'Server command (for add/update), e.g. "npx"'
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Command arguments (for add/update), e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]'
      },
      env: {
        type: 'object',
        description: 'Environment variables (for add/update), e.g. {"API_KEY": "xxx"}'
      }
    },
    required: ['action']
  },
  handler: async (args, context) => {
    const { mcpManager, configPath, loadConfigFn, saveConfigFn } = context;

    if (!mcpManager) return 'Error: MCP manager not available';
    if (!configPath || !loadConfigFn || !saveConfigFn) {
      return 'Error: Config functions not available';
    }

    const { action, name, command, args: cmdArgs, env } = args;

    switch (action) {
      case 'status': {
        const status = mcpManager.getStatus();
        const entries = Object.entries(status);
        if (entries.length === 0) return 'No MCP servers configured.';
        return entries.map(([n, info]) => {
          const icon = info.status === 'connected' ? '[connected]' : '[error]';
          const detail = info.status === 'connected'
            ? `${info.toolCount} tools`
            : (info.error || 'disconnected');
          return `${icon} ${n}: ${detail}`;
        }).join('\n');
      }

      case 'list': {
        const config = loadConfigFn();
        const servers = config.mcpServers || {};
        const names = Object.keys(servers);
        if (names.length === 0) return 'No MCP servers configured.';

        const status = mcpManager.getStatus();
        return names.map(n => {
          const s = servers[n];
          const st = status[n];
          const icon = st?.status === 'connected' ? '[connected]' : (st ? '[error]' : '[not started]');
          const tools = st?.toolCount ? ` (${st.toolCount} tools)` : '';
          return `${icon} ${n}: ${s.command} ${(s.args || []).join(' ')}${tools}`;
        }).join('\n');
      }

      case 'add': {
        if (!name) return 'Error: name is required';
        if (!command) return 'Error: command is required';

        // Validate name
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
          return 'Error: Server name must only contain letters, digits, hyphens, underscores';
        }

        const config = loadConfigFn();
        if (!config.mcpServers) config.mcpServers = {};

        if (config.mcpServers[name]) {
          return `Error: Server "${name}" already exists. Use action=update to modify.`;
        }

        const serverConfig = { command };
        if (cmdArgs && cmdArgs.length > 0) serverConfig.args = cmdArgs;
        if (env && Object.keys(env).length > 0) serverConfig.env = env;

        config.mcpServers[name] = serverConfig;
        saveConfigFn(config);

        // Auto-reconnect
        try {
          await mcpManager.reconnect(config.mcpServers);
        } catch (e) {
          return `Server "${name}" saved but connect failed: ${e.message}`;
        }

        const st = mcpManager.getStatus()[name];
        if (st?.status === 'connected') {
          return `Added and connected: "${name}" (${st.toolCount} tools available)`;
        } else {
          return `Added "${name}" but connection failed: ${st?.error || 'unknown error'}. Check that the command is correct.`;
        }
      }

      case 'remove': {
        if (!name) return 'Error: name is required';

        const config = loadConfigFn();
        if (!config.mcpServers || !config.mcpServers[name]) {
          return `Error: Server "${name}" not found`;
        }

        delete config.mcpServers[name];
        if (Object.keys(config.mcpServers).length === 0) {
          delete config.mcpServers;
        }
        saveConfigFn(config);

        // Reconnect without the removed server
        await mcpManager.reconnect(config.mcpServers || {});

        return `Removed server "${name}" and reconnected.`;
      }

      case 'update': {
        if (!name) return 'Error: name is required';

        const config = loadConfigFn();
        if (!config.mcpServers || !config.mcpServers[name]) {
          return `Error: Server "${name}" not found. Use action=add to create.`;
        }

        const existing = config.mcpServers[name];
        if (command) existing.command = command;
        if (cmdArgs !== undefined) existing.args = cmdArgs;
        if (env !== undefined) existing.env = env;

        config.mcpServers[name] = existing;
        saveConfigFn(config);

        // Reconnect with updated config
        await mcpManager.reconnect(config.mcpServers);

        const st = mcpManager.getStatus()[name];
        if (st?.status === 'connected') {
          return `Updated and reconnected: "${name}" (${st.toolCount} tools)`;
        } else {
          return `Updated "${name}" but reconnection failed: ${st?.error || 'unknown error'}`;
        }
      }

      default:
        return `Error: Unknown action: ${action}`;
    }
  }
});
