import { MessageDtoSchema, type MessageDto, type UserDto } from '@deuce/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { ApiError, apiJson } from '../api/http'
import { messagesKey, sharedKey } from '../api/queries'
import { formatBytes, isImage } from '../lib/format'
import { collectMentionIds, mentionQueryAt } from '../lib/mentions'
import { appendMessage, type MessagesData } from '../realtime/cache'
import { beginSubmission, diagnosticFetch, record } from '../diagnostics/recorder'

const MAX_FILE_BYTES = 26214400 // 서버 MAX_UPLOAD_BYTES 기본값과 동일 (25MiB)

/** 전송 단위. 제출 때 초안에서 떼어낸 뒤로는 outgoing mutation만 소유한다 — 실패하면 variables로 남아 재전송·버리기의 대상이 된다 */
type Outgoing = { body: string; file: File | null; replyToId?: string; mentions: string[]; traceId?: string; clientMessageId?: string }

export function Composer({
  me,
  conversationId,
  members,
  replyTo,
  onClearReply,
}: {
  me: UserDto
  conversationId: string
  members: UserDto[]
  replyTo: MessageDto | null
  onClearReply: () => void
}) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const caretFixRef = useRef<number | null>(null)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [activeMention, setActiveMention] = useState(0)
  const mentionListId = useId()
  const mentionListRef = useRef<HTMLDivElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [multiDropNotice, setMultiDropNotice] = useState(false)
  const dragCounterRef = useRef(0) // dragleave가 자식 엘리먼트 이동에도 발생하므로 카운터로 진짜 이탈을 판별한다
  const candidates = mention
    ? members.filter((u) => u.id !== me.id && u.name.toLowerCase().startsWith(mention.query.toLowerCase()))
    : []

  const selectedMention = Math.min(activeMention, Math.max(0, candidates.length - 1))
  const selectedMentionId = candidates[selectedMention]?.id
  useEffect(() => {
    mentionListRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedMentionId])

  const refreshMention = () => {
    const el = boxRef.current
    const next = el ? mentionQueryAt(el.value, el.selectionStart) : null
    if (next?.start !== mention?.start || next?.query !== mention?.query) setActiveMention(0)
    setMention(next)
  }

  const pickMention = (name: string) => {
    if (!mention) return
    const el = boxRef.current!
    const caret = el.selectionStart
    const pos = mention.start + name.length + 2 // '@' + 이름 + 공백 뒤
    setText(text.slice(0, mention.start) + `@${name} ` + text.slice(caret))
    setMention(null)
    caretFixRef.current = pos
  }

  // 리렌더가 caret을 끝으로 보내므로, 커밋 직후(다음 이벤트가 끼어들기 전)에 되돌린다
  useLayoutEffect(() => {
    if (caretFixRef.current === null) return
    const pos = caretFixRef.current
    caretFixRef.current = null
    const el = boxRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(pos, pos)
    }
  }, [text])

  // 이미지 파일일 때만 미리보기 URL을 만든다 — 교체·해제·언마운트 모두 이 정리에서 해제된다
  useEffect(() => {
    if (!file || !isImage(file.type)) return
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setPreviewUrl(null)
    }
  }, [file])

  /** 첨부로 받아들였으면 true — 드롭 쪽에서 안내 문구를 띄울지 판단하는 데 쓴다 */
  const pickFile = (f: File | null): boolean => {
    if (f && f.size > MAX_FILE_BYTES) {
      setFileError('파일이 너무 큽니다 (최대 25MB).')
      setFile(null)
      return false
    }
    setFileError(null)
    setFile(f)
    return true
  }

  const isFileDrag = (e: DragEvent<HTMLDivElement>) => e.dataTransfer.types.includes('Files')

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    dragCounterRef.current += 1
    setDragging(true)
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setDragging(false)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    dragCounterRef.current = 0
    setDragging(false)
    const files = e.dataTransfer.files
    if (files.length === 0) return
    // 서버 계약상 메시지당 첨부는 하나뿐이라 첫 파일만 취한다.
    // 그 파일이 거부되면 첨부된 게 없으므로 "첫 번째만" 안내도 띄우지 않는다
    const accepted = pickFile(files[0]!)
    setMultiDropNotice(accepted && files.length > 1)
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(e.clipboardData.files).filter((f) => isImage(f.type))
    if (images.length === 0) return
    const accepted = pickFile(images[0]!)
    setMultiDropNotice(accepted && images.length > 1)
    // 기본 붙여넣기를 막지 않아 이미지와 함께 복사된 일반 텍스트도 입력창에 남는다.
  }

  // 텍스트 전송과 첨부 업로드를 한 mutation으로 묶는다 — 미해결 payload는 항상 하나뿐이고,
  // TanStack이 이미 variables·isPending·isError·reset()으로 그 payload와 상태를 들고 있다
  const outgoing = useMutation({
    mutationFn: async (o: Outgoing) => {
      if (!o.file) {
        return MessageDtoSchema.parse(
          await apiJson('POST', `/api/conversations/${conversationId}/messages`, {
            body: o.body,
            replyToId: o.replyToId,
            mentions: o.mentions,
            ...(o.clientMessageId ? { clientMessageId: o.clientMessageId } : {}),
          }, o.traceId),
        )
      }
      // 첨부는 multipart 전용 엔드포인트 — 캡션은 body 필드로 함께 올린다 (T1 계약). 답장은 포함하지 않는다
      const fd = new FormData()
      fd.append('file', o.file)
      fd.append('body', o.body)
      const res = await diagnosticFetch(`/api/conversations/${conversationId}/attachments`, {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      }, o.traceId)
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new ApiError(res.status, body.error ?? res.statusText)
      }
      const message = MessageDtoSchema.parse(await res.json())
      record('http.body', { traceId: o.traceId, messageId: message.id, route: 'attachments', status: res.status })
      return message
    },
    // 성공·실패 모두 초안(text·file·답장)은 건드리지 않는다 — 초안은 제출 시점에 이미 비웠다
    onSuccess: (m, o) => {
      qc.setQueryData<MessagesData>(messagesKey(conversationId), (d) => appendMessage(d, m))
      record('cache.message', { traceId: o.traceId, messageId: m.id })
      if (o.file) void qc.invalidateQueries({ queryKey: sharedKey(conversationId) })
    },
  })

  const failed = outgoing.isError ? outgoing.variables : undefined
  // 미해결 payload(요청 중·실패)가 있으면 새 전송을 받지 않는다 — 한 번에 하나만 다룬다. 초안 작성은 계속 가능
  const blocked = outgoing.isPending || outgoing.isError

  const submit = () => {
    if (blocked) return
    const body = text.trim()
    if (!file && body.length === 0) return
    // JSON 요청에 필요한 값은 여기서 모두 확정한다 — 재전송도 같은 payload를 보낸다
    const mentions = collectMentionIds(body, members)
    const aiMentioned = members.some(u => u.isAgent && mentions.includes(u.id))
    if (aiMentioned && file) { setFileError('자료를 먼저 올린 뒤, 별도 메시지에서 AI에게 요청해 주세요.'); return }
    outgoing.mutate({ body, file, replyToId: replyTo?.id, mentions, traceId: beginSubmission(), ...(aiMentioned ? { clientMessageId: crypto.randomUUID() } : {}) }) // AI 요청의 실패 재전송은 같은 ID를 유지한다.
    // 초안을 즉시 비운다 — 응답을 기다리며 쓰는 글·고르는 파일·답장은 다음 초안의 것 (실 Chrome에서 확인)
    setText('')
    setFile(null)
    setMultiDropNotice(false)
    onClearReply()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
    if (candidates.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveMention((selectedMention + (e.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setMention(null)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        pickMention(candidates[selectedMention]!.name)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div
      className={dragging ? 'composer dragging' : 'composer'}
      data-testid="composer"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {fileError && <div className="composer-error">{fileError}</div>}
      {outgoing.isPending && <div className="composer-hint" role="status">{outgoing.variables.file ? '파일 업로드 중…' : '전송 중…'}</div>}
      {failed && (
        <div className="composer-error" role="alert">
          전송에 실패했습니다. 재전송하거나 버린 뒤 새 메시지를 보낼 수 있습니다:{' '}
          <div className="composer-failed-preview">
            {failed.file && `📎 ${failed.file.name}\n`}
            {failed.body}
          </div>
          <button className="btn-plain" onClick={() => outgoing.mutate({ ...failed, traceId: beginSubmission(true) })}>
            재전송
          </button>
          <button className="btn-plain" onClick={() => outgoing.reset()}>
            버리기
          </button>
        </div>
      )}
      {file && (
        <div className="file-chip">
          {previewUrl && <img className="file-chip-preview" src={previewUrl} alt={file.name} />}
          📎 {file.name} <span className="size">({formatBytes(file.size)})</span>
          <button
            className="chip-close"
            aria-label="첨부 제거"
            onClick={() => {
              setFile(null)
              setMultiDropNotice(false)
            }}
          >
            ✕
          </button>
        </div>
      )}
      {multiDropNotice && <div className="composer-hint">여러 파일 중 첫 번째만 첨부됩니다.</div>}
      {file && replyTo && <div className="composer-hint">첨부에는 답장이 포함되지 않습니다.</div>}
      {replyTo && (
        <div className="reply-chip">
          <span className="quote-author">{replyTo.author.name}에게 답장</span>
          <span className="convo-preview">{replyTo.deleted ? '삭제된 메시지입니다' : replyTo.body}</span>
          <button className="chip-close" onClick={onClearReply}>
            ✕
          </button>
        </div>
      )}
      <div className="composer-row">
        <label className="icon-btn" title="파일 첨부">
          📎
          <input
            data-testid="file-input"
            type="file"
            hidden
            onChange={(e) => {
              setMultiDropNotice(false)
              pickFile(e.target.files?.[0] ?? null)
              e.target.value = '' // 같은 파일을 다시 골라도 change가 나도록
            }}
          />
        </label>
        <div className="composer-anchor">
          <textarea
            ref={boxRef}
            value={text}
            maxLength={4000}
            placeholder="메시지를 입력하세요"
            onChange={(e) => {
              setText(e.target.value)
              refreshMention()
            }}
            aria-label="메시지"
            aria-autocomplete="list"
            aria-controls={candidates.length > 0 ? mentionListId : undefined}
            aria-activedescendant={selectedMentionId ? `${mentionListId}-${selectedMentionId}` : undefined}
            onKeyUp={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) refreshMention()
            }}
            onBlur={() => setMention(null)}
            onClick={refreshMention}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
          />
          {candidates.length > 0 && (
            <div className="mention-pop" id={mentionListId} ref={mentionListRef} role="listbox" aria-label="멘션 대상">
              {candidates.map((u, index) => (
                <button
                  key={u.id}
                  id={`${mentionListId}-${u.id}`}
                  role="option"
                  aria-selected={index === selectedMention}
                  className={index === selectedMention ? 'focused' : undefined}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveMention(index)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickMention(u.name)
                  }}
                >
                  <span className="avatar">{u.name.slice(0, 1)}</span>
                  {u.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="send-btn" onClick={submit} disabled={(!file && text.trim().length === 0) || blocked}>
          보내기
        </button>
      </div>
    </div>
  )
}
