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

export default function MessageList({ messages, streamingStatus, onRetry }: MessageListProps) {
  const { userProfile } = useAppState()

  return (
    <div className="messages">
      <Virtuoso
        data={messages}
        itemContent={(index, message) => (
          <MessageItem
            key={message.id}
            message={message}
            isStreaming={index === messages.length - 1 && !!streamingStatus}
            statusText={index === messages.length - 1 ? streamingStatus : undefined}
            userAvatarPath={userProfile?.avatarAbsPath}
            onRetry={message.role === 'error' ? onRetry : undefined}
          />
        )}
        followOutput="smooth"
        style={{ height: '100%' }}
      />
    </div>
  )
}
