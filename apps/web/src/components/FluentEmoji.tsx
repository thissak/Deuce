import { getReactionOption } from '../lib/messages'

export function FluentEmoji({ emoji, className = '' }: { emoji: string; className?: string }) {
  const option = getReactionOption(emoji)
  if (!option) return <span className={className}>{emoji}</span>

  return (
    <img
      className={`fluent-emoji ${className}`.trim()}
      src={option.asset}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
