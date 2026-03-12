import { Virtuoso } from 'react-virtuoso'
import { Message } from '../types'
import MessageItem from './MessageItem'
import { useAppState } from '../store'

interface MessageListProps {
  messages: Message[]
  sessionId: string
  streamingStatus?: string
  onRetry?: () => void
}

const ListPadding = () => <div style={{ height: 16 }} />

export default function MessageList({ messages, sessionId, streamingStatus, onRetry }: MessageListProps) {
  const { userProfile } = useAppState()

  return (
    <div className="messages">
      <Virtuoso
        key={sessionId}
        data={messages}
        initialTopMostItemIndex={Math.max(0, messages.length - 1)}
        components={{ Header: ListPadding, Footer: ListPadding }}
        itemContent={(index, message) => (
          <MessageItem
            key={message.id}
            message={message}
            isStreaming={index === messages.length - 1 && !!streamingStatus}
            statusText={index === messages.length - 1 ? streamingStatus : undefined}
            userAvatarPath={userProfile?.avatarAbsPath}
            onRetry={(message.isError || message.status === 'failed') ? onRetry : undefined}
          />
        )}
        followOutput="smooth"
        style={{ height: '100%' }}
      />
    </div>
  )
}
