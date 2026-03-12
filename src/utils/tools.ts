import { ToolStep } from '../types'

const TOOL_ACTIONS: Record<string, { verb: string; icon: string; argKey?: string; extract?: (v: any) => string; hidden?: boolean }> = {
  file_read: { verb: 'Read', icon: '📄', argKey: 'path', extract: v => v?.split('/').pop() },
  file_write: { verb: 'Wrote', icon: '✏️', argKey: 'path', extract: v => v?.split('/').pop() },
  file_edit: { verb: 'Edited', icon: '✏️', argKey: 'path', extract: v => v?.split('/').pop() },
  shell_exec: { verb: 'Ran', icon: '⚡', argKey: 'command', extract: v => v?.split('\n')[0]?.slice(0, 40) },
  web_fetch: { verb: 'Fetched', icon: '🌐', argKey: 'url', extract: v => { try { return new URL(v).hostname } catch { return v?.slice(0, 30) } } },
  search: { verb: 'Searched', icon: '🔍', argKey: 'query', extract: v => v?.slice(0, 40) },
  memory_search: { verb: 'Recalled', icon: '🧠', argKey: 'query', extract: v => v?.slice(0, 30) },
  ui_status_set: { verb: 'Updated status', icon: '📊', hidden: true },
}

export function humanizeToolStep(name: string, input?: any): { text: string; icon: string; hidden?: boolean } {
  const action = TOOL_ACTIONS[name]
  if (!action) return { text: name, icon: '🔧' }

  let target = ''
  if (action.argKey && input) {
    const src = typeof input === 'object' ? input : (() => { try { return JSON.parse(input) } catch { return null } })()
    if (src) {
      const raw = src[action.argKey]
      target = raw ? (action.extract ? action.extract(raw) : String(raw)) : ''
    }
  }
  return { text: target ? `${action.verb} ${target}` : action.verb, icon: action.icon, hidden: action.hidden }
}

export function summarizeToolSteps(steps: ToolStep[]): string | null {
  const cats = { read: 0, edit: 0, exec: 0, search: 0, other: 0 }
  const samples: any = { read: [], edit: [], search: [] }

  for (const s of steps) {
    const h = humanizeToolStep(s.name, s.input)
    if (h.hidden) continue
    const n = s.name.toLowerCase()
    if (n.includes('read') || n.includes('glob')) {
      cats.read++
      if (samples.read.length < 1 && s.input?.file_path) samples.read.push(s.input.file_path.split('/').pop())
    } else if (n.includes('edit') || n.includes('write')) {
      cats.edit++
      if (samples.edit.length < 1 && s.input?.file_path) samples.edit.push(s.input.file_path.split('/').pop())
    } else if (n.includes('exec') || n.includes('bash')) cats.exec++
    else if (n.includes('grep') || n.includes('search')) {
      cats.search++
      if (samples.search.length < 1 && s.input?.pattern) samples.search.push(s.input.pattern)
    } else cats.other++
  }

  const total = cats.read + cats.edit + cats.exec + cats.search + cats.other
  if (!total) return null

  if (cats.read && !cats.edit && !cats.exec && !cats.search) return `读取了 ${cats.read} 个文件`
  if (cats.edit && !cats.read && cats.edit === 1 && samples.edit[0]) return `编辑了 ${samples.edit[0]}`
  if (cats.edit && !cats.read) return `编辑了 ${cats.edit} 个文件`
  if (cats.read && cats.edit) return `读取并编辑了 ${cats.read + cats.edit} 个文件`
  if (cats.search && samples.search[0]) return `搜索了 ${samples.search[0]}`
  if (cats.exec) return `执行了 ${cats.exec} 个命令`
  return `执行了 ${total} 个操作`
}
