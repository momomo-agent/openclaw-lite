// tools/agents.js — create_agent + remove_agent + send_message
const { registerTool } = require('./registry');

registerTool({
  name: 'send_message',
  description: 'Send a message to another agent in this session. Only available in multi-agent sessions.',
  parameters: {
    type: 'object',
    properties: {
      targetAgent: { type: 'string', description: 'Name of the target agent' },
      message: { type: 'string' }
    },
    required: ['targetAgent', 'message']
  },
  handler: async (args, context) => {
    const { clawDir, sessionId, agentName, mainWindow, sessionStore, listAgentsFn } = context;
    if (!clawDir || !sessionId) return 'Error: No active session';
    const targetName = (args.targetAgent || '').trim();
    const msg = (args.message || '').trim();
    if (!targetName || !msg) return 'Error: targetAgent and message required';
    // Find target: session agents first, then templates
    const sessionAgent = sessionStore.findSessionAgentByName(clawDir, sessionId, targetName);
    const templateAgent = !sessionAgent && listAgentsFn ? listAgentsFn().find(a => a.name === targetName) : null;
    if (!sessionAgent && !templateAgent) return `Error: Agent "${targetName}" not found`;
    // Anti-loop
    const session = sessionStore.loadSession(clawDir, sessionId);
    if (session?.messages) {
      const recent = session.messages.slice(-20);
      const pair = new Set([agentName || 'Assistant', targetName]);
      let pairCount = 0;
      for (const m of recent) {
        if (m.role === 'assistant' && m.sender && pair.has(m.sender)) pairCount++;
      }
      if (pairCount >= 6) return `Error: Conversation chain between ${agentName} and ${targetName} is too long. Waiting for user input.`;
    }
    if (mainWindow) {
      mainWindow.webContents.send('agent-message', {
        from: agentName || 'Assistant', to: targetName, message: msg, sessionId
      });
    }
    return `Message sent to ${targetName}`;
  }
});

registerTool({
  name: 'create_agent',
  description: 'Create a lightweight agent in the current session. The agent will be a participant with the given name and role.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Agent name (unique within session)' },
      role: { type: 'string', description: 'Role description (1-2 sentences)' }
    },
    required: ['name', 'role']
  },
  handler: async (args, context) => {
    const { clawDir, sessionId, mainWindow, sessionStore } = context;
    if (!clawDir || !sessionId) return 'Error: No active session';
    const name = (args.name || '').trim();
    const role = (args.role || '').trim();
    if (!name) return 'Error: name required';
    if (!role) return 'Error: role required';
    const existing = sessionStore.findSessionAgentByName(clawDir, sessionId, name);
    if (existing) return `Error: Agent "${name}" already exists in this session`;
    const agent = sessionStore.createSessionAgent(clawDir, sessionId, { name, role });
    if (mainWindow) mainWindow.webContents.send('session-agents-changed', sessionId);
    return JSON.stringify(agent);
  }
});

registerTool({
  name: 'remove_agent',
  description: 'Remove a lightweight agent from the current session.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the agent to remove' }
    },
    required: ['name']
  },
  handler: async (args, context) => {
    const { clawDir, sessionId, mainWindow, sessionStore } = context;
    if (!clawDir || !sessionId) return 'Error: No active session';
    const name = (args.name || '').trim();
    if (!name) return 'Error: name required';
    const found = sessionStore.findSessionAgentByName(clawDir, sessionId, name);
    if (!found) return `Error: Agent "${name}" not found in this session`;
    sessionStore.deleteSessionAgent(clawDir, found.id);
    if (mainWindow) mainWindow.webContents.send('session-agents-changed', sessionId);
    return `Agent "${name}" removed`;
  }
});
