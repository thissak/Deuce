import type { UserDto } from '@deuce/shared'
import { useParams } from 'react-router-dom'
import { ChatView } from './ChatView'
import { ConversationList } from './ConversationList'

export function ChatPage({ me }: { me: UserDto }) {
  const { conversationId } = useParams()
  return (
    <div className="chat-page">
      <ConversationList me={me} activeId={conversationId} />
      {conversationId ? (
        <ChatView key={conversationId} me={me} conversationId={conversationId} />
      ) : (
        <section className="chat-view">
          <div className="empty-state">
            <p>대화를 선택하거나 새 채팅을 시작해 보세요.</p>
          </div>
        </section>
      )}
    </div>
  )
}
