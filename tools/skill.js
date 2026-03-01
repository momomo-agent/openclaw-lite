// tools/skill.js
const { registerTool } = require('./registry');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

registerTool({
  name: 'skill_exec',
  description: 'Execute a skill script from the skills/ directory',
  parameters: {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'Name of the skill (directory name in skills/)'
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Arguments to pass to the skill script'
      }
    },
    required: ['skillName']
  },
  handler: async (args, context) => {
    const { clawDir } = context;
    const { skillName, args: skillArgs = [] } = args;
    
    const skillDir = path.join(clawDir, 'skills', skillName);
    const scriptPath = path.join(skillDir, 'run.sh');
    
    try {
      await fs.access(scriptPath);
    } catch {
      return `Error: Skill '${skillName}' not found or missing run.sh`;
    }
    
    return new Promise((resolve) => {
      const proc = spawn('bash', [scriptPath, ...skillArgs], {
        cwd: skillDir,
        timeout: 60000,
        env: { ...process.env, SKILL_DIR: skillDir }
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
        resolve(code === 0 ? output : `Skill failed (exit ${code}):\n${output}`);
      });
      
      proc.on('error', (error) => {
        resolve(`Error executing skill: ${error.message}`);
      });
    });
  }
});
