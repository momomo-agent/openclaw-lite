import { createContext, useContext, ReactNode, useState } from 'react'
import { Session, Workspace, ActivityLevel, UserProfile } from '../types'

interface AppState {
  currentSessionId: string | null
  sessions: Session[]
  workspaces: Workspace[]
  activityState: Map<string, ActivityLevel>
  aiStatus: Map<string, string>
  userProfile: UserProfile | null
  clawDir: string | null
  featureFlags: Record<string, boolean>
  sidebarVisible: boolean
}

interface AppContextType extends AppState {
  setCurrentSessionId: (id: string | null) => void
  setSessions: (sessions: Session[]) => void
  setWorkspaces: (workspaces: Workspace[]) => void
  setActivity: (sessionId: string, level: ActivityLevel) => void
  setStatus: (sessionId: string, text: string) => void
  setUserProfile: (profile: UserProfile) => void
  setClawDir: (dir: string | null) => void
  setFeatureFlags: (flags: Record<string, boolean>) => void
  setSidebarVisible: (v: boolean) => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activityState, setActivityState] = useState<Map<string, ActivityLevel>>(new Map())
  const [aiStatus, setAiStatus] = useState<Map<string, string>>(new Map())
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [clawDir, setClawDir] = useState<string | null>(null)
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({})
  const [sidebarVisible, setSidebarVisible] = useState(true)

  const setActivity = (sessionId: string, level: ActivityLevel) => {
    setActivityState(prev => new Map(prev).set(sessionId, level))
  }

  const setStatus = (sessionId: string, text: string) => {
    setAiStatus(prev => new Map(prev).set(sessionId, text))
  }

  return (
    <AppContext.Provider value={{
      currentSessionId, setCurrentSessionId,
      sessions, setSessions,
      workspaces, setWorkspaces,
      activityState, aiStatus,
      userProfile, setUserProfile,
      clawDir, setClawDir,
      featureFlags, setFeatureFlags,
      sidebarVisible, setSidebarVisible,
      setActivity, setStatus
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}
