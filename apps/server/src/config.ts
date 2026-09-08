import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  // PrismaClient가 process.env.DATABASE_URL을 직접 읽으므로 AppConfig로 넘기지 않는다.
  // 여기 남겨두는 이유는 값이 없을 때 부팅을 즉시 실패시키기 위해서다.
  DATABASE_URL: z.string().min(1),
  SESSION_KEY_HEX: z.string().regex(/^[0-9a-f]{64}$/),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),
  GOOGLE_DESKTOP_CLIENT_ID: z.string().min(1).optional(),
  ALLOWED_EMAILS: z.string().min(1),
  NODE_ENV: z.string().default('development'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26214400),
})

export interface AppConfig {
  port: number
  sessionKey: Buffer
  google: { clientId: string; clientSecret: string; callbackUrl: string; desktopClientId?: string }
  allowedEmails: string[]
  isProd: boolean
  uploadDir: string
  maxUploadBytes: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env)
  return {
    port: parsed.PORT,
    sessionKey: Buffer.from(parsed.SESSION_KEY_HEX, 'hex'),
    google: {
      clientId: parsed.GOOGLE_CLIENT_ID,
      clientSecret: parsed.GOOGLE_CLIENT_SECRET,
      callbackUrl: parsed.GOOGLE_CALLBACK_URL,
      desktopClientId: parsed.GOOGLE_DESKTOP_CLIENT_ID,
    },
    allowedEmails: parsed.ALLOWED_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    isProd: parsed.NODE_ENV === 'production',
    uploadDir: parsed.UPLOAD_DIR,
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
  }
}
