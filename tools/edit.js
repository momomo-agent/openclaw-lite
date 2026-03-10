// tools/edit.js — Precise text replacement (like OpenClaw's edit tool)
const { registerTool } = require('./registry');
const fs = require('fs').promises;
const path = require('path');

registerTool({
  name: 'file_edit',
  description: 'Edit a file by replacing exact text. The old_text must match exactly (including whitespace). Use this for precise, surgical edits instead of rewriting the entire file.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit'
      },
      old_text: {
        type: 'string',
        description: 'Exact text to find and replace (must match exactly, including whitespace)'
      },
      new_text: {
        type: 'string',
        description: 'New text to replace the old text with'
      }
    },
    required: ['path', 'old_text', 'new_text']
  },
  handler: async (args, context) => {
    const { clawDir } = context;
    const filePath = path.resolve(clawDir, args.path);

    try {
      const content = await fs.readFile(filePath, 'utf8');

      // Check for exact match
      const idx = content.indexOf(args.old_text);
      if (idx === -1) {
        return `Error: old_text not found in ${args.path}. Make sure it matches exactly (including whitespace and newlines).`;
      }

      // Check for multiple matches
      const secondIdx = content.indexOf(args.old_text, idx + 1);
      if (secondIdx !== -1) {
        return `Error: old_text found multiple times in ${args.path}. Please provide more context to make it unique.`;
      }

      // Replace
      const newContent = content.slice(0, idx) + args.new_text + content.slice(idx + args.old_text.length);
      await fs.writeFile(filePath, newContent, 'utf8');

      return `File edited: ${args.path}`;
    } catch (error) {
      return `Error editing file: ${error.message}`;
    }
  }
});
