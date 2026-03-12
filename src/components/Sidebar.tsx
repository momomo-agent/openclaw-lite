import { useState, useEffect } from 'react'
import { Session, Workspace } from '../types'
import { useAppState } from '../store'
import { useIPC } from '../hooks/useIPC'
import { Avatar } from './Avatar'

interface SessionItemProps {
  session: Session
  workspaces: Workspace[]
  isActive: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

const GroupIcon = () => (
  <span className="ic">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  </span>
)

function SessionItem({ session, workspaces, isActive, onClick, onContextMenu }: SessionItemProps) {
  const { activityState, aiStatus } = useAppState()
  const activity = activityState.get(session.id) || 'idle'
  const statusText = aiStatus.get(session.id) || ''

  const isGroup = (session.participants?.length || 0) > 1
  const wsId = session.participants?.[0] || session.workspaceId
  const ws = wsId ? workspaces.find(w => w.id === wsId) : workspaces[0]

  let avatarEl: React.ReactNode
  if (isGroup) {
    avatarEl = <GroupIcon />
  } else {
    avatarEl = (
      <Avatar
        raw={ws?.identity?.avatar}
        role="assistant"
        wsPath={ws?.path}
      />
    )
  }

  const isRunning = activity === 'thinking' || activity === 'running' || activity === 'tool'
  const subtitle = isRunning ? (statusText || '思考中...') : (session.lastMessage || '')

  return (
    <div
      className={`session-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="session-avatar">{avatarEl}</div>
      <div className="session-body">
        <div className="session-row-top">
          <span className="session-title">{session.title}</span>
          <span className="session-time">{formatTime(session.updatedAt)}</span>
        </div>
        <div className="session-row-bottom">
          <span className={`session-subtitle ${isRunning ? 'active-status' : ''}`}>{subtitle}</span>
          {activity !== 'idle' && <span className={`session-dot ${activity}`}></span>}
        </div>
      </div>
    </div>
  )
}

function formatTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// F225: Context menu
interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  sessionId: string | null
}

export default function Sidebar() {
  const { sessions, workspaces, currentSessionId, setCurrentSessionId, setSessions } = useAppState()
  const api = useIPC()
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, sessionId: null })
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  // F232: Cmd+Shift+S toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key === 's') {
        e.preventDefault()
        setSidebarVisible(v => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu.visible) return
    const close = () => setCtxMenu(prev => ({ ...prev, visible: false }))
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu.visible])

  const handleNewSession = async () => {
    const result = await api.createSession({})
    if (result?.id) {
      setCurrentSessionId(result.id)
      const sessions = await api.listSessions()
      setSessions(sessions)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, sessionId })
  }

  const handleRename = (id: string) => {
    const session = sessions.find(s => s.id === id)
    setRenameText(session?.title || '')
    setRenaming(id)
    setCtxMenu(prev => ({ ...prev, visible: false }))
  }

  const submitRename = async () => {
    if (!renaming || !renameText.trim()) return
    await api.renameSession(renaming, renameText.trim())
    setRenaming(null)
    const updated = await api.listSessions()
    setSessions(updated)
  }

  const handleDelete = async (id: string) => {
    setCtxMenu(prev => ({ ...prev, visible: false }))
    await api.deleteSession(id)
    if (currentSessionId === id) setCurrentSessionId(null)
    const updated = await api.listSessions()
    setSessions(updated)
  }

  const handleExport = async (id: string) => {
    setCtxMenu(prev => ({ ...prev, visible: false }))
    await api.exportSession(id)
  }

  // F232: Filter sessions
  const filtered = searchQuery
    ? sessions.filter(s => s.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions

  return (
    <div className={`sidebar ${!sidebarVisible ? 'hidden' : ''}`}>
      <div className="sidebar-header">
        <button className="icon-btn" onClick={handleNewSession}>+</button>
        <button className="icon-btn" onClick={() => setSidebarVisible(!sidebarVisible)}>
          <span className="ic">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 3v18"/>
            </svg>
          </span>
        </button>
      </div>
      {/* F232: Search */}
      <div style={{ padding: '0 8px 4px' }}>
        <input
          type="text"
          className="session-search"
          placeholder="搜索对话..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '4px 8px', fontSize: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none' }}
        />
      </div>
      <div className="session-list">
        {filtered.map(s => (
          renaming === s.id ? (
            <div key={s.id} className="session-item active" style={{ padding: '8px 12px' }}>
              <input
                autoFocus
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenaming(null) }}
                onBlur={submitRename}
                style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
              />
            </div>
          ) : (
            <SessionItem
              key={s.id}
              session={s}
              workspaces={workspaces}
              isActive={s.id === currentSessionId}
              onClick={() => setCurrentSessionId(s.id)}
              onContextMenu={(e) => handleContextMenu(e, s.id)}
            />
          )
        ))}
      </div>
      <div className="sidebar-resize" id="sidebarResize"></div>

      {/* F225: Context menu */}
      {ctxMenu.visible && ctxMenu.sessionId && (
        <div
          className="context-menu"
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '4px 0', minWidth: 140, boxShadow: '0 4px 12px rgba(0,0,0,.3)' }}
        >
          <div className="ctx-item" style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}
            onClick={() => handleRename(ctxMenu.sessionId!)}>
            ✏️ 重命名
          </div>
          <div className="ctx-item" style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}
            onClick={() => handleExport(ctxMenu.sessionId!)}>
            📤 导出
          </div>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <div className="ctx-item" style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--status-error)' }}
            onClick={() => handleDelete(ctxMenu.sessionId!)}>
            🗑 删除
          </div>
        </div>
      )}
    </div>
  )
}
