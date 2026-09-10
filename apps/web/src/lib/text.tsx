import type { ReactNode } from 'react'

const URL_RE = /https?:\/\/[^\s<>"')]+/g

function renderMentions(text: string, memberNames: string[], keyBase: string): ReactNode[] {
  if (memberNames.length === 0 || !text.includes('@')) return [text]
  // 긴 이름 우선 — "김철"이 "김철수"를 가로채지 않도록
  const names = [...memberNames].sort((a, b) => b.length - a.length)
  const out: ReactNode[] = []
  let rest = text
  let i = 0
  while (rest.length > 0) {
    const at = rest.indexOf('@')
    if (at === -1) break
    const hit = names.find((n) => rest.startsWith(`@${n}`, at))
    if (!hit) {
      out.push(rest.slice(0, at + 1))
      rest = rest.slice(at + 1)
      continue
    }
    if (at > 0) out.push(rest.slice(0, at))
    out.push(
      <span key={`${keyBase}-m${i++}`} className="mention">
        {hit}
      </span>,
    )
    rest = rest.slice(at + 1 + hit.length)
  }
  if (rest.length > 0) out.push(rest)
  return out
}

export function renderBody(body: string, memberNames: string[]): ReactNode {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const match of body.matchAll(URL_RE)) {
    const url = match[0].replace(/[.,;:!?]+$/, '') // 문장 끝에 붙은 부호는 링크가 아니다
    const start = match.index
    if (start > last) out.push(...renderMentions(body.slice(last, start), memberNames, `t${i}`))
    out.push(
      <a key={`l${i++}`} href={url} target="_blank" rel="noreferrer">
        {url}
      </a>,
    )
    last = start + url.length
  }
  if (last < body.length) out.push(...renderMentions(body.slice(last), memberNames, 'tail'))
  return out
}
