import { useState } from 'react'
import { Session, Workspace } from '../types'
import { useAppState } from '../store'
import { useIPC } from '../hooks/useIPC'

interface SessionItemProps {
  session: Session
  workspaces: Workspace[]
  isActive: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function SessionItem({ session, workspaces, isActive, onClick, onContextMenu }: SessionItemProps) {
  const { activityState, aiStatus } = useAppState()
  const activity = activityState.get(session.id) || 'idle'
  const statusText = aiStatus.get(session.id) || ''

  const isGroup = (session.participants?.length || 0) > 1
  const ws = workspaces.find(w => w.id === session.participants?.[0])

  let avatarContent = '🤖'
  if (isGroup) {
    avatarContent = '👥'
  } else if (ws?.identity?.avatar) {
    avatarContent = ws.identity.avatar
  }

  const isRunning = activity === 'thinking' || activity === 'running' || activity === 'tool'
  const subtitle = isRunning ? (statusText || '思考中...') : (session.lastMessage || '')

  return (
    <div
      className={`session-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="session-avatar">{avatarContent}</div>
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

export default function Sidebar() {
  const { sessions, workspaces, currentSessionId, setCurrentSessionId, setSessions } = useAppState()
  const api = useIPC()
  const [sidebarVisible, setSidebarVisible] = useState(true)

  const handleNewSession = async () => {
    const result = await api.createSession({})
    if (result?.id) {
      setCurrentSessionId(result.id)
      const sessions = await api.listSessions()
      setSessions(sessions)
    }
  }

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
      <div className="session-list">
        {sessions.map(s => (
          <SessionItem
            key={s.id}
            session={s}
            workspaces={workspaces}
            isActive={s.id === currentSessionId}
            onClick={() => setCurrentSessionId(s.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              // Context menu logic
            }}
          />
        ))}
      </div>
      <div className="sidebar-resize" id="sidebarResize"></div>
    </div>
  )
}
