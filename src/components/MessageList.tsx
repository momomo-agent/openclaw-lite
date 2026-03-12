import { Virtuoso } from 'react-virtuoso'
import { Message } from '../types'
import MessageItem from './MessageItem'

interface MessageListProps {
  messages: Message[]
  sessionId: string
}

export default function MessageList({ messages }: MessageListProps) {
  return (
    <div className="messages">
      <Virtuoso
        data={messages}
        itemContent={(_index, message) => (
          <MessageItem key={message.id} message={message} />
        )}
        followOutput="smooth"
        style={{ height: '100%' }}
      />
    </div>
  )
}
