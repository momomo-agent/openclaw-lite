import { useState, useEffect, useRef } from 'react'
import { useAppState } from '../store'
import { useIPC } from '../hooks/useIPC'
import { Message, ToolStep } from '../types'
import MessageList from './MessageList'
import InputBar from './InputBar'
import SettingsPanel from './SettingsPanel'

export default function ChatView() {
  const { currentSessionId, setActivity } = useAppState()
  const api = useIPC()
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionTitle, setSessionTitle] = useState('New Chat')
  const [showSettings, setShowSettings] = useState(false)
  const currentRequestId = useRef<string | null>(null)
  const streamingMsg = useRef<Message | null>(null)

  useEffect(() => {
    if (!currentSessionId) return
    loadSession()
  }, [currentSessionId])

  useEffect(() => {
    const handleToken = (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return

      if (data.type === 'chat-text-start') {
        streamingMsg.current = {
          id: 'streaming-' + Date.now(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          toolSteps: []
        }
        setMessages(prev => [...prev, streamingMsg.current!])
      } else if (data.type === 'chat-token' && streamingMsg.current) {
        streamingMsg.current.content += data.delta || ''
        setMessages(prev => [...prev.slice(0, -1), { ...streamingMsg.current! }])
      } else if (data.type === 'chat-tool-step' && streamingMsg.current) {
        const step: ToolStep = { name: data.tool, input: data.input, output: data.output }
        streamingMsg.current.toolSteps = [...(streamingMsg.current.toolSteps || []), step]
        setMessages(prev => [...prev.slice(0, -1), { ...streamingMsg.current! }])
      }
    }

    const handleDone = async (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      currentRequestId.current = null
      streamingMsg.current = null
      if (currentSessionId) {
        setActivity(currentSessionId, 'idle')
        await loadSession()
      }
    }

    const handleError = (data: any) => {
      if (!currentRequestId.current || data.requestId !== currentRequestId.current) return
      const errorMsg: Message = {
        id: 'error-' + Date.now(),
        role: 'error',
        content: data.error || 'An error occurred',
        timestamp: Date.now(),
        error: data.error
      }
      setMessages(prev => [...prev, errorMsg])
      currentRequestId.current = null
      streamingMsg.current = null
      if (currentSessionId) setActivity(currentSessionId, 'idle')
    }

    api.onToken?.(handleToken)
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

  const handleSend = async (text: string, files: File[]) => {
    if (!currentSessionId) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, userMsg])

    const requestId = Date.now().toString()
    currentRequestId.current = requestId
    setActivity(currentSessionId, 'thinking')

    await api.chat({ sessionId: currentSessionId, message: text, requestId, attachments: files })
  }

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
      <MessageList messages={messages} sessionId={currentSessionId || ''} />
      <InputBar sessionId={currentSessionId} onSend={handleSend} />
      <SettingsPanel visible={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
