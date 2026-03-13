import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'
import { useAppState } from '../store'
import { Avatar } from './Avatar'

interface MembersPanelProps {
  visible: boolean
  sessionId: string | null
  onClose: () => void
  onChanged?: () => void
}

export default function MembersPanel({ visible, sessionId, onClose, onChanged }: MembersPanelProps) {
  const api = useIPC()
  const { workspaces, userProfile } = useAppState()
  const [participants, setParticipants] = useState<string[]>([])
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (visible && sessionId) refresh()
  }, [visible, sessionId])

  const refresh = async () => {
    if (!sessionId) return
    const p = await api.getParticipants(sessionId)
    setParticipants(p || [])
  }

  const addParticipant = async (wsId: string) => {
    if (!sessionId) return
    await api.addParticipant(sessionId, wsId)
    refresh()
    onChanged?.()
  }

  const removeParticipant = async (wsId: string) => {
    if (!sessionId) return
    await api.removeParticipant(sessionId, wsId)
    refresh()
    onChanged?.()
  }

  const handleClose = () => {
    setClosing(true)
  }

  if (!visible && !closing) return null

  const nonParticipants = workspaces.filter(w => !participants.includes(w.id))

  return (
    <div
      className={`settings-backdrop${closing ? ' closing' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className={`settings-drawer${closing ? ' closing' : ''}`}
        onAnimationEnd={() => { if (closing) { setClosing(false); onClose() } }}
      >
        <div className="settings-header">
          <span>成员管理</span>
          <button className="icon-btn" onClick={handleClose}>
            <span className="ic">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          </button>
        </div>

        <div className="settings-body">
          {/* Current participants */}
          <div className="settings-section">
            <div className="settings-section-title">当前成员</div>

            {/* User */}
            <div className="members-item">
              <div className="members-avatar">
                <Avatar role="user" />
              </div>
              <span className="members-name">{userProfile?.userName || '你'}</span>
              <span className="members-tag">你</span>
            </div>

            {/* Workspace participants */}
            {participants.map((pid, i) => {
              const ws = workspaces.find(w => w.id === pid)
              if (!ws) return null
              return (
                <div key={pid} className="members-item">
                  <div className="members-avatar">
                    <Avatar raw={ws.identity?.avatar} role="assistant" wsPath={ws.path} />
                  </div>
                  <span className="members-name">{ws.identity?.name || ws.id}</span>
                  {i === 0 && (
                    <span className="members-tag">群主</span>
                  )}
                  {i > 0 && (
                    <button className="icon-btn members-remove" onClick={() => removeParticipant(pid)} title="移除">
                      <span className="ic">
                        <svg viewBox="0 0 24 24" width="14" height="14">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add participant */}
          {nonParticipants.length > 0 && (
            <div className="settings-section">
              <div className="settings-section-title">添加成员</div>
              {nonParticipants.map(ws => (
                <div key={ws.id} className="members-item members-item-add" onClick={() => addParticipant(ws.id)}>
                  <div className="members-avatar">
                    <Avatar raw={ws.identity?.avatar} role="assistant" wsPath={ws.path} />
                  </div>
                  <span className="members-name">{ws.identity?.name || ws.id}</span>
                  <span className="ic members-add-icon">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path d="M12 5v14"/><path d="M5 12h14"/>
                    </svg>
                  </span>
                </div>
              ))}
            </div>
          )}

          {nonParticipants.length === 0 && participants.length > 0 && (
            <div className="settings-section" style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13, padding: '24px 0' }}>
              所有助手都已加入对话
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
