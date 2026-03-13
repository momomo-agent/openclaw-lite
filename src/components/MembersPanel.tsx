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

interface CodingAgent {
  id: string
  name: string
  engine: string
  projectPath: string
}

const ENGINE_COLORS: Record<string, string> = {
  claude: '#f59e0b', codex: '#22c55e', gemini: '#3b82f6', kiro: '#a855f7',
}

export default function MembersPanel({ visible, sessionId, onClose, onChanged }: MembersPanelProps) {
  const api = useIPC()
  const { workspaces, userProfile } = useAppState()
  const [participants, setParticipants] = useState<string[]>([])
  const [parsedParticipants, setParsedParticipants] = useState<any[]>([])
  const [codingAgents, setCodingAgents] = useState<CodingAgent[]>([])
  const [addingCA, setAddingCA] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (visible && sessionId) refresh()
    api.codingAgentsList?.().then((list: CodingAgent[]) => {
      if (list?.length) setCodingAgents(list)
    }).catch(() => {})
  }, [visible, sessionId])

  const refresh = async () => {
    if (!sessionId) return
    const p = await api.getParticipants(sessionId)
    setParticipants(p || [])
    const parsed = await api.getSessionParticipantsParsed?.(sessionId)
    setParsedParticipants(parsed || [])
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
    const name = projectPath.split('/').pop() || 'Project'
    const agent = await api.codingAgentAdd?.({ engine, projectPath, name })
    if (agent) {
      const list = await api.codingAgentsList?.()
      if (list) setCodingAgents(list)
      const participantId = `ca:${engine}:${projectPath}`
      await api.addParticipant(sessionId, participantId)
      refresh()
      onChanged?.()
    }
    setAddingCA(false)
  }

  const handleClose = () => {
    setClosing(true)
  }

  if (!visible && !closing) return null

  const nonParticipants = workspaces.filter(w => !participants.includes(w.id))
  const participantCAIds = parsedParticipants.filter(p => p.type === 'coding-agent').map(p => `ca:${p.engine}:${p.workdir}`)
  const nonParticipantCAs = codingAgents.filter(ca => !participantCAIds.includes(`ca:${ca.engine}:${ca.projectPath}`))

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
            {parsedParticipants.map((p, i) => {
              if (p.type === 'workspace') {
                const ws = workspaces.find(w => w.id === p.id)
                if (!ws) return null
                return (
                  <div key={p.id} className="members-item">
                    <div className="members-avatar">
                      <Avatar raw={ws.identity?.avatar} role="assistant" wsPath={ws.path} />
                    </div>
                    <span className="members-name">{ws.identity?.name || ws.id}</span>
                    {i === 0 && <span className="members-tag">群主</span>}
                    {i > 0 && (
                      <button className="icon-btn members-remove" onClick={() => removeParticipant(p.id)} title="移除">
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
              } else if (p.type === 'coding-agent') {
                const caId = `ca:${p.engine}:${p.workdir}`
                return (
                  <div key={caId} className="members-item">
                    <div className="members-avatar">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ENGINE_COLORS[p.engine] || 'var(--text-faint)' }} />
                    </div>
                    <span className="members-name">{p.name}</span>
                    <button className="icon-btn members-remove" onClick={() => removeParticipant(caId)} title="移除">
                      <span className="ic">
                        <svg viewBox="0 0 24 24" width="14" height="14">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </span>
                    </button>
                  </div>
                )
              }
              return null
            })}
          </div>

          {/* Add participant */}
          {(nonParticipants.length > 0 || nonParticipantCAs.length > 0) && (
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
              {nonParticipantCAs.map(ca => (
                <div key={ca.id} className="members-item members-item-add" onClick={() => addParticipant(`ca:${ca.engine}:${ca.projectPath}`)}>
                  <div className="members-avatar">
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: ENGINE_COLORS[ca.engine] || 'var(--text-faint)' }} />
                  </div>
                  <span className="members-name">{ca.name}</span>
                  <span className="ic members-add-icon">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path d="M12 5v14"/><path d="M5 12h14"/>
                    </svg>
                  </span>
                </div>
              ))}
              {!addingCA && (
                <div className="members-item members-item-add" onClick={() => setAddingCA(true)}>
                  <div className="members-avatar" style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'var(--hover-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14"/><path d="M5 12h14"/>
                    </svg>
                  </div>
                  <span className="members-name">添加新编码助手</span>
                </div>
              )}
              {addingCA && (
                <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: 8, margin: '8px 0' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>选择引擎</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(ENGINE_COLORS).map(([engine, color]) => (
                      <button
                        key={engine}
                        onClick={() => handleAddCA(engine)}
                        style={{
                          padding: '6px 12px', borderRadius: 6, border: 'none',
                          background: 'var(--hover-bg)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 13, color: 'var(--text-primary)',
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                        {engine}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setAddingCA(false)}
                    style={{ marginTop: 8, fontSize: 12, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          )}

          {nonParticipants.length === 0 && nonParticipantCAs.length === 0 && participants.length > 0 && !addingCA && (
            <div className="settings-section" style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13, padding: '24px 0' }}>
              所有助手都已加入对话
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
