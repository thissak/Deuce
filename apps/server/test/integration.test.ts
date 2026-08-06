import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from 'jose';
import { io as createSocket, type Socket } from 'socket.io-client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest';

import { buildApp } from '../src/app.js';
import { AuthService } from '../src/auth.js';
import type { OidcConfig } from '../src/config.js';
import { createDatabase } from '../src/db/client.js';
import { channelMemberships, users } from '../src/db/schema.js';
import type { Message } from '../src/messages.js';

const databaseUrl = process.env.DEUCE_TEST_DATABASE_URL;
const testDatabaseUrl = databaseUrl ?? '';
const oidcConfig: OidcConfig = {
  issuer: 'https://auth.test/realms/deuce',
  audience: 'deuce-api',
  jwksUrl: 'https://auth.test/realms/deuce/certs',
  logoutAudience: 'deuce-windows',
  accessTokenMaxAgeSeconds: 300,
};
const backchannelLogoutEvent =
  'http://schemas.openid.net/event/backchannel-logout';

describe.skipIf(!databaseUrl)('authenticated message vertical slice', () => {
  const sockets: Socket[] = [];
  let context: ReturnType<typeof createDatabase>;
  let app: ReturnType<typeof buildApp>;
  let serverUrl: string;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let verificationKey: JWTVerifyGetKey;
  let aliceId: string;
  let bobId: string;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256');
    privateKey = keyPair.privateKey;
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'test-key';
    verificationKey = createLocalJWKSet({ keys: [publicJwk] });
  });

  beforeEach(async () => {
    assert(databaseUrl, 'DEUCE_TEST_DATABASE_URL is required');
    context = createDatabase(testDatabaseUrl);
    await context.pool.query(
      'truncate table revoked_oidc_sessions, channel_memberships, users, messages restart identity cascade',
    );

    const createdUsers = await context.db
      .insert(users)
      .values([
        {
          oidcIssuer: oidcConfig.issuer,
          oidcSubject: 'keycloak-alice',
          displayName: 'Alice',
          isAdmin: true,
        },
        {
          oidcIssuer: oidcConfig.issuer,
          oidcSubject: 'keycloak-bob',
          displayName: 'Bob',
        },
        {
          oidcIssuer: oidcConfig.issuer,
          oidcSubject: 'keycloak-outsider',
          displayName: 'Outsider',
        },
        {
          oidcIssuer: oidcConfig.issuer,
          oidcSubject: 'keycloak-disabled',
          displayName: 'Disabled',
          disabledAt: new Date(),
        },
      ])
      .returning({ id: users.id, subject: users.oidcSubject });

    aliceId = requiredUserId(createdUsers, 'keycloak-alice');
    bobId = requiredUserId(createdUsers, 'keycloak-bob');
    await context.db.insert(channelMemberships).values([
      { userId: aliceId, channelId: 'general' },
      { userId: bobId, channelId: 'general' },
    ]);

    await startApp();
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await app.close();
  });

  test('persists, broadcasts, deduplicates, and recovers authorized messages', async () => {
    const aliceToken = await signAccessToken('keycloak-alice', 'alice-session');
    const bobToken = await signAccessToken('keycloak-bob', 'bob-session');
    const alice = await connectWithToken(aliceToken);
    const bob = await connectWithToken(bobToken);
    const receivedByBob: Message[] = [];
    bob.on('message:created', (message: Message) => receivedByBob.push(message));

    const payload = {
      clientMessageId: randomUUID(),
      channelId: 'general',
      body: 'first message',
    };

    const firstAck = await alice.emitWithAck('message:send', payload);
    expect(firstAck.ok).toBe(true);
    expect(firstAck.message.body).toBe(payload.body);
    expect(firstAck.message.authorId).toBe(aliceId);
    await expect.poll(() => receivedByBob.length).toBe(1);

    const duplicateAck = await alice.emitWithAck('message:send', payload);
    expect(duplicateAck.ok).toBe(true);
    expect(duplicateAck.message.id).toBe(firstAck.message.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receivedByBob).toHaveLength(1);

    const stored = await fetchMessages(0, aliceToken);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(firstAck.message.id);

    bob.disconnect();
    const secondAck = await alice.emitWithAck('message:send', {
      clientMessageId: randomUUID(),
      channelId: 'general',
      body: 'message sent while Bob was offline',
    });
    expect(secondAck.ok).toBe(true);

    const recovered = await fetchMessages(
      firstAck.message.sequence,
      bobToken,
    );
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.id).toBe(secondAck.message.id);

    for (const socket of sockets.splice(0)) socket.disconnect();
    await app.close();
    context = createDatabase(testDatabaseUrl);
    await startApp();

    const afterRestart = await fetchMessages(0, aliceToken);
    expect(afterRestart).toHaveLength(2);
    const aliceAfterRestart = await connectWithToken(aliceToken);
    const thirdAck = await aliceAfterRestart.emitWithAck('message:send', {
      clientMessageId: randomUUID(),
      channelId: 'general',
      body: 'message after server restart',
    });
    expect(thirdAck.message.sequence).toBe(secondAck.message.sequence + 1);
  });

  test('rejects missing, invalid, unknown, disabled, and non-member identities', async () => {
    expect((await fetch(`${serverUrl}/messages`)).status).toBe(401);

    const wrongAudience = await signAccessToken(
      'keycloak-alice',
      'wrong-audience',
      'another-api',
    );
    expect((await authorizedFetch('/messages', wrongAudience)).status).toBe(401);

    const wrongIssuer = await signAccessToken(
      'keycloak-alice',
      'wrong-issuer',
      oidcConfig.audience,
      '5m',
      'https://another-issuer.test/realms/deuce',
    );
    expect((await authorizedFetch('/messages', wrongIssuer)).status).toBe(401);

    const expired = await signAccessToken(
      'keycloak-alice',
      'expired-session',
      oidcConfig.audience,
      Math.floor(Date.now() / 1000) - 1,
    );
    expect((await authorizedFetch('/messages', expired)).status).toBe(401);

    const unknown = await signAccessToken('not-linked', 'unknown-session');
    expect((await authorizedFetch('/messages', unknown)).status).toBe(403);

    const disabled = await signAccessToken(
      'keycloak-disabled',
      'disabled-session',
    );
    expect((await authorizedFetch('/messages', disabled)).status).toBe(403);

    const outsider = await signAccessToken(
      'keycloak-outsider',
      'outsider-session',
    );
    expect((await authorizedFetch('/messages', outsider)).status).toBe(403);

    const invalidSocket = createSocket(serverUrl, {
      auth: { accessToken: wrongAudience },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(invalidSocket);
    const connectionError = await new Promise<Error>((resolve) => {
      invalidSocket.once('connect_error', resolve);
    });
    expect(connectionError.message).toBe('unauthorized');
  });

  test('rechecks membership for every command and disconnects revoked access', async () => {
    const bobToken = await signAccessToken('keycloak-bob', 'bob-membership');
    const bob = await connectWithToken(bobToken);

    await context.db.delete(channelMemberships);
    const ack = await bob.emitWithAck('message:send', {
      clientMessageId: randomUUID(),
      channelId: 'general',
      body: 'must be rejected',
    });

    expect(ack).toEqual({ ok: false, error: 'forbidden' });
    await expect.poll(() => bob.connected).toBe(false);
  });

  test('local logout revokes the session and disconnects its socket', async () => {
    const token = await signAccessToken('keycloak-alice', 'local-logout');
    const alice = await connectWithToken(token);

    const response = await authorizedFetch('/auth/logout', token, {
      method: 'POST',
    });
    expect(response.status).toBe(204);
    await expect.poll(() => alice.connected).toBe(false);
    expect((await authorizedFetch('/messages', token)).status).toBe(401);
  });

  test('back-channel logout revokes the session and disconnects its socket', async () => {
    const token = await signAccessToken('keycloak-bob', 'backchannel-logout');
    const bob = await connectWithToken(token);
    const logoutToken = await signLogoutToken('backchannel-logout');

    const response = await fetch(`${serverUrl}/auth/backchannel-logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ logout_token: logoutToken }),
    });
    expect(response.status).toBe(204);
    await expect.poll(() => bob.connected).toBe(false);
    expect((await authorizedFetch('/messages', token)).status).toBe(401);

    const invalidResponse = await fetch(
      `${serverUrl}/auth/backchannel-logout`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          logout_token: await signAccessToken(
            'keycloak-bob',
            'not-a-logout-token',
            oidcConfig.logoutAudience,
          ),
        }),
      },
    );
    expect(invalidResponse.status).toBe(400);
  });

  test('an admin can locally disable a user and disconnect every user socket', async () => {
    const adminToken = await signAccessToken('keycloak-alice', 'admin-session');
    const bobToken = await signAccessToken('keycloak-bob', 'disabled-by-admin');
    const bob = await connectWithToken(bobToken);

    const response = await authorizedFetch(
      `/admin/users/${bobId}/disable`,
      adminToken,
      { method: 'POST' },
    );
    expect(response.status).toBe(204);
    await expect.poll(() => bob.connected).toBe(false);
    expect((await authorizedFetch('/messages', bobToken)).status).toBe(403);
  });

  async function startApp(): Promise<void> {
    const auth = new AuthService(context.db, oidcConfig, verificationKey);
    app = buildApp({ ...context, auth, logger: false });
    await app.listen({ host: '127.0.0.1', port: 0 });
    serverUrl = app.listeningOrigin;
  }

  async function connectWithToken(accessToken: string): Promise<Socket> {
    const socket = createSocket(serverUrl, {
      auth: { accessToken },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);

    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  async function fetchMessages(
    afterSequence: number,
    accessToken: string,
  ): Promise<Message[]> {
    const response = await authorizedFetch(
      `/messages?channelId=general&afterSequence=${afterSequence}`,
      accessToken,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: Message[] };
    return body.messages;
  }

  function authorizedFetch(
    path: string,
    accessToken: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return fetch(`${serverUrl}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${accessToken}` },
    });
  }

  function signAccessToken(
    subject: string,
    sessionId: string,
    audience = oidcConfig.audience,
    expirationTime: number | string | Date = '5m',
    issuer = oidcConfig.issuer,
  ): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime(expirationTime)
      .sign(privateKey);
  }

  function signLogoutToken(sessionId: string): Promise<string> {
    return new SignJWT({
      sid: sessionId,
      events: { [backchannelLogoutEvent]: {} },
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'logout+jwt' })
      .setIssuer(oidcConfig.issuer)
      .setAudience(oidcConfig.logoutAudience)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(privateKey);
  }
});

function requiredUserId(
  rows: Array<{ id: string; subject: string }>,
  subject: string,
): string {
  const row = rows.find((candidate) => candidate.subject === subject);
  assert(row, `Missing test user: ${subject}`);
  return row.id;
}
