import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'
import { useAppState } from '../store'
import { Avatar } from './Avatar'

interface MembersPanelProps {
  visible: boolean
  sessionId: string | null
  onClose: () => void
}

interface SessionAgent {
  id: string
  name: string
  role?: string
}

export default function MembersPanel({ visible, sessionId, onClose }: MembersPanelProps) {
  const api = useIPC()
  const { workspaces, userProfile } = useAppState()
  const [participants, setParticipants] = useState<string[]>([])
  const [sessionAgents, setSessionAgents] = useState<SessionAgent[]>([])
  const [templateAgents, setTemplateAgents] = useState<any[]>([])
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentSoul, setNewAgentSoul] = useState('')
  const [newAgentModel, setNewAgentModel] = useState('')

  useEffect(() => {
    if (visible && sessionId) refresh()
  }, [visible, sessionId])

  const refresh = async () => {
    if (!sessionId) return
    const [p, sa, ta] = await Promise.all([
      api.getParticipants(sessionId),
      api.listSessionAgents(sessionId),
      api.listAgents()
    ])
    setParticipants(p || [])
    setSessionAgents(sa || [])
    setTemplateAgents(ta || [])
  }

  const addParticipant = async (wsId: string) => {
    if (!sessionId) return
    await api.addParticipant(sessionId, wsId)
    refresh()
  }

  const removeParticipant = async (wsId: string) => {
    if (!sessionId) return
    await api.removeParticipant(sessionId, wsId)
    refresh()
  }

  const createLightweight = async () => {
    if (!sessionId || !newRoleName.trim() || !newRoleDesc.trim()) return
    await api.createSessionAgent(sessionId, { name: newRoleName.trim(), role: newRoleDesc.trim() })
    setNewRoleName('')
    setNewRoleDesc('')
    refresh()
  }

  const addFromTemplate = async () => {
    if (!sessionId || !selectedTemplate) return
    const agent = await api.loadAgent(selectedTemplate)
    if (!agent) return
    await api.createSessionAgent(sessionId, { name: agent.name, role: agent.soul || '' })
    setSelectedTemplate('')
    refresh()
  }

  const removeAgent = async (agentId: string) => {
    await api.deleteSessionAgent(agentId)
    refresh()
  }

  // Global agent management
  const createNewAgent = async () => {
    if (!newAgentName.trim()) return
    await api.createAgent({ name: newAgentName.trim(), soul: newAgentSoul, model: newAgentModel.trim() || undefined })
    setNewAgentName('')
    setNewAgentSoul('')
    setNewAgentModel('')
    refresh()
  }

  const deleteAgent = async (id: string) => {
    await api.deleteAgent(id)
    refresh()
  }

  if (!visible) return null

  const nonParticipants = workspaces.filter(w => !participants.includes(w.id))
  const sessionAgentNames = new Set(sessionAgents.map(a => a.name))
  const availableTemplates = templateAgents.filter(a => !sessionAgentNames.has(a.name))

  return (
    <div className="overlay-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ display: 'flex' }}>
      <div className="members-panel" style={{ width: 320, maxHeight: '70vh', overflow: 'auto', background: 'var(--bg-secondary)', borderRadius: 8, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Members</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {/* Workspace participants */}
        {participants.map((pid, i) => {
          const ws = workspaces.find(w => w.id === pid)
          if (!ws) return null
          return (
            <div key={pid} className="member-item" style={{ display: 'flex', alignItems: 'center', padding: '4px 0', gap: 8 }}>
              <Avatar raw={ws.identity?.avatar} role="assistant" wsPath={ws.path} />
              <span style={{ flex: 1, fontSize: 13 }}>{ws.identity?.name || ws.id}</span>
              {i === 0 && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>(群主)</span>}
              {i > 0 && <button className="icon-btn" style={{ fontSize: 11 }} onClick={() => removeParticipant(pid)}>✕</button>}
            </div>
          )
        })}

        {/* Add participant */}
        {nonParticipants.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <select style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: 4, fontSize: 12 }}
              onChange={(e) => { if (e.target.value) addParticipant(e.target.value); e.target.value = '' }}>
              <option value="">添加成员...</option>
              {nonParticipants.map(w => <option key={w.id} value={w.id}>{w.identity?.name || w.id}</option>)}
            </select>
          </div>
        )}

        {participants.length > 0 && <hr style={{ border: 'none', height: 1, background: 'var(--border)', margin: '8px 0' }} />}

        {/* User */}
        <div className="member-item" style={{ display: 'flex', alignItems: 'center', padding: '4px 0', gap: 8 }}>
          {userProfile?.avatarAbsPath
            ? <img src={`file://${userProfile.avatarAbsPath}?t=${Date.now()}`} style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />
            : <span>👤</span>}
          <span style={{ fontSize: 13 }}>{userProfile?.userName || 'You'}</span>
        </div>

        {/* Session agents */}
        {sessionAgents.map(a => (
          <div key={a.id} className="member-item" style={{ display: 'flex', alignItems: 'center', padding: '4px 0', gap: 8 }}>
            <span>🤖</span>
            <span style={{ flex: 1, fontSize: 13 }}>{a.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{(a.role || '').slice(0, 40)}</span>
            <button className="icon-btn" style={{ fontSize: 11 }} onClick={() => removeAgent(a.id)}>✕</button>
          </div>
        ))}

        {/* Add from template */}
        {availableTemplates.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}
              style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: 4, fontSize: 12 }}>
              <option value="">Select template...</option>
              {availableTemplates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button className="icon-btn" onClick={addFromTemplate} disabled={!selectedTemplate}>+</button>
          </div>
        )}

        {/* Create lightweight agent */}
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input placeholder="Agent 名称" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)}
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} />
          <input placeholder="角色描述" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createLightweight() }}
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} />
          <button className="secondary-btn" style={{ margin: 0, fontSize: 12 }}
            disabled={!newRoleName.trim() || !newRoleDesc.trim()} onClick={createLightweight}>
            + 创建 Session Agent
          </button>
        </div>

        {/* Global agent templates */}
        <hr style={{ border: 'none', height: 1, background: 'var(--border)', margin: '12px 0 8px' }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Agent Templates</span>
        {templateAgents.map(a => (
          <div key={a.id} className="agent-card" style={{ display: 'flex', alignItems: 'center', padding: '4px 0', gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {(a.name || '?')[0].toUpperCase()}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.model || 'default model'}</div>
            </div>
            <button className="icon-btn" style={{ fontSize: 11 }} onClick={() => deleteAgent(a.id)} title="Delete">✕</button>
          </div>
        ))}
        {templateAgents.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', padding: 8 }}>No agents yet.</p>
        )}
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input placeholder="Agent 名称" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)}
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} />
          <textarea placeholder="Soul (性格描述)" value={newAgentSoul} onChange={(e) => setNewAgentSoul(e.target.value)} rows={2}
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, resize: 'vertical' }} />
          <input placeholder="Model (可选)" value={newAgentModel} onChange={(e) => setNewAgentModel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createNewAgent() }}
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} />
          <button className="secondary-btn" style={{ margin: 0, fontSize: 12 }}
            disabled={!newAgentName.trim()} onClick={createNewAgent}>
            + 创建 Template
          </button>
        </div>
      </div>
    </div>
  )
}
