import { Message } from '../types'
import { renderMarkdown } from '../utils/markdown'
import { linkifyPaths } from '../utils/linkify'
import { useAppState } from '../store'
import { Avatar } from './Avatar'
import ToolGroup from './ToolGroup'

interface MessageItemProps {
  message: Message
  isStreaming?: boolean
  statusText?: string
  userAvatarPath?: string
  onRetry?: () => void
}

export default function MessageItem({ message, isStreaming, statusText, userAvatarPath, onRetry }: MessageItemProps) {
  const { workspaces } = useAppState()
  const isUser = message.role === 'user'
  const isError = message.role === 'error'
  const isA2A = message.role === 'agent-to-agent'
  const ws = message.workspaceId ? workspaces.find(w => w.id === message.workspaceId) : undefined

  const renderContent = (text: string) => linkifyPaths(renderMarkdown(text))

  return (
    <div className={`msg-card ${message.role}${isError ? ' msg-error' : ''}`}>
      <div className="msg-avatar">
        {isError ? <span>⚠️</span> : isA2A ? <span>💬</span> : (
          <Avatar
            raw={message.avatar}
            role={isUser ? 'user' : 'assistant'}
            wsPath={ws?.path || message.workspacePath}
            userAvatarPath={userAvatarPath}
          />
        )}
      </div>
      <div className="msg-body">
        <div className="msg-header">
          <span className={`msg-name ${isUser ? 'user-name' : ''}${isA2A ? ' a2a-name' : ''}`}>
            {message.sender || (isUser ? 'You' : isError ? 'Error' : 'Assistant')}
          </span>
          <span className="msg-time">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="msg-flow">
          {message.thinking && (
            <details className="delegate-thinking">
              <summary>▶ 💭 Thinking...</summary>
              <div className="thinking-content" dangerouslySetInnerHTML={{ __html: renderContent(message.thinking) }} />
            </details>
          )}
          {message.toolSteps && message.toolSteps.length > 0 && (
            <ToolGroup steps={message.toolSteps} />
          )}
          {isError ? (
            <>
              <div className="msg-content" style={{ color: 'var(--status-error)', borderLeft: '3px solid var(--status-error)', paddingLeft: 8 }}>
                {message.content}
              </div>
              {onRetry && (
                <button className="retry-btn" onClick={onRetry}
                  style={{ marginTop: 8, padding: '4px 12px', background: 'var(--accent)', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                  🔄 重试
                </button>
              )}
            </>
          ) : (
            <div
              className={`msg-content md-content${isA2A ? ' a2a-content' : ''}`}
              dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}
            />
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
