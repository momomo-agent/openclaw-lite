import { Message } from '../types'
import { renderMarkdown } from '../utils/markdown'
import ToolGroup from './ToolGroup'

interface MessageItemProps {
  message: Message
}

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'
  const isError = message.role === 'error'

  return (
    <div className={`msg-card ${message.role}`}>
      <div className="msg-avatar">{isUser ? '👤' : '🤖'}</div>
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
