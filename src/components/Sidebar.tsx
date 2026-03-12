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

const BotIcon = () => (
  <span className="ic">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>
      <path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
    </svg>
  </span>
)

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
  // Find workspace: try participants first, then workspaceId from listAllSessions
  const wsId = session.participants?.[0] || session.workspaceId
  const ws = wsId ? workspaces.find(w => w.id === wsId) : workspaces[0]

  // Avatar: group icon, workspace PNG, or bot SVG
  let avatarEl: React.ReactNode = <BotIcon />
  if (isGroup) {
    avatarEl = <GroupIcon />
  } else if (ws?.identity?.avatar?.includes('.') && ws?.path) {
    avatarEl = <img src={`file://${ws.path}/.paw/${ws.identity.avatar}`} className="avatar-img" alt="" />
  } else if (ws?.identity?.avatar) {
    avatarEl = <>{ws.identity.avatar}</>
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
