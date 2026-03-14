import { useState, useRef, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'
import TextInput from './TextInput'

const AVATAR_COUNT = 6 // 0.png through 5.png

interface SetupScreenProps {
  onEnterChat: () => void
}

type Step = 'user' | 'assistant'

/** Strip characters that break @mention, folder names, or path handling */
function sanitizeName(v: string): string {
  return v.replace(/[@/\\:*?"<>|\s]/g, '').replace(/^\.+/, '')
}

export default function SetupScreen({ onEnterChat }: SetupScreenProps) {
  const api = useIPC()

  const [step, setStep] = useState<Step>('user')

  // User profile
  const [userName, setUserName] = useState('')
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

  // Assistant
  const [assistantName, setAssistantName] = useState('')
  const [assistantAvatar, setAssistantAvatar] = useState(Math.floor(Math.random() * AVATAR_COUNT))
  const [creating, setCreating] = useState(false)

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
      onEnterChat()
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
      onEnterChat()
    } else if (result?.error === 'not_a_workspace') {
      alert('该文件夹不是 Paw workspace。\n\n请选择包含 SOUL.md 或 .paw/config.json 的文件夹。')
    }
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
              value={userName}
              onChange={e => setUserName(sanitizeName(e.target.value))}
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
        ) : (
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
              value={assistantName}
              onChange={e => setAssistantName(sanitizeName(e.target.value))}
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
