/**
 * useChatEvents — Streaming event listener hook for ChatView.
 *
 * Owns all IPC streaming event subscriptions (14 handlers).
 * Uses refs for current values so handlers register once on mount.
 */
import { useEffect, useRef } from 'react'
import { Message, ToolStep } from '../types'

// Debug toggle — run `__PAW_DEBUG__=true` in DevTools console
const dbg = (...args: any[]) => {
  if ((window as any).__PAW_DEBUG__) console.log('[Paw🐾]', ...args)
}

/** Per-session streaming state */
export interface StreamState {
  requestId: string | null
  streamingMsg: Message | null
  delegateMsg: Message | null
  pendingSplit: { sender?: string; avatar?: string; workspacePath?: string; workspaceId?: string } | null
  thinkingAccum: string
  status: string
  statusIsAiAuthored: boolean
}

export function createStreamState(): StreamState {
  return { requestId: null, streamingMsg: null, delegateMsg: null, pendingSplit: null, thinkingAccum: '', status: '', statusIsAiAuthored: false }
}

interface Refs {
  currentSessionId: React.MutableRefObject<string | null>
  api: React.MutableRefObject<any>
  workspaces: React.MutableRefObject<any[]>
  store: React.MutableRefObject<{
    setActivity: (sid: string, activity: string) => void
    setStatus: (sid: string, status: string) => void
    setSessions: (sessions: any[]) => void
  }>
}

interface StreamRouter {
  getStreamState: (sid: string) => StreamState
  clearStreamState: (sid: string) => void
  ensureCardAdded: (sid: string, ss: StreamState) => void
  routeUpdate: (sid: string, msg: Message) => void
  routeAdd: (sid: string, msg: Message) => void
  routeRemove: (sid: string, msgId: string) => void
  routeSet: (sid: string, msgs: Message[] | ((prev: Message[]) => Message[])) => void
  routeStatus: (sid: string, status: string) => void
  streamStates: React.MutableRefObject<Map<string, StreamState>>
}

// ── Thinking management ──────────────────────────────────────

/** Flush pending thinking accumulator and finalize the live __thinking__ entry. */
function flushThinking(ss: StreamState, target: Message) {
  if (!ss.thinkingAccum) return
  const steps = target.toolSteps || []
  const last = steps[steps.length - 1]
  if (last?.name === '__thinking__' && (last as any)._live) {
    delete (last as any)._live
  }
  ss.thinkingAccum = ''
}

/** Append thinking text to the target message's live __thinking__ entry. */
function appendThinking(ss: StreamState, target: Message, text: string) {
  ss.thinkingAccum += text
  const steps = target.toolSteps || []
  const last = steps[steps.length - 1]
  if (last?.name === '__thinking__' && (last as any)._live) {
    last.output = ss.thinkingAccum
    target.toolSteps = [...steps]
  } else {
    target.toolSteps = [...steps, { name: '__thinking__', output: ss.thinkingAccum, _live: true } as any]
  }
}

// ── Hook ─────────────────────────────────────────────────────

export function useChatEvents(refs: Refs, router: StreamRouter) {
  const api = refs.api.current

  useEffect(() => {
    // Guard: resolve session, check requestId match, log rejection.
    // allowAdopt: if true and session has no active stream, adopt the incoming requestId.
    const guard = (event: string, data: any, opts?: { allowAdopt?: boolean }): { sid: string; ss: StreamState } | null => {
      const sid = data.sessionId || refs.currentSessionId.current
      if (!sid) return null
      const ss = router.streamStates.current.get(sid)
      const match = ss?.requestId && data.requestId === ss.requestId
      dbg(event, { sid: sid.slice(0, 8), reqId: data.requestId?.slice(0, 8), match })
      if (match) return { sid, ss: ss! }
      if (opts?.allowAdopt && data.requestId && (!ss || !ss.requestId)) {
        dbg(`${event} (adopt-drain)`, { sid: sid.slice(0, 8), reqId: data.requestId.slice(0, 8) })
        const adopted = router.getStreamState(sid)
        adopted.requestId = data.requestId
        return { sid, ss: adopted }
      }
      return null
    }

    // ── Streaming events ────────────────────

    const handleTextStart = (data: any) => {
      const g = guard('text-start', data, { allowAdopt: true })
      if (!g) return
      const { sid, ss } = g

      // Post-delegate split: create deferred card
      if (ss.pendingSplit) {
        const split = ss.pendingSplit
        ss.pendingSplit = null
        ss.streamingMsg = {
          id: 'streaming-' + Date.now(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          toolSteps: [],
          sender: split.sender,
          avatar: split.avatar,
          workspacePath: split.workspacePath,
          workspaceId: split.workspaceId,
          _deferred: true,
        } as any
        if (!ss.delegateMsg) router.routeStatus(sid, 'Thinking...')
        ss.statusIsAiAuthored = false
        return
      }

      // Update existing card with backend identity
      if (ss.streamingMsg) {
        if (data.agentName) ss.streamingMsg.sender = data.agentName
        if (data.avatar) ss.streamingMsg.avatar = data.avatar
        if (data.wsPath) ss.streamingMsg.workspacePath = data.wsPath
        if (data.workspaceId) ss.streamingMsg.workspaceId = data.workspaceId
        router.routeStatus(sid, ss.status || 'Thinking...')
        router.routeUpdate(sid, ss.streamingMsg)
        return
      }

      // Create new card
      ss.streamingMsg = {
        id: 'streaming-' + Date.now(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolSteps: [],
        sender: data.agentName,
        avatar: data.avatar,
        workspacePath: data.wsPath,
        workspaceId: data.workspaceId,
      }
      router.routeStatus(sid, 'Thinking...')
      ss.statusIsAiAuthored = false
      router.routeAdd(sid, ss.streamingMsg)
    }

    const handleToken = (data: any) => {
      const g = guard('token', data)
      if (!g) return
      const { sid, ss } = g
      if (!ss.streamingMsg) return
      const text = data.text || data.delta || ''
      if (!text) return
      router.ensureCardAdded(sid, ss)
      const target = ss.delegateMsg || ss.streamingMsg
      if (data.thinking) {
        appendThinking(ss, target, text)
      } else {
        flushThinking(ss, target)
        target.content = (target.content || '') + text
      }
      router.routeUpdate(sid, target)
    }

    const handleToolStep = (data: any) => {
      const g = guard('tool-step', data)
      if (!g) return
      const { sid, ss } = g
      const target = ss.delegateMsg || ss.streamingMsg
      if (!target) return
      router.ensureCardAdded(sid, ss)
      flushThinking(ss, target)
      const step: ToolStep = { name: data.name || data.tool || 'unknown', input: data.input, output: String(data.output || '').slice(0, 500) }
      target.toolSteps = [...(target.toolSteps || []), step]
      if (!ss.statusIsAiAuthored) router.routeStatus(sid, `${step.name}...`)
      router.routeUpdate(sid, target)
      refs.store.current.setActivity(sid, 'running')
    }

    const handleRoundInfo = (data: any) => {
      const g = guard('round-info', data)
      if (!g) return
      const { sid, ss } = g
      const target = ss.delegateMsg || ss.streamingMsg
      if (target && data.purpose) {
        target.roundPurpose = data.purpose
        router.routeUpdate(sid, target)
      }
    }

    const handleStatus = (data: any) => {
      const sid = data.sessionId || refs.currentSessionId.current
      if (!sid) return
      const ss = router.streamStates.current.get(sid)
      if (!ss) return
      if (data.state === 'done' || data.state === 'error') {
        router.routeStatus(sid, '')
        ss.statusIsAiAuthored = false
      } else if (!ss.statusIsAiAuthored && data.detail) {
        router.routeStatus(sid, data.detail)
      }
    }

    const handleWatsonStatus = (data: any) => {
      const sid = data.sessionId || refs.currentSessionId.current
      if (!sid) return
      if (data.level === 'idle' || data.level === 'done') {
        const ss = router.streamStates.current.get(sid)
        if (ss) {
          ss.statusIsAiAuthored = false
          router.routeStatus(sid, '')
        }
        return
      }
      const ss = router.streamStates.current.get(sid)
      if (ss && data.text) {
        ss.statusIsAiAuthored = true
        router.routeStatus(sid, data.text)
        refs.store.current.setStatus(sid, data.text)
        refs.api.current.updateSessionStatus?.(sid, 'running', data.text)
      }
    }

    // ── Delegate events ─────────────────────

    const handleDelegateStart = (data: any) => {
      const sid = data.sessionId || refs.currentSessionId.current
      if (!sid) return
      const ss = router.streamStates.current.get(sid)
      if (!ss) return

      // Finalize orchestrator thinking
      if (ss.streamingMsg) {
        flushThinking(ss, ss.streamingMsg)
        router.ensureCardAdded(sid, ss)
        router.routeUpdate(sid, ss.streamingMsg)
      }
      ss.thinkingAccum = ''

      // Save orchestrator identity for post-delegate split
      if (ss.streamingMsg) {
        ss.pendingSplit = {
          sender: ss.streamingMsg.sender,
          avatar: ss.streamingMsg.avatar,
          workspacePath: ss.streamingMsg.workspacePath,
          workspaceId: ss.streamingMsg.workspaceId,
        }
        // Remove empty orchestrator card
        const hasContent = !!(ss.streamingMsg.content?.trim())
        const hasVisibleSteps = (ss.streamingMsg.toolSteps || []).some((s: any) =>
          s.name !== '__thinking__' || (s.output || '').trim()
        )
        if (!hasContent && !hasVisibleSteps) {
          router.routeRemove(sid, ss.streamingMsg.id)
        }
        ss.streamingMsg = null
      }

      const wsPath = data.workspaceId
        ? refs.workspaces.current.find(w => w.id === data.workspaceId)?.path
        : undefined
      ss.delegateMsg = {
        id: 'delegate-' + Date.now(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        sender: data.sender,
        avatar: data.avatar,
        workspacePath: wsPath,
        workspaceId: data.workspaceId,
        toolSteps: [],
      }
      router.routeAdd(sid, ss.delegateMsg)
      router.routeStatus(sid, 'Thinking...')
    }

    const handleDelegateToken = (data: any) => {
      const sid = data.sessionId || refs.currentSessionId.current
      if (!sid) return
      const ss = router.streamStates.current.get(sid)
      if (!ss?.delegateMsg) return

      // Tool step from delegate
      if (data.toolStep) {
        flushThinking(ss, ss.delegateMsg)
        const ts = data.toolStep
        ss.delegateMsg.toolSteps = [
          ...(ss.delegateMsg.toolSteps || []),
          { name: ts.name || ts.tool, input: ts.input, output: String(ts.output || '').slice(0, 500) },
        ]
        router.routeUpdate(sid, ss.delegateMsg)
        return
      }

      // Round info from delegate
      if (data.roundInfo) {
        if (data.roundInfo.purpose) {
          ss.delegateMsg.roundPurpose = data.roundInfo.purpose
          router.routeUpdate(sid, ss.delegateMsg)
        }
        return
      }

      // Text/thinking token
      const text = data.token || ''
      if (!text) return
      if (data.thinking) {
        appendThinking(ss, ss.delegateMsg, text)
      } else {
        flushThinking(ss, ss.delegateMsg)
        ss.delegateMsg.content += text
      }
      router.routeUpdate(sid, ss.delegateMsg)
    }

    const handleDelegateEnd = (data: any) => {
      const sid = data.sessionId || refs.currentSessionId.current
      if (!sid) return
      const ss = router.streamStates.current.get(sid)
      if (!ss?.delegateMsg) return
      if (data.fullText !== undefined) ss.delegateMsg.content = data.fullText
      flushThinking(ss, ss.delegateMsg)
      router.routeUpdate(sid, ss.delegateMsg)
      ss.delegateMsg = null
    }

    const handleAutoRotate = (data: any) => {
      if (data.sessionId) refs.store.current.setActivity(data.sessionId, 'thinking')
    }

    // ── Done / Error / Queued ────────────────

    const handleDone = async (data: any) => {
      const g = guard('done', data)
      if (!g) return
      const { sid } = g
      router.clearStreamState(sid)
      refs.store.current.setActivity(sid, 'idle')
      refs.store.current.setStatus(sid, '')

      try {
        const session = await refs.api.current.loadSession(sid)
        if (!session) return
        const dbMessages = session.messages || []
        if (dbMessages.length === 0) return

        if (data.error && !dbMessages.some((m: any) => m.isError)) {
          let errMsg = data.error
          errMsg = errMsg.replace(/^Error invoking remote method '[^']+': Error: /i, '')
          errMsg = errMsg.replace(/^Error: /i, '')
          dbMessages.push({ id: 'error-' + Date.now(), role: 'assistant', content: errMsg, timestamp: Date.now(), isError: true })
        }
        router.routeSet(sid, dbMessages)

        const updated = await refs.api.current.listSessions()
        refs.store.current.setSessions(updated)
      } catch (err) {
        console.error('[ChatView] handleDone error:', err)
      }
    }

    const handleError = (data: any) => {
      const g = guard('error', data)
      if (!g) return
      const { sid } = g
      let errMsg = data.error || 'Something went wrong'
      errMsg = errMsg.replace(/^Error invoking remote method '[^']+': Error: /i, '')
      errMsg = errMsg.replace(/^Error: /i, '')
      router.routeAdd(sid, {
        id: 'error-' + Date.now(),
        role: 'assistant' as any,
        content: errMsg,
        timestamp: Date.now(),
        isError: true,
      })
      router.clearStreamState(sid)
      refs.store.current.setActivity(sid, 'idle')
      refs.store.current.setStatus(sid, '')
    }

    const handleChatQueued = (data: any) => {
      const sid = data.sessionId || refs.currentSessionId.current
      if (!sid) return
      const ss = router.streamStates.current.get(sid)
      if (!ss || data.requestId !== ss.requestId) return
      if (ss.streamingMsg) {
        dbg('chat-queued', { sid: sid.slice(0, 8), reqId: data.requestId?.slice(0, 8), depth: data.depth })
        router.routeSet(sid, ((prev: Message[]) => prev.filter(m => m.id !== ss.streamingMsg!.id)) as any)
        router.clearStreamState(sid)
      }
    }

    const handleTitleUpdated = async () => {
      const updated = await refs.api.current.listSessions()
      refs.store.current.setSessions(updated)
    }

    // ── Register ─────────────────────────────

    const cleanups = [
      api.onTextStart?.(handleTextStart),
      api.onToken?.(handleToken),
      api.onToolStep?.(handleToolStep),
      api.onRoundInfo?.(handleRoundInfo),
      api.onStatus?.(handleStatus),
      api.onWatsonStatus?.(handleWatsonStatus),
      api.onSessionTitleUpdated?.(handleTitleUpdated),
      api.onChatQueued?.(handleChatQueued),
      api.onDelegateStart?.(handleDelegateStart),
      api.onDelegateToken?.(handleDelegateToken),
      api.onDelegateEnd?.(handleDelegateEnd),
      api.onChatDone?.(handleDone),
      api.onChatError?.(handleError),
      api.onAutoRotate?.(handleAutoRotate),
    ]

    return () => { for (const fn of cleanups) if (typeof fn === 'function') fn() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Register once — handlers use refs for current values
}
