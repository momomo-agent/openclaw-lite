import { useIPC } from '../hooks/useIPC'

interface SetupScreenProps {
  onEnterChat: () => void
}

export default function SetupScreen({ onEnterChat }: SetupScreenProps) {
  const api = useIPC()

  const handleCreate = async () => {
    const result = await api.createWorkspace({})
    if (result?.ok) onEnterChat()
  }

  const handleOpen = async () => {
    const result = await api.addWorkspace()
    if (result?.ok) onEnterChat()
  }

  return (
    <div className="setup-screen" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 24, color: 'var(--text-primary)'
    }}>
      <div style={{ fontSize: 48 }}>🐾</div>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Welcome to Paw</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0, maxWidth: 360, textAlign: 'center' }}>
        Your AI team's operating system. One folder, one assistant.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="primary-btn" onClick={handleCreate}
          style={{ padding: '10px 24px', fontSize: 14 }}>
          ✨ 新建 Workspace
        </button>
        <button className="secondary-btn" onClick={handleOpen}
          style={{ padding: '10px 24px', fontSize: 14, margin: 0 }}>
          📁 打开已有
        </button>
      </div>
    </div>
  )
}
