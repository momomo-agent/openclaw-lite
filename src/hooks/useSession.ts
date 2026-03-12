import { useState, useCallback } from 'react'
import { Session, ActivityLevel } from '../types'

export function useSession() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [activityState, setActivityState] = useState<Map<string, ActivityLevel>>(new Map())
  const [aiStatus, setAiStatus] = useState<Map<string, string>>(new Map())

  const setActivity = useCallback((sessionId: string, level: ActivityLevel) => {
    setActivityState(prev => new Map(prev).set(sessionId, level))
  }, [])

  const setStatus = useCallback((sessionId: string, text: string) => {
    setAiStatus(prev => new Map(prev).set(sessionId, text))
  }, [])

  return {
    currentSessionId,
    setCurrentSessionId,
    sessions,
    setSessions,
    activityState,
    aiStatus,
    setActivity,
    setStatus
  }
}
