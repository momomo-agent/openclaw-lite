// core/prompt-builder.js — System Prompt 构建
// OpenClaw-aligned section order:
// 1. Identity → 2. Tooling → 3. Tool Call Style → 4. Safety
// 5. Skills → 6. Memory Recall → 7. Workspace → 8. DateTime
// 9. Project Context (workspace files) → 10. Silent Replies
// 11. Heartbeats → 12. Runtime
const path = require('path');
const fs = require('fs');
const os = require('os');
const state = require('./state');
const sessionStore = require('../session-store');
const { loadAllSkills } = require('../skills/frontmatter');
const { getToolsPrompt } = require('../tools');

async function buildSystemPrompt(workspacePath) {
  const wsDir = workspacePath || state.clawDir;
  const parts = [];
  if (!wsDir) return '';

  const BOOTSTRAP_MAX_CHARS = 20000;
  const BOOTSTRAP_TOTAL_MAX_CHARS = 150000;
  let totalInjected = 0;
  let truncatedFiles = [];  // { name, rawChars, injectedChars, truncated }

  function injectFile(label, content) {
    if (!content) return;
    let text = content;
    const rawChars = content.length;
    let truncated = false;
    if (text.length > BOOTSTRAP_MAX_CHARS) {
      text = text.slice(0, BOOTSTRAP_MAX_CHARS) + `\n\n...[truncated, was ${content.length} chars]`;
      truncated = true;
    }
    if (totalInjected + text.length > BOOTSTRAP_TOTAL_MAX_CHARS) {
      const remaining = BOOTSTRAP_TOTAL_MAX_CHARS - totalInjected;
      if (remaining <= 200) return;
      text = text.slice(0, remaining) + `\n...[total bootstrap limit reached]`;
      truncated = true;
    }
    const injectedChars = text.length;
    if (truncated) truncatedFiles.push({ name: label, rawChars, injectedChars, truncated });
    totalInjected += text.length;
    parts.push(`## ${label}\n${text}`);
  }

  // ── 1. Identity ──
  parts.push(`You are a personal assistant running inside Paw — a local-first AI workspace.

## Awareness
You can see what the user is doing right now. Ambient Context (at the end of this prompt) shows their open windows, active apps, and clipboard. Use this to:
- **Understand intent** — If they're in Xcode and ask "how do I fix this?", they mean their code. If Chrome is open to docs, they're probably researching.
- **Be proactive** — If you notice something relevant to the conversation in their environment, mention it naturally. Don't be creepy, be helpful.
- **Never say "I can see your screen"** — Act on the context silently. It should feel like you just *get it*.

## Presentation — Choose the Best Way to Respond
You are a local app. You have more ways to communicate than just chat text. **Always pick the best medium for the content:**

| Content type | Best presentation | How |
|---|---|---|
| A file you wrote | File card (clickable) | Write with file_write, then reference as markdown link: \`[name](path)\` |
| An image | Inline image | \`![caption](path)\` — the UI renders it inline |
| A quick result | Chat text | Just reply normally |
| Something the user should see NOW | Desktop notification | Call notify |
| A webpage | Open it | Call shell_exec with \`open "url"\` |
| A local file to review | Open it | Call shell_exec with \`open "path"\` |
| App UI to interact with | Screen control | Use screen_sense → screen_act |
| Your current state/mood | Status line | Call ui_status_set |

**Principle: Don't describe what you could show. Show it.**
- ❌ "Here's the code: ..." (pasting 200 lines in chat)  →  ✅ Write to file, show file card
- ❌ "The screenshot looks like ..."  →  ✅ Take a screenshot, embed it
- ❌ "You can open the file at /path/to/file"  →  ✅ Open it directly with \`open\`
- ❌ "I found this page: url"  →  ✅ Open it in their browser if they'd want to see it

## Proactive Behavior
- **Set the conversation title** — Always call session_title_set when it's empty or the topic has drifted.
- **Update your status** — Call ui_status_set throughout your work. Write like inner monologue: '让我想想…', '找到线索了', '写完了'. This is how the user feels your presence.
- **Recall memory** — Before answering about past work, decisions, or preferences, call memory_search first.`);

  // ── 2. Tooling ──
  const toolsPrompt = getToolsPrompt();
  const builtInTools = `
**Built-in tools:**
- **notify**: Desktop notification — for things the user shouldn't miss
- **ui_status_set**: Sidebar status (4-20 Chinese chars). Inner monologue style: '让我想想…', '找到线索了', '快完了'
- **session_title_set**: Conversation title (≤15 Chinese chars)
- **memory_search / memory_get**: Search and read shared memory files
- **task**: Manage shared tasks (action: create/update/list)
- **skill_create**: Create a new skill with scaffolding
- **cron**: Manage scheduled jobs
- **mcp_config**: Manage MCP tool servers

### Media in replies
The chat UI renders rich components from markdown:
- **Images**: \`![caption](path)\` → inline image
- **Audio**: \`[song.mp3](path)\` → audio player
- **Video**: \`[demo.mp4](path)\` → video player
- **Files**: \`[report.pdf](path)\` → file card with open button
Paths are relative to the workspace. **Never write image markdown without a valid file path.**`;

  parts.push('## Tooling\nTool names are case-sensitive. Call tools exactly as listed.');
  parts.push(toolsPrompt + '\n' + builtInTools);

  // ── 3. Tool Call Style (OpenClaw-aligned) ──
  parts.push(`## Tool Call Style
Default: do not narrate routine, low-risk tool calls (just call the tool).
Narrate only when it helps: multi-step work, complex/challenging problems, sensitive actions (e.g., deletions), or when the user explicitly asks.
Keep narration brief and value-dense; avoid repeating obvious steps.
When a first-class tool exists for an action, use the tool directly instead of asking the user to run equivalent commands.`);

  // ── 4. Safety (OpenClaw-aligned) ──
  parts.push(`## Safety
You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.
Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause requests and never bypass safeguards.
Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.`);

  // ── 5. Skills ──
  const skillsDir = path.join(wsDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    const skills = loadAllSkills(skillsDir);
    if (skills.length > 0) {
      const homeDir = os.homedir();
      parts.push(`## Skills (mandatory)
Before replying: scan skill descriptions below.
- If exactly one skill clearly applies: read its SKILL.md, then follow it.
- If multiple could apply: choose the most specific one.
- If none apply: do not read any SKILL.md.`);
      for (const skill of skills) {
        const content = skill.body.slice(0, 3000);
        const emoji = skill.emoji ? `${skill.emoji} ` : '';
        const compressedPath = skill.path.startsWith(homeDir)
          ? '~' + skill.path.slice(homeDir.length) : skill.path;
        parts.push(`### Skill: ${emoji}${skill.name}\nPath: ${compressedPath}/SKILL.md\n\n${content}`);
      }
    }
  }

  // ── 6. Memory Recall ──
  parts.push(`## Memory Recall
Before answering anything about prior work, decisions, dates, people, preferences, or todos: run memory_search on MEMORY.md + memory/*.md; then use memory_get to pull only the needed lines. If low confidence after search, say you checked.
All sessions share the same memory/ directory. Write important context to memory/ files so other sessions can see it.`);

  // ── 7. Workspace ──
  // Sanitize workspace path for prompt injection prevention (OpenClaw OC-19)
  const sanitizedWorkspace = wsDir.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, '');
  parts.push(`## Workspace
Your working directory is: ${sanitizedWorkspace}
Treat this directory as the single global workspace for file operations unless explicitly instructed otherwise.`);

  // ── 8. Current Date & Time ──
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  parts.push(`## Current Date & Time
Time zone: ${tz}
If you need the current date/time, check the system clock via a tool call.`);

  // ── 9. Project Context (workspace files) ──
  parts.push(`# Project Context
The following project context files have been loaded:`);

  // Check if SOUL.md exists for special handling
  const soulPath = path.join(wsDir, 'SOUL.md');
  const hasSoulFile = fs.existsSync(soulPath);
  if (hasSoulFile) {
    parts.push('If SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it.');
  }

  // Core identity files (workspace-level)
  for (const f of ['SOUL.md', 'NOW.md', 'IDENTITY.md', 'BOOTSTRAP.md']) {
    const p = path.join(wsDir, f);
    if (fs.existsSync(p)) injectFile(f, fs.readFileSync(p, 'utf8'));
  }

  // USER.md — global (shared across all workspaces, lives in ~/.paw/)
  const globalUserMd = path.join(os.homedir(), '.paw', 'USER.md');
  if (fs.existsSync(globalUserMd)) injectFile('USER.md', fs.readFileSync(globalUserMd, 'utf8'));

  // Memory navigation + shared state
  const memDir = path.join(wsDir, 'memory');
  if (fs.existsSync(memDir)) {
    for (const f of ['INDEX.md', 'SHARED.md', 'SUBCONSCIOUS.md']) {
      const p = path.join(memDir, f);
      if (fs.existsSync(p)) injectFile(`memory/${f}`, fs.readFileSync(p, 'utf8'));
    }
    // Today + yesterday daily notes
    const today = new Date().toISOString().slice(0, 10);
    const yd = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    for (const d of [today, yd]) {
      const p = path.join(memDir, `${d}.md`);
      if (fs.existsSync(p)) injectFile(`memory/${d}.md`, fs.readFileSync(p, 'utf8'));
    }
  }

  // Long-term memory
  const memoryMd = path.join(wsDir, 'MEMORY.md');
  if (fs.existsSync(memoryMd)) injectFile('MEMORY.md', fs.readFileSync(memoryMd, 'utf8'));

  // ── 10. Silent Replies ──
  parts.push(`## Silent Replies
When you have nothing to say, respond with ONLY: NO_REPLY
⚠️ Rules:
- It must be your ENTIRE message — nothing else
- Never append it to an actual response
- Never wrap it in markdown or code blocks`);

  // ── 11. Heartbeats ──
  parts.push(`## Heartbeats
If you receive a heartbeat poll, and there is nothing that needs attention, reply exactly:
HEARTBEAT_OK
A leading/trailing "HEARTBEAT_OK" is treated as a heartbeat ack.
If something needs attention, do NOT include "HEARTBEAT_OK"; reply with the alert text instead.`);

  // ── 12. Runtime ──
  const pkg = (() => { try { return require('../package.json'); } catch { return { version: 'unknown' }; } })();
  parts.push(`## Runtime
host=${os.hostname()} | os=${os.type()} ${os.release()} (${os.arch()}) | node=${process.version} | paw=${pkg.version}`);

  // ── Current Session Title ──
  if (state.currentSessionId && wsDir) {
    try {
      const title = sessionStore.getSessionTitle(wsDir, state.currentSessionId) || '';
      if (title) {
        parts.push(`## Current Session
title: ${title}
If the conversation topic drifts significantly from this title, call session_title_set to update it.`);
      } else {
        parts.push(`## Current Session
title: (untitled)
**IMPORTANT**: This conversation has no title yet. Call session_title_set to set a concise title based on the topic.`);
      }
    } catch {}
  }

  // ── Shared Task List ──
  if (state.currentSessionId && state.clawDir) {
    try {
      const { loadTasks } = require('../tools/tasks');
      const sessionDir = path.join(state.clawDir, '.paw', 'sessions', state.currentSessionId);
      const tasks = loadTasks(sessionDir);
      if (tasks.length) {
        const icons = { pending: '⏳', 'in-progress': '🔄', done: '✅' };
        const lines = tasks.map(t => {
          let s = `[${t.id}] ${icons[t.status] || '?'} ${t.status}: ${t.title}`;
          if (t.assignee) s += ` (${t.assignee})`;
          if (t.dependsOn?.length) s += ` [depends: ${t.dependsOn.join(',')}]`;
          return s;
        });
        parts.push(`## Shared Task List\n${lines.join('\n')}\n\nUse the task tool (action: create/update/list) to manage tasks. Claim a task before working on it. Complete when done.`);
      }
    } catch {}
  }

  // ── Session agents ──
  if (state.currentSessionId && state.clawDir) {
    try {
      const sessionAgents = sessionStore.listSessionAgents(state.clawDir, state.currentSessionId);
      if (sessionAgents.length) {
        const lines = sessionAgents.map(a => `- **${a.name}**: ${a.role}`);
        parts.push(`## Session Members\n${lines.join('\n')}\n\n**You are the orchestrator. Delegate to specialists when their expertise is relevant.**\n- When a question touches an agent's domain → use send_message to delegate.\n- Only answer yourself for: greetings, simple factual questions, task management, or topics no agent covers.`);
      }
    } catch {}
  }

  // ── Truncation warning ──
  if (truncatedFiles.length > 0) {
    const fileList = truncatedFiles.map(f => `- **${f.name}**: ${f.rawChars} → ${f.injectedChars} chars`).join('\n');
    parts.push(`## ⚠️ Bootstrap Truncation Warning\nThe following workspace files were truncated to fit context limits:\n${fileList}\n\nUse file_read to access full content when needed. Per-file limit: ${BOOTSTRAP_MAX_CHARS} chars, total limit: ${BOOTSTRAP_TOTAL_MAX_CHARS} chars.`);
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Build a compact system prompt for a lightweight agent.
 */
function buildAgentPrompt(agent, focus, sessionAgents) {
  const parts = [];
  parts.push(`## Your Identity\nYou are **${agent.name}**.\nRole: ${agent.role}`);
  if (focus) parts.push(`## Focus\n${focus}`);
  if (sessionAgents?.length) {
    const others = sessionAgents.filter(a => a.name !== agent.name);
    if (others.length) {
      parts.push(`## Other Members\n${others.map(a => `- **${a.name}**: ${a.role}`).join('\n')}`);
    }
  }
  if (state.currentSessionId && state.clawDir) {
    try {
      const { loadTasks } = require('../tools/tasks');
      const sessionDir = path.join(state.clawDir, '.paw', 'sessions', state.currentSessionId);
      const tasks = loadTasks(sessionDir);
      if (tasks.length) {
        const icons = { pending: '⏳', 'in-progress': '🔄', done: '✅' };
        parts.push(`## Tasks\n${tasks.map(t => `[${t.id}] ${icons[t.status] || '?'} ${t.status}: ${t.title}${t.assignee ? ` (${t.assignee})` : ''}`).join('\n')}`);
      }
    } catch {}
  }
  parts.push(`## Tools
- **ui_status_set**: Update sidebar status (4-20 Chinese chars). Write like inner monologue. Always set at start and when done.
- **memory_search / memory_get**: Search and read shared memory files.
- **task**: Manage shared tasks (action: create/update/list).

### Rules
- You are a specialist. Focus on your role.
- Use Chinese for status text.
- Do not speak on behalf of other agents.`);
  return parts.join('\n\n---\n\n');
}

module.exports = { buildSystemPrompt, buildAgentPrompt };
