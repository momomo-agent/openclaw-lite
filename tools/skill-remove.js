// tools/skill-remove.js — skill_remove tool
const { registerTool } = require('./registry');
const path = require('path');
const fs = require('fs');

registerTool({
  name: 'skill_remove',
  description: 'Remove a skill from the workspace (moves to trash if available, otherwise deletes)',
  parameters: {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'Name of the skill to remove'
      }
    },
    required: ['skillName']
  },
  handler: async (args, context) => {
    const { clawDir, approvalCallback } = context;
    if (!clawDir) return 'Error: No workspace directory configured';

    const { skillName } = args;
    const skillDir = path.join(clawDir, 'skills', skillName);

    if (!fs.existsSync(skillDir)) {
      return `Error: Skill '${skillName}' not found`;
    }

    // Request approval
    if (approvalCallback) {
      const approved = await approvalCallback({
        type: 'skill_remove',
        command: `Remove skill '${skillName}' from ${skillDir}`
      });
      if (!approved) return 'Cancelled by user.';
    }

    // Try trash first, fallback to rm
    const { execSync } = require('child_process');
    try {
      execSync(`which trash && trash "${skillDir}"`, { stdio: 'pipe' });
      return `✅ Skill '${skillName}' moved to trash.`;
    } catch {
      fs.rmSync(skillDir, { recursive: true, force: true });
      return `✅ Skill '${skillName}' deleted.`;
    }
  }
});
