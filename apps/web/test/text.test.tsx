import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderBody } from '../src/lib/text'

function html(body: string, names: string[] = []): string {
  return render(<div>{renderBody(body, names)}</div>).container.innerHTML
}

describe('renderBody', () => {
  it('http 링크를 앵커로 바꾼다', () => {
    const out = html('여기 https://example.com/a?b=1 보세요')
    expect(out).toContain('<a href="https://example.com/a?b=1"')
    expect(out).toContain('target="_blank"')
  })

  it('링크가 없으면 텍스트 그대로', () => {
    expect(html('그냥 텍스트')).toContain('그냥 텍스트')
  })

  it('멘션을 하이라이트한다 (긴 이름 우선)', () => {
    const out = html('@김철수님 확인 부탁드립니다', ['김철수', '김철'])
    expect(out).toContain('<span class="mention">@김철수</span>')
  })

  it('멤버가 아닌 @텍스트는 그대로 둔다', () => {
    expect(html('@아무개 안녕', ['김철수'])).not.toContain('mention')
  })
})
