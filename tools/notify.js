// tools/notify.js
const { registerTool } = require('./registry');

registerTool({
  name: 'notify',
  description: 'Send a system notification to the user',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Notification title' },
      body: { type: 'string', description: 'Notification body' }
    },
    required: ['body']
  },
  handler: async (args, context) => {
    const { sendNotification } = context;
    if (sendNotification) {
      sendNotification(args.title || 'Paw', args.body);
    }
    return 'Notification sent';
  }
});
