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
  const { workspaces, userProfile } = useAppState()
  const isUser = message.role === 'user'
  const isError = message.isError === true  // assistant message that errored
  const isA2A = message.role === 'agent-to-agent'

  // Dynamic workspace identity resolution — always use live identity, never stale history
  // Priority: workspaceId → workspacePath → first workspace (default for single-workspace)
  const ws = message.workspaceId
    ? workspaces.find(w => w.id === message.workspaceId)
    : (message.workspacePath
      ? workspaces.find(w => w.path === message.workspacePath)
      : (!isUser ? workspaces[0] : undefined))
  const resolvedAvatar = (!isUser && ws?.identity?.avatar) || message.avatar
  const resolvedName = (!isUser && ws?.identity?.name) || message.sender

  const renderContent = (text: string) => linkifyPaths(renderMarkdown(text))

  const attachments = message.attachments

  return (
    <div className={`msg-card ${message.role}${isError ? ' msg-error' : ''}`}>
      <div className="msg-avatar">
        {isA2A ? (
          <span className="ic">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </span>
        ) : (
          <Avatar
            raw={resolvedAvatar}
            role={isUser ? 'user' : 'assistant'}
            wsPath={ws?.path || message.workspacePath}
            userAvatarPath={userAvatarPath}
          />
        )}
      </div>
      <div className="msg-body">
        <div className="msg-header">
          <span className={`msg-name ${isUser ? 'user-name' : ''}${isA2A ? ' a2a-name' : ''}`}>
            {resolvedName || (isUser ? (userProfile?.userName || 'You') : 'Assistant')}
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
            <ToolGroup
              steps={message.toolSteps}
              isStreaming={isStreaming}
              roundPurpose={message.roundPurpose}
            />
          )}
          {/* F247: Image attachments inline */}
          {isUser && attachments && attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {attachments.filter(a => a.url).map((a, i) => (
                <img key={i} src={a.url} alt={a.name}
                  style={{ maxWidth: 300, maxHeight: 200, borderRadius: 8, objectFit: 'contain' }}
                />
              ))}
            </div>
          )}
          {isError ? (
            <>
              <div className="msg-content msg-error-content">
                {message.content}
              </div>
              {onRetry && (
                <button className="retry-btn" onClick={onRetry}>↻ 重试</button>
              )}
            </>
          ) : (
            <div
              className={`msg-content md-content${isA2A ? ' a2a-content' : ''}${isUser && message.status === 'failed' ? ' msg-send-failed' : ''}`}
              dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}
            />
          )}
          {/* Send failure: small retry icon beside message */}
          {isUser && message.status === 'failed' && onRetry && (
            <button className="retry-icon-btn" onClick={onRetry} title="重新发送">↻ 重试</button>
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
