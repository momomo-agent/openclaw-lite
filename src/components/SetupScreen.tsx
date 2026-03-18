import { useState, useRef, useEffect, useCallback } from 'react'
import { useIPC } from '../hooks/useIPC'
import { useSanitizedInput } from '../hooks/useSanitizedInput'
import TextInput from './TextInput'

const AVATAR_COUNT = 6 // 0.png through 5.png

interface SetupScreenProps {
  onEnterChat: () => void
}

type Step = 'user' | 'assistant' | 'apikey'

/** Strip characters that break @mention, folder names, or path handling */
function sanitizeName(v: string): string {
  return v.replace(/[@/\\:*?"<>|\s]/g, '').replace(/^\.+/, '')
}

export default function SetupScreen({ onEnterChat }: SetupScreenProps) {
  const api = useIPC()

  const [step, setStep] = useState<Step>('user')

  // User profile — IME-safe sanitized input
  const sanitize = useCallback(sanitizeName, [])
  const [userName, setUserName, userNameProps] = useSanitizedInput(sanitize)
  const [userAvatar, setUserAvatar] = useState(0)

  // Check if user profile already exists (skip user step on re-entry)
  useEffect(() => {
    api.getUserProfile?.().then((profile: any) => {
      if (profile?.userName) {
        setUserName(profile.userName)
        setUserAvatar(profile.presetIndex ?? 0)
        setStep('assistant')
      }
    }).catch(() => {})
  }, [])

  // Assistant — IME-safe sanitized input
  const [assistantName, setAssistantName, assistantNameProps] = useSanitizedInput(sanitize)
  const [assistantAvatar, setAssistantAvatar] = useState(Math.floor(Math.random() * AVATAR_COUNT))
  const [creating, setCreating] = useState(false)

  // API key
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [model, setModel] = useState('claude-sonnet-4-20250514')
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // Force light theme during setup for warm first impression
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme')
    document.documentElement.setAttribute('data-theme', 'light')
    return () => {
      if (prev) document.documentElement.setAttribute('data-theme', prev)
      else document.documentElement.removeAttribute('data-theme')
    }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [step])

  const handleUserNext = () => {
    if (!userName.trim()) return
    setStep('assistant')
  }

  const handleCreate = async () => {
    const trimmed = assistantName.trim()
    if (!trimmed || creating) return
    setCreating(true)

    // Save user profile
    await api.setUserProfile({ userName: userName.trim(), presetIndex: userAvatar })

    // Create workspace
    const result = await api.createWorkspace({ name: trimmed, avatar: `preset:${assistantAvatar}` })
    if (result?.ok) {
      const ws = result.workspace
      if (ws?.id) {
        await api.setWorkspaceAvatar({ id: ws.id, presetIndex: assistantAvatar })
      }
      // Load existing config to check if API key already set
      const cfg = await api.loadConfig?.() || {}
      if (cfg.apiKey) {
        onEnterChat()
      } else {
        setCreating(false)
        setStep('apikey')
      }
    } else {
      setCreating(false)
    }
  }

  const handleOpen = async () => {
    if (userName.trim()) {
      await api.setUserProfile({ userName: userName.trim(), presetIndex: userAvatar })
    }
    const result = await api.addWorkspace()
    if (result?.ok) {
      // Check if API key exists
      const cfg = await api.loadConfig?.() || {}
      if (cfg.apiKey) {
        onEnterChat()
      } else {
        setStep('apikey')
      }
    } else if (result?.error === 'not_a_workspace') {
      alert('该文件夹不是 Paw workspace。\n\n请选择包含 SOUL.md 或 .paw/config.json 的文件夹。')
    }
  }

  const handleTestConnection = async () => {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.testApiConnection?.({
        provider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
      })
      setTestResult(result?.ok
        ? { ok: true, msg: '连接成功 ✓' }
        : { ok: false, msg: result?.error || '连接失败' }
      )
    } catch (err: any) {
      setTestResult({ ok: false, msg: err?.message || '连接失败' })
    } finally {
      setTesting(false)
    }
  }

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)

    // Test connection first
    try {
      const result = await api.testApiConnection?.({
        provider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
      })
      if (!result?.ok) {
        setTestResult({ ok: false, msg: result?.error || '连接失败，请检查 API Key' })
        setTesting(false)
        return
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err?.message || '连接失败' })
      setTesting(false)
      return
    }

    // Save config
    const cfg = await api.loadConfig?.() || {}
    cfg.provider = provider
    cfg.apiKey = apiKey.trim()
    if (model) cfg.model = model
    if (baseUrl.trim()) cfg.baseUrl = baseUrl.trim()
    if (tavilyKey.trim()) cfg.tavilyApiKey = tavilyKey.trim()
    await api.saveConfig?.(cfg)
    setTesting(false)
    onEnterChat()
  }

  return (
    <div className="setup-screen" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', color: 'var(--text-primary)',
    }}>
      <div className="setup-container" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 28, maxWidth: 340, width: '100%', padding: '0 24px',
      }}>

        {step === 'user' ? (
          <>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 21, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                先认识一下你
              </h1>
              <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                选个头像，告诉我怎么称呼你。
              </p>
            </div>

            <AvatarPicker
              count={AVATAR_COUNT}
              selected={userAvatar}
              onSelect={setUserAvatar}
            />

            <TextInput
              ref={inputRef}
              {...userNameProps}
              onSubmit={handleUserNext}
              placeholder="你的名字"
              maxLength={32}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-muted)'}
            />

            <button
              className="primary-btn"
              onClick={handleUserNext}
              disabled={!userName.trim()}
              style={btnStyle}
            >
              下一步
            </button>
          </>
        ) : step === 'assistant' ? (
          <>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 21, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                创建你的第一个助手
              </h1>
              <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                给 ta 起个名字，选个形象。
              </p>
            </div>

            <AvatarPicker
              count={AVATAR_COUNT}
              selected={assistantAvatar}
              onSelect={setAssistantAvatar}
            />

            <TextInput
              ref={inputRef}
              {...assistantNameProps}
              onSubmit={handleCreate}
              placeholder="比如 Momo、小助手、Alice"
              maxLength={32}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-muted)'}
            />

            <button
              className="primary-btn"
              onClick={handleCreate}
              disabled={!assistantName.trim() || creating}
              style={btnStyle}
            >
              {creating ? '创建中...' : '开始'}
            </button>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <button onClick={() => setStep('user')} style={linkStyle}>
                上一步
              </button>
              <span style={{ color: 'var(--border-muted)', fontSize: 12 }}>|</span>
              <button onClick={handleOpen} style={linkStyle}>
                我已有 workspace
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 21, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                最后一步 — API Key
              </h1>
              <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                选择 AI 服务商，粘贴你的 API Key。
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              {(['anthropic', 'openai'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => {
                    setProvider(p)
                    setModel(p === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o')
                    setTestResult(null)
                  }}
                  style={{
                    flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 500,
                    borderRadius: 8, border: '1px solid',
                    borderColor: provider === p ? '#111' : 'var(--border-muted)',
                    background: provider === p ? '#111' : 'transparent',
                    color: provider === p ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                </button>
              ))}
            </div>

            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              style={{
                ...inputStyle, textAlign: 'left', fontSize: 13,
                appearance: 'none', WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%23999' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
                paddingRight: 32,
              }}
            >
              {provider === 'anthropic' ? (
                <>
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                  <option value="claude-haiku-3-5-20241022">Claude 3.5 Haiku</option>
                </>
              ) : (
                <>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="o3-mini">o3-mini</option>
                </>
              )}
            </select>

            <TextInput
              ref={inputRef}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setTestResult(null) }}
              onSubmit={handleSaveApiKey}
              placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
              style={{ ...inputStyle, textAlign: 'left', fontFamily: "'SF Mono', monospace", fontSize: 13 }}
              onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-muted)'}
            />

            <TextInput
              value={baseUrl}
              onChange={e => { setBaseUrl(e.target.value); setTestResult(null) }}
              placeholder="Base URL（可选，默认官方地址）"
              style={{ ...inputStyle, textAlign: 'left', fontFamily: "'SF Mono', monospace", fontSize: 12 }}
              onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-muted)'}
            />

            <div style={{ width: '100%', borderTop: '1px solid var(--border-muted)', paddingTop: 16 }}>
              <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: '0 0 8px' }}>
                联网搜索（可选）
              </p>
              <TextInput
                value={tavilyKey}
                onChange={e => setTavilyKey(e.target.value)}
                placeholder="Tavily API Key（tvly-...）"
                style={{ ...inputStyle, textAlign: 'left', fontFamily: "'SF Mono', monospace", fontSize: 12 }}
                onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-muted)'}
              />
            </div>

            {testResult && (
              <p style={{
                fontSize: 12, margin: 0,
                color: testResult.ok ? '#22c55e' : '#ef4444',
              }}>
                {testResult.msg}
              </p>
            )}

            <button
              className="primary-btn"
              onClick={handleSaveApiKey}
              disabled={!apiKey.trim() || testing}
              style={btnStyle}
            >
              {testing ? '检测中...' : '开始使用'}
            </button>

            <button onClick={onEnterChat} style={linkStyle}>
              稍后设置
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Avatar picker ──

function AvatarPicker({ count, selected, onSelect }: { count: number, selected: number, onSelect: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          style={{
            width: 46, height: 46, borderRadius: '50%', padding: 0, border: 'none',
            outline: selected === i ? '2px solid var(--text-primary)' : '2px solid transparent',
            outlineOffset: 2,
            cursor: 'pointer', overflow: 'hidden',
            background: 'transparent',
            opacity: selected === i ? 1 : 0.45,
            transition: 'opacity 0.15s, outline-color 0.15s',
          }}
        >
          <img
            src={`../avatars/${i}.png`}
            alt=""
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </button>
      ))}
    </div>
  )
}

// ── Shared styles ──

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: 15, fontWeight: 500,
  background: 'var(--bg-elevated)', border: '1px solid var(--border-muted)',
  borderRadius: 10, color: 'var(--text-primary)', textAlign: 'center',
  outline: 'none', transition: 'border-color 0.15s',
}

const btnStyle: React.CSSProperties = {
  width: '100%', padding: '11px 24px', fontSize: 14, borderRadius: 10,
}

const linkStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0,
  color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer',
}
