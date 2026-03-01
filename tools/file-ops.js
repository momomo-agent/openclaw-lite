// tools/file-ops.js
const { registerTool } = require('./registry');
const fs = require('fs').promises;
const path = require('path');

registerTool({
  name: 'file_read',
  description: 'Read the contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read'
      }
    },
    required: ['path']
  },
  handler: async (args, context) => {
    const { clawDir } = context;
    const filePath = path.resolve(clawDir, args.path);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      return `Error reading file: ${error.message}`;
    }
  }
});

registerTool({
  name: 'file_write',
  description: 'Write content to a file (creates parent directories if needed)',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write'
      },
      content: {
        type: 'string',
        description: 'Content to write to the file'
      }
    },
    required: ['path', 'content']
  },
  handler: async (args, context) => {
    const { clawDir } = context;
    const filePath = path.resolve(clawDir, args.path);
    
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, args.content, 'utf8');
      return `File written: ${args.path}`;
    } catch (error) {
      return `Error writing file: ${error.message}`;
    }
  }
});
