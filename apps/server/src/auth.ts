import { and, eq, gt } from 'drizzle-orm';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from 'jose';

import type { OidcConfig } from './config.js';
import type { Database } from './db/client.js';
import {
  channelMemberships,
  revokedOidcSessions,
  users,
} from './db/schema.js';

const allowedAlgorithms = ['RS256'] as const;
const backchannelLogoutEvent =
  'http://schemas.openid.net/event/backchannel-logout';

export class AuthenticationError extends Error {
  readonly code = 'unauthorized' as const;
}

export class AuthorizationError extends Error {
  readonly code = 'forbidden' as const;
}

export type AuthenticatedPrincipal = {
  userId: string;
  displayName: string;
  actorType: string;
  isAdmin: boolean;
  issuer: string;
  subject: string;
  sessionId: string;
  expiresAt: number;
};

export type RevokedSession = {
  issuer: string;
  sessionId: string;
};

export class AuthService {
  readonly #db: Database;
  readonly #config: OidcConfig;
  readonly #verificationKey: JWTVerifyGetKey;

  constructor(
    db: Database,
    config: OidcConfig,
    verificationKey: JWTVerifyGetKey = createRemoteJWKSet(
      new URL(config.jwksUrl),
    ),
  ) {
    this.#db = db;
    this.#config = config;
    this.#verificationKey = verificationKey;
  }

  async authenticateAccessToken(token: unknown): Promise<AuthenticatedPrincipal> {
    if (typeof token !== 'string' || token.length === 0) {
      throw new AuthenticationError();
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.#verificationKey, {
        algorithms: [...allowedAlgorithms],
        audience: this.#config.audience,
        issuer: this.#config.issuer,
      }));
    } catch {
      throw new AuthenticationError();
    }

    const subject = requiredClaim(payload.sub);
    const sessionId = requiredClaim(payload.sid);
    if (subject === null || sessionId === null || typeof payload.exp !== 'number') {
      throw new AuthenticationError();
    }

    const [user] = await this.#db
      .select({
        id: users.id,
        displayName: users.displayName,
        actorType: users.actorType,
        isAdmin: users.isAdmin,
        disabledAt: users.disabledAt,
      })
      .from(users)
      .where(
        and(
          eq(users.oidcIssuer, this.#config.issuer),
          eq(users.oidcSubject, subject),
        ),
      )
      .limit(1);

    if (!user || user.disabledAt !== null) {
      throw new AuthorizationError();
    }

    const principal: AuthenticatedPrincipal = {
      userId: user.id,
      displayName: user.displayName,
      actorType: user.actorType,
      isAdmin: user.isAdmin,
      issuer: this.#config.issuer,
      subject,
      sessionId,
      expiresAt: payload.exp,
    };

    await this.#assertSessionActive(principal);
    return principal;
  }

  async authorizeChannel(
    principal: AuthenticatedPrincipal,
    channelId: string,
  ): Promise<void> {
    if (principal.expiresAt * 1000 <= Date.now()) {
      throw new AuthenticationError();
    }

    await this.#assertSessionActive(principal);

    const [membership] = await this.#db
      .select({ disabledAt: users.disabledAt })
      .from(users)
      .innerJoin(
        channelMemberships,
        eq(channelMemberships.userId, users.id),
      )
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.oidcIssuer, principal.issuer),
          eq(users.oidcSubject, principal.subject),
          eq(channelMemberships.channelId, channelId),
        ),
      )
      .limit(1);

    if (!membership || membership.disabledAt !== null) {
      throw new AuthorizationError();
    }
  }

  async revokeSession(principal: AuthenticatedPrincipal): Promise<void> {
    await this.#storeRevokedSession(
      principal.issuer,
      principal.sessionId,
      new Date(principal.expiresAt * 1000),
    );
  }

  async processBackchannelLogout(token: unknown): Promise<RevokedSession> {
    if (typeof token !== 'string' || token.length === 0) {
      throw new AuthenticationError();
    }

    try {
      const { payload, protectedHeader } = await jwtVerify(
        token,
        this.#verificationKey,
        {
          algorithms: [...allowedAlgorithms],
          audience: this.#config.logoutAudience,
          issuer: this.#config.issuer,
        },
      );
      const events = payload.events;
      const sessionId = requiredClaim(payload.sid);
      const headerType = protectedHeader.typ?.toLowerCase();
      const nowInSeconds = Math.floor(Date.now() / 1000);

      if (
        headerType !== 'logout+jwt' ||
        sessionId === null ||
        typeof payload.iat !== 'number' ||
        payload.iat > nowInSeconds + 60 ||
        typeof payload.exp !== 'number' ||
        typeof payload.jti !== 'string' ||
        payload.jti.length === 0 ||
        payload.nonce !== undefined ||
        !isBackchannelLogoutEvents(events)
      ) {
        throw new AuthenticationError();
      }

      await this.#storeRevokedSession(
        this.#config.issuer,
        sessionId,
        new Date(
          Date.now() + this.#config.accessTokenMaxAgeSeconds * 1000,
        ),
      );
      return { issuer: this.#config.issuer, sessionId };
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError();
    }
  }

  async disableUser(userId: string): Promise<boolean> {
    const disabled = await this.#db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return disabled.length > 0;
  }

  async #assertSessionActive(
    principal: Pick<AuthenticatedPrincipal, 'issuer' | 'sessionId'>,
  ): Promise<void> {
    const [revoked] = await this.#db
      .select({ sessionId: revokedOidcSessions.oidcSessionId })
      .from(revokedOidcSessions)
      .where(
        and(
          eq(revokedOidcSessions.oidcIssuer, principal.issuer),
          eq(revokedOidcSessions.oidcSessionId, principal.sessionId),
          gt(revokedOidcSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (revoked) throw new AuthenticationError();
  }

  async #storeRevokedSession(
    issuer: string,
    sessionId: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.#db
      .insert(revokedOidcSessions)
      .values({ oidcIssuer: issuer, oidcSessionId: sessionId, expiresAt })
      .onConflictDoUpdate({
        target: [
          revokedOidcSessions.oidcIssuer,
          revokedOidcSessions.oidcSessionId,
        ],
        set: { expiresAt, revokedAt: new Date() },
      });
  }
}

export function bearerToken(authorization: unknown): string {
  if (typeof authorization !== 'string') throw new AuthenticationError();
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match?.[1]) throw new AuthenticationError();
  return match[1];
}

export function channelRoom(channelId: string): string {
  return `channel:${channelId}`;
}

export function sessionRoom(issuer: string, sessionId: string): string {
  return `session:${encodeURIComponent(issuer)}:${encodeURIComponent(sessionId)}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

function requiredClaim(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isBackchannelLogoutEvents(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const event = (value as Record<string, unknown>)[backchannelLogoutEvent];
  return typeof event === 'object' && event !== null && !Array.isArray(event);
}
