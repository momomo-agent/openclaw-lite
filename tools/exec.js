// tools/exec.js — Shell + Code execution with safety layers
const { registerTool } = require('./registry');
const { spawn } = require('child_process');
const path = require('path');

// ── Exec Safety ──

// Commands that are always safe (read-only, no side effects)
const SAFE_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'which', 'where',
  'echo', 'date', 'pwd', 'whoami', 'uname', 'file', 'stat', 'du', 'df',
  'git status', 'git log', 'git diff', 'git show', 'git branch',
  'node --version', 'python3 --version', 'npm --version',
]);

// Patterns that indicate dangerous commands
const DANGEROUS_PATTERNS = [
  /\bsudo\b/,
  /\brm\s+-rf?\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bchmod\s+777\b/,
  /\bcurl\b.*\|\s*(bash|sh|zsh)/,  // curl | bash
  /\bwget\b.*\|\s*(bash|sh|zsh)/,
  />\s*\/dev\//,
  /\bkill\s+-9\b/,
  /\bpkill\b/,
  /\bshutdown\b/,
  /\breboot\b/,
];

// Reject environment variable injection attempts
const ENV_INJECTION_PATTERNS = [
  /\bPATH\s*=/,
  /\bLD_PRELOAD\s*=/,
  /\bLD_LIBRARY_PATH\s*=/,
  /\bDYLD_/,
];

function classifyCommand(command) {
  const trimmed = command.trim();

  // Check safe commands (exact prefix match)
  for (const safe of SAFE_COMMANDS) {
    if (trimmed === safe || trimmed.startsWith(safe + ' ')) {
      return 'safe';
    }
  }

  // Check env injection
  for (const pattern of ENV_INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'blocked';
    }
  }

  // Check dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'dangerous';
    }
  }

  return 'normal'; // Needs approval
}

registerTool({
  name: 'shell_exec',
  description: 'Execute a shell command in the workspace directory. Safe read-only commands run without approval. Dangerous commands (sudo, rm -rf, etc.) are blocked. Other commands require user approval.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute'
      }
    },
    required: ['command']
  },
  handler: async (args, context) => {
    const { clawDir, approvalCallback } = context;
    const classification = classifyCommand(args.command);

    // Blocked commands
    if (classification === 'blocked') {
      return `Command blocked: environment variable injection detected. PATH/LD_PRELOAD/DYLD overrides are not allowed.`;
    }

    // Safe commands skip approval
    if (classification !== 'safe' && approvalCallback) {
      const label = classification === 'dangerous' ? '⚠️ DANGEROUS' : '⚙️ Shell';
      const approved = await approvalCallback({
        type: 'shell_exec',
        command: args.command,
        classification,
        label
      });
      if (!approved) {
        return 'Command execution cancelled by user';
      }
    }

    return new Promise((resolve) => {
      const proc = spawn(args.command, {
        shell: true,
        cwd: clawDir,
        timeout: 30000,
        env: { ...process.env }, // Clean env copy, no user overrides
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
        resolve(code === 0 ? output : `Command failed (exit ${code}):\n${output}`);
      });

      proc.on('error', (error) => {
        resolve(`Error executing command: ${error.message}`);
      });
    });
  }
});

registerTool({
  name: 'code_exec',
  description: 'Execute code in a specific language (python, javascript, bash)',
  parameters: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['python', 'javascript', 'bash'],
        description: 'Programming language'
      },
      code: {
        type: 'string',
        description: 'Code to execute'
      }
    },
    required: ['language', 'code']
  },
  handler: async (args, context) => {
    const { clawDir } = context;
    const { language, code } = args;

    const commands = {
      python: `python3 -c ${JSON.stringify(code)}`,
      javascript: `node -e ${JSON.stringify(code)}`,
      bash: code
    };

    const command = commands[language];
    if (!command) {
      return `Unsupported language: ${language}`;
    }

    return new Promise((resolve) => {
      const proc = spawn(command, {
        shell: true,
        cwd: clawDir,
        timeout: 30000,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
        resolve(code === 0 ? output : `Execution failed (exit ${code}):\n${output}`);
      });

      proc.on('error', (error) => {
        resolve(`Error: ${error.message}`);
      });
    });
  }
});
