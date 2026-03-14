import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppState } from '../store'
import { useIPC } from '../hooks/useIPC'
import { Message, ToolStep } from '../types'
import MessageList from './MessageList'
import InputBar from './InputBar'
import MembersPanel from './MembersPanel'
import TaskBar from './TaskBar'
import SettingsPanel from './SettingsPanel'

const CHARS_PER_TOKEN = 3.5

// Debug toggle — run `__PAW_DEBUG__=true` in DevTools console to enable
const dbgEnabled = () => !!(window as any).__PAW_DEBUG__

/** Per-session streaming state — lives in a Map ref, survives session switches */
interface StreamState {
  requestId: string | null
  streamingMsg: Message | null
  delegateMsg: Message | null
  pendingSplit: { sender?: string; avatar?: string; workspacePath?: string; workspaceId?: string } | null
  thinkingAccum: string
  status: string
  statusIsAiAuthored: boolean
}

function createStreamState(): StreamState {
  return { requestId: null, streamingMsg: null, delegateMsg: null, pendingSplit: null, thinkingAccum: '', status: '', statusIsAiAuthored: false }
}

export default function ChatView() {
  const { currentSessionId, setCurrentSessionId, sessions, setSessions, setActivity, setStatus, workspaces, setWorkspaces, userProfile, sidebarVisible, setSidebarVisible } = useAppState()
  const api = useIPC()
  const [messages, setMessages] = useState<Message[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [streamingStatus, setStreamingStatus] = useState('')

    // Derive from sessions store (always live, never stale)
  const currentSession = sessions.find(s => s.id === currentSessionId)
  const sessionParticipants = currentSession?.participants || []
  const isGroup = sessionParticipants.length > 1
  const ownerWs = sessionParticipants[0] ? workspaces.find(w => w.id === sessionParticipants[0]) : workspaces[0]
  const sessionTitle = currentSession?.title || (isGroup ? '群聊' : (ownerWs?.identity?.name || ''))

  // === Refs for latest values (handlers registered once need current values via refs) ===
  const currentSidRef = useRef<string | null>(null)
  const workspacesRef = useRef(workspaces)
  const apiRef = useRef(api)
  const storeRef = useRef({ setActivity, setStatus, setSessions })

  useEffect(() => { currentSidRef.current = currentSessionId || null })
  useEffect(() => { workspacesRef.current = workspaces }, [workspaces])
  useEffect(() => { apiRef.current = api }, [api])
  useEffect(() => { storeRef.current = { setActivity, setStatus, setSessions } }, [setActivity, setStatus, setSessions])

  // === Per-session streaming state Map ===
  const streamStates = useRef<Map<string, StreamState>>(new Map())
  const sessionCache = useRef<Map<string, Message[]>>(new Map())

  const getStreamState = (sid: string): StreamState => {
    let s = streamStates.current.get(sid)
    if (!s) {
      s = createStreamState()
      streamStates.current.set(sid, s)
    }
    return s
  }

  const clearStreamState = (sid: string) => {
    streamStates.current.delete(sid)
    if (sid === currentSidRef.current) {
      setStreamingStatus('')
    }
  }

  // === Message routing: React state for current session, cache for background ===
  const routeUpdate = (sid: string, msg: Message) => {
    const updater = (prev: Message[]) => {
      const idx = prev.findIndex(m => m.id === msg.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...msg }
        return next
      }
      return [...prev.slice(0, -1), { ...msg }]
    }
    if (sid === currentSidRef.current) {
      setMessages(updater)
    } else {
      const cached = sessionCache.current.get(sid) || []
      sessionCache.current.set(sid, updater(cached))
    }
  }

  const routeAdd = (sid: string, msg: Message) => {
    if (sid === currentSidRef.current) {
      setMessages(prev => [...prev, msg])
    } else {
      const cached = sessionCache.current.get(sid) || []
      sessionCache.current.set(sid, [...cached, msg])
    }
  }

  const routeRemove = (sid: string, msgId: string) => {
    if (sid === currentSidRef.current) {
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } else {
      const cached = sessionCache.current.get(sid) || []
      sessionCache.current.set(sid, cached.filter(m => m.id !== msgId))
    }
  }

  /** Ensure a deferred streaming card is materialized into the message list */
  const ensureCardAdded = (sid: string, ss: StreamState) => {
    const msg = ss.streamingMsg as any
    if (msg?._deferred) {
      delete msg._deferred
      routeAdd(sid, msg)
    }
  }

  const routeSet = (sid: string, msgs: Message[]) => {
    if (sid === currentSidRef.current) {
      setMessages(msgs)
    } else {
      sessionCache.current.set(sid, msgs)
    }
  }

  const routeStatus = (sid: string, status: string) => {
    const ss = streamStates.current.get(sid)
    if (ss) ss.status = status
    if (sid === currentSidRef.current) {
      setStreamingStatus(status)
    }
    // Update sidebar status text (visible in session list)
    storeRef.current.setStatus(sid, status)
  }

  // === Session switch: load messages and restore streaming status ===
  useEffect(() => {
    if (!currentSessionId) return
    if (dbgEnabled()) console.log('[Paw🐾] session-switch', { sid: currentSessionId.slice(0, 8), hasCache: sessionCache.current.has(currentSessionId), streaming: !!streamStates.current.get(currentSessionId)?.requestId })
    // Restore streaming status from per-session state
    const ss = streamStates.current.get(currentSessionId)
    setStreamingStatus(ss?.status || '')
    // Load messages from cache (may include live streaming data) or DB
    const cached = sessionCache.current.get(currentSessionId)
    if (cached) {
      setMessages(cached)
    } else {
      // Clear stale messages immediately before async load
      setMessages([])
      loadSessionMessages(currentSessionId)
    }
  }, [currentSessionId])

  // Sync messages to cache for current session
  useEffect(() => {
    if (currentSessionId) {
      sessionCache.current.set(currentSessionId, messages)
    }
  }, [messages, currentSessionId])

  // F248 + F249: Global click handler for file links and external links
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a') as HTMLAnchorElement | null
      if (!link) return

      // F248: File links
      const filePath = link.dataset?.path || link.getAttribute('data-path')
      if (filePath) {
        e.preventDefault()
        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        const previewExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf']
        if (previewExts.includes(ext)) {
          api.openFilePreview?.(filePath) || api.openFile?.(filePath)
        } else {
          api.openFile?.(filePath)
        }
        return
      }

      // F249: External links
      const href = link.getAttribute('href')
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        e.preventDefault()
        api.openExternal?.(href)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [api])

  // === Streaming event handlers — registered ONCE, session-independent ===
  useEffect(() => {
    const dbg = (...args: any[]) => { if (dbgEnabled()) console.log('[Paw🐾]', ...args) }

    // Guard helper: resolves session, checks requestId, logs rejection reason
    const guard = (event: string, data: any): { sid: string; ss: StreamState } | null => {
      const sid = data.sessionId || currentSidRef.current
      const ss = sid ? streamStates.current.get(sid) : undefined
      const match = ss?.requestId && data.requestId === ss.requestId
      dbg(event, {
        sid: sid?.slice(0, 8) || '(none)',
        reqId: data.requestId?.slice(0, 8),
        match,
      })
      if (!sid || !ss || !match) return null
      return { sid, ss }
    }

    const handleTextStart = (data: any) => {
      const g = guard('text-start', data)
      if (!g) return
      const { sid, ss } = g

      // Post-delegate split: prepare NEW orchestrator card but don't add to UI yet —
      // the first token/thinking/toolStep will add it (avoids empty card flash)
      if (ss.pendingSplit) {
        const split = ss.pendingSplit
        ss.pendingSplit = null
        const newId = 'streaming-' + Date.now()
        ss.streamingMsg = {
          id: newId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          toolSteps: [],
          sender: split.sender,
          avatar: split.avatar,
          workspacePath: split.workspacePath,
          workspaceId: split.workspaceId,
          _deferred: true,  // not yet added to messages
        } as any
        // Don't steal status — if delegate is still active, status stays on delegate
        if (!ss.delegateMsg) {
          routeStatus(sid, 'Thinking...')
        }
        ss.statusIsAiAuthored = false
        return
      }

      // For round > 0 or pre-created card from handleSend: update identity from backend
      if (ss.streamingMsg) {
        dbg('text-start (existing card)', { id: ss.streamingMsg.id, sender: data.agentName })
        // Update with authoritative identity from backend
        if (data.agentName) ss.streamingMsg.sender = data.agentName
        if (data.avatar) ss.streamingMsg.avatar = data.avatar
        if (data.wsPath) ss.streamingMsg.workspacePath = data.wsPath
        if (data.workspaceId) ss.streamingMsg.workspaceId = data.workspaceId
        routeStatus(sid, ss.status || 'Thinking...')
        routeUpdate(sid, ss.streamingMsg)
        return
      }

      const newId = 'streaming-' + Date.now()
      ss.streamingMsg = {
        id: newId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolSteps: [],
        sender: data.agentName,
        avatar: data.avatar,
        workspacePath: data.wsPath,
        workspaceId: data.workspaceId,
      }
      routeStatus(sid, 'Thinking...')
      ss.statusIsAiAuthored = false
      routeAdd(sid, ss.streamingMsg)    }

    const handleToken = (data: any) => {
      const g = guard('token', data)
      if (!g) return
      const { sid, ss } = g
      if (!ss.streamingMsg) {
        dbg('token skip (no streamingMsg)')
        return
      }
      const text = data.text || data.delta || ''
      if (!text) return
      dbg(data.thinking ? 'think-chunk' : 'text-chunk', text.slice(0, 80))
      ensureCardAdded(sid, ss)
      const target = ss.delegateMsg || ss.streamingMsg
      if (data.thinking) {
        ss.thinkingAccum += text
        // Live preview: update or append __thinking__ entry in toolSteps
        const steps = target.toolSteps || []
        const last = steps[steps.length - 1]
        if (last?.name === '__thinking__' && (last as any)._live) {
          last.output = ss.thinkingAccum
          target.toolSteps = [...steps]
        } else {
          target.toolSteps = [...steps, { name: '__thinking__', output: ss.thinkingAccum, _live: true } as any]
        }
      } else {
        // Non-thinking token → finalize any pending thinking block
        if (ss.thinkingAccum) {
          const steps = target.toolSteps || []
          const last = steps[steps.length - 1]
          if (last?.name === '__thinking__' && (last as any)._live) delete (last as any)._live
          ss.thinkingAccum = ''
        }
        target.content = (target.content || '') + text
      }
      routeUpdate(sid, target)
    }

    const handleToolStep = (data: any) => {
      const g = guard('tool-step', data)
      if (!g) return
      const { sid, ss } = g
      const target = ss.delegateMsg || ss.streamingMsg
      if (!target) {
        dbg('tool-step skip (no target)')
        return
      }
      ensureCardAdded(sid, ss)
      // Flush pending thinking before adding tool step
      if (ss.thinkingAccum) {
        const steps = target.toolSteps || []
        const last = steps[steps.length - 1]
        if (last?.name === '__thinking__' && (last as any)._live) delete (last as any)._live
        ss.thinkingAccum = ''
      }
      const step: ToolStep = { name: data.name || data.tool || 'unknown', input: data.input, output: String(data.output || '').slice(0, 500) }
      dbg('tool', step.name, typeof data.input === 'object' ? JSON.stringify(data.input).slice(0, 80) : '')
      target.toolSteps = [...(target.toolSteps || []), step]
      if (!ss.statusIsAiAuthored) {
        routeStatus(sid, `${data.name || data.tool}...`)
      }
      routeUpdate(sid, target)
      storeRef.current.setActivity(sid, 'running')
    }

    const handleRoundInfo = (data: any) => {
      const g = guard('round-info', data)
      if (!g) return
      const { sid, ss } = g
      const target = ss.delegateMsg || ss.streamingMsg
      if (target && data.purpose) {
        target.roundPurpose = data.purpose
        routeUpdate(sid, target)
      }
    }

    const handleStatus = (data: any) => {
      const sid = data.sessionId || currentSidRef.current
      if (!sid) return
      const ss = streamStates.current.get(sid)
      dbg('status', { sid: sid.slice(0, 8), state: data.state, detail: data.detail, hasSS: !!ss })
      if (!ss) return
      if (data.state === 'done' || data.state === 'error') {
        routeStatus(sid, '')
        ss.statusIsAiAuthored = false
      } else if (!ss.statusIsAiAuthored && data.detail) {
        routeStatus(sid, data.detail)
      }
    }

    const handleWatsonStatus = (data: any) => {
      const sid = data.sessionId || currentSidRef.current
      if (!sid) return
      dbg('watson-status', { sid: sid.slice(0, 8), level: data.level, text: data.text?.slice(0, 30) })
      // Idle/done status is for tray only — clear streaming status, don't display
      if (data.level === 'idle' || data.level === 'done') {
        const ss = streamStates.current.get(sid)
        if (ss) {
          ss.statusIsAiAuthored = false
          routeStatus(sid, '')
        }
        return
      }
      const ss = streamStates.current.get(sid)
      if (ss && data.text) {
        ss.statusIsAiAuthored = true
        const target = ss.delegateMsg || ss.streamingMsg
        routeStatus(sid, data.text)
        storeRef.current.setStatus(sid, data.text)
        apiRef.current.updateSessionStatus?.(sid, 'running', data.text)
      }
    }

    // --- F222/F242: Delegate events ---
    const handleDelegateStart = (data: any) => {
      const sid = data.sessionId || currentSidRef.current
      dbg('delegate-start', { sid: sid?.slice(0, 8), sender: data.sender, hasSS: !!streamStates.current.get(sid || '') })
      if (!sid) return
      const ss = streamStates.current.get(sid)
      if (!ss) return
      // Finalize orchestrator's pending thinking before switching to delegate
      if (ss.thinkingAccum && ss.streamingMsg) {
        const steps = ss.streamingMsg.toolSteps || []
        const last = steps[steps.length - 1]
        if (last?.name === '__thinking__' && (last as any)._live) delete (last as any)._live
        ensureCardAdded(sid, ss)
        routeUpdate(sid, ss.streamingMsg)
      }
      ss.thinkingAccum = ''
      // Capture orchestrator identity BEFORE creating delegate card
      if (ss.streamingMsg) {
        ss.pendingSplit = {
          sender: ss.streamingMsg.sender,
          avatar: ss.streamingMsg.avatar,
          workspacePath: ss.streamingMsg.workspacePath,
          workspaceId: ss.streamingMsg.workspaceId,
        }
        // Remove empty orchestrator card from UI (no content, no visible tools = nothing to show)
        const hasContent = !!(ss.streamingMsg.content?.trim())
        const hasVisibleSteps = (ss.streamingMsg.toolSteps || []).some((s: any) =>
          s.name !== '__thinking__' || (s.output || '').trim()
        )
        if (!hasContent && !hasVisibleSteps) {
          routeRemove(sid, ss.streamingMsg.id)
        }
        ss.streamingMsg = null
      }
      const wsPath = data.workspaceId
        ? workspacesRef.current.find(w => w.id === data.workspaceId)?.path
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
      routeAdd(sid, ss.delegateMsg)
      routeStatus(sid, 'Thinking...')
    }

    const handleDelegateToken = (data: any) => {
      const sid = data.sessionId || currentSidRef.current
      if (!sid) return
      const ss = streamStates.current.get(sid)
      if (!ss?.delegateMsg) return

      // Tool step from delegate
      if (data.toolStep) {
        if (ss.thinkingAccum) {
          const steps = ss.delegateMsg.toolSteps || []
          const last = steps[steps.length - 1]
          if (last?.name === '__thinking__' && (last as any)._live) delete (last as any)._live
          ss.thinkingAccum = ''
        }
        const ts = data.toolStep
        const step: ToolStep = { name: ts.name || ts.tool, input: ts.input, output: String(ts.output || '').slice(0, 500) }
        dbg('delegate-tool', step.name)
        ss.delegateMsg.toolSteps = [...(ss.delegateMsg.toolSteps || []), step]
        routeUpdate(sid, ss.delegateMsg)
        return
      }

      // Round info from delegate
      if (data.roundInfo) {
        if (data.roundInfo.purpose) {
          ss.delegateMsg.roundPurpose = data.roundInfo.purpose
          routeUpdate(sid, ss.delegateMsg)
        }
        return
      }

      // Text/thinking token
      const text = data.token || ''
      if (!text) return
      dbg(data.thinking ? 'delegate-think' : 'delegate-text', text.slice(0, 80))
      if (data.thinking) {
        ss.thinkingAccum += text
        const steps = ss.delegateMsg.toolSteps || []
        const last = steps[steps.length - 1]
        if (last?.name === '__thinking__' && (last as any)._live) {
          last.output = ss.thinkingAccum
          ss.delegateMsg.toolSteps = [...steps]
        } else {
          ss.delegateMsg.toolSteps = [...steps, { name: '__thinking__', output: ss.thinkingAccum, _live: true } as any]
        }
      } else {
        if (ss.thinkingAccum) {
          const steps = ss.delegateMsg.toolSteps || []
          const last = steps[steps.length - 1]
          if (last?.name === '__thinking__' && (last as any)._live) delete (last as any)._live
          ss.thinkingAccum = ''
        }
        ss.delegateMsg.content += text
      }
      routeUpdate(sid, ss.delegateMsg)
      // No longer need to track msgId — MessageList derives active card from message list
    }

    const handleDelegateEnd = (data: any) => {
      const sid = data.sessionId || currentSidRef.current
      dbg('delegate-end', { sid: sid?.slice(0, 8), sender: data.sender, textLen: (data.fullText || '').length })
      if (!sid) return
      const ss = streamStates.current.get(sid)
      if (!ss?.delegateMsg) return
      if (data.fullText !== undefined) ss.delegateMsg.content = data.fullText
      // Finalize any live thinking block
      if (ss.thinkingAccum) {
        const steps = ss.delegateMsg.toolSteps || []
        const last = steps[steps.length - 1]
        if (last?.name === '__thinking__' && (last as any)._live) delete (last as any)._live
        ss.thinkingAccum = ''
      }
      routeUpdate(sid, ss.delegateMsg)
      ss.delegateMsg = null
    }

        // --- F240: Auto-rotate ---
    const handleAutoRotate = (data: any) => {
      const sid = data.sessionId
      if (sid) storeRef.current.setActivity(sid, 'thinking')
    }

    // --- Done / Error ---
    const handleDone = async (data: any) => {
      const g = guard('done', data)
      if (!g) return
      const { sid } = g

      clearStreamState(sid)
      storeRef.current.setActivity(sid, 'idle')
      storeRef.current.setStatus(sid, '')

      try {
        // Load authoritative messages from DB
        const session = await apiRef.current.loadSession(sid)
        if (!session) {
          console.warn('[ChatView] handleDone: loadSession returned null for', sid)
          return
        }
        const dbMessages = session.messages || []
        dbg('done-db', { sid: sid.slice(0, 8), msgCount: dbMessages.length, msgs: dbMessages.map((m: any) => ({ role: m.role, sender: m.sender, textLen: (m.content || '').length, steps: (m.toolSteps || []).map((s: any) => s.name) })) })
        // Safety net: if DB returns 0 messages but we had streaming content, don't wipe the UI
        if (dbMessages.length === 0) {
          console.warn('[ChatView] handleDone: DB returned 0 messages — keeping existing UI messages')
          return
        }
        // Error handling
        if (data.error) {
          const lastUserIdx = dbMessages.map((m: any) => m.role).lastIndexOf('user')
          const hasAssistantAfter = lastUserIdx >= 0 && dbMessages.slice(lastUserIdx + 1).some((m: any) => m.role === 'assistant')
          if (!hasAssistantAfter && lastUserIdx >= 0) {
            dbMessages[lastUserIdx] = { ...dbMessages[lastUserIdx], status: 'failed' }
            apiRef.current.updateMessageMeta?.(sid, dbMessages[lastUserIdx].id, { status: 'failed' })
          } else {
            dbMessages.push({ id: 'error-' + Date.now(), role: 'assistant', content: data.error, timestamp: Date.now(), isError: true })
          }
        }
        routeSet(sid, dbMessages)

        // Refresh sessions to pick up any title/status changes
        const updated = await apiRef.current.listSessions()
        storeRef.current.setSessions(updated)
      } catch (err) {
        console.error('[ChatView] handleDone error:', err)
      }
    }

    const handleError = (data: any) => {
      const g = guard('error', data)
      if (!g) return
      const { sid } = g

      // Sanitize error message: strip IPC wrappers, show friendly text
      let errMsg = data.error || 'Something went wrong'
      errMsg = errMsg.replace(/^Error invoking remote method '[^']+': Error: /i, '')
      errMsg = errMsg.replace(/^Error: /i, '')

      routeAdd(sid, {
        id: 'error-' + Date.now(),
        role: 'error' as any,
        content: errMsg,
        timestamp: Date.now(),
        error: errMsg,
      })
      clearStreamState(sid)
      storeRef.current.setActivity(sid, 'idle')
      storeRef.current.setStatus(sid, '')
    }

    // --- Session title updated by AI tool ---
    const handleTitleUpdated = async () => {
      const updated = await apiRef.current.listSessions()
      storeRef.current.setSessions(updated)
    }

    // Register all listeners
    const cleanups = [
      api.onTextStart?.(handleTextStart),
      api.onToken?.(handleToken),
      api.onToolStep?.(handleToolStep),
      api.onRoundInfo?.(handleRoundInfo),
      api.onStatus?.(handleStatus),
      api.onWatsonStatus?.(handleWatsonStatus),
      api.onSessionTitleUpdated?.(handleTitleUpdated),
      api.onDelegateStart?.(handleDelegateStart),
      api.onDelegateToken?.(handleDelegateToken),
      api.onDelegateEnd?.(handleDelegateEnd),
      api.onChatDone?.(handleDone),
      api.onChatError?.(handleError),
      api.onAutoRotate?.(handleAutoRotate),
    ]

    return () => {
      for (const fn of cleanups) {
        if (typeof fn === 'function') fn()
      }
    }
  }, []) // Register once — handlers use refs for current values

  const loadSessionMessages = async (sid: string) => {
    const session = await api.loadSession(sid)
    if (session) {
      routeSet(sid, session.messages || [])
    }
  }

  // Slash commands
  const handleSlashCommand = async (text: string): Promise<boolean> => {
    if (!text.startsWith('/')) return false
    const cmd = text.split(/\s/)[0].toLowerCase()
    const arg = text.slice(cmd.length).trim()

    const addSystemMsg = (content: string) => {
      setMessages(prev => [...prev, {
        id: 'sys-' + Date.now(), role: 'assistant', content, timestamp: Date.now(), sender: 'System'
      }])
    }

    if (cmd === '/new') {
      const result = await api.createSession({})
      if (result?.id) {
        setCurrentSessionId(result.id)
        const sessions = await api.listSessions()
        setSessions(sessions)
        if (arg) {
          const reqId = await api.chatPrepare?.() || Date.now().toString()
          await api.chat({ sessionId: result.id, message: arg, requestId: reqId })
        }
      }
      return true
    }
    if (cmd === '/status' && currentSessionId) {
      const session = await api.loadSession(currentSessionId)
      const msgCount = session?.messages?.length || 0
      const config = await api.getConfig()
      const usage = await api.getTokenUsage?.(currentSessionId) || { inputTokens: 0, outputTokens: 0 }
      const systemPrompt = await api.buildSystemPrompt?.() || ''
      const estimatedCtx = Math.ceil((JSON.stringify(session?.messages || []).length + systemPrompt.length) / CHARS_PER_TOKEN)
      addSystemMsg([
        '**Session Status**',
        `- Messages: ${msgCount}`,
        `- API usage: ${(usage.inputTokens || 0).toLocaleString()} input + ${(usage.outputTokens || 0).toLocaleString()} output tokens`,
        `- Estimated context: ~${estimatedCtx.toLocaleString()} tokens`,
        `- Model: ${config?.model || '(default)'}`,
        `- Provider: ${config?.provider || 'anthropic'}`,
      ].join('\n'))
      return true
    }
    if ((cmd === '/model' || cmd === '/models') && currentSessionId) {
      const config = await api.getConfig()
      if (!arg) {
        addSystemMsg(`**当前模型:** ${config?.model || '(default)'} (${config?.provider || 'anthropic'})`)
      } else {
        await api.saveConfig({ ...config, model: arg })
        addSystemMsg(`模型已切换到: ${arg}`)
      }
      return true
    }
    if (cmd === '/compact' && currentSessionId) {
      addSystemMsg('正在压缩对话历史...')
      await api.chat({ sessionId: currentSessionId, message: '/compact', requestId: Date.now().toString() })
      return true
    }
    if (cmd === '/reset' && currentSessionId) {
      await api.clearMessages?.(currentSessionId)
      setMessages([])
      addSystemMsg('对话已重置')
      return true
    }
    if (cmd === '/stop') {
      await api.chatCancel?.()
      if (currentSessionId) {
        clearStreamState(currentSessionId)
        setActivity(currentSessionId, 'idle')
      }
      return true
    }
    if (cmd === '/context' && currentSessionId) {
      const session = await api.loadSession(currentSessionId)
      const systemPrompt = await api.buildSystemPrompt?.() || ''
      const msgChars = JSON.stringify(session?.messages || []).length
      const totalChars = msgChars + systemPrompt.length
      addSystemMsg([
        `**Context:**`,
        `- Messages: ~${Math.ceil(msgChars / CHARS_PER_TOKEN).toLocaleString()} tokens`,
        `- System prompt: ~${Math.ceil(systemPrompt.length / CHARS_PER_TOKEN).toLocaleString()} tokens`,
        `- Total: ~${Math.ceil(totalChars / CHARS_PER_TOKEN).toLocaleString()} tokens (${(totalChars / 1000).toFixed(1)}k chars)`,
      ].join('\n'))
      return true
    }
    return false
  }

  const handleSend = async (text: string, files: File[]) => {
    if (!currentSessionId) return
    if (await handleSlashCommand(text)) return

    // F247: User message with image display
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      sender: userProfile?.userName || 'You',
    }
    if (files.length > 0) {
      userMsg.attachments = files.map(f => ({
        name: f.name,
        type: f.type,
        url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      }))
    }

    setMessages(prev => [...prev, userMsg])

    const requestId = await api.chatPrepare?.() || Date.now().toString()
    // Initialize per-session stream state with requestId
    const ss = getStreamState(currentSessionId)
    ss.requestId = requestId

    // Immediately create assistant streaming card so status appears on correct card from the start
    const streamingId = 'streaming-' + Date.now()
    ss.streamingMsg = {
      id: streamingId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolSteps: [],
      sender: ownerWs?.identity?.name,
      avatar: ownerWs?.identity?.avatar,
      workspacePath: ownerWs?.path,
      workspaceId: ownerWs?.id,
    }
    setMessages(prev => [...prev, ss.streamingMsg!])
    setStreamingStatus('Thinking...')
    ss.status = 'Thinking...'
    ss.statusIsAiAuthored = false

    if (dbgEnabled()) console.log('[Paw🐾] send', { sid: currentSessionId.slice(0, 8), requestId: requestId.slice(0, 8), text: text.slice(0, 50), streamingId })
    setActivity(currentSessionId, 'thinking')
    setStatus(currentSessionId, '')
    try {
      await api.chat({ sessionId: currentSessionId, message: text, requestId, attachments: files })
    } catch (err: any) {
      console.error('[ChatView] chat error:', err)
      clearStreamState(currentSessionId)
      setActivity(currentSessionId, 'idle')
      setMessages(prev => prev.map(m =>
        m.id === userMsg.id ? { ...m, status: 'failed' } : m
      ))
      const session = await api.loadSession(currentSessionId)
      const lastUser = session?.messages?.filter((m: any) => m.role === 'user').pop()
      if (lastUser) api.updateMessageMeta?.(currentSessionId, lastUser.id, { status: 'failed' })
    }
  }

  // F228: Retry — delete failed message from DB, remove from UI, resend
  const handleRetry = useCallback(async () => {
    if (!currentSessionId) return
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUserIdx = i; break } }
    if (lastUserIdx < 0) return
    const lastUserMsg = messages[lastUserIdx]
    const retryContent = lastUserMsg.content
    api.deleteMessage?.(currentSessionId, lastUserMsg.id)
    setMessages(prev => prev.slice(0, lastUserIdx))
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: retryContent,
      timestamp: Date.now(),
      sender: userProfile?.userName || 'You',
    }
    setMessages(prev => [...prev, userMsg])
    const requestId = await api.chatPrepare?.() || Date.now().toString()
    const ss = getStreamState(currentSessionId)
    ss.requestId = requestId
    setActivity(currentSessionId, 'thinking')
    try {
      await api.chat({ sessionId: currentSessionId, message: retryContent, requestId })
    } catch (err: any) {
      console.error('[ChatView] retry error:', err)
      clearStreamState(currentSessionId)
      setActivity(currentSessionId, 'idle')
      setMessages(prev => prev.map(m =>
        m.id === userMsg.id ? { ...m, status: 'failed' } : m
      ))
    }
  }, [currentSessionId, messages])

  // Derive active streaming card ID from StreamState ref at render time.
  // Single source of truth: delegateMsg (if active) > streamingMsg (if active) > null.
  // No handler competition — just read the ref each render.
  const activeStreamingId = (() => {
    if (!currentSessionId || !streamingStatus) return null
    const ss = streamStates.current.get(currentSessionId)
    if (!ss) return null
    const target = ss.delegateMsg || ss.streamingMsg
    // Only return ID if the card is actually in the message list (not deferred)
    return (target && !(target as any)._deferred) ? target.id : null
  })()

  return (
    <div className="chat-main">
      <div className={`chat-header${!sidebarVisible ? ' sidebar-hidden' : ''}`}>
        <button className={`icon-btn sidebar-toggle${!sidebarVisible ? ' visible' : ''}`} onClick={() => setSidebarVisible(true)}>
          <span className="ic">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
            </svg>
          </span>
        </button>
        <div className="title-area">
          <span id="sessionTitle">{sessionTitle}</span>
          <span className="header-members">
            {sessionParticipants.length > 0
              ? sessionParticipants.map((pid, i) => {
                  const w = workspaces.find(ws => ws.id === pid)
                  const name = w?.identity?.name || pid
                  return i === 0 && sessionParticipants.length > 1 ? `${name}(群主)` : name
                }).join(', ')
              : (workspaces[0]?.identity?.name || '')
            }
          </span>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => setShowMembers(!showMembers)} title="成员管理">
            <span className="ic">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
            </span>
          </button>
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)} title="设置">
            <span className="ic">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </span>
          </button>
        </div>
      </div>

      <MessageList
        messages={messages}
        sessionId={currentSessionId || ''}
        streamingStatus={streamingStatus}
        activeStreamingId={activeStreamingId}
        ownerWorkspaceId={sessionParticipants[0]}
        onRetry={handleRetry}
      />
      <InputBar sessionId={currentSessionId} onSend={handleSend} />
      <TaskBar sessionId={currentSessionId} />
      <SettingsPanel visible={showSettings} onClose={() => setShowSettings(false)} />
      <MembersPanel visible={showMembers} sessionId={currentSessionId} onClose={() => setShowMembers(false)}
        onChanged={async () => {
          const updated = await api.listSessions()
          setSessions(updated)
        }}
        onWorkspacesChanged={async () => {
          const ws = await api.listWorkspaces()
          setWorkspaces(ws)
        }}
      />
    </div>
  )
}
