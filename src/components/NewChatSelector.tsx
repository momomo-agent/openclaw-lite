import { useState } from 'react'
import { Workspace } from '../types'
import { useIPC } from '../hooks/useIPC'
import { Avatar } from './Avatar'

interface NewChatSelectorProps {
  workspaces: Workspace[]
  onSelect: (opts: { workspaceId?: string; mode?: string; participants?: string[] }) => void
  onClose: () => void
  onWorkspacesChanged: () => void
}

export default function NewChatSelector({ workspaces, onSelect, onClose, onWorkspacesChanged }: NewChatSelectorProps) {
  const api = useIPC()
  const [groupSelected, setGroupSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingWs, setEditingWs] = useState<Workspace | null>(null)
  const [editName, setEditName] = useState('')

  const handleGroupToggle = (id: string) => {
    setGroupSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateGroup = () => {
    if (groupSelected.size < 2) return
    onSelect({ participants: [...groupSelected] })
  }

  const handleAddExisting = async () => {
    const result = await api.addWorkspace()
    if (result?.ok) onWorkspacesChanged()
    else if (result?.error === 'not_a_workspace') alert('该文件夹不是有效的 workspace')
    else if (result?.error === 'already_registered') alert('该 workspace 已添加')
  }

  const handleCreateNew = async () => {
    if (!newName.trim()) return
    const result = await api.createWorkspace({ name: newName.trim() })
    if (result?.ok) { setCreating(false); setNewName(''); onWorkspacesChanged() }
  }

  const handleRemoveWs = async (id: string) => {
    const ws = workspaces.find(w => w.id === id)
    if (!confirm(`确定要移除 "${ws?.identity?.name || id}" 吗？`)) return
    await api.removeWorkspace(id)
    onWorkspacesChanged()
  }

  const handleEditSave = async () => {
    if (!editingWs || !editName.trim()) return
    await api.updateWorkspaceIdentity({ id: editingWs.id, name: editName.trim() })
    setEditingWs(null)
    onWorkspacesChanged()
  }

  return (
    <div className="overlay-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="new-chat-panel" style={{ maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="people-header">
          <span>New Chat</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {/* Workspace section */}
          <div style={{ marginBottom: 12 }}>
            <div className="settings-section-title" style={{ padding: '4px 8px' }}>Workspace</div>
            {workspaces.map(ws => (
              <div key={ws.id} className="new-chat-item" onClick={() => onSelect({ workspaceId: ws.id, mode: 'chat' })}>
                <span className="new-chat-avatar">
                  <Avatar raw={ws.identity?.avatar} role="assistant" wsPath={ws.path} />
                </span>
                <div className="new-chat-info">
                  <div className="new-chat-name">{ws.identity?.name || ws.id}</div>
                  <div className="new-chat-desc">{ws.path}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Group chat section */}
          {workspaces.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <div className="settings-section-title" style={{ padding: '4px 8px' }}>Group Chat</div>
              {workspaces.map(ws => (
                <div key={ws.id} className="new-chat-item" onClick={() => handleGroupToggle(ws.id)} style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={groupSelected.has(ws.id)} readOnly style={{ marginRight: 8 }} />
                  <span className="new-chat-avatar">
                    <Avatar raw={ws.identity?.avatar} role="assistant" wsPath={ws.path} />
                  </span>
                  <div className="new-chat-info">
                    <div className="new-chat-name">{ws.identity?.name || ws.id}</div>
                  </div>
                </div>
              ))}
              <button className="primary-btn" disabled={groupSelected.size < 2}
                style={{ margin: 8, width: 'calc(100% - 16px)' }} onClick={handleCreateGroup}>
                创建群聊
              </button>
            </div>
          )}

          <hr style={{ border: 'none', height: 1, background: 'var(--border)', margin: '8px 0' }} />

          {/* Manage Agents section */}
          <div style={{ marginBottom: 8 }}>
            <div className="settings-section-title" style={{ padding: '4px 8px' }}>Manage Agents</div>
            {workspaces.map(ws => (
              editingWs?.id === ws.id ? (
                <div key={ws.id} style={{ padding: '8px 4px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') setEditingWs(null) }}
                    style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 13 }} />
                  <button className="icon-btn" onClick={handleEditSave}>✓</button>
                  <button className="icon-btn" onClick={() => setEditingWs(null)}>✕</button>
                </div>
              ) : (
                <div key={ws.id} className="people-item" style={{ padding: '8px 4px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 20, width: 28 }}>
                    <Avatar raw={ws.identity?.avatar} role="assistant" wsPath={ws.path} />
                  </span>
                  <div className="people-info" style={{ flex: 1, marginLeft: 8 }}>
                    <div className="people-name" style={{ fontSize: 13 }}>{ws.identity?.name || ws.id}</div>
                  </div>
                  <div className="people-actions" style={{ display: 'flex', gap: 4 }}>
                    <button className="icon-btn" style={{ fontSize: 12 }} title="编辑"
                      onClick={(e) => { e.stopPropagation(); setEditingWs(ws); setEditName(ws.identity?.name || '') }}>✏️</button>
                    <button className="icon-btn" style={{ fontSize: 12 }} title="移除"
                      onClick={(e) => { e.stopPropagation(); handleRemoveWs(ws.id) }}>✕</button>
                  </div>
                </div>
              )
            ))}
            <div style={{ display: 'flex', gap: 8, padding: '8px 4px' }}>
              {creating ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                  <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Agent 名称"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNew() }}
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 13 }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="primary-btn" style={{ flex: 1, fontSize: 12 }} onClick={handleCreateNew}>创建</button>
                    <button className="secondary-btn" style={{ flex: 1, margin: 0, fontSize: 12 }} onClick={() => setCreating(false)}>取消</button>
                  </div>
                </div>
              ) : (
                <>
                  <button className="secondary-btn" style={{ flex: 1, margin: 0, fontSize: 12 }} onClick={handleAddExisting}>📁 添加已有</button>
                  <button className="secondary-btn" style={{ flex: 1, margin: 0, fontSize: 12 }} onClick={() => setCreating(true)}>✨ 新建</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
