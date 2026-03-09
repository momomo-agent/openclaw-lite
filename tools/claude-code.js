// tools/claude-code.js — Claude Code via acpx
const { registerTool } = require('./registry');
const acpx = require('../core/acpx');
const path = require('path');

const sessionCCSessions = new Map(); // pawSessionId -> acpxSessionName

function isRunning() {
  return false; // acpx handles process lifecycle
}

function stop() {
  // No-op: acpx manages session lifecycle with TTL
}

registerTool({
  name: 'claude_code',
  description: 'Delegate a coding task to a coding agent (Claude Code/Codex/Gemini). Use when you need to write, edit, or refactor code. Has full file system access and can run commands.',
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Clear description of the coding task'
      },
      agent: {
        type: 'string',
        enum: ['claude', 'codex', 'gemini'],
        description: 'Which coding agent to use (default: claude)'
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
    const { clawDir, mainWindow, sessionId, config } = context;
    const workdir = args.workdir ? path.resolve(clawDir, args.workdir) : clawDir;
    const task = (args.task || '').trim();
    if (!task) return 'Error: task required';
    if (!acpx.isAvailable()) return 'Error: acpx not available. Install with: npm install acpx';

    const agent = args.agent || config?.defaultCodingAgent || 'claude';

    if (mainWindow) {
      mainWindow.webContents.send('cc-status', { status: 'running', task: task.slice(0, 80) });
    }

    try {
      const acpxOpts = {
        cwd: workdir,
        timeout: 300000,
        approveAll: true,
        onOutput: (chunk) => {
          if (mainWindow) {
            mainWindow.webContents.send('cc-output', { chunk, total: chunk.length });
          }
        }
      };

      let result;
      const existingCCSession = sessionCCSessions.get(sessionId);

      if (args.continue_session && existingCCSession) {
        acpxOpts.session = existingCCSession;
        result = await acpx.prompt(agent, task, acpxOpts);
      } else {
        const sessionName = sessionId ? `paw-${sessionId}` : undefined;
        acpxOpts.session = sessionName;
        result = await acpx.exec(agent, task, acpxOpts);
      }

      if (result.sessionName && sessionId) {
        sessionCCSessions.set(sessionId, result.sessionName);
      }

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
          error: result.isError ? (text.slice(0, 200) || 'CC execution failed') : undefined
        });
      }

      const meta = result.sessionName ? `\n[CC session: ${result.sessionName}]` : '';
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
