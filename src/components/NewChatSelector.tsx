import { useState, useEffect, useRef } from 'react'
import { Workspace } from '../types'
import { useIPC } from '../hooks/useIPC'
import { Avatar } from './Avatar'
import TextInput from './TextInput'

interface NewChatSelectorProps {
  workspaces: Workspace[]
  onSelect: (opts: { workspaceId?: string; mode?: string; participants?: string[] }) => void
  onClose: () => void
  onWorkspacesChanged: () => void
}

interface CodingAgentDef {
  id: string
  name: string
  engine?: string
}

const ENGINE_COLORS: Record<string, string> = {
  claude: '#f59e0b', codex: '#22c55e', gemini: '#3b82f6', kiro: '#a855f7',
}

const PRESET_COUNT = 6

function sanitizeName(v: string): string {
  return v.replace(/[@/\\:*?"<>|\s]/g, '').replace(/^\.+/, '')
}

// ── SVG Icons ──

function IconClose() {
  return (
    <span className="ic">
      <svg viewBox="0 0 24 24"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
    </span>
  )
}

function IconEdit() {
  return (
    <span className="ic">
      <svg viewBox="0 0 24 24">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </span>
  )
}

function IconTrash() {
  return (
    <span className="ic">
      <svg viewBox="0 0 24 24">
        <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </span>
  )
}

function IconPlus() {
  return (
    <span className="ic">
      <svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
    </span>
  )
}

function IconUsers() {
  return (
    <span className="ic">
      <svg viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    </span>
  )
}

function IconFolder() {
  return (
    <span className="ic">
      <svg viewBox="0 0 24 24">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    </span>
  )
}

function IconUpload() {
  return (
    <span className="ic">
      <svg viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    </span>
  )
}

// ── Avatar Picker (SetupScreen pattern) ──

function AvatarPicker({ selected, onSelect, onUpload, customSrc }: {
  selected: number; onSelect: (i: number) => void; onUpload?: () => void; customSrc?: string
}) {
  const isCustomSelected = selected === -1
  const [customImgValid, setCustomImgValid] = useState(true)

  // Reset validity when customSrc changes
  useEffect(() => { setCustomImgValid(true) }, [customSrc])

  const circleStyle = (active: boolean, dim?: boolean): React.CSSProperties => ({
    width: 46, height: 46, borderRadius: '50%', padding: 0, border: 'none',
    outline: active ? '2px solid var(--text-primary)' : '2px solid transparent',
    outlineOffset: 2,
    cursor: 'pointer', overflow: 'hidden',
    background: 'transparent',
    opacity: active ? 1 : (dim ? 0.45 : 0.45),
    transition: 'opacity 0.15s, outline-color 0.15s',
  })

  const showCustom = customSrc && customImgValid

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Presets 0-5 */}
      {Array.from({ length: PRESET_COUNT }, (_, i) => (
        <button key={i} onClick={() => onSelect(i)} style={circleStyle(selected === i)}>
          <img src={`../avatars/${i}.png`} alt="" style={{ width: '100%', height: '100%', display: 'block' }} />
        </button>
      ))}
      {/* Custom image (avatar.png) — shown if file exists on disk */}
      {showCustom && (
        <button onClick={() => onSelect(-1)} style={circleStyle(isCustomSelected)}>
          <img src={customSrc} alt="" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} onError={() => setCustomImgValid(false)} />
        </button>
      )}
      {/* Upload button */}
      {onUpload && (
        <button
          onClick={onUpload}
          style={{
            width: 46, height: 46, borderRadius: '50%', padding: 0,
            border: '2px dashed var(--border-muted)',
            cursor: 'pointer', background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-faint)', fontSize: 16,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          title="上传自定义头像"
        >
          <IconUpload />
        </button>
      )}
    </div>
  )
}

// ── Main Component ──

export default function NewChatSelector({ workspaces, onSelect, onClose, onWorkspacesChanged }: NewChatSelectorProps) {
  const api = useIPC()
  const [managing, setManaging] = useState(false)
  const [groupMode, setGroupMode] = useState(false)
  const [groupSelected, setGroupSelected] = useState<Set<string>>(new Set())
  const [codingAgents, setCodingAgents] = useState<CodingAgentDef[]>([])
  const [addingCA, setAddingCA] = useState(false)
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null)

  // Editor overlay state
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null)
  const [editorName, setEditorName] = useState('')
  const [editorAvatar, setEditorAvatar] = useState(0) // -1 = custom image
  const [editorCustomSrc, setEditorCustomSrc] = useState<string | null>(null)
  const [editorWsId, setEditorWsId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const editorInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.codingAgentsList?.().then((list: CodingAgentDef[]) => {
      if (list?.length) setCodingAgents(list)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (editorMode) setTimeout(() => editorInputRef.current?.focus(), 50)
  }, [editorMode])

  // ── Editor actions ──

  const openCreate = () => {
    setEditorMode('create')
    setEditorName('')
    setEditorAvatar(Math.floor(Math.random() * PRESET_COUNT))
    setEditorCustomSrc(null)
    setEditorWsId(null)
    setSaving(false)
  }

  const openEdit = (e: React.MouseEvent | null, ws: Workspace) => {
    e?.stopPropagation()
    setEditorMode('edit')
    setEditorName(ws.identity?.name || '')
    const av = ws.identity?.avatar
    // Always check for custom avatar.png on disk (even when preset is active)
    const customPath = ws.path ? `file://${ws.path}/.paw/avatar.png?t=${Date.now()}` : null
    if (typeof av === 'string' && av.startsWith('preset:')) {
      setEditorAvatar(parseInt(av.replace('preset:', '')) || 0)
      setEditorCustomSrc(customPath)
    } else if (typeof av === 'string' && av.includes('.') && ws.path) {
      // Custom image file (e.g. avatar.png) — show it and select custom slot
      setEditorAvatar(-1)
      setEditorCustomSrc(`file://${ws.path}/.paw/${av}?t=${Date.now()}`)
    } else {
      setEditorAvatar(0)
      setEditorCustomSrc(customPath)
    }
    setEditorWsId(ws.id)
    setSaving(false)
  }

  const handleEditorSave = async () => {
    if (!editorName.trim() || saving) return
    setSaving(true)
    try {
      if (editorMode === 'create') {
        const result = await api.createWorkspace({ name: editorName.trim(), avatar: `preset:${editorAvatar}` })
        if (result?.ok) {
          const ws = result.workspace
          if (ws?.id) await api.setWorkspaceAvatar?.({ id: ws.id, presetIndex: editorAvatar })
          onWorkspacesChanged()
        }
      } else if (editorMode === 'edit' && editorWsId) {
        await api.updateWorkspaceIdentity({ id: editorWsId, name: editorName.trim() })
        if (editorAvatar >= 0) {
          await api.setWorkspaceAvatar?.({ id: editorWsId, presetIndex: editorAvatar })
        } else if (editorAvatar === -1) {
          // User clicked the custom avatar thumbnail — switch config back to avatar.png
          await api.updateWorkspaceIdentity({ id: editorWsId, avatar: 'avatar.png' })
        }
        onWorkspacesChanged()
      }
      setEditorMode(null)
    } finally {
      setSaving(false)
    }
  }

  const handleEditorUpload = async () => {
    if (!editorWsId) return
    const filePath = await api.pickImage?.()
    if (!filePath) return
    await api.setWorkspaceAvatar?.({ id: editorWsId, customPath: filePath })
    setEditorAvatar(-1)
    setEditorCustomSrc(`file://${filePath}?t=${Date.now()}`)
    onWorkspacesChanged()
  }

  // ── List actions ──

  const handleAddExisting = async () => {
    const result = await api.addWorkspace()
    if (result?.ok) onWorkspacesChanged()
    else if (result?.error === 'not_a_workspace') alert('该文件夹不是有效的工作区')
    else if (result?.error === 'already_registered') alert('该工作区已添加')
  }

  const handleRemove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const ws = workspaces.find(w => w.id === id)
    if (!confirm(`确定要移除「${ws?.identity?.name || id}」吗？`)) return
    await api.removeWorkspace(id)
    onWorkspacesChanged()
  }

  const handleGroupToggle = (id: string) => {
    setGroupSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitManaging = () => {
    setManaging(false)
    setGroupMode(false)
    setGroupSelected(new Set())
  }

  const handleAddCA = async (engine: string) => {
    const projectPath = await api.selectDirectory?.()
    if (!projectPath) return
    const name = projectPath.split('/').pop() || 'Project'
    const agent = await api.codingAgentAdd?.({ engine, projectPath, name })
    if (agent) {
      const list = await api.codingAgentsList?.()
      if (list) setCodingAgents(list)
      const participantId = `ca:${engine}:${projectPath}`
      onSelect({ participants: [participantId] })
    }
    setAddingCA(false)
    setSelectedEngine(null)
  }

  const [closing, setClosing] = useState(false)
  const animatedClose = () => { setClosing(true) }
  const [editorClosing, setEditorClosing] = useState(false)
  const closeEditor = () => { setEditorClosing(true) }

  // Smooth height animation
  const bodyRef = useRef<HTMLDivElement>(null)
  const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!bodyRef.current) return
    const ro = new ResizeObserver(() => {
      if (bodyRef.current) setBodyHeight(bodyRef.current.scrollHeight)
    })
    ro.observe(bodyRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <>
      {/* Agent list panel */}
      <div className={`overlay-backdrop${closing ? ' closing' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) animatedClose() }}>
        <div className={`new-chat-panel${closing ? ' closing' : ''}`}
          onAnimationEnd={() => { if (closing) { setClosing(false); onClose() } }}>
          <div className="people-header">
            <span>{managing ? '管理助手' : '新建对话'}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className={`ncs-manage-btn${managing ? ' active' : ''}`}
                onClick={() => managing ? exitManaging() : setManaging(true)}>
                {managing ? '完成' : '管理'}
              </button>
              <button className="icon-btn" onClick={animatedClose}><IconClose /></button>
            </div>
          </div>
          <div className="ncs-body" style={bodyHeight !== undefined ? { height: bodyHeight, transition: 'height 0.2s ease' } : {}}>
            <div ref={bodyRef}>
            {workspaces.map(ws => (
              <div key={ws.id} className="ncs-agent-row"
                onClick={() => {
                  if (groupMode) { handleGroupToggle(ws.id); return }
                  if (managing) { openEdit(null as any, ws); return }
                  onSelect({ workspaceId: ws.id, mode: 'chat' })
                }}>
                {groupMode && (
                  <input type="checkbox" checked={groupSelected.has(ws.id)} readOnly className="ncs-checkbox" />
                )}
                <span className="ncs-avatar">
                  <Avatar raw={ws.identity?.avatar} role="assistant" wsPath={ws.path} />
                </span>
                <div className="ncs-info">
                  <div className="ncs-name">{ws.identity?.name || ws.id}</div>
                  {managing && <div className="ncs-path">{ws.path.split('/').slice(-2).join('/')}</div>}
                </div>
                {managing && !groupMode && (
                  <div className="ncs-actions visible">
                    <button className="icon-btn" title="编辑"
                      onClick={(e) => openEdit(e, ws)}><IconEdit /></button>
                    <button className="icon-btn" title="移除"
                      onClick={(e) => handleRemove(e, ws.id)}><IconTrash /></button>
                  </div>
                )}
              </div>
            ))}

            {/* Coding agents */}
            {!managing && (
              <>
                <div className="ncs-divider" />
                <div className="ncs-section-title">编码助手</div>
                {codingAgents.map(agent => (
                  <div key={agent.id} className="ncs-agent-row" onClick={() => {
                    const participantId = `ca:${agent.engine}:${(agent as any).projectPath}`
                    onSelect({ participants: [participantId] })
                  }}>
                    <span className="ncs-avatar">
                      {(agent as any).avatar ? (
                        <img src={(agent as any).avatar} alt={agent.name} style={{ width: 28, height: 28, borderRadius: '50%' }} />
                      ) : (
                        <span className="ncs-engine-dot" style={{ background: ENGINE_COLORS[agent.engine || ''] || 'var(--text-faint)' }} />
                      )}
                    </span>
                    <div className="ncs-info">
                      <div className="ncs-name">{agent.name}</div>
                      {agent.engine && <div className="ncs-path">{agent.engine}</div>}
                    </div>
                  </div>
                ))}
                {!addingCA && (
                  <div className="ncs-agent-row" onClick={() => setAddingCA(true)}>
                    <span className="ncs-avatar" style={{
                      width: 28, height: 28, borderRadius: '50%', background: 'var(--hover-bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)',
                    }}>
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                    </span>
                    <div className="ncs-info">
                      <div className="ncs-name">添加编码助手</div>
                    </div>
                  </div>
                )}
                {addingCA && (
                  <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 8, margin: '8px 0' }}>
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
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--border-muted)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                          {engine}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => { setAddingCA(false); setSelectedEngine(null) }}
                      style={{ marginTop: 8, fontSize: 12, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      取消
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Group chat confirm button */}
            {groupMode && groupSelected.size >= 2 && (
              <button className="primary-btn ncs-group-btn"
                onClick={() => { onSelect({ participants: [...groupSelected] }); setGroupMode(false) }}>
                创建群聊 ({groupSelected.size})
              </button>
            )}

            {/* Add workspace — styled like a list row */}
            {managing && !groupMode && (
                <div className="ncs-agent-row" onClick={openCreate}>
                  <span className="ncs-avatar" style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'var(--hover-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)',
                  }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  </span>
                  <div className="ncs-info">
                    <div className="ncs-name">添加助手</div>
                  </div>
                </div>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Agent editor overlay (SetupScreen-style) */}
      {(editorMode || editorClosing) && (
        <div className={`overlay-backdrop agent-editor-backdrop${editorClosing ? ' closing' : ''}`}
          onClick={(e) => { if (e.target === e.currentTarget) closeEditor() }}>
          <div className={`agent-editor${editorClosing ? ' closing' : ''}`}
            onAnimationEnd={() => { if (editorClosing) { setEditorClosing(false); setEditorMode(null) } }}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 21, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                {editorMode === 'create' ? '创建新助手' : '编辑助手'}
              </h1>
              <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                {editorMode === 'create' ? '选个头像，给 ta 起个名字。' : '修改头像或名称。'}
              </p>
            </div>

            <AvatarPicker
              selected={editorAvatar}
              onSelect={(i) => setEditorAvatar(i)}
              onUpload={editorMode === 'edit' ? handleEditorUpload : undefined}
              customSrc={editorCustomSrc || undefined}
            />

            <TextInput
              ref={editorInputRef}
              value={editorName}
              onChange={e => setEditorName(sanitizeName(e.target.value))}
              onSubmit={handleEditorSave}
              placeholder="助手名称"
              maxLength={32}
              style={editorInputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-muted)'}
            />

            <button
              className="primary-btn"
              onClick={handleEditorSave}
              disabled={!editorName.trim() || saving}
              style={editorBtnStyle}
            >
              {saving ? '保存中...' : editorMode === 'create' ? '创建' : '保存'}
            </button>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <button onClick={closeEditor} style={editorLinkStyle}>
                取消
              </button>
              {editorMode === 'create' && (
                <>
                  <span style={{ color: 'var(--border-muted)', fontSize: 12 }}>|</span>
                  <button onClick={() => { closeEditor(); handleAddExisting() }} style={editorLinkStyle}>
                    我已有 workspace
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Editor shared styles ──

const editorInputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: 15, fontWeight: 500,
  background: 'var(--bg-elevated)', border: '1px solid var(--border-muted)',
  borderRadius: 10, color: 'var(--text-primary)', textAlign: 'center',
  outline: 'none', transition: 'border-color 0.15s',
}

const editorBtnStyle: React.CSSProperties = {
  width: '100%', padding: '11px 24px', fontSize: 14, borderRadius: 10,
}

const editorLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0,
  color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer',
}
