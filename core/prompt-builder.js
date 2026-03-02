// core/prompt-builder.js — System Prompt 构建
const path = require('path');
const fs = require('fs');
const os = require('os');
const state = require('./state');
const sessionStore = require('../session-store');
const { loadAllSkills } = require('../skills/frontmatter');
const { getToolsPrompt } = require('../tools');

async function buildSystemPrompt() {
  const parts = [];
  if (!state.clawDir) return '';

  // 1. Core identity files
  for (const f of ['SOUL.md', 'USER.md', 'NOW.md', 'AGENTS.md', 'IDENTITY.md']) {
    const p = path.join(state.clawDir, f);
    if (fs.existsSync(p)) parts.push(`## ${f}\n${fs.readFileSync(p, 'utf8')}`);
  }

  // 2. Memory navigation + shared state
  const memDir = path.join(state.clawDir, 'memory');
  if (fs.existsSync(memDir)) {
    for (const f of ['INDEX.md', 'SHARED.md', 'SUBCONSCIOUS.md']) {
      const p = path.join(memDir, f);
      if (fs.existsSync(p)) parts.push(`## memory/${f}\n${fs.readFileSync(p, 'utf8').slice(0, 2000)}`);
    }
    // 3. Today + yesterday daily notes
    const today = new Date().toISOString().slice(0, 10);
    const yd = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    for (const d of [today, yd]) {
      const p = path.join(memDir, `${d}.md`);
      if (fs.existsSync(p)) parts.push(`## memory/${d}.md\n${fs.readFileSync(p, 'utf8').slice(0, 2000)}`);
    }
  }

  // 4. Long-term memory
  const memoryMd = path.join(state.clawDir, 'MEMORY.md');
  if (fs.existsSync(memoryMd)) parts.push(`## MEMORY.md\n${fs.readFileSync(memoryMd, 'utf8')}`);

  // 5. Skills (frontmatter + path compression)
  const skillsDir = path.join(state.clawDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    const skills = loadAllSkills(skillsDir);
    const homeDir = os.homedir();

    for (const skill of skills) {
      const content = skill.body.slice(0, 3000);
      const emoji = skill.emoji ? `${skill.emoji} ` : '';
      const compressedPath = skill.path.startsWith(homeDir)
        ? '~' + skill.path.slice(homeDir.length)
        : skill.path;
      // always:true skills first (already sorted by loadAllSkills)
      parts.push(`## Skill: ${emoji}${skill.name}\nPath: ${compressedPath}/SKILL.md\n\n${content}`);
    }
  }

  // 6. Memory sync instructions
  parts.push('## Memory Sync\nAll sessions share the same memory/ directory. Write important context to memory/ files (e.g. memory/SHARED.md) so other sessions can see it. Use memory_search to recall prior context before answering questions about past work, decisions, or preferences.');

  // 7. Tools
  const toolsPrompt = getToolsPrompt();
  const builtInTools = `
**Built-in tools (require main.js state):**
- **notify**: Send a desktop notification
- **ui_status_set**: Update the sidebar status line (4-20 Chinese chars)
- **memory_search**: Search MEMORY.md + memory/*.md by keywords. Use BEFORE answering questions about prior work, decisions, dates, people, preferences, or todos.
- **memory_get**: Read a snippet from MEMORY.md or memory/*.md with optional line range. Use AFTER memory_search to pull only the needed lines.
- **task_create**: Create a new task in the shared task list
- **task_update**: Update task status/assignee
- **task_list**: List all tasks in current session
- **send_message**: Send a message to another agent

### Important Rules
- When the user asks you to "write", "save", "create a file", or "存成markdown" — you MUST call file_write to actually create the file. Do not just output the content as text.
- After writing a file, tell the user the file path.
- Use ui_status_set to keep the status updated: at start, before tools, when done.
- You can chain multiple tools in sequence (up to 5 rounds). For example: search → search → file_write.
- Before answering questions about past work, decisions, or preferences — call memory_search first.
- Prefer Chinese for status text. Example: '在撰写报告' or '已保存文件'.`;

  parts.push(toolsPrompt + '\n' + builtInTools);

  // 8. Shared Task List (deduplicated)
  if (state.currentSessionId && state.clawDir) {
    try {
      const tasks = sessionStore.listTasks(state.clawDir, state.currentSessionId);
      if (tasks.length) {
        const icons = { pending: '⏳', 'in-progress': '🔄', done: '✅' };
        const lines = tasks.map(t => {
          let s = `[${t.id}] ${icons[t.status] || '?'} ${t.status}: ${t.title}`;
          if (t.assignee) s += ` (${t.assignee})`;
          if (t.dependsOn?.length) s += ` [depends: ${t.dependsOn.join(',')}]`;
          return s;
        });
        parts.push(`## Shared Task List\n${lines.join('\n')}\n\nUse task_create/task_update/task_list to manage tasks. Claim a task before working on it. Complete when done.`);
      }
    } catch {}
  }

  return parts.join('\n\n---\n\n');
}

module.exports = { buildSystemPrompt };
