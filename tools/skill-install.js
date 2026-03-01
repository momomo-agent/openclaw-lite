// tools/skill-install.js
const { registerTool } = require('./registry');
const path = require('path');
const { loadSkillMetadata } = require('../skills/frontmatter');
const { installSkillDependencies } = require('../skills/installer');

registerTool({
  name: 'skill_install',
  description: 'Install dependencies for a skill (brew/npm/go/uv)',
  parameters: {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'Name of the skill to install dependencies for'
      }
    },
    required: ['skillName']
  },
  handler: async (args, context) => {
    const { clawDir, approvalCallback } = context;
    const { skillName } = args;
    
    const skillDir = path.join(clawDir, 'skills', skillName);
    const metadata = loadSkillMetadata(skillDir);
    
    if (!metadata) {
      return `Error: Skill '${skillName}' not found`;
    }
    
    if (!metadata.install || metadata.install.length === 0) {
      return `✅ Skill '${skillName}' has no dependencies to install`;
    }
    
    // Request approval for installation
    if (approvalCallback) {
      const installList = metadata.install.map(spec => {
        if (spec.kind === 'brew') return `brew install ${spec.formula}`;
        if (spec.kind === 'npm') return `npm install -g ${spec.package}`;
        if (spec.kind === 'go') return `go install ${spec.module}`;
        if (spec.kind === 'uv') return `uv pip install ${spec.package}`;
        return spec.kind;
      }).join('\n');
      
      const approved = await approvalCallback({
        type: 'skill_install',
        command: `Install dependencies for skill '${skillName}':\n${installList}`
      });
      
      if (!approved) {
        return 'Installation cancelled by user';
      }
    }
    
    const result = await installSkillDependencies(metadata);
    return result;
  }
});
