import { describe, expect, it } from 'vitest'
import type { TokenPayload } from 'google-auth-library'
import { profileFromIdTokenPayload } from '../src/auth/google.js'

function payload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    iss: 'https://accounts.google.com',
    sub: 'sub-123',
    aud: 'client-id',
    iat: 0,
    exp: 0,
    email: 'a@goldenlabs.dev',
    email_verified: true,
    name: '테스터',
    picture: 'https://example.com/a.png',
    ...overrides,
  }
}

describe('profileFromIdTokenPayload', () => {
  it('maps a verified payload to a profile', () => {
    const profile = profileFromIdTokenPayload(payload())
    expect(profile).toEqual({
      sub: 'sub-123',
      email: 'a@goldenlabs.dev',
      name: '테스터',
      avatarUrl: 'https://example.com/a.png',
    })
  })

  it('falls back to email when name is missing', () => {
    const profile = profileFromIdTokenPayload(payload({ name: undefined }))
    expect(profile.name).toBe('a@goldenlabs.dev')
  })

  it('falls back to null avatarUrl when picture is missing', () => {
    const profile = profileFromIdTokenPayload(payload({ picture: undefined }))
    expect(profile.avatarUrl).toBeNull()
  })

  it('throws when email_verified is false', () => {
    expect(() => profileFromIdTokenPayload(payload({ email_verified: false }))).toThrow()
  })

  it('throws when email_verified is missing', () => {
    expect(() => profileFromIdTokenPayload(payload({ email_verified: undefined }))).toThrow()
  })

  it('throws when email is missing', () => {
    expect(() => profileFromIdTokenPayload(payload({ email: undefined }))).toThrow()
  })

  it('throws when payload itself is undefined', () => {
    expect(() => profileFromIdTokenPayload(undefined)).toThrow()
  })
})
