// tools/tasks.js — task_create + task_update + task_list
const { registerTool } = require('./registry');
const eventBus = require('../core/event-bus');

function findBestAgent(taskTitle, sessionAgents) {
  if (!sessionAgents?.length) return null;
  const titleLower = taskTitle.toLowerCase();
  let best = null, bestScore = 0;
  for (const a of sessionAgents) {
    const role = (a.role || '').toLowerCase();
    const roleTokens = role.split(/[\s,，、/]+/).filter(w => w.length >= 2);
    const roleKeys = new Set(roleTokens);
    for (const t of roleTokens) {
      for (let i = 0; i <= t.length - 2; i++) roleKeys.add(t.slice(i, i + 2));
    }
    let score = 0;
    for (const rk of roleKeys) {
      if (titleLower.includes(rk)) score += rk.length >= 3 ? 3 : 1;
    }
    if (score > bestScore) { bestScore = score; best = a.name; }
  }
  return best;
}

registerTool({
  name: 'task_create',
  description: 'Create a task in the shared task list. Tasks are auto-assigned to the best matching agent by role. You can override with assignee.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      dependsOn: { type: 'array', items: { type: 'string' }, description: 'Task IDs this depends on' },
      assignee: { type: 'string', description: 'Agent name to assign (auto-assigned if omitted)' }
    },
    required: ['title']
  },
  handler: async (args, context) => {
    const { clawDir, sessionId, agentName, sessionStore } = context;
    if (!clawDir || !sessionId) return 'Error: No active session';
    const title = (args.title || '').trim();
    if (!title) return 'Error: title required';
    const tasks = sessionStore.listTasks(clawDir, sessionId);
    if (tasks.length >= 50) return 'Error: Task limit reached (50)';
    const sessionAgents = sessionStore.listSessionAgents(clawDir, sessionId);
    const agentNames = new Set(sessionAgents.map(a => a.name));
    let assignee = null;
    if (args.assignee && agentNames.has(args.assignee)) {
      assignee = args.assignee;
    } else {
      assignee = findBestAgent(title, sessionAgents);
    }
    const task = sessionStore.createTask(clawDir, sessionId, {
      title, dependsOn: args.dependsOn, createdBy: agentName || 'user', assignee
    });
    eventBus.dispatch('tasks-changed', sessionId);
    return JSON.stringify(task);
  }
});

registerTool({
  name: 'task_update',
  description: 'Update a task status: claim (pending→in-progress) or complete (in-progress→done).',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      status: { type: 'string', enum: ['in-progress', 'done'] },
      assignee: { type: 'string', description: 'Agent name claiming the task' }
    },
    required: ['taskId', 'status']
  },
  handler: async (args, context) => {
    const { clawDir, sessionId, agentName, sessionStore } = context;
    if (!clawDir || !sessionId) return 'Error: No active session';
    const result = sessionStore.updateTask(clawDir, args.taskId, {
      status: args.status, assignee: args.assignee || agentName
    });
    if (result?.error) return `Error: ${result.error}`;
    eventBus.dispatch('tasks-changed', sessionId);
    // Auto-rotation: when a task is done, check for unblocked tasks
    if (args.status === 'done') {
      const allTasks = sessionStore.listTasks(clawDir, sessionId);
      const unblocked = allTasks.find(t =>
        t.status === 'pending' && t.dependsOn?.includes(args.taskId) &&
        t.dependsOn.every(dep => allTasks.find(d => d.id === dep)?.status === 'done')
      );
      if (unblocked) {
        if (!unblocked.assignee) {
          const sessionAgents = sessionStore.listSessionAgents(clawDir, sessionId);
          const best = findBestAgent(unblocked.title, sessionAgents);
          if (best) {
            sessionStore.updateTask(clawDir, unblocked.id, { assignee: best });
            unblocked.assignee = best;
          }
        }
        eventBus.dispatch('auto-rotate', {
          sessionId, completedTask: args.taskId, completedBy: agentName, nextTask: unblocked
        });
      }
    }
    return JSON.stringify(result);
  }
});

registerTool({
  name: 'task_list',
  description: 'List all tasks in the current session.',
  parameters: { type: 'object', properties: {} },
  handler: async (args, context) => {
    const { clawDir, sessionId, sessionStore } = context;
    if (!clawDir || !sessionId) return 'Error: No active session';
    const tasks = sessionStore.listTasks(clawDir, sessionId);
    return JSON.stringify({ tasks, total: tasks.length });
  }
});
