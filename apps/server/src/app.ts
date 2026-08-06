import formbody from '@fastify/formbody';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { Server as SocketServer } from 'socket.io';
import type pg from 'pg';
import { z, ZodError } from 'zod';

import {
  AuthenticationError,
  AuthorizationError,
  type AuthenticatedPrincipal,
  type AuthService,
  bearerToken,
  channelRoom,
  sessionRoom,
  userRoom,
} from './auth.js';
import type { Database } from './db/client.js';
import {
  channelId,
  listMessages,
  messageQuerySchema,
  sendMessageSchema,
  storeMessage,
} from './messages.js';

type BuildAppOptions = {
  db: Database;
  pool: pg.Pool;
  auth: AuthService;
  logger?: boolean;
};

const backchannelLogoutSchema = z.object({
  logout_token: z.string().min(1),
});

const userParamsSchema = z.object({
  userId: z.uuid(),
});

export function buildApp({
  db,
  pool,
  auth,
  logger = true,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: logger
      ? {
          redact: {
            paths: [
              'req.headers.authorization',
              'req.body.accessToken',
              'req.body.logout_token',
            ],
            censor: '[REDACTED]',
          },
        }
      : false,
  });
  const io = new SocketServer(app.server, {
    transports: ['websocket'],
    serveClient: false,
  });

  void app.register(formbody);

  app.get('/health', async () => {
    await pool.query('select 1');
    return { ok: true };
  });

  app.get('/me', async (request, reply) => {
    const principal = await authenticateHttp(auth, request, reply);
    if (!principal) return;

    return {
      id: principal.userId,
      displayName: principal.displayName,
      actorType: principal.actorType,
    };
  });

  app.get('/messages', async (request, reply) => {
    const principal = await authenticateHttp(auth, request, reply);
    if (!principal) return;

    try {
      const query = messageQuerySchema.parse(request.query);
      await auth.authorizeChannel(principal, query.channelId);
      return { messages: await listMessages(db, query.afterSequence) };
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: 'invalid_query' });
      }
      if (sendHttpAuthError(reply, error)) return;
      throw error;
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    const principal = await authenticateHttp(auth, request, reply);
    if (!principal) return;

    await auth.revokeSession(principal);
    io.in(sessionRoom(principal.issuer, principal.sessionId)).disconnectSockets(
      true,
    );
    return reply.code(204).send();
  });

  app.post('/auth/backchannel-logout', async (request, reply) => {
    try {
      const input = backchannelLogoutSchema.parse(request.body);
      const revoked = await auth.processBackchannelLogout(input.logout_token);
      io.in(sessionRoom(revoked.issuer, revoked.sessionId)).disconnectSockets(
        true,
      );
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof ZodError || error instanceof AuthenticationError) {
        return reply.code(400).send({ error: 'invalid_logout_token' });
      }
      throw error;
    }
  });

  app.post('/admin/users/:userId/disable', async (request, reply) => {
    const principal = await authenticateHttp(auth, request, reply);
    if (!principal) return;
    if (!principal.isAdmin) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    try {
      const { userId } = userParamsSchema.parse(request.params);
      if (!(await auth.disableUser(userId))) {
        return reply.code(404).send({ error: 'user_not_found' });
      }
      io.in(userRoom(userId)).disconnectSockets(true);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: 'invalid_user' });
      }
      throw error;
    }
  });

  io.use(async (socket, next) => {
    try {
      const principal = await auth.authenticateAccessToken(
        socket.handshake.auth.accessToken,
      );
      await auth.authorizeChannel(principal, channelId);
      socket.data.principal = principal;
      next();
    } catch (error) {
      const code = authErrorCode(error);
      if (code) {
        next(new Error(code));
        return;
      }
      app.log.error(error, 'socket authentication failed');
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const principal = socket.data.principal as AuthenticatedPrincipal;
    void socket.join([
      channelRoom(channelId),
      sessionRoom(principal.issuer, principal.sessionId),
      userRoom(principal.userId),
    ]);

    const expiresInMilliseconds = Math.max(
      0,
      principal.expiresAt * 1000 - Date.now(),
    );
    const expiryTimer = setTimeout(
      () => socket.conn.close(),
      Math.min(expiresInMilliseconds, 2_147_483_647),
    );
    socket.once('disconnect', () => clearTimeout(expiryTimer));

    socket.on('message:send', async (payload, acknowledge) => {
      const ack = typeof acknowledge === 'function' ? acknowledge : () => undefined;

      try {
        const input = sendMessageSchema.parse(payload);
        await auth.authorizeChannel(principal, input.channelId);
        const stored = await storeMessage(
          db,
          principal.userId,
          principal.displayName,
          input,
        );

        if (stored.inserted) {
          io.to(channelRoom(channelId)).emit('message:created', stored.message);
        }
        ack({ ok: true, message: stored.message });
      } catch (error) {
        if (error instanceof ZodError) {
          ack({ ok: false, error: 'invalid_message' });
          return;
        }

        const code = authErrorCode(error);
        if (code) {
          ack({ ok: false, error: code });
          socket.disconnect(true);
          return;
        }

        app.log.error(error, 'message:send failed');
        ack({ ok: false, error: 'store_failed' });
      }
    });
  });

  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await pool.end();
  });

  return app;
}

async function authenticateHttp(
  auth: AuthService,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthenticatedPrincipal | null> {
  try {
    return await auth.authenticateAccessToken(
      bearerToken(request.headers.authorization),
    );
  } catch (error) {
    if (sendHttpAuthError(reply, error)) return null;
    throw error;
  }
}

function sendHttpAuthError(reply: FastifyReply, error: unknown): boolean {
  const code = authErrorCode(error);
  if (!code) return false;
  void reply.code(code === 'unauthorized' ? 401 : 403).send({ error: code });
  return true;
}

function authErrorCode(error: unknown): 'unauthorized' | 'forbidden' | null {
  if (error instanceof AuthenticationError) return error.code;
  if (error instanceof AuthorizationError) return error.code;
  return null;
}
