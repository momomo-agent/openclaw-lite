import { useState, useEffect, useRef, useCallback } from 'react'
import { useIPC } from '../hooks/useIPC'
import { useAppState } from '../store'
import { Config } from '../types'

interface SettingsPanelProps {
  visible: boolean
  onClose: () => void
}

interface McpServerStatus {
  status: 'connected' | 'disconnected'
  toolCount?: number
  error?: string
}

interface ThemeDef {
  value: string
  label: string
  bg: string
  accent: string
}

const THEMES: ThemeDef[] = [
  { value: 'light', label: 'Light', bg: '#ffffff', accent: '#b45309' },
  { value: 'default', label: 'Dark', bg: '#0a0a0a', accent: '#fbbf24' },
  { value: 'codex', label: 'Codex', bg: '#f8faf8', accent: '#10a37f' },
  { value: 'claude', label: 'Claude', bg: '#faf8f6', accent: '#da7756' },
]

const AVATAR_PRESETS = [0, 1, 2, 3, 4, 5]

export default function SettingsPanel({ visible, onClose }: SettingsPanelProps) {
  const api = useIPC()
  const { setUserProfile, bumpAvatarVersion, showTools, setShowTools } = useAppState()

  // Config state
  const [config, setConfig] = useState<Config>({})
  const [codingAgent, setCodingAgent] = useState<string>('claude')
  const [currentTheme, setCurrentTheme] = useState<string>('default')

  // Profile state
  const [userName, setUserName] = useState('')
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null)
  const [customAvatarSrc, setCustomAvatarSrc] = useState<string | null>(null) // persists custom image url even when preset selected
  const [pendingAvatar, setPendingAvatar] = useState<{ presetIndex?: number; customPath?: string; useCustom?: boolean } | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)

  // MCP state
  const [mcpText, setMcpText] = useState('')
  const [mcpStatus, setMcpStatus] = useState<Record<string, McpServerStatus> | null>(null)

  // Workspace state

  // Heartbeat derived state
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(true)
  const [heartbeatInterval, setHeartbeatInterval] = useState(30)

  // Refs
  const configRef = useRef(config)
  const codingAgentRef = useRef(codingAgent)
  const currentThemeRef = useRef(currentTheme)
  const userNameRef = useRef(userName)
  const pendingAvatarRef = useRef(pendingAvatar)
  const mcpTextRef = useRef(mcpText)
  const heartbeatEnabledRef = useRef(heartbeatEnabled)
  const heartbeatIntervalRef = useRef(heartbeatInterval)

  // Keep refs in sync
  configRef.current = config
  codingAgentRef.current = codingAgent
  currentThemeRef.current = currentTheme
  userNameRef.current = userName
  pendingAvatarRef.current = pendingAvatar
  mcpTextRef.current = mcpText
  heartbeatEnabledRef.current = heartbeatEnabled
  heartbeatIntervalRef.current = heartbeatInterval

  // Load all settings when panel opens
  useEffect(() => {
    if (!visible) return
    loadAll()
  }, [visible])

  const loadAll = async () => {
    try {
      const [cfg, , agent, profile, avatarPath] = await Promise.all([
        api.getConfig(),
        api.getPrefs(),
        api.getCodingAgent(),
        api.getUserProfile(),
        api.getUserAvatarPath(),
      ])

      const c = cfg || {}
      setConfig(c)
      setCodingAgent(agent || 'claude')
      setCurrentTheme(c.theme || 'default')
      setShowTools(c.showTools === true)

      // Profile
      setUserName(profile?.userName || '')
      setPendingAvatar(null)
      // Check if custom user-avatar.png exists
      const customSrc = avatarPath ? `file://${avatarPath}?t=${Date.now()}` : null
      setCustomAvatarSrc(customSrc)
      if (profile?.userAvatar?.startsWith('preset:')) {
        const idx = parseInt(profile.userAvatar.replace('preset:', '')) || 0
        setSelectedPreset(idx)
        setAvatarSrc(`../avatars/${idx}.png`)
      } else if (profile?.userAvatar && avatarPath) {
        setSelectedPreset(null)
        setAvatarSrc(customSrc)
      } else {
        setSelectedPreset(0)
        setAvatarSrc(`../avatars/0.png`)
      }

      // Heartbeat
      const hb = c.heartbeat as any
      setHeartbeatEnabled(hb?.enabled !== false)
      setHeartbeatInterval(hb?.intervalMinutes || 30)

      // MCP
      setMcpText(c.mcpServers ? JSON.stringify(c.mcpServers, null, 2) : '')

      // MCP status
      if (api.getMcpStatus) {
        try {
          const status = await api.getMcpStatus()
          setMcpStatus(status)
        } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  // Close animation state
  const [closing, setClosing] = useState(false)

  // Save all settings on close
  const saveAndClose = useCallback(async () => {
    try {
      const cfg = { ...configRef.current }
      cfg.theme = currentThemeRef.current || 'light'
      cfg.showTools = showTools
      cfg.heartbeat = {
        enabled: heartbeatEnabledRef.current,
        intervalMinutes: heartbeatIntervalRef.current || 30,
      } as any

      // Parse MCP JSON
      const trimmed = mcpTextRef.current.trim()
      if (trimmed) {
        try {
          cfg.mcpServers = JSON.parse(trimmed)
        } catch (e: any) {
          alert('Invalid MCP JSON: ' + e.message)
          return
        }
      } else {
        cfg.mcpServers = undefined
      }

      await api.saveConfig(cfg)
      await api.setCodingAgent(codingAgentRef.current)

      // Heartbeat
      if (heartbeatEnabledRef.current) {
        await api.heartbeatStart()
      } else {
        await api.heartbeatStop()
      }

      // User profile
      const profileOpts: any = { userName: userNameRef.current }
      if (pendingAvatarRef.current) {
        Object.assign(profileOpts, pendingAvatarRef.current)
      }
      const updatedProfile = await api.setUserProfile(profileOpts)
      if (updatedProfile) setUserProfile(updatedProfile)
      if (pendingAvatarRef.current) bumpAvatarVersion()

      // Reconnect MCP
      if (api.mcpReconnect) {
        try { await api.mcpReconnect() } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Failed to save settings:', err)
    }

    setClosing(true)
  }, [api])

  // Apply theme immediately on selection
  const applyTheme = (theme: string) => {
    setCurrentTheme(theme)
    document.documentElement.setAttribute('data-theme', theme)
  }

  // Avatar preset click
  const handlePresetClick = (index: number) => {
    setSelectedPreset(index)
    setAvatarSrc(`../avatars/${index}.png`)
    setPendingAvatar({ presetIndex: index })
  }

  // Custom avatar upload via native dialog
  const handleAvatarUpload = async () => {
    const filePath = await api.pickImage?.()
    if (!filePath) return
    const src = `file://${filePath}?t=${Date.now()}`
    setAvatarSrc(src)
    setCustomAvatarSrc(src)
    setPendingAvatar({ customPath: filePath })
    setSelectedPreset(null)
  }

  // Workspace change
  // External link
  const handleOpenExternal = (url: string) => {
    api.openExternal(url)
  }

  if (!visible && !closing) return null

  return (
    <div
      className={`settings-backdrop${closing ? ' closing' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) saveAndClose() }}
    >
      <div
        className={`settings-drawer${closing ? ' closing' : ''}`}
        onAnimationEnd={() => { if (closing) { setClosing(false); onClose() } }}
      >
        <div className="settings-header">
          <span>设置</span>
          <button className="icon-btn" onClick={saveAndClose}>
            <span className="ic">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          </button>
        </div>

        <div className="settings-body">

          {/* ── Profile ── */}
          <div className="settings-section">
            <div className="settings-section-title">个人信息</div>
            <div className="settings-field" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'var(--avatar-bg)', overflow: 'hidden', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
                onClick={handleAvatarUpload}
              >
                {avatarSrc ? (
                  <img src={avatarSrc} className="avatar-img" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 28 }}>&#128100;</span>
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  placeholder="你的名字"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {AVATAR_PRESETS.map((i) => (
                    <img
                      key={i}
                      src={`../avatars/${i}.png`}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                        border: `2px solid ${selectedPreset === i ? 'var(--accent)' : 'transparent'}`,
                        objectFit: 'cover', transition: 'border-color 0.15s',
                      }}
                      onClick={() => handlePresetClick(i)}
                    />
                  ))}
                  {/* Custom image (user-avatar.png) — always visible if exists, selected when no preset chosen */}
                  {customAvatarSrc && (
                    <img
                      src={customAvatarSrc}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                        border: `2px solid ${selectedPreset === null ? 'var(--accent)' : 'transparent'}`,
                        objectFit: 'cover', transition: 'border-color 0.15s',
                      }}
                      onClick={() => {
                        setSelectedPreset(null)
                        setAvatarSrc(customAvatarSrc)
                        setPendingAvatar({ useCustom: true })
                      }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleAvatarUpload}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                      border: '2px dashed var(--border-muted)',
                      background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-faint)', fontSize: 14, padding: 0,
                    }}
                    title="上传自定义头像"
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Provider ── */}
          <div className="settings-section">
            <div className="settings-section-title">服务商</div>
            <div className="settings-field">
              <label>服务商</label>
              <select
                value={config.provider || 'anthropic'}
                onChange={(e) => setConfig({ ...config, provider: e.target.value })}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div className="settings-field">
              <label>API 密钥</label>
              <input
                type="password"
                placeholder="sk-..."
                value={config.apiKey || ''}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              />
            </div>
            <div className="settings-field">
              <label>自定义地址 <span className="hint">（可选）</span></label>
              <input
                type="text"
                placeholder="https://api.anthropic.com"
                value={config.baseUrl || ''}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              />
            </div>
          </div>

          {/* ── Model ── */}
          <div className="settings-section">
            <div className="settings-section-title">模型</div>
            <div className="settings-field">
              <label>模型</label>
              <input
                type="text"
                placeholder="claude-sonnet-4-20250514"
                value={config.model || ''}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
              />
              <p className="hint" style={{ marginTop: 4 }}>留空使用服务商默认模型。</p>
            </div>
          </div>

          {/* ── Appearance ── */}
          <div className="settings-section">
            <div className="settings-section-title">外观</div>
            <div className="settings-field">
              <label>主题</label>
              <div className="theme-picker">
                {THEMES.map((t) => (
                  <div key={t.value} className="theme-option" onClick={() => applyTheme(t.value)}>
                    <div className={`theme-swatch${currentTheme === t.value ? ' active' : ''}`}>
                      <div className="theme-swatch-inner">
                        <div className="theme-swatch-top" style={{ background: t.bg }} />
                        <div className="theme-swatch-bottom" style={{ background: t.accent }} />
                      </div>
                    </div>
                    <span className="theme-label">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="settings-field">
              <label className="toggle-label" style={{ justifyContent: 'space-between' }}>
                <span style={{ flex: 1 }}>在对话中显示工具调用</span>
                <input
                  type="checkbox"
                  checked={showTools}
                  onChange={(e) => setShowTools(e.target.checked)}
                />
              </label>
            </div>
          </div>

          {/* ── Tools ── */}
          <div className="settings-section">
            <div className="settings-section-title">工具</div>
            <div className="settings-field">
              <label>默认编码助手</label>
              <select
                value={codingAgent}
                onChange={(e) => setCodingAgent(e.target.value)}
              >
                <option value="claude">Claude Code</option>
                <option value="codex">Codex</option>
                <option value="gemini">Gemini CLI</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Tavily API 密钥 <span className="hint">（网页搜索）</span></label>
              <input
                type="password"
                placeholder="tvly-..."
                value={config.tavilyKey || ''}
                onChange={(e) => setConfig({ ...config, tavilyKey: e.target.value })}
              />
            </div>
          </div>

          {/* ── Permission ── */}
          <div className="settings-section">
            <div className="settings-section-title">权限</div>
            <div className="settings-field">
              <label className="toggle-label" style={{ justifyContent: 'space-between' }}>
                <span style={{ flex: 1 }}>执行危险命令前需要确认</span>
                <input
                  type="checkbox"
                  checked={config.execApproval !== false}
                  onChange={(e) => setConfig({ ...config, execApproval: e.target.checked })}
                />
              </label>
            </div>
          </div>

          {/* ── MCP Servers (status only) ── */}
          {mcpStatus && Object.keys(mcpStatus).length > 0 && (
            <div className="settings-section">
              <div className="settings-section-title">MCP 服务器</div>
              <div className="settings-field">
                {Object.entries(mcpStatus).map(([name, info]) => (
                  <div key={name} style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0' }}>
                    <span style={{ color: info.status === 'connected' ? '#22c55e' : '#ef4444' }}>&#9679;</span>
                    {' '}<strong>{name}</strong> &mdash;{' '}
                    {info.status === 'connected' ? `${info.toolCount} 个工具` : (info.error || '未连接')}
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* ── About ── */}
          <div className="settings-section" style={{ textAlign: 'center', borderBottom: 'none', paddingBottom: 0 }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>&#128062;</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Paw</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>v0.22.0</div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 12 }}>
              <a
                href="#"
                style={{ color: 'var(--accent-link)', fontSize: 12, textDecoration: 'none' }}
                onClick={(e) => { e.preventDefault(); handleOpenExternal('https://github.com/momomo-agent/paw') }}
              >
                GitHub
              </a>
              <a
                href="#"
                style={{ color: 'var(--accent-link)', fontSize: 12, textDecoration: 'none' }}
                onClick={(e) => { e.preventDefault(); handleOpenExternal('https://momomo-agent.github.io/paw/') }}
              >
                官网
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
