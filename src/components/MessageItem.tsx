import React from 'react'
import { Message, ToolStep } from '../types'
import { renderMarkdown } from '../utils/markdown'
import { linkifyPaths } from '../utils/linkify'
import { useAppState } from '../store'
import { Avatar } from './Avatar'
import ToolGroup from './ToolGroup'

interface MessageItemProps {
  message: Message
  isStreaming?: boolean
  statusText?: string
  ownerWorkspaceId?: string  // session's first participant (owner)
  onRetry?: () => void
}

export default function MessageItem({ message, isStreaming, statusText, ownerWorkspaceId, onRetry }: MessageItemProps) {
  const { workspaces, userProfile } = useAppState()
  const isUser = message.role === 'user'
  const isError = message.isError === true  // assistant message that errored
  const isA2A = message.role === 'agent-to-agent'

  // Dynamic workspace identity resolution — always use live identity, never stale history
  // Priority: workspaceId/senderWorkspaceId → workspacePath → ownerWorkspaceId → first workspace
  // Note: DB stores delegate sender as `senderWorkspaceId` in metadata
  const msgWsId = message.workspaceId || (message as any).senderWorkspaceId
  const ws = msgWsId
    ? workspaces.find(w => w.id === msgWsId)
    : (message.workspacePath
      ? workspaces.find(w => w.path === message.workspacePath)
      : (!isUser
        ? (ownerWorkspaceId ? workspaces.find(w => w.id === ownerWorkspaceId) : workspaces[0])
        : undefined))
  const resolvedAvatar = isUser ? (userProfile?.userAvatar || message.avatar) : (ws?.identity?.avatar || message.avatar)
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
          />
        )}
      </div>
      <div className="msg-body">
        <div className="msg-header">
          <span className={`msg-name ${isUser ? 'user-name' : ''}${isA2A ? ' a2a-name' : ''}`}>
            {resolvedName || (isUser ? (userProfile?.userName || 'You') : 'Assistant')}
          </span>
          {isStreaming && statusText && (
            <span className="msg-status-breathing">({statusText})</span>
          )}
          <span className="msg-time">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="msg-flow">
          {message.toolSteps && message.toolSteps.length > 0 && (() => {
            const segments: React.ReactNode[] = []
            let toolBatch: ToolStep[] = []
            const flushTools = () => {
              if (toolBatch.length) {
                segments.push(<ToolGroup key={`tg-${segments.length}`} steps={toolBatch} isStreaming={isStreaming} roundPurpose={message.roundPurpose} />)
                toolBatch = []
              }
            }
            for (const step of message.toolSteps) {
              if (step.name === '__thinking__') {
                flushTools()
                const text = (step.output || '').trim()
                if (text) {
                  segments.push(
                    <div key={`th-${segments.length}`} className="msg-thinking">
                      <div className="msg-thinking-content" dangerouslySetInnerHTML={{ __html: renderContent(text) }} />
                    </div>
                  )
                }
              } else {
                toolBatch.push(step)
              }
            }
            flushTools()
            return segments
          })()}
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
            message.content?.trim() ? (
              <div
                className={`msg-content md-content${isA2A ? ' a2a-content' : ''}${isUser && message.status === 'failed' ? ' msg-send-failed' : ''}`}
                dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}
              />
            ) : null
          )}
          {/* Send failure: small retry icon beside message */}
          {isUser && message.status === 'failed' && onRetry && (
            <button className="retry-icon-btn" onClick={onRetry} title="重新发送">↻ 重试</button>
          )}
          {/* Typing indicator: three bouncing dots while streaming */}
          {isStreaming && (
            <span className="typing-dots">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
