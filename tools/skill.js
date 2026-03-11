// tools/skill.js — skill_exec tool (OpenClaw-aligned)
const { registerTool } = require('./registry');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { loadSkillMetadata } = require('../skills/frontmatter');

registerTool({
  name: 'skill_exec',
  description: 'Execute a skill script from the skills/ directory. Supports run.sh, run.py, or scripts/*.py',
  parameters: {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'Name of the skill (directory name in skills/)'
      },
      script: {
        type: 'string',
        description: 'Optional script path relative to skill dir (e.g. "scripts/analyze.py"). Defaults to run.sh or run.py'
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
    const { clawDir, skillEnv = {} } = context;
    const { skillName, script, args: skillArgs = [] } = args;

    const skillDir = path.join(clawDir, 'skills', skillName);

    // Determine script path and interpreter
    let scriptPath, interpreter;

    if (script) {
      // Explicit script specified
      scriptPath = path.join(skillDir, script);
      interpreter = script.endsWith('.py') ? 'python3' : 'bash';
    } else {
      // Auto-detect: run.sh > run.py (OpenClaw-aligned)
      const shPath = path.join(skillDir, 'run.sh');
      const pyPath = path.join(skillDir, 'run.py');

      try {
        await fs.access(shPath);
        scriptPath = shPath;
        interpreter = 'bash';
      } catch {
        try {
          await fs.access(pyPath);
          scriptPath = pyPath;
          interpreter = 'python3';
        } catch {
          return `Error: Skill '${skillName}' not found or missing run.sh/run.py`;
        }
      }
    }

    try {
      await fs.access(scriptPath);
    } catch {
      return `Error: Script not found: ${script || 'run.sh/run.py'}`;
    }

    // Load skill metadata to get primaryEnv
    const metadata = loadSkillMetadata(skillDir);
    const env = {
      ...process.env,
      SKILL_DIR: skillDir,
      WORKSPACE_DIR: clawDir  // OpenClaw-aligned: workspace root path
    };

    // Inject environment variables from skillEnv
    if (metadata?.primaryEnv && skillEnv[metadata.primaryEnv]) {
      env[metadata.primaryEnv] = skillEnv[metadata.primaryEnv];
    }

    return new Promise((resolve) => {
      const proc = spawn(interpreter, [scriptPath, ...skillArgs], {
        cwd: skillDir,
        timeout: 60000,
        env
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
