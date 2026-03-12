import { useEffect } from 'react'
import { AppProvider, useAppState } from './store'
import { useIPC } from './hooks/useIPC'
import { useTheme } from './hooks/useTheme'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import './styles/global.css'

function AppContent() {
  const { setSessions, setWorkspaces, setActivity, setStatus } = useAppState()
  const api = useIPC()
  const { setTheme } = useTheme()

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    const workspaces = await api.listWorkspaces()
    setWorkspaces(workspaces)

    const sessions = await api.listSessions()
    setSessions(sessions)

    const config = await api.getConfig()
    setTheme(config?.theme || 'default')

    // Listen to status updates
    api.onWatsonStatus?.((data: any) => {
      if (data.sessionId) {
        setActivity(data.sessionId, data.level)
        setStatus(data.sessionId, data.text || '')
      }
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
