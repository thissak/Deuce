import { expect, it } from 'vitest'
import { connectRunner, parseAnswer, providerArgs } from '../src/index.js'

it('Codex 실패·중간 출력과 Claude 오류를 최종 답변으로 게시하지 않는다', () => {
  expect(parseAnswer('codex', '{"type":"item.completed","item":{"type":"agent_message","text":"답변"}}\n{"type":"turn.completed"}')).toBe('답변')
  expect(() => parseAnswer('codex', '{"type":"item.completed","item":{"type":"agent_message","text":"미완료"}}')).toThrow()
  expect(() => parseAnswer('codex', '{"type":"turn.failed"}\n{"type":"turn.completed"}')).toThrow()
  expect(parseAnswer('claude', '{"result":"답변","is_error":false}')).toBe('답변')
  expect(() => parseAnswer('claude', '{"result":"로그인 오류","is_error":true}')).toThrow()
})
it('개인 설정·명령 실행을 로드하지 않는 CLI 인자로 실행한다', () => {
  expect(providerArgs('codex')).toEqual(expect.arrayContaining(['--ignore-user-config', 'read-only', 'shell_tool', 'hooks', 'project_doc_max_bytes=0']))
  const claude = providerArgs('claude'); expect(claude[claude.indexOf('--tools') + 1]).toBe('')
  expect(claude).toContain('--safe-mode')
  expect(claude).not.toContain('--dangerously-skip-permissions')
})
it('키를 보낼 주소에 외부 HTTP·사용자정보·경로를 허용하지 않는다', () => {
  for (const baseUrl of ['http://example.com', 'https://x:y@example.com', 'https://example.com/path'])
    expect(() => connectRunner({ baseUrl, provider: 'codex', token: 'deuce_' + 'a'.repeat(43) })).toThrow()
})
