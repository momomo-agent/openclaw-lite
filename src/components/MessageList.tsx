import { Virtuoso } from 'react-virtuoso'
import { Message } from '../types'
import MessageItem from './MessageItem'
import { useAppState } from '../store'

interface MessageListProps {
  messages: Message[]
  sessionId: string
  streamingStatus?: string
}

export default function MessageList({ messages, streamingStatus }: MessageListProps) {
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
          />
        )}
        followOutput="smooth"
        style={{ height: '100%' }}
      />
    </div>
  )
}
