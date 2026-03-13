// tools/file-ops.js
const { registerTool } = require('./registry');
const fs = require('fs').promises;
const path = require('path');

registerTool({
  name: 'file_read',
  description: 'Read the contents of a file. Use offset/limit for large files to read specific line ranges.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read'
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-indexed)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read'
      }
    },
    required: ['path']
  },
  handler: async (args, context) => {
    const { clawDir } = context;
    const filePath = path.resolve(clawDir, args.path);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      if (args.offset || args.limit) {
        const lines = content.split('\n');
        const start = Math.max(0, (args.offset || 1) - 1);
        const count = args.limit || lines.length;
        const slice = lines.slice(start, start + count);
        const remaining = lines.length - start - slice.length;
        let result = slice.join('\n');
        if (remaining > 0) {
          result += `\n\n[${remaining} more lines in file. Use offset=${start + slice.length + 1} to continue.]`;
        }
        return result;
      }
      
      // For large files, truncate and suggest using offset/limit
      const MAX_CHARS = 100000;
      if (content.length > MAX_CHARS) {
        const lines = content.split('\n');
        let truncated = content.slice(0, MAX_CHARS);
        const truncLines = truncated.split('\n').length;
        return truncated + `\n\n...[truncated at ${MAX_CHARS} chars, ${lines.length} total lines. Use offset/limit for the rest.]`;
      }
      
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
      const name = path.basename(args.path);
      return `File written: [${name}](${args.path})`;
    } catch (error) {
      return `Error writing file: ${error.message}`;
    }
  }
});
