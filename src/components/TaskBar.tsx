import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'

interface Task {
  id: string
  title: string
  status: 'pending' | 'in-progress' | 'done'
  assignee?: string
}

interface TaskBarProps {
  sessionId: string | null
}

const STATUS_ICON: Record<string, string> = { pending: '⏳', 'in-progress': '🔄', done: '✅' }

export default function TaskBar({ sessionId }: TaskBarProps) {
  const api = useIPC()
  const [tasks, setTasks] = useState<Task[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (sessionId) refresh()
  }, [sessionId])

  // Auto-refresh on task changes
  useEffect(() => {
    const handler = (sid: string) => {
      if (sid === sessionId) refresh()
    }
    const cleanup = api.onTasksChanged?.(handler)
    return () => { if (typeof cleanup === 'function') cleanup() }
  }, [sessionId])

  const refresh = async () => {
    if (!sessionId) return
    const t = await api.listTasks?.(sessionId)
    setTasks(t || [])
  }

  if (!tasks.length) return null

  const done = tasks.filter(t => t.status === 'done').length

  return (
    <div className="task-bar" style={{ borderTop: '1px solid var(--border)', padding: '4px 12px', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setCollapsed(c => !c)}>
        <span>{collapsed ? '▸' : '▾'}</span>
        <span style={{ fontWeight: 600 }}>Tasks</span>
        <span style={{ color: 'var(--text-secondary)' }}>({done}/{tasks.length})</span>
      </div>
      {!collapsed && (
        <div style={{ marginTop: 4 }}>
          {tasks.map(t => (
            <div key={t.id} className={`task-item ${t.status}`}
              style={{ display: 'flex', gap: 8, padding: '2px 0', color: t.status === 'done' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{t.id.slice(0, 8)}</span>
              <span>{STATUS_ICON[t.status] || '?'}</span>
              <span style={{ flex: 1, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
              {t.assignee && <span style={{ color: 'var(--text-secondary)' }}>{t.assignee}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
