import { OAuth2Client, type TokenPayload } from 'google-auth-library'
import type { AppConfig } from '../config.js'

export interface GoogleProfile {
  sub: string
  email: string
  name: string
  avatarUrl: string | null
}

export type GoogleCodeExchanger = (code: string) => Promise<GoogleProfile>

function newClient(config: AppConfig): OAuth2Client {
  return new OAuth2Client(
    config.google.clientId,
    config.google.clientSecret,
    config.google.callbackUrl,
  )
}

export function createAuthUrl(config: AppConfig, state: string): string {
  return newClient(config).generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
  })
}

export function profileFromIdTokenPayload(payload: TokenPayload | undefined): GoogleProfile {
  if (!payload?.email) throw new Error('구글 프로필에 이메일이 없습니다')
  if (payload.email_verified !== true) throw new Error('구글 이메일이 인증되지 않았습니다')
  if (!payload.sub) throw new Error('구글 계정 식별자가 없습니다')
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    avatarUrl: payload.picture ?? null,
  }
}

export function createGoogleCodeExchanger(config: AppConfig): GoogleCodeExchanger {
  return async (code) => {
    const client = newClient(config)
    const { tokens } = await client.getToken(code)
    if (!tokens.id_token) throw new Error('구글 응답에 id_token이 없습니다')
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.google.clientId,
    })
    return profileFromIdTokenPayload(ticket.getPayload())
  }
}

export type GoogleIdTokenVerifier = (idToken: string) => Promise<GoogleProfile>

export function createDesktopTokenVerifier(config: AppConfig): GoogleIdTokenVerifier {
  const client = new OAuth2Client()
  client.transporter.defaults.timeout = 20_000
  return async (idToken) => {
    if (!config.google.desktopClientId) throw new Error('Desktop login is not configured')
    const ticket = await client.verifyIdToken({ idToken, audience: config.google.desktopClientId })
    return profileFromIdTokenPayload(ticket.getPayload())
  }
}
