import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, apiJson } from '../src/api/http'

function stubFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('JSON 응답을 반환하고 credentials를 붙인다', async () => {
    const fn = stubFetch(200, { hello: 'world' })
    await expect(api('/api/x')).resolves.toEqual({ hello: 'world' })
    expect(fn.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' })
  })

  it('에러 응답의 error 필드를 ApiError로 던진다', async () => {
    stubFetch(403, { error: 'not a member' })
    const err = await api('/api/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(403)
    expect((err as ApiError).message).toBe('not a member')
  })

  it('204는 undefined를 반환한다', async () => {
    stubFetch(204, undefined)
    await expect(api('/api/x')).resolves.toBeUndefined()
  })

  it('apiJson은 content-type과 직렬화된 body를 보낸다', async () => {
    const fn = stubFetch(200, {})
    await apiJson('POST', '/api/x', { a: 1 })
    expect(fn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    })
  })
})
