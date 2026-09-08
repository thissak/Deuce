declare const __DEUCE_APP_ORIGIN__: string
export const APP_ORIGIN = typeof __DEUCE_APP_ORIGIN__ === 'undefined' ? 'https://deuce.goldenlabs.dev' : __DEUCE_APP_ORIGIN__
export const WEBSOCKET_ORIGIN = APP_ORIGIN.replace(/^https:/, 'wss:')
export function trustedUrl(value: string, origin = APP_ORIGIN): boolean {
  try { const u = new URL(value); return u.origin === origin && !u.username && !u.password } catch { return false }
}
export function externalUrl(value: string): boolean {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password } catch { return false }
}
