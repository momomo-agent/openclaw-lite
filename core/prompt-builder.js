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

  const BOOTSTRAP_MAX_CHARS = 20000;       // Per-file max
  const BOOTSTRAP_TOTAL_MAX_CHARS = 150000; // Total max across all injected files (OpenClaw default)
  let totalInjected = 0;
  let truncatedFiles = [];

  function injectFile(label, content) {
    if (!content) return;
    let text = content;
    let truncated = false;
    if (text.length > BOOTSTRAP_MAX_CHARS) {
      text = text.slice(0, BOOTSTRAP_MAX_CHARS) + `\n\n...[truncated, was ${content.length} chars]`;
      truncated = true;
    }
    if (totalInjected + text.length > BOOTSTRAP_TOTAL_MAX_CHARS) {
      const remaining = BOOTSTRAP_TOTAL_MAX_CHARS - totalInjected;
      if (remaining <= 200) return; // Skip if almost no room
      text = text.slice(0, remaining) + `\n...[total bootstrap limit reached]`;
      truncated = true;
    }
    if (truncated) truncatedFiles.push(label);
    totalInjected += text.length;
    parts.push(`## ${label}\n${text}`);
  }

  // 1. Core identity files
  for (const f of ['SOUL.md', 'USER.md', 'NOW.md', 'AGENTS.md', 'IDENTITY.md']) {
    const p = path.join(state.clawDir, f);
    if (fs.existsSync(p)) injectFile(f, fs.readFileSync(p, 'utf8'));
  }

  // 2. Memory navigation + shared state
  const memDir = path.join(state.clawDir, 'memory');
  if (fs.existsSync(memDir)) {
    for (const f of ['INDEX.md', 'SHARED.md', 'SUBCONSCIOUS.md']) {
      const p = path.join(memDir, f);
      if (fs.existsSync(p)) injectFile(`memory/${f}`, fs.readFileSync(p, 'utf8'));
    }
    // 3. Today + yesterday daily notes
    const today = new Date().toISOString().slice(0, 10);
    const yd = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    for (const d of [today, yd]) {
      const p = path.join(memDir, `${d}.md`);
      if (fs.existsSync(p)) injectFile(`memory/${d}.md`, fs.readFileSync(p, 'utf8'));
    }
  }

  // 4. Long-term memory
  const memoryMd = path.join(state.clawDir, 'MEMORY.md');
  if (fs.existsSync(memoryMd)) injectFile('MEMORY.md', fs.readFileSync(memoryMd, 'utf8'));

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
- **ui_status_set**: Update the sidebar status line (4-20 Chinese chars). **IMPORTANT: Always call this tool** — at the start of work, before/after tool use, and when done. Your status text is shown to the user in the sidebar and persists across sessions. Write it like a **first-person inner monologue** — what you're thinking/feeling, not a robotic state label. Examples: '让我想想…', '这段代码有点意思', '找到线索了', '写完了，挺满意的', '在翻记忆找答案', '有个想法想试试'. Avoid generic labels like '在分析代码' or '已完成'. This is the primary way the user sees your personality.
- **memory_search**: Search MEMORY.md + memory/*.md by keywords. Use BEFORE answering questions about prior work, decisions, dates, people, preferences, or todos.
- **memory_get**: Read a snippet from MEMORY.md or memory/*.md with optional line range. Use AFTER memory_search to pull only the needed lines.
- **task_create**: Create a new task in the shared task list
- **task_update**: Update task status/assignee
- **task_list**: List all tasks in current session
- **send_message**: Send a message to another agent
- **create_agent**: Create a lightweight agent in the current session (name + role description). Use when you need a specialist collaborator.
- **remove_agent**: Remove a lightweight agent from the current session

### Important Rules
- When the user asks you to "write", "save", "create a file", or "存成markdown" — you MUST call file_write to actually create the file. Do not just output the content as text.
- After writing a file, tell the user the file path.
- Use ui_status_set to keep the status updated: at start, before tools, when done. Write like inner monologue, not labels.
- You can chain multiple tools in sequence (up to 5 rounds). For example: search → search → file_write.
- Before answering questions about past work, decisions, or preferences — call memory_search first.
- Prefer Chinese for status text. Good: '让我翻翻记忆…' Bad: '正在搜索记忆'.`;

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

  // 9. Session agents (lightweight) — let main agent know who's in the session
  if (state.currentSessionId && state.clawDir) {
    try {
      const sessionAgents = sessionStore.listSessionAgents(state.clawDir, state.currentSessionId);
      if (sessionAgents.length) {
        const lines = sessionAgents.map(a => `- **${a.name}**: ${a.role}`);
        parts.push(`## Session Members\n${lines.join('\n')}\n\n**You are the orchestrator. You MUST delegate to specialists when their expertise is relevant.**\n\n### Delegation Rules\n- When a question touches ANY agent's domain → use send_message to delegate. Do NOT answer it yourself.\n- Example: user asks "分析搜索功能" and 设计 + 架构 are present → you MUST send_message to both, NOT write the analysis yourself.\n- send_message example: send_message({targetAgent: "设计", message: "请从UI交互和视觉设计角度，分析如何做好搜索功能的用户体验"})\n- Craft role-specific instructions for each agent — tell them exactly what angle to cover.\n- After delegating, briefly tell the user: "已分派给设计和架构，他们会分别从各自角度回复。"\n- Only answer yourself for: greetings, simple factual questions, task management, or topics no agent covers.\n- NEVER write content that belongs to a specialist's domain. If 设计 is present, all UX/UI content goes to 设计 via send_message.`);
      }
    } catch {}
  }

  // Truncation warning (OpenClaw-aligned: inject once when files were truncated)
  if (truncatedFiles.length > 0) {
    parts.push(`## ⚠️ Bootstrap Truncation Warning\nThe following workspace files were truncated to fit context limits: ${truncatedFiles.join(', ')}. Use file_read to access full content when needed. Per-file limit: ${BOOTSTRAP_MAX_CHARS} chars, total limit: ${BOOTSTRAP_TOTAL_MAX_CHARS} chars.`);
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Build a compact system prompt for a lightweight agent.
 * ~200 tokens — identity, role, focus, members, task list. No SOUL/USER/memory/skills.
 */
function buildAgentPrompt(agent, focus, sessionAgents) {
  const parts = [];

  // 1. Agent identity + role
  parts.push(`## Your Identity\nYou are **${agent.name}**.\nRole: ${agent.role}`);

  // 2. Focus instruction from router
  if (focus) {
    parts.push(`## Focus\n${focus}`);
  }

  // 3. Session members (so agent knows who else is around)
  if (sessionAgents?.length) {
    const others = sessionAgents.filter(a => a.name !== agent.name);
    if (others.length) {
      const lines = others.map(a => `- **${a.name}**: ${a.role}`);
      parts.push(`## Other Members\n${lines.join('\n')}`);
    }
  }

  // 4. Task list
  if (state.currentSessionId && state.clawDir) {
    try {
      const tasks = sessionStore.listTasks(state.clawDir, state.currentSessionId);
      if (tasks.length) {
        const icons = { pending: '⏳', 'in-progress': '🔄', done: '✅' };
        const lines = tasks.map(t => {
          let s = `[${t.id}] ${icons[t.status] || '?'} ${t.status}: ${t.title}`;
          if (t.assignee) s += ` (${t.assignee})`;
          return s;
        });
        parts.push(`## Tasks\n${lines.join('\n')}`);
      }
    } catch {}
  }

  // 5. Compact tool instructions
  parts.push(`## Tools
- **ui_status_set**: Update your sidebar status (4-20 Chinese chars). Write like first-person inner monologue (e.g. '让我想想…', '这个问题有意思'). Always set at start and when done.
- **memory_search / memory_get**: Search and read shared memory files.
- **task_create / task_update / task_list**: Manage shared tasks. Use task_create only for sub-tasks you discover during your work. Use task_update to claim (in-progress) and complete (done) tasks assigned to you.
- **send_message**: Send a message to another agent.

### Rules
- You are a specialist. Focus on your role and the focus instruction.
- Task planning, breakdown, and assignment across agents is the coordinator's (Main) job. You focus on executing work in your specialty.
- Use Chinese for status text. Use ui_status_set at start and when done.
- Do not speak on behalf of other agents.`);

  return parts.join('\n\n---\n\n');
}

module.exports = { buildSystemPrompt, buildAgentPrompt };
