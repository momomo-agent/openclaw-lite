// tools/skill-list.js — skill_list tool
const { registerTool } = require('./registry');
const path = require('path');
const { loadAllSkills } = require('../skills/frontmatter');

registerTool({
  name: 'skill_list',
  description: 'List all installed skills in the workspace',
  parameters: { type: 'object', properties: {}, required: [] },
  handler: async (args, context) => {
    const { clawDir } = context;
    if (!clawDir) return 'Error: No workspace directory configured';

    const skillsDir = path.join(clawDir, 'skills');
    const skills = loadAllSkills(skillsDir);

    if (skills.length === 0) return 'No skills installed.';

    return skills.map(s => {
      const deps = s.install?.length ? ` (${s.install.length} deps)` : '';
      return `- **${s.name}**${deps}: ${s.description || 'No description'}`;
    }).join('\n');
  }
});
