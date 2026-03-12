import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppState } from '../store'
import { useIPC } from '../hooks/useIPC'
import { Message, ToolStep } from '../types'
import MessageList from './MessageList'
import InputBar from './InputBar'
import SettingsPanel from './SettingsPanel'

export default function ChatView() {
  const { currentSessionId, setCurrentSessionId, setSessions, setActivity, setStatus, workspaces } = useAppState()
  const api = useIPC()
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionTitle, setSessionTitle] = useState('New Chat')
  const [showSettings, setShowSettings] = useState(false)
  const [streamingStatus, setStreamingStatus] = useState('')
  const currentRequestId = useRef<string | null>(null)
  const streamingMsg = useRef<Message | null>(null)
  const statusIsAiAuthored = useRef(false)

  // F223: Session message cache — preserve messages when switching
  const sessionCache = useRef<Map<string, { messages: Message[]; title: string }>>(new Map())

  // F222: Delegate state
  const delegateMsg = useRef<Message | null>(null)

  useEffect(() => {
    if (!currentSessionId) return
    // Restore from cache if available, otherwise load from disk
    const cached = sessionCache.current.get(currentSessionId)
    if (cached) {
      setMessages(cached.messages)
      setSessionTitle(cached.title)
    } else {
      loadSession()
    }
  }, [currentSessionId])

  // Cache messages when they change
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      sessionCache.current.set(currentSessionId, { messages, title: sessionTitle })
    }
  }, [messages, sessionTitle, currentSessionId])

  useEffect(() => {
    // --- Core streaming events ---
    const handleTextStart = (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      streamingMsg.current = {
        id: 'streaming-' + Date.now(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolSteps: [],
        thinking: '',
        sender: data.agentName,
        avatar: data.avatar,
        workspacePath: data.wsPath
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
      setMessages(prev => [...prev.slice(0, -1), { ...streamingMsg.current! }])
    }

    const handleToolStep = (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      const target = delegateMsg.current || streamingMsg.current
      if (!target) return
      const step: ToolStep = { name: data.name || data.tool, input: data.input, output: String(data.output).slice(0, 120) }
      target.toolSteps = [...(target.toolSteps || []), step]
      if (!statusIsAiAuthored.current) {
        setStreamingStatus(`${data.name || data.tool}...`)
      }
      setMessages(prev => [...prev.slice(0, -1), { ...target }])
      if (currentSessionId) setActivity(currentSessionId, 'running')
    }

    const handleRoundInfo = (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      // Round done — don't clear status, let next text start or done handle it
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
        if (currentSessionId) setStatus(currentSessionId, data.text)
      }
    }

    // --- F222: Delegate events ---
    const handleDelegateStart = (data: any) => {
      if (data.sessionId && data.sessionId !== currentSessionId) return
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
      } else if (data.toolStep) {
        // Tool step inside delegate — handled by handleToolStep
      } else {
        delegateMsg.current.content += text
      }
      setMessages(prev => [...prev.slice(0, -1), { ...delegateMsg.current! }])
    }

    const handleDelegateEnd = (data: any) => {
      if (!delegateMsg.current) return
      if (data.fullText) delegateMsg.current.content = data.fullText
      setMessages(prev => [...prev.slice(0, -1), { ...delegateMsg.current! }])
      delegateMsg.current = null
    }

    // --- F227: Claude Code events ---
    const handleCcStatus = (data: any) => {
      if (data.status === 'running') {
        setStreamingStatus(`Claude Code: ${data.task || 'working'}...`)
      } else if (data.status === 'done') {
        setStreamingStatus('')
      } else if (data.status === 'error') {
        setStreamingStatus(`CC error: ${data.error || 'unknown'}`)
      }
    }

    const handleCcOutput = (data: any) => {
      // CC output appended to current streaming message
      if (!streamingMsg.current) return
      streamingMsg.current.content += data.chunk || ''
      setMessages(prev => [...prev.slice(0, -1), { ...streamingMsg.current! }])
    }

    // --- Done / Error ---
    const handleDone = async (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      currentRequestId.current = null
      streamingMsg.current = null
      delegateMsg.current = null
      setStreamingStatus('')
      statusIsAiAuthored.current = false
      if (currentSessionId) {
        setActivity(currentSessionId, 'idle')
        await loadSession()
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
      currentRequestId.current = null
      streamingMsg.current = null
      delegateMsg.current = null
      setStreamingStatus('')
      statusIsAiAuthored.current = false
      if (currentSessionId) setActivity(currentSessionId, 'idle')
    }

    // Register all listeners
    api.onTextStart?.(handleTextStart)
    api.onToken?.(handleToken)
    api.onToolStep?.(handleToolStep)
    api.onRoundInfo?.(handleRoundInfo)
    api.onStatus?.(handleStatus)
    api.onWatsonStatus?.(handleWatsonStatus)
    api.onDelegateStart?.(handleDelegateStart)
    api.onDelegateToken?.(handleDelegateToken)
    api.onDelegateEnd?.(handleDelegateEnd)
    api.onCcStatus?.(handleCcStatus)
    api.onCcOutput?.(handleCcOutput)
    api.onChatDone?.(handleDone)
    api.onChatError?.(handleError)
  }, [currentSessionId])

  const loadSession = async () => {
    if (!currentSessionId) return
    const session = await api.loadSession(currentSessionId)
    if (session) {
      setMessages(session.messages || [])
      setSessionTitle(session.title)
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
      }
      return true
    }
    if (cmd === '/status' && currentSessionId) {
      const session = await api.loadSession(currentSessionId)
      const msgCount = session?.messages?.length || 0
      const config = await api.getConfig()
      const usage = await api.getTokenUsage?.(currentSessionId) || { inputTokens: 0, outputTokens: 0 }
      addSystemMsg([
        '**Session Status**',
        `- Messages: ${msgCount}`,
        `- API usage: ${(usage.inputTokens || 0).toLocaleString()} input + ${(usage.outputTokens || 0).toLocaleString()} output tokens`,
        `- Model: ${config?.model || '(default)'}`,
        `- Provider: ${config?.provider || 'anthropic'}`,
      ].join('\n'))
      return true
    }
    if (cmd === '/export' && currentSessionId) {
      await api.exportSession(currentSessionId)
      addSystemMsg('导出完成')
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
      setMessages([])
      addSystemMsg('对话已重置')
      return true
    }
    if (cmd === '/stop') {
      await api.chatCancel?.()
      currentRequestId.current = null
      streamingMsg.current = null
      delegateMsg.current = null
      setStreamingStatus('')
      if (currentSessionId) setActivity(currentSessionId, 'idle')
      return true
    }
    if (cmd === '/context' && currentSessionId) {
      const session = await api.loadSession(currentSessionId)
      const totalChars = JSON.stringify(session?.messages || []).length
      addSystemMsg(`**Context:** ~${Math.ceil(totalChars / 3.5).toLocaleString()} tokens (${(totalChars / 1000).toFixed(1)}k chars)`)
      return true
    }
    return false
  }

  const handleSend = async (text: string, files: File[]) => {
    if (!currentSessionId) return

    // Check slash commands first
    if (await handleSlashCommand(text)) return

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }])

    // Use chatPrepare for proper requestId if available
    const requestId = await api.chatPrepare?.() || Date.now().toString()
    currentRequestId.current = requestId
    setActivity(currentSessionId, 'thinking')
    await api.chat({ sessionId: currentSessionId, message: text, requestId, attachments: files })
  }

  // F228: Retry last message
  const handleRetry = useCallback(async () => {
    if (!currentSessionId) return
    // Find last user message
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUserIdx = i; break } }
    if (lastUserIdx < 0) return
    const lastUserMsg = messages[lastUserIdx]
    // Remove everything after last user message
    setMessages(prev => prev.slice(0, lastUserIdx + 1))
    const requestId = await api.chatPrepare?.() || Date.now().toString()
    currentRequestId.current = requestId
    setActivity(currentSessionId, 'thinking')
    await api.chat({ sessionId: currentSessionId, message: lastUserMsg.content, requestId })
  }, [currentSessionId, messages])

  return (
    <div className="chat-main">
      <div className="chat-header">
        <div className="title-area">
          <span id="sessionTitle">{sessionTitle}</span>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)}>
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
        onRetry={handleRetry}
      />
      <InputBar sessionId={currentSessionId} onSend={handleSend} />
      <SettingsPanel visible={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
