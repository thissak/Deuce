declare module '@fastify/secure-session' {
  interface SessionData {
    userId: string
    oauthState: string
  }
}

export {}
