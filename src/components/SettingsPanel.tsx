import { useState, useEffect, useRef, useCallback } from 'react'
import { useIPC } from '../hooks/useIPC'
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
  { value: 'nerv', label: 'NERV', bg: '#0a0008', accent: '#ff3030' },
]

const AVATAR_PRESETS = [0, 1, 2, 3, 4, 5]

export default function SettingsPanel({ visible, onClose }: SettingsPanelProps) {
  const api = useIPC()

  // Config state
  const [config, setConfig] = useState<Config>({})
  const [codingAgent, setCodingAgent] = useState<string>('claude')
  const [currentTheme, setCurrentTheme] = useState<string>('default')

  // Profile state
  const [userName, setUserName] = useState('')
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null)
  const [pendingAvatar, setPendingAvatar] = useState<{ presetIndex?: number; customPath?: string } | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)

  // MCP state
  const [mcpText, setMcpText] = useState('')
  const [mcpStatus, setMcpStatus] = useState<Record<string, McpServerStatus> | null>(null)

  // Workspace state

  // Heartbeat derived state
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(true)
  const [heartbeatInterval, setHeartbeatInterval] = useState(30)

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
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

      // Profile
      setUserName(profile?.userName || '')
      setPendingAvatar(null)
      setSelectedPreset(null)
      if (profile?.userAvatar && avatarPath) {
        setAvatarSrc(`file://${avatarPath}?t=${Date.now()}`)
      } else {
        setAvatarSrc(null)
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
      await api.setUserProfile(profileOpts)

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

  // Custom avatar upload
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const filePath = (file as any).path
    if (filePath) {
      setAvatarSrc(`file://${filePath}`)
      setPendingAvatar({ customPath: filePath })
      setSelectedPreset(null)
    }
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
          <span>Settings</span>
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
            <div className="settings-section-title">Profile</div>
            <div className="settings-field" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'var(--avatar-bg)', overflow: 'hidden', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
                onClick={() => fileInputRef.current?.click()}
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
                  placeholder="Your name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarUpload}
              />
            </div>
          </div>

          {/* ── Provider ── */}
          <div className="settings-section">
            <div className="settings-section-title">Provider</div>
            <div className="settings-field">
              <label>Provider</label>
              <select
                value={config.provider || 'anthropic'}
                onChange={(e) => setConfig({ ...config, provider: e.target.value })}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div className="settings-field">
              <label>API Key</label>
              <input
                type="password"
                placeholder="sk-..."
                value={config.apiKey || ''}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              />
            </div>
            <div className="settings-field">
              <label>Base URL <span className="hint">(optional)</span></label>
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
            <div className="settings-section-title">Model</div>
            <div className="settings-field">
              <label>Model</label>
              <input
                type="text"
                placeholder="claude-sonnet-4-20250514"
                value={config.model || ''}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
              />
              <p className="hint" style={{ marginTop: 4 }}>Leave empty to use provider default.</p>
            </div>
          </div>

          {/* ── Appearance ── */}
          <div className="settings-section">
            <div className="settings-section-title">Appearance</div>
            <div className="settings-field">
              <label>Theme</label>
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
          </div>

          {/* ── Tools ── */}
          <div className="settings-section">
            <div className="settings-section-title">Tools</div>
            <div className="settings-field">
              <label>Default Coding Agent</label>
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
              <label>Tavily API Key <span className="hint">(for web search)</span></label>
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
            <div className="settings-section-title">Permission</div>
            <div className="settings-field">
              <label className="toggle-label" style={{ justifyContent: 'space-between' }}>
                <span style={{ flex: 1 }}>Require approval for dangerous commands</span>
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
              <div className="settings-section-title">MCP Servers</div>
              <div className="settings-field">
                {Object.entries(mcpStatus).map(([name, info]) => (
                  <div key={name} style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0' }}>
                    <span style={{ color: info.status === 'connected' ? '#22c55e' : '#ef4444' }}>&#9679;</span>
                    {' '}<strong>{name}</strong> &mdash;{' '}
                    {info.status === 'connected' ? `${info.toolCount} tools` : (info.error || 'disconnected')}
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* ── About ── */}
          <div className="settings-section" style={{ textAlign: 'center', borderBottom: 'none', paddingBottom: 0 }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>&#128062;</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Paw</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>v0.21.0</div>
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
                Website
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
