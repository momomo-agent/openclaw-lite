// tools/ui-status.js
const { registerTool } = require('./registry');

registerTool({
  name: 'ui_status_set',
  description: 'Set the status displayed in the sidebar and menubar. Level: idle/thinking/running/need_you/done. Text: 4-20 chars.',
  parameters: {
    type: 'object',
    properties: {
      level: { type: 'string', enum: ['idle', 'thinking', 'running', 'need_you', 'done'] },
      text: { type: 'string' }
    },
    required: ['level', 'text']
  },
  handler: async (args, context) => {
    const level = String(args.level || 'idle');
    const text = String(args.text || '').trim();
    const minLen = 4, maxLen = 20;
    if (!['idle', 'thinking', 'running', 'need_you', 'done'].includes(level)) {
      return 'Error: invalid level';
    }
    if (text.length < minLen || text.length > maxLen) {
      return `Error: text length must be ${minLen}-${maxLen} chars (got ${text.length}). Please rewrite shorter/longer.`;
    }
    if (context.pushStatus) {
      context.pushStatus(level, text);
    }
    return 'OK';
  }
});
