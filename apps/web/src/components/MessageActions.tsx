import { useEffect, useRef, useState } from 'react'
import { QUICK_REACTIONS, REACTION_PALETTE } from '../lib/messages'
import { useEscapeKey } from '../lib/useEscapeKey'

/** Teams 형태 메시지 액션 바 — 반응 4종 · 팔레트 · 수정 · 더보기(회신/고정/삭제) */
export function MessageActions({
  isMine,
  isPinned,
  onToggleReaction,
  onReply,
  onEdit,
  onPin,
  onDelete,
}: {
  isMine: boolean
  isPinned: boolean
  onToggleReaction: (emoji: string) => void
  onReply: () => void
  onEdit: () => void
  onPin: () => void
  onDelete: () => void
}) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const closeAll = () => {
    setPaletteOpen(false)
    setMenuOpen(false)
    setConfirmDelete(false)
  }

  useEscapeKey(closeAll)

  // 팔레트·메뉴가 열려 있을 때만 바깥 클릭을 감시한다
  useEffect(() => {
    if (!paletteOpen && !menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeAll()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [paletteOpen, menuOpen])

  const togglePalette = () => {
    setMenuOpen(false)
    setPaletteOpen((v) => !v)
  }

  const toggleMenu = () => {
    setPaletteOpen(false)
    setConfirmDelete(false)
    setMenuOpen((v) => !v)
  }

  const pickReaction = (emoji: string) => {
    onToggleReaction(emoji)
    setPaletteOpen(false)
  }

  return (
    <div className="msg-actions" ref={rootRef}>
      {QUICK_REACTIONS.map((e) => (
        <button key={e} onClick={() => onToggleReaction(e)}>
          {e}
        </button>
      ))}
      <button aria-label="반응 추가" onClick={togglePalette}>
        😊+
      </button>
      <span className="msg-actions-divider" />
      {isMine && (
        <button aria-label="수정" onClick={onEdit}>
          ✏️
        </button>
      )}
      <button aria-label="더 보기" onClick={toggleMenu}>
        ⋯
      </button>
      {paletteOpen && (
        <div className="reaction-palette">
          {REACTION_PALETTE.map((e) => (
            <button key={e} onClick={() => pickReaction(e)}>
              {e}
            </button>
          ))}
        </div>
      )}
      {menuOpen && (
        <div className="msg-menu" role="menu">
          {confirmDelete ? (
            <>
              <button
                role="menuitem"
                className="btn-danger"
                onClick={() => {
                  onDelete()
                  closeAll()
                }}
              >
                정말 삭제
              </button>
              <button role="menuitem" onClick={() => setConfirmDelete(false)}>
                취소
              </button>
            </>
          ) : (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  onReply()
                  closeAll()
                }}
              >
                따옴표로 회신
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  onPin()
                  closeAll()
                }}
              >
                {isPinned ? '고정 해제' : '고정'}
              </button>
              {isMine && (
                <button role="menuitem" onClick={() => setConfirmDelete(true)}>
                  삭제
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
