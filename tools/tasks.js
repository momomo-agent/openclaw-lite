// tools/tasks.js — unified task tool with file-based storage
const fs = require('fs');
const path = require('path');
const { registerTool } = require('./registry');
const eventBus = require('../core/event-bus');

function tasksPath(sessionDir) {
  return path.join(sessionDir, 'tasks.json');
}

function loadTasks(sessionDir) {
  const p = tasksPath(sessionDir);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')).tasks || [];
  } catch {
    return [];
  }
}

function saveTasks(sessionDir, tasks) {
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(tasksPath(sessionDir), JSON.stringify({ tasks }, null, 2));
}

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

function handleCreate(args, context) {
  const { sessionDir, sessionId, agentName, sessionStore, clawDir } = context;
  const title = (args.title || '').trim();
  if (!title) return 'Error: title required';
  const tasks = loadTasks(sessionDir);
  if (tasks.length >= 50) return 'Error: Task limit reached (50)';
  const sessionAgents = sessionStore.listSessionAgents(clawDir, sessionId);
  const agentNames = new Set(sessionAgents.map(a => a.name));
  let assignee = null;
  if (args.assignee && agentNames.has(args.assignee)) {
    assignee = args.assignee;
  } else {
    assignee = findBestAgent(title, sessionAgents);
  }
  const id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const now = Date.now();
  const task = {
    id, title, status: 'pending',
    assignee: assignee || null,
    dependsOn: args.dependsOn || [],
    createdBy: agentName || 'user',
    createdAt: now, updatedAt: now,
  };
  tasks.push(task);
  saveTasks(sessionDir, tasks);
  eventBus.dispatch('tasks-changed', sessionId);
  return JSON.stringify(task);
}

function handleUpdate(args, context) {
  const { sessionDir, sessionId, agentName, sessionStore, clawDir } = context;
  const tasks = loadTasks(sessionDir);
  const idx = tasks.findIndex(t => t.id === args.taskId);
  if (idx === -1) return 'Error: Task not found';
  const task = tasks[idx];

  const status = args.status;
  if (status) {
    const order = { pending: 0, 'in-progress': 1, done: 2 };
    if (order[status] === undefined) return `Error: Invalid status "${status}"`;
    if (order[status] <= order[task.status]) return `Error: Cannot move from ${task.status} to ${status}`;

    if (status === 'in-progress' && task.dependsOn?.length) {
      const blocked = task.dependsOn.filter(dep => {
        const depTask = tasks.find(t => t.id === dep);
        return depTask && depTask.status !== 'done';
      });
      if (blocked.length) return `Error: Blocked by: ${blocked.join(', ')}`;
    }
    task.status = status;
  }

  if (args.assignee !== undefined) task.assignee = args.assignee || agentName;
  task.updatedAt = Date.now();
  tasks[idx] = task;
  saveTasks(sessionDir, tasks);
  eventBus.dispatch('tasks-changed', sessionId);

  // Auto-rotation: when a task is done, check for unblocked tasks
  if (status === 'done') {
    const unblocked = tasks.find(t =>
      t.status === 'pending' && t.dependsOn?.includes(args.taskId) &&
      t.dependsOn.every(dep => tasks.find(d => d.id === dep)?.status === 'done')
    );
    if (unblocked) {
      if (!unblocked.assignee) {
        const sessionAgents = sessionStore.listSessionAgents(clawDir, sessionId);
        const best = findBestAgent(unblocked.title, sessionAgents);
        if (best) {
          unblocked.assignee = best;
          unblocked.updatedAt = Date.now();
          saveTasks(sessionDir, tasks);
        }
      }
      eventBus.dispatch('auto-rotate', {
        sessionId, completedTask: args.taskId, completedBy: agentName, nextTask: unblocked
      });
    }
  }

  return JSON.stringify({ id: task.id, status: task.status, assignee: task.assignee });
}

function handleList(context) {
  const tasks = loadTasks(context.sessionDir);
  return JSON.stringify({ tasks, total: tasks.length });
}

registerTool({
  name: 'task',
  description: 'Manage tasks in the current session. Actions: create (new task), update (change status/assignee), list (show all tasks).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'update', 'list'], description: 'Action to perform' },
      title: { type: 'string', description: 'Task title (for create)' },
      taskId: { type: 'string', description: 'Task ID (for update)' },
      status: { type: 'string', enum: ['in-progress', 'done'], description: 'New status (for update)' },
      assignee: { type: 'string', description: 'Agent name (for create/update)' },
      dependsOn: { type: 'array', items: { type: 'string' }, description: 'Task IDs this depends on (for create)' },
    },
    required: ['action']
  },
  handler: async (args, context) => {
    const { clawDir, sessionId, sessionDir } = context;
    if (!clawDir || !sessionId || !sessionDir) return 'Error: No active session';
    switch (args.action) {
      case 'create': return handleCreate(args, context);
      case 'update': return handleUpdate(args, context);
      case 'list': return handleList(context);
      default: return `Error: Unknown action "${args.action}"`;
    }
  }
});

// Export loadTasks for IPC use
module.exports = { loadTasks };
