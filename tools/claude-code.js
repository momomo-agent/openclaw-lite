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
        '--output-format', 'json',
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
        let textOutput = ''; // For streaming display

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
          textOutput += chunk;
          // Stream to UI (show raw output during execution)
          if (mainWindow) {
            mainWindow.webContents.send('cc-output', { chunk, total: textOutput.length });
          }
        });

        proc.stderr.on('data', (data) => {
          const chunk = data.toString();
          stderr += chunk;
          // Stream stderr to UI as progress (JSON mode has no stdout streaming)
          if (mainWindow) {
            mainWindow.webContents.send('cc-output', { chunk, total: stderr.length });
          }
        });

        proc.on('close', (code) => {
          ccProcess = null;
          // Parse JSON output to extract result and session_id
          try {
            const json = JSON.parse(stdout);
            if (json.session_id) ccSessionId = json.session_id;
            const resultText = json.result || stdout;
            resolve({ text: resultText, sessionId: json.session_id, cost: json.total_cost_usd, isError: json.is_error });
          } catch {
            // Fallback to raw text
            resolve({ text: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ''), sessionId: null, cost: null, isError: code !== 0 });
          }
        });

        proc.on('error', (err) => {
          ccProcess = null;
          reject(err);
        });
      });

      // Truncate output for context efficiency
      const MAX_OUTPUT = 3000;
      const text = result.text || '';
      const truncated = text.length > MAX_OUTPUT
        ? `...(truncated ${text.length - MAX_OUTPUT} chars)...\n${text.slice(-MAX_OUTPUT)}`
        : text;

      if (mainWindow) {
        mainWindow.webContents.send('cc-status', {
          status: result.isError ? 'error' : 'done',
          length: text.length,
          cost: result.cost,
          error: result.isError ? text.slice(0, 200) : undefined
        });
      }

      // Return result with metadata
      const meta = result.sessionId ? `\n[CC session: ${result.sessionId}]` : '';
      const costInfo = result.cost ? ` [cost: $${result.cost.toFixed(4)}]` : '';
      return truncated + meta + costInfo;

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
