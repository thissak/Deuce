import { describe, expect, test } from 'vitest';

import { loadConfig } from '../src/config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  DEUCE_DATABASE_URL: 'postgresql://deuce:secret@127.0.0.1:5432/deuce',
  DEUCE_OIDC_ISSUER: 'https://auth.example.com/realms/deuce',
  DEUCE_OIDC_AUDIENCE: 'deuce-api',
  DEUCE_OIDC_JWKS_URL:
    'https://auth.example.com/realms/deuce/protocol/openid-connect/certs',
  DEUCE_OIDC_LOGOUT_AUDIENCE: 'deuce-windows',
};

describe('server configuration', () => {
  test('loads fixed OIDC verification boundaries', () => {
    const config = loadConfig(validEnvironment);

    expect(config.host).toBe('127.0.0.1');
    expect(config.oidc).toEqual({
      issuer: validEnvironment.DEUCE_OIDC_ISSUER,
      audience: 'deuce-api',
      jwksUrl: validEnvironment.DEUCE_OIDC_JWKS_URL,
      logoutAudience: 'deuce-windows',
      accessTokenMaxAgeSeconds: 300,
    });
  });

  test('rejects plaintext non-loopback OIDC endpoints', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        DEUCE_OIDC_ISSUER: 'http://auth.example.com/realms/deuce',
      }),
    ).toThrow();
  });
});
