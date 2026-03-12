import { useEffect, useState } from 'react'
import { AppProvider, useAppState } from './store'
import { useIPC } from './hooks/useIPC'
import { useTheme } from './hooks/useTheme'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SetupScreen from './components/SetupScreen'
import './styles/global.css'

function AppContent() {
  const { setSessions, setWorkspaces, setActivity, setStatus, setUserProfile, setCurrentSessionId } = useAppState()
  const api = useIPC()
  const { setTheme } = useTheme()
  const [ready, setReady] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    const ws = await api.listWorkspaces()
    setWorkspaces(ws)

    if (ws.length === 0) {
      setNeedsSetup(true)
      return
    }

    await enterChat()
  }

  const enterChat = async () => {
    setNeedsSetup(false)

    const config = await api.getConfig()
    setTheme(config?.theme || 'light')

    const profile = await api.getUserProfile()
    if (profile) setUserProfile(profile)

    const ws = await api.listWorkspaces()
    setWorkspaces(ws)

    const sessions = await api.listSessions()
    setSessions(sessions)

    // Auto-select or bootstrap
    if (sessions.length > 0) {
      setCurrentSessionId(sessions[0].id)
    } else {
      // Create first session + bootstrap
      const result = await api.createSession({})
      if (result?.id) {
        setCurrentSessionId(result.id)
        const updated = await api.listSessions()
        setSessions(updated)
        // Bootstrap: auto-send intro prompt
        const cfg = await api.getConfig()
        if (cfg?.apiKey) {
          const session = await api.loadSession(result.id)
          if (!session?.messages?.length) {
            const reqId = await api.chatPrepare?.() || Date.now().toString()
            await api.chat({ sessionId: result.id, message: '你好，请读取 SOUL.md 和 USER.md，介绍一下你自己。', requestId: reqId })
          }
        }
      }
    }

    // Listen to sidebar status updates
    api.onWatsonStatus?.((data: any) => {
      if (data.sessionId) {
        setActivity(data.sessionId, data.level)
        setStatus(data.sessionId, data.text || '')
      }
    })

    // Tray new chat
    api.onTrayNewChat?.(() => {
      api.createSession({}).then(async (result: any) => {
        if (result?.id) {
          setCurrentSessionId(result.id)
          const updated = await api.listSessions()
          setSessions(updated)
        }
      })
    })

    setReady(true)
  }

  if (needsSetup) {
    return <SetupScreen onEnterChat={enterChat} />
  }

  if (!ready) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>Loading...</div>
  }

  return (
    <div id="chatScreen" style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <ChatView />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
