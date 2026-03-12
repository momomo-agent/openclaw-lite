import { useState, useCallback } from 'react'
import { Draft } from '../types'

export function useDraft() {
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map())

  const saveDraft = useCallback((sessionId: string, draft: Draft) => {
    setDrafts(prev => new Map(prev).set(sessionId, draft))
  }, [])

  const getDraft = useCallback((sessionId: string): Draft | undefined => {
    return drafts.get(sessionId)
  }, [drafts])

  const clearDraft = useCallback((sessionId: string) => {
    setDrafts(prev => {
      const next = new Map(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  return { saveDraft, getDraft, clearDraft }
}
