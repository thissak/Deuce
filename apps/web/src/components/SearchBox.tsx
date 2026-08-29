import { useQuery } from '@tanstack/react-query'
import { useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchQuery } from '../api/queries'
import { formatTime, truncate } from '../lib/format'

export function SearchBox() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState('')
  const results = useQuery(searchQuery(submitted))

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) setSubmitted(text.trim())
    if (e.key === 'Escape') {
      setSubmitted('')
      setText('')
    }
  }

  return (
    <div className="search-box">
      <input
        type="text"
        placeholder="검색 (2자 이상, Enter)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        className="search-input"
      />
      {submitted.length >= 2 && (
        <ul className="search-results">
          {results.data?.length === 0 && <li className="result-row">결과가 없습니다.</li>}
          {results.data?.map((r) => (
            <li key={r.messageId}>
              <button
                className="result-row"
                onClick={() => {
                  setSubmitted('')
                  setText('')
                  navigate(`/chat/${r.conversationId}?m=${r.messageId}`)
                }}
              >
                <span className="result-meta">
                  <span>{r.conversationTitle ?? r.authorName}</span>
                  <span>{formatTime(r.createdAt)}</span>
                </span>
                {truncate(r.body, 60)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
