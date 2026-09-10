import type { MessageDto } from '@deuce/shared'

export type ReactionOption = {
  emoji: string
  label: string
  asset: string
}

/** Microsoft Fluent Emoji의 공식 3D PNG로 표시하는 반응 40종 */
export const REACTION_PALETTE: readonly ReactionOption[] = [
  { emoji: '👍', label: '좋아요', asset: '/fluent-emoji/thumbs-up.png' },
  { emoji: '❤️', label: '사랑해요', asset: '/fluent-emoji/red-heart.png' },
  { emoji: '😂', label: '웃겨요', asset: '/fluent-emoji/face-with-tears-of-joy.png' },
  { emoji: '😮', label: '놀라워요', asset: '/fluent-emoji/face-with-open-mouth.png' },
  { emoji: '😢', label: '슬퍼요', asset: '/fluent-emoji/crying-face.png' },
  { emoji: '🙏', label: '감사해요', asset: '/fluent-emoji/folded-hands.png' },
  { emoji: '😡', label: '화나요', asset: '/fluent-emoji/pouting-face.png' },
  { emoji: '🎉', label: '축하해요', asset: '/fluent-emoji/party-popper.png' },
  { emoji: '🔥', label: '최고예요', asset: '/fluent-emoji/fire.png' },
  { emoji: '👏', label: '박수', asset: '/fluent-emoji/clapping-hands.png' },
  { emoji: '🙌', label: '만세', asset: '/fluent-emoji/raising-hands.png' },
  { emoji: '💯', label: '백 점', asset: '/fluent-emoji/hundred-points.png' },
  { emoji: '😍', label: '반했어요', asset: '/fluent-emoji/smiling-face-with-heart-eyes.png' },
  { emoji: '🤔', label: '생각 중', asset: '/fluent-emoji/thinking-face.png' },
  { emoji: '😅', label: '멋쩍은 웃음', asset: '/fluent-emoji/grinning-face-with-sweat.png' },
  { emoji: '😎', label: '멋져요', asset: '/fluent-emoji/smiling-face-with-sunglasses.png' },
  { emoji: '🥳', label: '파티', asset: '/fluent-emoji/partying-face.png' },
  { emoji: '😴', label: '졸려요', asset: '/fluent-emoji/sleeping-face.png' },
  { emoji: '👀', label: '보고 있어요', asset: '/fluent-emoji/eyes.png' },
  { emoji: '✅', label: '확인', asset: '/fluent-emoji/check-mark-button.png' },
  { emoji: '❌', label: '아니요', asset: '/fluent-emoji/cross-mark.png' },
  { emoji: '🚀', label: '출발', asset: '/fluent-emoji/rocket.png' },
  { emoji: '💡', label: '아이디어', asset: '/fluent-emoji/light-bulb.png' },
  { emoji: '⭐', label: '별', asset: '/fluent-emoji/star.png' },
  { emoji: '😀', label: '활짝 웃어요', asset: '/fluent-emoji/grinning-face.png' },
  { emoji: '😃', label: '기뻐요', asset: '/fluent-emoji/grinning-face-with-big-eyes.png' },
  { emoji: '😄', label: '신나요', asset: '/fluent-emoji/grinning-face-with-smiling-eyes.png' },
  { emoji: '😊', label: '미소', asset: '/fluent-emoji/smiling-face-with-smiling-eyes.png' },
  { emoji: '😉', label: '윙크', asset: '/fluent-emoji/winking-face.png' },
  { emoji: '🥰', label: '행복해요', asset: '/fluent-emoji/smiling-face-with-hearts.png' },
  { emoji: '😘', label: '뽀뽀', asset: '/fluent-emoji/face-blowing-a-kiss.png' },
  { emoji: '🤗', label: '안아 줄게요', asset: '/fluent-emoji/hugging-face.png' },
  { emoji: '🤩', label: '황홀해요', asset: '/fluent-emoji/star-struck.png' },
  { emoji: '🤯', label: '놀라서 멍해요', asset: '/fluent-emoji/exploding-head.png' },
  { emoji: '😭', label: '엉엉 울어요', asset: '/fluent-emoji/loudly-crying-face.png' },
  { emoji: '😱', label: '무서워요', asset: '/fluent-emoji/face-screaming-in-fear.png' },
  { emoji: '🤝', label: '함께해요', asset: '/fluent-emoji/handshake.png' },
  { emoji: '👌', label: '좋습니다', asset: '/fluent-emoji/ok-hand.png' },
  { emoji: '💪', label: '힘내요', asset: '/fluent-emoji/flexed-biceps.png' },
  { emoji: '✨', label: '반짝여요', asset: '/fluent-emoji/sparkles.png' },
]

/** 액션 바에 항상 보이는 빠른 반응 (Teams 순서) */
export const QUICK_REACTIONS = REACTION_PALETTE.slice(0, 4)

const REACTION_BY_EMOJI = new Map(REACTION_PALETTE.map((option) => [option.emoji, option]))

export function getReactionOption(emoji: string): ReactionOption | undefined {
  return REACTION_BY_EMOJI.get(emoji)
}

export function hasMyReaction(m: MessageDto, emoji: string, meId: string): boolean {
  return m.reactions.some((r) => r.emoji === emoji && r.userIds.includes(meId))
}
