// tools/claude-code.js — Claude Code as a persistent tool
const { registerTool } = require('./registry');
const { spawn } = require('child_process');
const path = require('path');

let ccProcess = null;
let ccSessionId = null;

function isRunning() {
  return ccProcess !== null && !ccProcess.killed;
}

function stop() {
  if (ccProcess && !ccProcess.killed) {
    ccProcess.kill('SIGTERM');
    setTimeout(() => {
      if (ccProcess && !ccProcess.killed) ccProcess.kill('SIGKILL');
    }, 5000);
  }
  ccProcess = null;
  ccSessionId = null;
}

registerTool({
  name: 'claude_code',
  description: 'Delegate a coding task to Claude Code. Use when you need to write, edit, or refactor code. Claude Code has full file system access and can run commands. Provide a clear task description.',
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Clear description of the coding task'
      },
      workdir: {
        type: 'string',
        description: 'Working directory (defaults to claw directory)'
      },
      continue_session: {
        type: 'boolean',
        description: 'Continue the previous CC session instead of starting fresh'
      }
    },
    required: ['task']
  },
  handler: async (args, context) => {
    const { clawDir, mainWindow } = context;
    const workdir = args.workdir ? path.resolve(clawDir, args.workdir) : clawDir;
    const task = (args.task || '').trim();
    if (!task) return 'Error: task required';

    // Notify UI
    if (mainWindow) {
      mainWindow.webContents.send('cc-status', { status: 'running', task: task.slice(0, 80) });
    }

    try {
      const ccArgs = [
        '--print',
        '--output-format', 'text',
        '--dangerously-skip-permissions',
      ];

      // Continue previous session if requested and available
      if (args.continue_session && ccSessionId) {
        ccArgs.push('--resume', ccSessionId);
      }

      ccArgs.push(task);

      const result = await new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        const proc = spawn('claude', ccArgs, {
          cwd: workdir,
          shell: true,
          timeout: 300000, // 5 minutes
          env: { ...process.env, TERM: 'dumb' },
        });

        ccProcess = proc;

        proc.stdout.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          // Stream to UI
          if (mainWindow) {
            mainWindow.webContents.send('cc-output', { chunk, total: stdout.length });
          }
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          ccProcess = null;
          if (code === 0) {
            resolve(stdout);
          } else {
            resolve(`CC exited with code ${code}\n${stdout}\n${stderr}`.trim());
          }
        });

        proc.on('error', (err) => {
          ccProcess = null;
          reject(err);
        });
      });

      // Truncate output for context efficiency
      const MAX_OUTPUT = 3000;
      const truncated = result.length > MAX_OUTPUT
        ? `...(truncated ${result.length - MAX_OUTPUT} chars)...\n${result.slice(-MAX_OUTPUT)}`
        : result;

      if (mainWindow) {
        mainWindow.webContents.send('cc-status', { status: 'done', length: result.length });
      }

      return truncated;

    } catch (err) {
      if (mainWindow) {
        mainWindow.webContents.send('cc-status', { status: 'error', error: err.message });
      }
      return `Error running Claude Code: ${err.message}`;
    }
  }
});

// Export lifecycle methods for app quit
module.exports.ccStop = stop;
module.exports.ccIsRunning = isRunning;
