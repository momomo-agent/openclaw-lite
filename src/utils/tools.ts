import { ToolStep } from '../types'

interface ToolAction {
  verb: string
  icon: string
  argKey?: string
  extract?: (v: any) => string
  hidden?: boolean
}

const TOOL_ACTIONS: Record<string, ToolAction> = {
  // File operations
  file_read:    { verb: 'Read', icon: '📄', argKey: 'path', extract: v => v?.split('/').pop() || v },
  file_write:   { verb: 'Wrote', icon: '✏️', argKey: 'path', extract: v => v?.split('/').pop() || v },
  file_edit:    { verb: 'Edited', icon: '✏️', argKey: 'path', extract: v => v?.split('/').pop() || v },

  // Execution
  shell_exec:   { verb: 'Ran', icon: '⚡', argKey: 'command', extract: v => v?.split('\n')[0]?.slice(0, 40) },
  code_exec:    { verb: 'Ran code', icon: '💻' },
  process:      { verb: 'Executed', icon: '⚙️', argKey: 'command', extract: v => v?.split('\n')[0]?.slice(0, 40) },

  // Web
  web_fetch:    { verb: 'Fetched', icon: '🌐', argKey: 'url', extract: v => { try { return new URL(v).hostname } catch { return v?.slice(0, 30) } } },

  // Search
  search:       { verb: 'Searched', icon: '🔍', argKey: 'query', extract: v => v?.slice(0, 40) },

  // Memory
  memory_search: { verb: 'Recalled', icon: '🧠', argKey: 'query', extract: v => v?.slice(0, 30) },
  memory_get:    { verb: 'Read memory', icon: '🧠', argKey: 'key', extract: v => v?.slice(0, 30) },
  memory_set:    { verb: 'Saved memory', icon: '🧠', argKey: 'key', extract: v => v?.slice(0, 30) },
  memory_list:   { verb: 'Listed memories', icon: '🧠' },

  // Agent / delegation
  send_message:  { verb: 'Sent message to', icon: '💬', argKey: 'target', extract: v => v?.slice(0, 30) },
  delegate_to:   { verb: 'Delegated to', icon: '🤝', argKey: 'agent', extract: v => v?.slice(0, 30) },
  create_agent:  { verb: 'Created agent', icon: '👤', argKey: 'name', extract: v => v?.slice(0, 30) },
  remove_agent:  { verb: 'Removed agent', icon: '🗑️', argKey: 'name', extract: v => v?.slice(0, 30) },

  // Tasks
  task_create:   { verb: 'Created task', icon: '📋', argKey: 'title', extract: v => v?.slice(0, 40) },
  task_update:   { verb: 'Updated task', icon: '📋', argKey: 'id', extract: v => String(v) },
  task_list:     { verb: 'Listed tasks', icon: '📋' },

  // Skills
  skill_exec:    { verb: 'Ran skill', icon: '🎯', argKey: 'name', extract: v => v?.slice(0, 30) },
  skill_create:  { verb: 'Created skill', icon: '🎯', argKey: 'name', extract: v => v?.slice(0, 30) },
  skill_install: { verb: 'Installed', icon: '📦', argKey: 'name', extract: v => v?.slice(0, 30) },

  // Claude Code
  claude_code:   { verb: 'Claude Code:', icon: '🖥️', argKey: 'task', extract: v => v?.slice(0, 40) },

  // Scheduling / notifications
  cron:          { verb: 'Scheduled', icon: '⏰', argKey: 'expression', extract: v => v?.slice(0, 30) },
  notify:        { verb: 'Notified:', icon: '🔔', argKey: 'title', extract: v => v?.slice(0, 40) },

  // Config
  mcp_config:    { verb: 'Configured MCP', icon: '⚙️' },

  // Hidden tools
  stay_silent:   { verb: '(silent)', icon: '🤫', hidden: true },
  ui_status_set: { verb: 'Updated status', icon: '📊', hidden: true },
}

export function humanizeToolStep(name: string, input?: any): { text: string; icon: string; hidden?: boolean } {
  const action = TOOL_ACTIONS[name]
  if (!action) return { text: name, icon: '🔧' }

  let target = ''
  if (action.argKey && input) {
    const src = typeof input === 'object'
      ? input
      : (() => { try { return JSON.parse(input) } catch { return null } })()
    if (src) {
      const raw = src[action.argKey]
      target = raw ? (action.extract ? action.extract(raw) : String(raw)) : ''
    }
  }
  return {
    text: target ? `${action.verb} ${target}` : action.verb,
    icon: action.icon,
    hidden: action.hidden,
  }
}

/** Extract the most relevant arg value from a tool step's input, truncated */
export function extractArgPreview(name: string, input?: any, maxLen = 60): string | null {
  if (!input) return null
  const action = TOOL_ACTIONS[name]
  const src = typeof input === 'object'
    ? input
    : (() => { try { return JSON.parse(input) } catch { return null } })()
  if (!src) return null

  // Use the defined argKey first
  if (action?.argKey && src[action.argKey]) {
    const val = String(src[action.argKey])
    return val.length > maxLen ? val.slice(0, maxLen) + '...' : val
  }

  // Fallback: pick first string-valued key
  for (const key of Object.keys(src)) {
    const val = src[key]
    if (typeof val === 'string' && val.length > 0) {
      const display = val.length > maxLen ? val.slice(0, maxLen) + '...' : val
      return display
    }
  }
  return null
}

export function summarizeToolSteps(steps: ToolStep[]): string | null {
  const cats = { read: 0, edit: 0, exec: 0, search: 0, memory: 0, agent: 0, task: 0, skill: 0, other: 0 }
  const samples: Record<string, string[]> = { read: [], edit: [], search: [], skill: [] }

  for (const s of steps) {
    const h = humanizeToolStep(s.name, s.input)
    if (h.hidden) continue
    const n = s.name.toLowerCase()

    if (n.includes('read') && !n.includes('memory')) {
      cats.read++
      const path = s.input?.path || s.input?.file_path
      if (samples.read.length < 1 && path) samples.read.push(path.split('/').pop())
    } else if (n.includes('edit') || n.includes('write')) {
      cats.edit++
      const path = s.input?.path || s.input?.file_path
      if (samples.edit.length < 1 && path) samples.edit.push(path.split('/').pop())
    } else if (n.includes('exec') || n.includes('bash') || n === 'process' || n === 'code_exec') {
      cats.exec++
    } else if (n.includes('grep') || n.includes('search') && !n.includes('memory')) {
      cats.search++
      if (samples.search.length < 1 && s.input?.pattern) samples.search.push(s.input.pattern)
      else if (samples.search.length < 1 && s.input?.query) samples.search.push(s.input.query)
    } else if (n.startsWith('memory_')) {
      cats.memory++
    } else if (n.startsWith('task_')) {
      cats.task++
    } else if (n.includes('agent') || n === 'delegate_to' || n === 'send_message') {
      cats.agent++
    } else if (n.includes('skill')) {
      cats.skill++
      if (samples.skill.length < 1 && s.input?.name) samples.skill.push(s.input.name)
    } else {
      cats.other++
    }
  }

  const total = Object.values(cats).reduce((a, b) => a + b, 0)
  if (!total) return null

  // Single-category summaries
  if (cats.read && !cats.edit && !cats.exec && !cats.search) {
    return `读取了 ${cats.read} 个文件`
  }
  if (cats.edit && !cats.read && cats.edit === 1 && samples.edit[0]) {
    return `编辑了 ${samples.edit[0]}`
  }
  if (cats.edit && !cats.read) {
    return `编辑了 ${cats.edit} 个文件`
  }
  if (cats.read && cats.edit) {
    return `读取并编辑了 ${cats.read + cats.edit} 个文件`
  }
  if (cats.search && samples.search[0]) {
    return `搜索了 ${samples.search[0]}`
  }
  if (cats.exec) {
    return `执行了 ${cats.exec} 个命令`
  }
  if (cats.memory) {
    return `访问了 ${cats.memory} 次记忆`
  }
  if (cats.task) {
    return `处理了 ${cats.task} 个任务`
  }
  if (cats.agent) {
    return `与 ${cats.agent} 个代理交互`
  }
  if (cats.skill && samples.skill[0]) {
    return `运行了技能 ${samples.skill[0]}`
  }

  return `执行了 ${total} 个操作`
}
