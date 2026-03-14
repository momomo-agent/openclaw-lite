import { useEffect, useState } from 'react'
import { AppProvider, useAppState } from './store'
import { useIPC } from './hooks/useIPC'
import { useTheme } from './hooks/useTheme'
import { setClawDir as setMarkdownClawDir } from './utils/markdown'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SetupScreen from './components/SetupScreen'
import './styles/global.css'

function AppContent() {
  const { setSessions, setWorkspaces, setActivity, setStatus, setUserProfile, setCurrentSessionId, setClawDir, setFeatureFlags, setShowTools } = useAppState()
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

    // Parallelize independent IPC calls
    const [config, profile, ws, prefs, sessions] = await Promise.all([
      api.getConfig(),
      api.getUserProfile(),
      api.listWorkspaces(),
      api.getPrefs?.(),
      api.listSessions(),
    ])

    const t = config?.theme
    setTheme(!t || t === 'default' ? 'light' : t)
    setShowTools(config?.showTools === true)
    if (profile) setUserProfile(profile)
    setWorkspaces(ws)

    if (ws.length > 0 && ws[0].path) {
      setClawDir(ws[0].path)
      setMarkdownClawDir(ws[0].path)
    }

    if (prefs?.featureFlags) setFeatureFlags(prefs.featureFlags)
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
      }
    }

    // Catch up runtime state (window may have been closed and reopened)
    try {
      const runtimeState = await api.getRuntimeState?.()
      if (runtimeState?.latestStatuses) {
        for (const [sid, st] of Object.entries(runtimeState.latestStatuses)) {
          const s = st as any
          setActivity(sid, s.level)
          // Don't restore idle/done status text — it's meaningless in sidebar
          setStatus(sid, (s.level === 'idle' || s.level === 'done') ? '' : (s.text || ''))
        }
      }
    } catch {}

    setReady(true)
  }

  // Global event listeners — separate useEffect with proper cleanup
  useEffect(() => {
    if (!ready) return

    const cleanupWatson = api.onWatsonStatus?.((data: any) => {
      if (data.sessionId) {
        setActivity(data.sessionId, data.level)
        // Clear status text for idle/done — don't show "空闲待命中" in sidebar
        if (data.level === 'idle' || data.level === 'done') {
          setStatus(data.sessionId, '')
        } else {
          setStatus(data.sessionId, data.text || '')
        }
      }
    })

    const cleanupMemory = api.onMemoryChanged?.(() => {})

    const cleanupTray = api.onTrayNewChat?.(() => {
      api.createSession({}).then(async (result: any) => {
        if (result?.id) {
          setCurrentSessionId(result.id)
          const updated = await api.listSessions()
          setSessions(updated)
        }
      })
    })

    const cleanupWs = api.onWorkspaceChanged?.(async () => {
      const ws = await api.listWorkspaces()
      setWorkspaces(ws)
      // Update clawDir
      if (ws.length > 0 && ws[0].path) {
        setClawDir(ws[0].path)
        setMarkdownClawDir(ws[0].path)
      }
      // Refresh sessions (titles/participants may be affected)
      const sessions = await api.listSessions()
      setSessions(sessions)
      // If all workspaces deleted, go back to setup
      if (ws.length === 0) {
        setReady(false)
        setNeedsSetup(true)
      }
    })

    return () => {
      if (typeof cleanupWatson === 'function') cleanupWatson()
      if (typeof cleanupMemory === 'function') cleanupMemory()
      if (typeof cleanupTray === 'function') cleanupTray()
      if (typeof cleanupWs === 'function') cleanupWs()
    }
  }, [ready])

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
