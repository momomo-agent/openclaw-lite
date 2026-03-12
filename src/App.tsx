import { useEffect } from 'react'
import { AppProvider, useAppState } from './store'
import { useIPC } from './hooks/useIPC'
import { useTheme } from './hooks/useTheme'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import './styles/global.css'

function AppContent() {
  const { setSessions, setWorkspaces, setActivity, setStatus, setUserProfile, setCurrentSessionId } = useAppState()
  const api = useIPC()
  const { setTheme } = useTheme()

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    const workspaces = await api.listWorkspaces()
    setWorkspaces(workspaces)

    const config = await api.getConfig()
    setTheme(config?.theme || 'light')

    const profile = await api.getUserProfile()
    if (profile) setUserProfile(profile)

    const sessions = await api.listSessions()
    setSessions(sessions)

    // Auto-select first session
    if (sessions.length > 0) {
      setCurrentSessionId(sessions[0].id)
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
