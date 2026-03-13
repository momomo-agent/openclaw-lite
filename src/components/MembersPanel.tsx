import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'
import { useAppState } from '../store'
import { Avatar } from './Avatar'

interface MembersPanelProps {
  visible: boolean
  sessionId: string | null
  onClose: () => void
  onChanged?: () => void
  onWorkspacesChanged?: () => void
}

const ENGINE_COLORS: Record<string, string> = {
  claude: '#f59e0b', codex: '#22c55e', gemini: '#3b82f6', kiro: '#a855f7',
}

export default function MembersPanel({ visible, sessionId, onClose, onChanged, onWorkspacesChanged }: MembersPanelProps) {
  const api = useIPC()
  const { workspaces, userProfile } = useAppState()
  const [participants, setParticipants] = useState<string[]>([])
  const [closing, setClosing] = useState(false)
  const [availableEngines, setAvailableEngines] = useState<{id: string, name: string, avatar?: string}[]>([])

  useEffect(() => {
    if (visible && sessionId) refresh()
    // Load available coding agent engines
    api.listCodingAgents?.().then((list: any[]) => {
      if (list?.length) setAvailableEngines(list)
    }).catch(() => {})
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

  const handleAddCA = async (engine: string) => {
    if (!sessionId) return
    const projectPath = await api.selectDirectory?.()
    if (!projectPath) return
    const result = await (api as any).workspaceAddCodingAgent?.({ engine, projectPath })
    if (result?.ok && result.workspace) {
      onWorkspacesChanged?.()
      await api.addParticipant(sessionId, result.workspace.id)
      refresh()
      onChanged?.()
    }
  }

  const handleClose = () => {
    setClosing(true)
  }

  if (!visible && !closing) return null

  // All participants are workspace IDs — look them up uniformly
  const participantWorkspaces = participants.map(pid => workspaces.find(w => w.id === pid)).filter(Boolean)
  // Only show local (non-coding-agent) workspaces that aren't already participants
  const nonParticipantLocalWs = workspaces.filter(w => w.type !== 'coding-agent' && !participants.includes(w.id))

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

            {/* All participants (workspaces and coding agents unified) */}
            {participantWorkspaces.map((ws, i) => {
              if (!ws) return null
              const shortPath = ws.type === 'coding-agent' && ws.path
                ? ws.path.replace(/^\/Users\/[^/]+/, '~')
                : null
              return (
                <div key={ws.id} className="members-item">
                  <div className="members-avatar">
                    <Avatar raw={ws.identity?.avatar} role="assistant" wsPath={ws.path} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="members-name">{ws.identity?.name || ws.id}</span>
                    {shortPath && (
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                        {shortPath}
                      </div>
                    )}
                  </div>
                  {i === 0 && <span className="members-tag">群主</span>}
                  {i > 0 && (
                    <button className="icon-btn members-remove" onClick={() => removeParticipant(ws.id)} title="移除">
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
          {(nonParticipantLocalWs.length > 0 || availableEngines.length > 0) && (
            <div className="settings-section">
              <div className="settings-section-title">添加成员</div>
              {nonParticipantLocalWs.map(ws => (
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
              {/* Coding agent engines */}
              {availableEngines.map(engine => (
                <div key={engine.id} className="members-item members-item-add" onClick={() => handleAddCA(engine.id)}>
                  <div className="members-avatar">
                    {engine.avatar ? (
                      <img src={engine.avatar} alt={engine.name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                        onError={(e: any) => { e.currentTarget.src = '../avatars/1.png' }} />
                    ) : (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ENGINE_COLORS[engine.id] || 'var(--text-faint)' }} />
                    )}
                  </div>
                  <span className="members-name">{engine.name}</span>
                  <span className="members-tag" style={{ fontSize: 10, color: 'var(--text-faint)' }}>选择文件夹</span>
                  <span className="ic members-add-icon">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path d="M12 5v14"/><path d="M5 12h14"/>
                    </svg>
                  </span>
                </div>
              ))}
            </div>
          )}

          {nonParticipantLocalWs.length === 0 && availableEngines.length === 0 && participants.length > 0 && (
            <div className="settings-section" style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13, padding: '24px 0' }}>
              所有助手都已加入对话
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
