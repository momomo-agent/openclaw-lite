// tools/session-title.js — AI-driven session title update
const { registerTool } = require('./registry');

registerTool({
  name: 'session_title_set',
  description: 'Update the conversation title when the topic has drifted from the current title. Title should be ≤15 Chinese characters, concise and descriptive.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'New session title (≤15 Chinese chars)' }
    },
    required: ['title']
  },
  handler: async (args, context) => {
    const title = String(args.title || '').trim();
    if (!title) return 'Error: title cannot be empty';
    if (title.length > 30) return `Error: title too long (${title.length} chars, max 30)`;
    const sid = context.sessionId;
    if (!sid) return 'Error: no session';
    try {
      context.sessionStore.renameSession(context.clawDir, sid, title);
      // Notify frontend to refresh session list
      if (context.mainWindow?.webContents) {
        context.mainWindow.webContents.send('session-title-updated', { sessionId: sid, title });
      }
      return `OK: title set to "${title}"`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  }
});
