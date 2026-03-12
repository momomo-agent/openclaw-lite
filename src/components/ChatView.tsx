import { useState, useEffect } from 'react'
import { useAppState } from '../store'
import { useIPC } from '../hooks/useIPC'
import { Message } from '../types'
import MessageList from './MessageList'
import InputBar from './InputBar'

export default function ChatView() {
  const { currentSessionId } = useAppState()
  const api = useIPC()
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionTitle, setSessionTitle] = useState('New Chat')

  useEffect(() => {
    if (!currentSessionId) return
    loadSession()
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

    await api.chat({ sessionId: currentSessionId, message: text, attachments: files })
  }

  useEffect(() => {
    const handleToken = (data: any) => {
      if (data.sessionId !== currentSessionId) return
      // Update streaming message
    }
    api.onToken?.(handleToken)
  }, [currentSessionId])

  return (
    <div className="chat-main">
      <div className="chat-header">
        <div className="title-area">
          <span id="sessionTitle">{sessionTitle}</span>
        </div>
        <div className="header-actions">
          <button className="icon-btn">
            <span className="ic">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </span>
          </button>
        </div>
      </div>
      <MessageList messages={messages} sessionId={currentSessionId || ''} />
      <InputBar sessionId={currentSessionId} onSend={handleSend} />
    </div>
  )
}
