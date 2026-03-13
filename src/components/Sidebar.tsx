import { useState, useEffect, useRef } from 'react'
import { Session, Workspace } from '../types'
import { useAppState } from '../store'
import { useIPC } from '../hooks/useIPC'
import { Avatar } from './Avatar'
import { stripMarkdown } from '../utils/markdown'
import NewChatSelector from './NewChatSelector'

function presetAvatarSrc(avatar?: string): string {
  if (avatar?.startsWith('preset:')) {
    const idx = parseInt(avatar.replace('preset:', '')) || 1
    return `../avatars/${idx}.png`
  }
  return '../avatars/1.png'
}

function GroupAvatar({ members }: { members: Workspace[] }) {
  const n = members.length
  const border = '2px solid var(--bg-surface)'

  function avatarSrcFor(ws: Workspace) {
    const av = ws.identity?.avatar
    if (av?.startsWith('preset:')) return presetAvatarSrc(av)
    if (av?.startsWith('../')) return av
    if (av?.includes('.') && ws.path) return `file://${ws.path}/.paw/${av}`
    return '../avatars/1.png'
  }

  // 2 members: side by side overlapping
  if (n <= 2) {
    const size = 22
    return (
      <div style={{ width: 32, height: 32, position: 'relative', flexShrink: 0 }}>
        {members.map((ws, i) => (
          <img key={ws.id} src={avatarSrcFor(ws)}
            style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', position: 'absolute', left: i * 12, top: 5, border, zIndex: n - i }}
            onError={(e) => { e.currentTarget.src = '../avatars/1.png' }} />
        ))}
      </div>
    )
  }

  // 3 members: 品字形 (1 top center + 2 bottom)
  const size = 18
  const positions = [
    { left: 7, top: 0 },   // top center
    { left: 0, top: 13 },  // bottom left
    { left: 14, top: 13 }, // bottom right
  ]
  return (
    <div style={{ width: 32, height: 32, position: 'relative', flexShrink: 0 }}>
      {members.map((ws, i) => (
        <img key={ws.id} src={avatarSrcFor(ws)}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', position: 'absolute', ...positions[i], border, zIndex: n - i }}
          onError={(e) => { e.currentTarget.src = '../avatars/1.png' }} />
      ))}
    </div>
  )
}

interface SessionItemProps {
  session: Session
  workspaces: Workspace[]
  isActive: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  renaming?: boolean
  renameText?: string
  onRenameChange?: (text: string) => void
  onRenameSubmit?: () => void
  onRenameCancel?: () => void
}

function SessionItem({ session, workspaces, isActive, onClick, onContextMenu, onDoubleClick, renaming, renameText, onRenameChange, onRenameSubmit, onRenameCancel }: SessionItemProps) {
  const { activityState, aiStatus } = useAppState()
  const activity = activityState.get(session.id) || 'idle'
  const statusText = aiStatus.get(session.id) || ''

  const isGroup = (session.participants?.length || 0) > 1
  const wsId = session.participants?.[0] || session.workspaceId
  const ws = wsId ? workspaces.find(w => w.id === wsId) : workspaces[0]

  // Group sessions: composite avatar from participants
  let avatarEl: React.ReactNode
  if (isGroup) {
    const members = (session.participants || []).slice(0, 3)
      .map(id => workspaces.find(w => w.id === id))
      .filter(Boolean) as Workspace[]
    avatarEl = <GroupAvatar members={members} />
  } else {
    avatarEl = (
      <Avatar
        raw={ws?.identity?.avatar}
        role="assistant"
        wsPath={ws?.path}
      />
    )
  }

  // Status line + dot: only when there's active AI status text AND not idle/done
  const showStatus = !!statusText && activity !== 'idle' && activity !== 'done'

  // F251: Sender prefix for group chat + stripMd (main parity: deep reverse lookup)
  let subtitle = ''
  if (showStatus) {
    subtitle = statusText
  } else if (session.lastMessage) {
    const stripped = stripMarkdown(session.lastMessage)
    if (isGroup && (session.lastSender || session.lastSenderWsId) && stripped) {
      let senderName = session.lastSender || ''
      // Resolve from lastSenderWsId → current workspace identity name
      if (session.lastSenderWsId) {
        const senderWs = workspaces.find(w => w.id === session.lastSenderWsId)
        if (senderWs?.identity?.name) senderName = senderWs.identity.name
      } else if (senderName) {
        // Reverse lookup: find ws whose current name matches lastSender
        const match = workspaces.find(w => w.identity?.name === senderName)
        if (match?.identity?.name) senderName = match.identity.name
      }
      subtitle = senderName ? `${senderName}: ${stripped}` : stripped
    } else {
      subtitle = stripped
    }
  }

  return (
    <div
      className={`session-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className={`session-avatar${isGroup ? ' group' : ''}`}>{avatarEl}</div>
      <div className="session-body">
        <div className="session-row-top">
          {renaming ? (
            <input
              autoFocus
              value={renameText}
              onChange={(e) => onRenameChange?.(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onRenameSubmit?.(); if (e.key === 'Escape') onRenameCancel?.() }}
              onBlur={onRenameSubmit}
              className="session-title"
              style={{ background: 'transparent', border: 'none', outline: 'none', padding: 0, margin: 0, width: '100%', fontFamily: 'inherit', lineHeight: 'inherit', height: 'auto' }}
            />
          ) : (
            <span className="session-title">{session.title || (isGroup ? '群聊' : (ws?.identity?.name || ''))}</span>
          )}
          <span className="session-time">{formatTime(session.updatedAt)}</span>
        </div>
        <div className="session-row-bottom">
          <span className={`session-subtitle ${showStatus ? 'active-status' : ''}`}>{subtitle}</span>
          {activity !== 'idle' && activity !== 'done' && <span className={`session-dot ${activity}`}></span>}
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
  const { sessions, workspaces, currentSessionId, setCurrentSessionId, setSessions, setWorkspaces, setStatus, sidebarVisible, setSidebarVisible, bumpAvatarVersion } = useAppState()
  const api = useIPC()
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, sessionId: null })
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)

  // F250: Sidebar resize
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth')
    return saved ? parseInt(saved) : 260
  })
  const resizing = useRef(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return
      const w = Math.min(400, Math.max(180, e.clientX))
      setSidebarWidth(w)
    }
    const handleMouseUp = () => {
      if (resizing.current) {
        resizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        localStorage.setItem('sidebarWidth', String(sidebarRef.current?.offsetWidth || 260))
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    resizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // F232: Cmd+Shift+S toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') || (e.metaKey && e.key === '.')) {
        e.preventDefault()
        setSidebarVisible(!sidebarVisible)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebarVisible])

  // Restore persisted AI status from session data (once on mount)
  const statusRestored = useRef(false)
  useEffect(() => {
    if (statusRestored.current || sessions.length === 0) return
    statusRestored.current = true
    for (const s of sessions) {
      if (s.statusText) setStatus(s.id, s.statusText)
    }
  }, [sessions])

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu.visible) return
    const close = () => setCtxMenu(prev => ({ ...prev, visible: false }))
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu.visible])

  const handleNewSession = async () => {
    setShowNewChat(true)
  }

  const handleNewChatSelect = async (opts: { workspaceId?: string; mode?: string; participants?: string[] }) => {
    setShowNewChat(false)
    const result = await api.createSession(opts)
    if (result?.id) {
      setCurrentSessionId(result.id)
      const sessions = await api.listSessions()
      setSessions(sessions)
    }
  }

  const refreshWorkspaces = async () => {
    const ws = await api.listWorkspaces()
    setWorkspaces(ws)
    bumpAvatarVersion()
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
    if (!renaming) return
    if (renameText.trim()) {
      await api.renameSession(renaming, renameText.trim())
      const updated = await api.listSessions()
      setSessions(updated)
    }
    setRenaming(null)
  }

  const handleDelete = async (id: string) => {
    setCtxMenu(prev => ({ ...prev, visible: false }))
    await api.deleteSession(id)
    if (currentSessionId === id) setCurrentSessionId(null)
    const updated = await api.listSessions()
    setSessions(updated)
  }


  return (
    <div
      ref={sidebarRef}
      className={`sidebar ${!sidebarVisible ? 'hidden' : ''}`}
      style={{ width: sidebarVisible ? sidebarWidth : 0, minWidth: sidebarVisible ? sidebarWidth : 0 }}
    >
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
      <div className="session-list">
        {sessions.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              workspaces={workspaces}
              isActive={s.id === currentSessionId}
              onClick={() => setCurrentSessionId(s.id)}
              onDoubleClick={() => handleRename(s.id)}
              onContextMenu={(e) => handleContextMenu(e, s.id)}
              renaming={renaming === s.id}
              renameText={renameText}
              onRenameChange={setRenameText}
              onRenameSubmit={submitRename}
              onRenameCancel={() => setRenaming(null)}
            />
        ))}
      </div>
      {/* F250: Resize handle */}
      <div className="sidebar-resize" onMouseDown={handleResizeStart}></div>

      {/* F225: Context menu */}
      {ctxMenu.visible && ctxMenu.sessionId && (
        <div
          className="context-menu"
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '4px 0', minWidth: 140, boxShadow: '0 4px 12px rgba(0,0,0,.3)' }}
        >
          <div className="ctx-item" style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => handleRename(ctxMenu.sessionId!)}>
            <span className="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>
            重命名
          </div>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <div className="ctx-item" style={{ padding: '6px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--status-error)', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => handleDelete(ctxMenu.sessionId!)}>
            <span className="ic"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span>
            删除
          </div>
        </div>
      )}

      {/* New chat selector */}
      {showNewChat && (
        <NewChatSelector
          workspaces={workspaces}
          onSelect={handleNewChatSelect}
          onClose={() => setShowNewChat(false)}
          onWorkspacesChanged={refreshWorkspaces}
        />
      )}
    </div>
  )
}
