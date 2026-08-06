import { z } from 'zod';

const oidcUrlSchema = z.url().refine(isSecureOrLoopbackUrl, {
  message: 'OIDC URLs must use HTTPS, except for loopback development URLs',
});

const configSchema = z.object({
  DEUCE_DATABASE_URL: z.string().min(1),
  DEUCE_OIDC_ISSUER: oidcUrlSchema,
  DEUCE_OIDC_AUDIENCE: z.string().min(1),
  DEUCE_OIDC_JWKS_URL: oidcUrlSchema,
  DEUCE_OIDC_LOGOUT_AUDIENCE: z.string().min(1),
  DEUCE_OIDC_ACCESS_TOKEN_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .default(300),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3210),
});

export type OidcConfig = {
  issuer: string;
  audience: string;
  jwksUrl: string;
  logoutAudience: string;
  accessTokenMaxAgeSeconds: number;
};

export type ServerConfig = {
  databaseUrl: string;
  host: string;
  port: number;
  oidc: OidcConfig;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = configSchema.parse(environment);

  return {
    databaseUrl: parsed.DEUCE_DATABASE_URL,
    host: parsed.HOST,
    port: parsed.PORT,
    oidc: {
      issuer: parsed.DEUCE_OIDC_ISSUER,
      audience: parsed.DEUCE_OIDC_AUDIENCE,
      jwksUrl: parsed.DEUCE_OIDC_JWKS_URL,
      logoutAudience: parsed.DEUCE_OIDC_LOGOUT_AUDIENCE,
      accessTokenMaxAgeSeconds:
        parsed.DEUCE_OIDC_ACCESS_TOKEN_MAX_AGE_SECONDS,
    },
  };
}

function isSecureOrLoopbackUrl(value: string): boolean {
  const url = new URL(value);
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  );
}
