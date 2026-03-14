import { useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { Message } from '../types'
import { isVisibleToolStep } from '../utils/tools'
import MessageItem from './MessageItem'
interface MessageListProps {
  messages: Message[]
  sessionId: string
  streamingStatus?: string
  activeStreamingId?: string | null  // ID of the card currently being streamed to
  ownerWorkspaceId?: string
  onRetry?: () => void
}

/** An assistant message with no text, no visible tools, and no thinking is empty.
 *  Never filter streaming-phase cards (they start empty and fill up). */
function isEmptyAssistantMsg(m: Message): boolean {
  if (m.role !== 'assistant' || m.isError) return false
  // Streaming / delegate cards are in-flight — never hide them
  if (typeof m.id === 'string' && (m.id.startsWith('streaming-') || m.id.startsWith('delegate-'))) return false
  if (m.content?.trim()) return false
  const steps = m.toolSteps || []
  if (steps.some(s => isVisibleToolStep(s))) return false
  if (steps.some(s => s.name === '__thinking__' && (s.output || '').trim())) return false
  return true
}

const ListPadding = () => <div style={{ height: 16 }} />

export default function MessageList({ messages, sessionId, streamingStatus, activeStreamingId, ownerWorkspaceId, onRetry }: MessageListProps) {
  // Filter out empty assistant messages before Virtuoso (avoids zero-height items)
  const visibleMessages = useMemo(() => messages.filter(m => !isEmptyAssistantMsg(m)), [messages])

  return (
    <div className="messages" data-testid="message-list">
      <Virtuoso
        key={sessionId}
        data={visibleMessages}
        initialTopMostItemIndex={Math.max(0, visibleMessages.length - 1)}
        components={{ Header: ListPadding, Footer: ListPadding }}
        itemContent={(_index, message) => {
          // activeStreamingId comes from StreamState ref (delegateMsg > streamingMsg),
          // computed at render time in ChatView — deterministic, no handler race.
          const isActive = !!activeStreamingId && message.id === activeStreamingId
          return (
            <MessageItem
              key={message.id}
              message={message}
              isStreaming={isActive}
              statusText={isActive ? streamingStatus : undefined}
              ownerWorkspaceId={ownerWorkspaceId}
              onRetry={(message.isError || message.status === 'failed') ? onRetry : undefined}
            />
          )
        }}
        followOutput="smooth"
        style={{ height: '100%' }}
      />
    </div>
  )
}
