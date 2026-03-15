import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppState } from '../store'
import { useIPC } from '../hooks/useIPC'
import { useChatEvents, createStreamState, StreamState } from '../hooks/useChatEvents'
import { Message, ToolStep } from '../types'
import MessageList from './MessageList'
import InputBar from './InputBar'
import MembersPanel from './MembersPanel'
import TaskBar from './TaskBar'
import SettingsPanel from './SettingsPanel'

const CHARS_PER_TOKEN = 3.5

export default function ChatView() {
  const { currentSessionId, setCurrentSessionId, sessions, setSessions, setActivity, setStatus, workspaces, setWorkspaces, userProfile, sidebarVisible, setSidebarVisible } = useAppState()
  const api = useIPC()
  const [messages, setMessages] = useState<Message[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [streamingStatus, setStreamingStatus] = useState('')

  // Derive from sessions store
  const currentSession = sessions.find(s => s.id === currentSessionId)
  const sessionParticipants = currentSession?.participants || []
  const isGroup = sessionParticipants.length > 1
  const ownerWs = sessionParticipants[0] ? workspaces.find(w => w.id === sessionParticipants[0]) : workspaces[0]
  const isCodingAgentChat = !isGroup && ownerWs?.type === 'coding-agent'
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

  // === Per-session streaming state ===
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
    if (sid === currentSidRef.current) setStreamingStatus('')
  }

  // === Message routing ===
  const routeUpdate = (sid: string, msg: Message) => {
    const updater = (prev: Message[]) => {
      const idx = prev.findIndex(m => m.id === msg.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...msg }; return next }
      return [...prev.slice(0, -1), { ...msg }]
    }
    if (sid === currentSidRef.current) setMessages(updater)
    else {
      const cached = sessionCache.current.get(sid) || []
      sessionCache.current.set(sid, updater(cached))
    }
  }

  const routeAdd = (sid: string, msg: Message) => {
    if (sid === currentSidRef.current) setMessages(prev => [...prev, msg])
    else {
      const cached = sessionCache.current.get(sid) || []
      sessionCache.current.set(sid, [...cached, msg])
    }
  }

  const routeRemove = (sid: string, msgId: string) => {
    if (sid === currentSidRef.current) setMessages(prev => prev.filter(m => m.id !== msgId))
    else {
      const cached = sessionCache.current.get(sid) || []
      sessionCache.current.set(sid, cached.filter(m => m.id !== msgId))
    }
  }

  const routeSet = (sid: string, msgs: Message[] | ((prev: Message[]) => Message[])) => {
    if (sid === currentSidRef.current) setMessages(msgs as any)
    else if (typeof msgs === 'function') {
      const cached = sessionCache.current.get(sid) || []
      sessionCache.current.set(sid, (msgs as Function)(cached))
    } else {
      sessionCache.current.set(sid, msgs)
    }
  }

  const routeStatus = (sid: string, status: string) => {
    const ss = streamStates.current.get(sid)
    if (ss) ss.status = status
    if (sid === currentSidRef.current) setStreamingStatus(status)
    storeRef.current.setStatus(sid, status)
  }

  const ensureCardAdded = (sid: string, ss: StreamState) => {
    const msg = ss.streamingMsg as any
    if (msg?._deferred) {
      delete msg._deferred
      routeAdd(sid, msg)
    }
  }

  // === Streaming events (via hook) ===
  useChatEvents(
    { currentSessionId: currentSidRef, api: apiRef, workspaces: workspacesRef, store: storeRef },
    { getStreamState, clearStreamState, ensureCardAdded, routeUpdate, routeAdd, routeRemove, routeSet, routeStatus, streamStates }
  )

  // === Session switch ===
  useEffect(() => {
    if (!currentSessionId) return
    const ss = streamStates.current.get(currentSessionId)
    setStreamingStatus(ss?.status || '')
    const cached = sessionCache.current.get(currentSessionId)
    if (cached) {
      setMessages(cached)
    } else {
      setMessages([])
      loadSessionMessages(currentSessionId)
    }
  }, [currentSessionId])

  useEffect(() => {
    if (currentSessionId) sessionCache.current.set(currentSessionId, messages)
  }, [messages, currentSessionId])

  // File + external link click handler
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a') as HTMLAnchorElement | null
      if (!link) return
      const filePath = link.dataset?.path || link.getAttribute('data-path')
      if (filePath) {
        e.preventDefault()
        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        const previewExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf']
        if (previewExts.includes(ext)) api.openFilePreview?.(filePath) || api.openFile?.(filePath)
        else api.openFile?.(filePath)
        return
      }
      const href = link.getAttribute('href')
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        e.preventDefault()
        api.openExternal?.(href)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [api])

  const loadSessionMessages = async (sid: string) => {
    const session = await api.loadSession(sid)
    if (session) routeSet(sid, session.messages || [])
  }

  // === Slash commands ===
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

  // === Send message ===
  const handleSend = async (text: string, files: File[]) => {
    if (!currentSessionId) return
    if (await handleSlashCommand(text)) return

    const serializedFiles = await Promise.all(files.map(async (f) => {
      const entry: any = { name: f.name, type: f.type, size: f.size }
      if ((f as any).path) {
        entry.path = (f as any).path
      } else if (f.type.startsWith('image/')) {
        const buf = await f.arrayBuffer()
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
        entry.data = `data:${f.type};base64,${b64}`
      }
      return entry
    }))

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

    setMessages(prev => [...prev.filter(m => !m.isError), userMsg])

    const requestId = await api.chatPrepare?.() || Date.now().toString()
    const ss = getStreamState(currentSessionId)
    ss.requestId = requestId

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
    setActivity(currentSessionId, 'thinking')
    setStatus(currentSessionId, '')

    try {
      await api.chat({ sessionId: currentSessionId, message: text, requestId, attachments: serializedFiles })
    } catch (err: any) {
      console.error('[ChatView] chat error:', err)
      clearStreamState(currentSessionId)
      setActivity(currentSessionId, 'idle')

      let errMsg = err?.message || 'Something went wrong'
      errMsg = errMsg.replace(/^Error invoking remote method '[^']+': Error: /i, '')
      errMsg = errMsg.replace(/^Error: /i, '')

      setMessages(prev => {
        const cleaned = prev.filter(m => m.id !== streamingId)
        return cleaned.concat({
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: errMsg,
          timestamp: Date.now(),
          isError: true,
        })
      })
    }
  }

  // === Retry ===
  const handleRetry = useCallback(async () => {
    if (!currentSessionId) return
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUserIdx = i; break } }
    if (lastUserIdx < 0) return
    const retryContent = messages[lastUserIdx].content

    const requestId = await api.chatPrepare?.() || Date.now().toString()
    const ss = getStreamState(currentSessionId)
    ss.requestId = requestId

    const streamingId = 'streaming-' + Date.now()
    const retryOwnerWs = sessionParticipants[0] ? workspaces.find((w: any) => w.id === sessionParticipants[0]) : undefined
    ss.streamingMsg = {
      id: streamingId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolSteps: [],
      sender: retryOwnerWs?.identity?.name,
      avatar: retryOwnerWs?.identity?.avatar,
      workspacePath: retryOwnerWs?.path,
      workspaceId: retryOwnerWs?.id,
    }

    setMessages(prev => {
      const cleaned = prev.filter((m, i) => i <= lastUserIdx || !m.isError)
      return [...cleaned, ss.streamingMsg!]
    })
    setStreamingStatus('Thinking...')
    ss.status = 'Thinking...'
    ss.statusIsAiAuthored = false
    setActivity(currentSessionId, 'thinking')
    setStatus(currentSessionId, '')

    try {
      await api.chat({ sessionId: currentSessionId, message: retryContent, requestId })
    } catch (err: any) {
      console.error('[ChatView] retry error:', err)
      clearStreamState(currentSessionId)
      setActivity(currentSessionId, 'idle')

      let errMsg = err?.message || 'Something went wrong'
      errMsg = errMsg.replace(/^Error invoking remote method '[^']+': Error: /i, '')
      errMsg = errMsg.replace(/^Error: /i, '')

      setMessages(prev => {
        const cleaned = prev.filter(m => m.id !== streamingId)
        return cleaned.concat({
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: errMsg,
          timestamp: Date.now(),
          isError: true,
        })
      })
    }
  }, [currentSessionId, messages, sessionParticipants, workspaces])

  // Derive active streaming card ID
  const activeStreamingId = (() => {
    if (!currentSessionId || !streamingStatus) return null
    const ss = streamStates.current.get(currentSessionId)
    if (!ss) return null
    const target = ss.delegateMsg || ss.streamingMsg
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
          {!isCodingAgentChat && (
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
          )}
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
      <InputBar sessionId={currentSessionId} onSend={handleSend} isGroup={isGroup} />
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
