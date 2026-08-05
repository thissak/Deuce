import Fastify, { type FastifyInstance } from 'fastify';
import { Server as SocketServer } from 'socket.io';
import type pg from 'pg';
import { ZodError } from 'zod';

import type { Database } from './db/client.js';
import {
  channelId,
  devUserSchema,
  listMessages,
  messageQuerySchema,
  sendMessageSchema,
  storeMessage,
} from './messages.js';

type BuildAppOptions = {
  db: Database;
  pool: pg.Pool;
  logger?: boolean;
};

export function buildApp({ db, pool, logger = true }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger });
  const io = new SocketServer(app.server, {
    transports: ['websocket'],
    serveClient: false,
  });

  app.get('/health', async () => {
    await pool.query('select 1');
    return { ok: true };
  });

  app.get('/messages', async (request, reply) => {
    try {
      const query = messageQuerySchema.parse(request.query);
      return { messages: await listMessages(db, query.afterSequence) };
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: 'invalid_query' });
      }
      throw error;
    }
  });

  io.use((socket, next) => {
    const parsed = devUserSchema.safeParse(socket.handshake.auth.userId);
    if (!parsed.success) {
      next(new Error('invalid_dev_user'));
      return;
    }

    socket.data.userId = parsed.data;
    next();
  });

  io.on('connection', (socket) => {
    void socket.join(channelId);

    socket.on('message:send', async (payload, acknowledge) => {
      const ack = typeof acknowledge === 'function' ? acknowledge : () => undefined;

      try {
        const input = sendMessageSchema.parse(payload);
        const stored = await storeMessage(db, socket.data.userId as string, input);

        if (stored.inserted) {
          io.to(channelId).emit('message:created', stored.message);
        }
        ack({ ok: true, message: stored.message });
      } catch (error) {
        const errorCode = error instanceof ZodError ? 'invalid_message' : 'store_failed';
        app.log.error(error, 'message:send failed');
        ack({ ok: false, error: errorCode });
      }
    });
  });

  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await pool.end();
  });

  return app;
}
