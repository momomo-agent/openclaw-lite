// tools/skill-create.js — skill_create tool (OpenClaw-aligned init_skill.py)
const { registerTool } = require('./registry');
const path = require('path');
const fs = require('fs').promises;
const { normalizeSkillName, validateSkillName } = require('../skills/frontmatter');

// OpenClaw-aligned SKILL_TEMPLATE
function buildSkillTemplate(name, description) {
  const title = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `---
name: ${name}
description: ${description}
---

# ${title}

${description}

## Usage

Describe how to use this skill here.

## Scripts

Place executable scripts in the \`scripts/\` directory.
`;
}

registerTool({
  name: 'skill_create',
  description: 'Create a new skill with scaffolding (SKILL.md + scripts/ + references/ directories)',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Skill name (lowercase, hyphens allowed, e.g. "web-scraper")'
      },
      description: {
        type: 'string',
        description: 'Short description of the skill (max 1024 chars)'
      }
    },
    required: ['name', 'description']
  },
  handler: async (args, context) => {
    const { clawDir } = context;
    if (!clawDir) return 'Error: No workspace directory configured';

    const { name: rawName, description } = args;

    // Normalize name (OpenClaw-aligned normalize_skill_name)
    const name = normalizeSkillName(rawName);
    if (!name) return 'Error: Name is empty after normalization';

    // Validate
    const validation = validateSkillName(name);
    if (!validation.valid) return `Error: ${validation.error}`;

    // Description validation
    if (!description || typeof description !== 'string') {
      return 'Error: Description is required';
    }
    if (description.length > 1024) {
      return 'Error: Description must be 1024 chars or less';
    }
    if (/<|>/.test(description)) {
      return 'Error: Description cannot contain < or > characters';
    }

    const skillDir = path.join(clawDir, 'skills', name);

    // Check if already exists
    try {
      await fs.access(skillDir);
      return `Error: Skill directory already exists: skills/${name}/`;
    } catch {
      // Good — doesn't exist
    }

    // Create scaffolding
    await fs.mkdir(skillDir, { recursive: true });
    await fs.mkdir(path.join(skillDir, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(skillDir, 'references'), { recursive: true });

    // Write SKILL.md
    const template = buildSkillTemplate(name, description);
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), template, 'utf8');

    const nameNote = name !== rawName.trim().toLowerCase()
      ? `\nNote: Name was normalized from "${rawName}" to "${name}"`
      : '';

    return `Created skill: skills/${name}/
├── SKILL.md
├── scripts/
└── references/${nameNote}

Next steps:
1. Edit skills/${name}/SKILL.md to add detailed instructions
2. Add scripts to skills/${name}/scripts/ (run.sh or run.py)
3. Add reference documents to skills/${name}/references/`;
  }
});
