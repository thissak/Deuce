import { OAuth2Client } from 'google-auth-library'
import type { AppConfig } from '../config.js'

export interface GoogleProfile {
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

export function createGoogleCodeExchanger(config: AppConfig): GoogleCodeExchanger {
  return async (code) => {
    const client = newClient(config)
    const { tokens } = await client.getToken(code)
    if (!tokens.id_token) throw new Error('구글 응답에 id_token이 없습니다')
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.google.clientId,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) throw new Error('구글 프로필에 이메일이 없습니다')
    return {
      email: payload.email,
      name: payload.name ?? payload.email,
      avatarUrl: payload.picture ?? null,
    }
  }
}
