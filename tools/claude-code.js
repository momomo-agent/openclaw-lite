// tools/claude-code.js — Claude Code tool (legacy bridge)
// Now routes through coding-agents + delegate events.
// Kept for backward compatibility when orchestrator calls claude_code as a tool.
const { registerTool } = require('./registry');
const codingAgents = require('../core/coding-agents');
const eventBus = require('../core/event-bus');
const path = require('path');

const sessionCCSessions = new Map(); // pawSessionId -> session name

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
    const { clawDir, sessionId } = context;
    const workdir = args.workdir ? path.resolve(clawDir, args.workdir) : clawDir;
    const task = (args.task || '').trim();
    if (!task) return 'Error: task required';

    const agent = args.agent || 'claude';
    if (!codingAgents.isAvailable(agent)) return `Error: coding agent '${agent}' not available`;

    const agentName = agent === 'claude' ? 'Claude Code' : agent === 'codex' ? 'Codex' : 'Gemini CLI';

    let output = '';
    const sessionKey = `${sessionId}-${agent}-${workdir}`;
    const existingSession = args.continue_session ? sessionCCSessions.get(sessionKey) : undefined;

    try {
      const result = await codingAgents.run(agent, task, {
        cwd: workdir,
        session: existingSession,
        onOutput: (chunk) => {
          output += chunk;
        }
      });

      const MAX_OUTPUT = 3000;
      const text = output || result.stdout || '';
      const truncated = text.length > MAX_OUTPUT
        ? `...(truncated ${text.length - MAX_OUTPUT} chars)...\n${text.slice(-MAX_OUTPUT)}`
        : text;

      return `[${agentName} completed]\n${truncated}`;
    } catch (err) {
      return `Error running ${agentName}: ${err.message}`;
    }
  }
});
