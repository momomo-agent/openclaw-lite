import { Message } from '../types'
import { renderMarkdown } from '../utils/markdown'
import ToolGroup from './ToolGroup'
import { Avatar } from './Avatar'

interface MessageItemProps {
  message: Message
  isStreaming?: boolean
  statusText?: string
  userAvatarPath?: string
}

export default function MessageItem({ message, isStreaming, statusText, userAvatarPath }: MessageItemProps) {
  const isUser = message.role === 'user'
  const isError = message.role === 'error'

  return (
    <div className={`msg-card ${message.role}`}>
      <div className="msg-avatar">
        <Avatar
          raw={message.avatar}
          role={isUser ? 'user' : 'assistant'}
          wsPath={message.workspacePath}
          userAvatarPath={userAvatarPath}
        />
      </div>
      <div className="msg-body">
        <div className="msg-header">
          <span className={`msg-name ${isUser ? 'user-name' : ''}`}>
            {message.sender || (isUser ? 'You' : 'Assistant')}
          </span>
          <span className="msg-time">{new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        <div className="msg-flow">
          {message.thinking && (
            <details className="delegate-thinking">
              <summary>▶ 💭 Thinking...</summary>
              <div className="thinking-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.thinking) }} />
            </details>
          )}
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
          {isStreaming && statusText && (
            <div className="inline-status">
              <span className="reading-indicator"><span></span><span></span><span></span></span> {statusText}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
