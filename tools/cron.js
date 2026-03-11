// tools/cron.js — cron tool (OpenClaw-aligned, 8 actions)
const { registerTool } = require('./registry');

registerTool({
  name: 'cron',
  description: 'Manage scheduled cron jobs. Actions: status, list, add, update, remove, run, runs, wake',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'list', 'add', 'update', 'remove', 'run', 'runs', 'wake'],
        description: 'The cron action to perform'
      },
      // For add/update
      name: { type: 'string', description: 'Job name (for add)' },
      description: { type: 'string', description: 'Job description (for add/update)' },
      schedule: {
        type: 'object',
        description: 'Schedule config: { kind: "cron"|"every"|"at", expr?, everyMs?, at?, tz? }',
        properties: {
          kind: { type: 'string', enum: ['cron', 'every', 'at'] },
          expr: { type: 'string', description: 'Cron expression (for kind=cron)' },
          everyMs: { type: 'number', description: 'Interval in ms (for kind=every)' },
          at: { type: 'string', description: 'ISO date or datetime (for kind=at)' },
          tz: { type: 'string', description: 'Timezone (default: system timezone)' },
        }
      },
      sessionTarget: { type: 'string', enum: ['main', 'isolated'], description: 'Where to run (default: main)' },
      wakeMode: { type: 'string', enum: ['now', 'next-heartbeat'], description: 'When to trigger (default: now)' },
      text: { type: 'string', description: 'System event text (for main session target)' },
      message: { type: 'string', description: 'Agent turn message (for isolated session target)' },
      enabled: { type: 'boolean', description: 'Whether job is enabled' },
      deleteAfterRun: { type: 'boolean', description: 'Delete after first execution' },
      // For update/remove/run/runs
      id: { type: 'string', description: 'Job ID (for update/remove/run/runs)' },
      mode: { type: 'string', enum: ['due', 'force'], description: 'Run mode (default: due)' },
      // For list
      includeDisabled: { type: 'boolean', description: 'Include disabled jobs in list' },
    },
    required: ['action']
  },
  handler: async (args, context) => {
    const { cronService } = context;

    if (!cronService) {
      return 'Error: Cron service is not available. Make sure the workspace is configured.';
    }

    const { action } = args;

    switch (action) {
      case 'status': {
        const st = cronService.status();
        const lines = [
          `Cron service: ${st.running ? 'running' : 'stopped'}`,
          `Total jobs: ${st.totalJobs} (${st.enabledJobs} enabled)`,
        ];
        if (st.nextDueJob) {
          const nextDate = new Date(st.nextDueJob.nextRunAtMs).toISOString();
          lines.push(`Next due: "${st.nextDueJob.name}" at ${nextDate}`);
        }
        return lines.join('\n');
      }

      case 'list': {
        const jobs = cronService.list({ includeDisabled: args.includeDisabled });
        if (jobs.length === 0) return 'No cron jobs configured.';
        return jobs.map(j => {
          const next = j.state.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : 'none';
          const status = j.state.lastRunStatus || 'never';
          return `[${j.id.slice(0, 8)}] ${j.enabled ? '✓' : '✗'} "${j.name}" — next: ${next}, last: ${status}`;
        }).join('\n');
      }

      case 'add': {
        // Input normalization (OpenClaw-aligned)
        const input = { ...args };
        delete input.action;

        // Auto-infer sessionTarget
        if (!input.sessionTarget) {
          input.sessionTarget = input.message ? 'isolated' : 'main';
        }

        // Build payload
        if (!input.payload) {
          input.payload = {
            kind: input.sessionTarget === 'main' ? 'systemEvent' : 'agentTurn',
            text: input.text || '',
            message: input.message || '',
          };
        }

        // Default wakeMode
        if (!input.wakeMode) input.wakeMode = 'now';

        // Default deleteAfterRun for 'at' type
        if (input.deleteAfterRun === undefined && input.schedule?.kind === 'at') {
          input.deleteAfterRun = true;
        }

        const result = cronService.add(input);
        if (result.error) return `Error: ${result.error}`;
        const nextDate = result.nextRunAtMs ? new Date(result.nextRunAtMs).toISOString() : 'none';
        return `Created job "${result.name}" (${result.id.slice(0, 8)})\nNext run: ${nextDate}`;
      }

      case 'update': {
        if (!args.id) return 'Error: id is required for update';
        const patch = {};
        for (const key of ['name', 'description', 'schedule', 'wakeMode', 'enabled', 'deleteAfterRun']) {
          if (args[key] !== undefined) patch[key] = args[key];
        }
        if (args.text || args.message) {
          patch.payload = {
            kind: args.message ? 'agentTurn' : 'systemEvent',
            text: args.text || '',
            message: args.message || '',
          };
        }
        const result = cronService.update(args.id, patch);
        if (result.error) return `Error: ${result.error}`;
        return `Updated job "${result.name}"`;
      }

      case 'remove': {
        if (!args.id) return 'Error: id is required for remove';
        const result = cronService.remove(args.id);
        if (result.error) return `Error: ${result.error}`;
        return `Removed job "${result.name}"`;
      }

      case 'run': {
        if (!args.id) return 'Error: id is required for run';
        const result = await cronService.run(args.id, args.mode || 'due');
        if (result.error) return `Error: ${result.error}`;
        return `Job executed: status=${result.status}, duration=${result.durationMs}ms`;
      }

      case 'runs': {
        if (!args.id) return 'Error: id is required for runs';
        const job = cronService.getJob(args.id);
        if (!job) return 'Error: Job not found';
        const s = job.state;
        const lines = [
          `Job: "${job.name}" (${job.id.slice(0, 8)})`,
          `Last run: ${s.lastRunAtMs ? new Date(s.lastRunAtMs).toISOString() : 'never'}`,
          `Last status: ${s.lastRunStatus || 'none'}`,
          `Last duration: ${s.lastDurationMs !== null ? s.lastDurationMs + 'ms' : 'n/a'}`,
          `Consecutive errors: ${s.consecutiveErrors}`,
        ];
        if (s.lastError) lines.push(`Last error: ${s.lastError}`);
        return lines.join('\n');
      }

      case 'wake': {
        const text = args.text || 'Manual wake trigger';
        const result = cronService.wake(text);
        return result.ok ? 'Wake event sent.' : 'Error sending wake event.';
      }

      default:
        return `Error: Unknown cron action: ${action}`;
    }
  }
});
