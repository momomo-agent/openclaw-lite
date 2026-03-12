import { Message } from '../types'
import { renderMarkdown } from '../utils/markdown'
import ToolGroup from './ToolGroup'

interface MessageItemProps {
  message: Message
}

const UserIcon = () => (
  <span className="ic">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  </span>
)

const BotIcon = () => (
  <span className="ic">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>
      <path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
    </svg>
  </span>
)

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'
  const isError = message.role === 'error'

  return (
    <div className={`msg-card ${message.role}`}>
      <div className="msg-avatar">{isUser ? <UserIcon /> : <BotIcon />}</div>
      <div className="msg-body">
        <div className="msg-header">
          <span className={`msg-name ${isUser ? 'user-name' : ''}`}>
            {message.sender || (isUser ? 'You' : 'Assistant')}
          </span>
          <span className="msg-time">{new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        <div className="msg-flow">
          {message.toolSteps && message.toolSteps.length > 0 && (
            <ToolGroup steps={message.toolSteps} />
          )}
          <div
            className="msg-content md-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
          {isError && message.error && (
            <div className="error-message">{message.error}</div>
          )}
        </div>
      </div>
    </div>
  )
}
