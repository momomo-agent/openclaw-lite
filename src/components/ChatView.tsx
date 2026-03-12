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

export default function ChatView() {
  const { currentSessionId, setCurrentSessionId, sessions, setSessions, setActivity, setStatus, workspaces, userProfile, sidebarVisible, setSidebarVisible } = useAppState()
  const api = useIPC()
  const [messages, setMessages] = useState<Message[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [streamingStatus, setStreamingStatus] = useState('')
  const currentRequestId = useRef<string | null>(null)
  const streamingMsg = useRef<Message | null>(null)
  const statusIsAiAuthored = useRef(false)

  // Derive from sessions store (always live, never stale)
  const currentSession = sessions.find(s => s.id === currentSessionId)
  const sessionTitle = currentSession?.title || 'New Chat'
  const sessionParticipants = currentSession?.participants || []

  // F223: Session message cache
  const sessionCache = useRef<Map<string, Message[]>>(new Map())

  // F222/F242: Delegate state
  const delegateMsg = useRef<Message | null>(null)
  // Post-delegate split: orchestrator identity to create new card after delegate ends
  const pendingSplit = useRef<{ sender?: string; avatar?: string; workspacePath?: string; workspaceId?: string } | null>(null)

  // F243: CC output state
  const [ccOutput, setCcOutput] = useState<{ task: string; lines: string[]; running: boolean } | null>(null)

  useEffect(() => {
    if (!currentSessionId) return
    const cached = sessionCache.current.get(currentSessionId)
    if (cached) {
      setMessages(cached)
    } else {
      loadSession()
    }
  }, [currentSessionId])

  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      sessionCache.current.set(currentSessionId, messages)
    }
  }, [messages, sessionTitle, currentSessionId])

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

  // Helper: reset all streaming state
  const resetStreaming = () => {
    currentRequestId.current = null
    streamingMsg.current = null
    delegateMsg.current = null
    pendingSplit.current = null
    setCcOutput(null)
    setStreamingStatus('')
    statusIsAiAuthored.current = false
  }

  // Helper: update a message in list by ID (or replace last if ID not found)
  const updateMessage = (msg: Message) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msg.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...msg }
        return next
      }
      // Fallback: replace last
      return [...prev.slice(0, -1), { ...msg }]
    })
  }

  useEffect(() => {
    // --- Core streaming events ---
    const handleTextStart = (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return

      // Post-delegate split: create NEW orchestrator card below the delegate bubble
      if (pendingSplit.current) {
        const split = pendingSplit.current
        pendingSplit.current = null
        streamingMsg.current = {
          id: 'streaming-' + Date.now(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          toolSteps: [],
          thinking: '',
          sender: split.sender,
          avatar: split.avatar,
          workspacePath: split.workspacePath,
          workspaceId: split.workspaceId,
        }
        setStreamingStatus('Thinking...')
        statusIsAiAuthored.current = false
        setMessages(prev => [...prev, streamingMsg.current!])
        return
      }

      // For round > 0, update existing streaming message instead of creating a new one
      if (streamingMsg.current) {
        // Multi-round: just reset content for new round, keep identity
        return
      }
      streamingMsg.current = {
        id: 'streaming-' + Date.now(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolSteps: [],
        thinking: '',
        sender: data.agentName,
        avatar: data.avatar,
        workspacePath: data.wsPath,
        workspaceId: data.workspaceId,
      }
      setStreamingStatus('Thinking...')
      statusIsAiAuthored.current = false
      setMessages(prev => [...prev, streamingMsg.current!])
    }

    const handleToken = (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      if (!streamingMsg.current) return
      const text = data.text || data.delta || ''
      if (!text) return
      if (data.thinking) {
        streamingMsg.current.thinking = (streamingMsg.current.thinking || '') + text
      } else {
        streamingMsg.current.content += text
      }
      updateMessage(streamingMsg.current)
    }

    const handleToolStep = (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      const target = delegateMsg.current || streamingMsg.current
      if (!target) return
      const step: ToolStep = { name: data.name || data.tool, input: data.input, output: String(data.output || '').slice(0, 120) }
      target.toolSteps = [...(target.toolSteps || []), step]
      if (!statusIsAiAuthored.current) {
        setStreamingStatus(`${data.name || data.tool}...`)
      }
      updateMessage(target)
      if (currentSessionId) setActivity(currentSessionId, 'running')
    }

    const handleRoundInfo = (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      const target = delegateMsg.current || streamingMsg.current
      if (target && data.purpose) {
        target.roundPurpose = data.purpose
        updateMessage(target)
      }
    }

    const handleStatus = (data: any) => {
      if (data.state === 'done' || data.state === 'error') {
        setStreamingStatus('')
        statusIsAiAuthored.current = false
      } else if (!statusIsAiAuthored.current && data.detail) {
        setStreamingStatus(data.detail)
      }
    }

    const handleWatsonStatus = (data: any) => {
      if (data.sessionId === currentSessionId && data.text) {
        statusIsAiAuthored.current = true
        setStreamingStatus(data.text)
        if (currentSessionId) {
          setStatus(currentSessionId, data.text)
          api.updateSessionStatus?.(currentSessionId, 'running', data.text)
        }
      }
    }

    // --- F222/F242: Delegate events ---
    const handleDelegateStart = (data: any) => {
      if (data.sessionId && data.sessionId !== currentSessionId) return
      // Capture orchestrator identity BEFORE creating delegate card
      // (needed for post-delegate split — main parity: captures at delegate start time)
      if (streamingMsg.current) {
        pendingSplit.current = {
          sender: streamingMsg.current.sender,
          avatar: streamingMsg.current.avatar,
          workspacePath: streamingMsg.current.workspacePath,
          workspaceId: streamingMsg.current.workspaceId,
        }
        streamingMsg.current = null
      }
      const wsPath = data.workspaceId
        ? workspaces.find(w => w.id === data.workspaceId)?.path
        : undefined
      delegateMsg.current = {
        id: 'delegate-' + Date.now(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        sender: data.sender,
        avatar: data.avatar,
        workspacePath: wsPath,
        workspaceId: data.workspaceId,
        toolSteps: [],
        thinking: ''
      }
      setMessages(prev => [...prev, delegateMsg.current!])
    }

    const handleDelegateToken = (data: any) => {
      if (!delegateMsg.current) return
      if (data.sessionId && data.sessionId !== currentSessionId) return
      const text = data.token || ''
      if (!text) return
      if (data.thinking) {
        delegateMsg.current.thinking = (delegateMsg.current.thinking || '') + text
      } else {
        delegateMsg.current.content += text
      }
      updateMessage(delegateMsg.current)
    }

    const handleDelegateEnd = (data: any) => {
      if (!delegateMsg.current) return
      if (data.fullText !== undefined) delegateMsg.current.content = data.fullText

      const content = delegateMsg.current.content.trim()
      const isNoReply = !content || content === 'NO_REPLY' || content === '(silent)'
      const hasOnlyHiddenTools = (delegateMsg.current.toolSteps || []).every(s =>
        s.name === 'stay_silent' || s.name === 'ui_status_set'
      )

      if (isNoReply && hasOnlyHiddenTools && !delegateMsg.current.thinking) {
        setMessages(prev => prev.filter(m => m.id !== delegateMsg.current!.id))
      } else {
        updateMessage(delegateMsg.current)
      }
      delegateMsg.current = null
      // pendingSplit was already set at delegate START time (handleDelegateStart)
      // so orchestrator identity is preserved even for sequential delegates
    }

    // --- F243: Claude Code events ---
    const handleCcStatus = (data: any) => {
      if (data.status === 'running') {
        setCcOutput({ task: data.task || '', lines: [], running: true })
        setStreamingStatus(`Claude Code: ${data.task || 'working'}...`)
      } else if (data.status === 'done' || data.status === 'error') {
        setCcOutput(prev => prev ? { ...prev, running: false } : null)
        setStreamingStatus('')
      }
    }

    const handleCcOutput = (data: any) => {
      const chunk = data.chunk || ''
      setCcOutput(prev => {
        if (!prev) return null
        const newLines = [...prev.lines, ...chunk.split('\n')]
        return { ...prev, lines: newLines.slice(-50) }
      })
      if (streamingMsg.current) {
        streamingMsg.current.content += chunk
        updateMessage(streamingMsg.current)
      }
    }

    // --- F240: Auto-rotate ---
    const handleAutoRotate = (data: any) => {
      if (data.sessionId && data.sessionId !== currentSessionId) return
      if (currentSessionId) setActivity(currentSessionId, 'thinking')
    }

    // --- Done / Error ---
    const handleDone = async (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      const doneSessionId = currentSessionId
      resetStreaming()
      if (doneSessionId) {
        setActivity(doneSessionId, 'idle')
        try {
          // Load authoritative messages from DB
          const session = await api.loadSession(doneSessionId)
          if (!session) {
            console.warn('[ChatView] handleDone: loadSession returned null for', doneSessionId)
            return  // Keep current messages as-is (streaming state is already captured)
          }
          const dbMessages = session.messages || []
          // If chat-done carries an error:
          // - If DB has no assistant reply after last user msg → "send failed" (mark user msg)
          // - Otherwise → "reply error" (append as assistant msg with error flag)
          if (data.error) {
            const lastUserIdx = dbMessages.map((m: any) => m.role).lastIndexOf('user')
            const hasAssistantAfter = lastUserIdx >= 0 && dbMessages.slice(lastUserIdx + 1).some((m: any) => m.role === 'assistant')
            if (!hasAssistantAfter && lastUserIdx >= 0) {
              // Never started — mark user message as send failure (persist to DB)
              dbMessages[lastUserIdx] = { ...dbMessages[lastUserIdx], status: 'failed' }
              api.updateMessageMeta?.(doneSessionId, dbMessages[lastUserIdx].id, { status: 'failed' })
            } else {
              // Reply failed mid-stream — show as assistant error
              dbMessages.push({ id: 'error-' + Date.now(), role: 'assistant', content: data.error, timestamp: Date.now(), isError: true })
            }
          }
          setMessages(dbMessages)
          // F239: Auto-generate title from first user message
          if (session.title === 'New Chat' || session.title === '新对话') {
            const firstUser = dbMessages.find((m: any) => m.role === 'user')
            if (firstUser) {
              let title = (firstUser.content || '').split(/[。！？\n.!?]/)[0].trim()
              if (title.length > 30) title = title.slice(0, 30) + '...'
              if (!title) title = (firstUser.content || '').slice(0, 30).trim() || 'New Chat'
              await api.renameSession(doneSessionId, title)
            }
          }
          // Refresh sessions to pick up title changes
          const updated = await api.listSessions()
          setSessions(updated)
        } catch (err) {
          console.error('[ChatView] handleDone loadSession error:', err)
        }
      }
    }

    const handleError = (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      setMessages(prev => [...prev, {
        id: 'error-' + Date.now(),
        role: 'error',
        content: data.error || 'An error occurred',
        timestamp: Date.now(),
        error: data.error
      }])
      resetStreaming()
      if (currentSessionId) setActivity(currentSessionId, 'idle')
    }

    // Register all listeners and collect cleanup functions
    const cleanups = [
      api.onTextStart?.(handleTextStart),
      api.onToken?.(handleToken),
      api.onToolStep?.(handleToolStep),
      api.onRoundInfo?.(handleRoundInfo),
      api.onStatus?.(handleStatus),
      api.onWatsonStatus?.(handleWatsonStatus),
      api.onDelegateStart?.(handleDelegateStart),
      api.onDelegateToken?.(handleDelegateToken),
      api.onDelegateEnd?.(handleDelegateEnd),
      api.onCcStatus?.(handleCcStatus),
      api.onCcOutput?.(handleCcOutput),
      api.onChatDone?.(handleDone),
      api.onChatError?.(handleError),
      api.onAutoRotate?.(handleAutoRotate),
    ]

    return () => {
      for (const fn of cleanups) {
        if (typeof fn === 'function') fn()
      }
    }
  }, [currentSessionId])

  const loadSession = async () => {
    if (!currentSessionId) return
    const session = await api.loadSession(currentSessionId)
    if (session) {
      setMessages(session.messages || [])
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
        // Send arg text as first message if provided
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
      await api.ccStop?.()
      resetStreaming()
      if (currentSessionId) setActivity(currentSessionId, 'idle')
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
    currentRequestId.current = requestId
    setActivity(currentSessionId, 'thinking')
    try {
      await api.chat({ sessionId: currentSessionId, message: text, requestId, attachments: files })
    } catch (err: any) {
      console.error('[ChatView] chat error:', err)
      resetStreaming()
      setActivity(currentSessionId, 'idle')
      // Mark the user message as failed (persist to DB)
      setMessages(prev => prev.map(m =>
        m.id === userMsg.id ? { ...m, status: 'failed' } : m
      ))
      // Find and mark in DB (message was persisted by main process before streaming)
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
    // Delete failed message from DB + remove from UI (and any trailing error messages)
    api.deleteMessage?.(currentSessionId, lastUserMsg.id)
    setMessages(prev => prev.slice(0, lastUserIdx))
    // Resend as new message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: retryContent,
      timestamp: Date.now(),
      sender: userProfile?.userName || 'You',
    }
    setMessages(prev => [...prev, userMsg])
    const requestId = await api.chatPrepare?.() || Date.now().toString()
    currentRequestId.current = requestId
    setActivity(currentSessionId, 'thinking')
    try {
      await api.chat({ sessionId: currentSessionId, message: retryContent, requestId })
    } catch (err: any) {
      console.error('[ChatView] retry error:', err)
      resetStreaming()
      setActivity(currentSessionId, 'idle')
      setMessages(prev => prev.map(m =>
        m.id === userMsg.id ? { ...m, status: 'failed' } : m
      ))
    }
  }, [currentSessionId, messages])

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

      {/* F243: CC Output Panel */}
      {ccOutput && (
        <div style={{
          borderBottom: '1px solid var(--border-muted)',
          padding: '8px 16px',
          fontSize: 12,
          background: 'var(--bg-secondary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span>🖥️ Claude Code{ccOutput.task ? `: ${ccOutput.task}` : ''}</span>
            {ccOutput.running && (
              <button
                onClick={() => api.ccStop?.()}
                style={{ padding: '2px 8px', fontSize: 11, background: 'var(--status-error)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
              >
                Stop
              </button>
            )}
          </div>
          <pre style={{
            margin: 0, padding: 8, background: 'var(--bg-base)',
            borderRadius: 4, maxHeight: 200, overflow: 'auto',
            fontSize: 11, lineHeight: 1.4, whiteSpace: 'pre-wrap',
            color: 'var(--text-secondary)',
          }}>
            {ccOutput.lines.join('\n') || '(waiting for output...)'}
          </pre>
        </div>
      )}

      <MessageList
        messages={messages}
        sessionId={currentSessionId || ''}
        streamingStatus={streamingStatus}
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
      />
    </div>
  )
}
