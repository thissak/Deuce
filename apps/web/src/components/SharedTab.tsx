import { useQuery } from '@tanstack/react-query'
import { sharedFilesQuery } from '../api/queries'
import { formatBytes, formatTime } from '../lib/format'

export function SharedTab({ conversationId }: { conversationId: string }) {
  const { data: files = [] } = useQuery(sharedFilesQuery(conversationId))
  return (
    <div className="shared-list">
      {files.length === 0 && <p className="empty-state">공유된 파일이 없습니다.</p>}
      {files.map((f) => (
        <a key={f.id} className="attachment" href={`/api/attachments/${f.id}`}>
          📎 {f.fileName}
          <span className="size">
            {formatBytes(f.size)} · {formatTime(f.createdAt)}
          </span>
        </a>
      ))}
    </div>
  )
}
