import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { io as createSocket, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import type { Message } from '../src/messages.js';

const databaseUrl = process.env.DEUCE_TEST_DATABASE_URL;
const testDatabaseUrl = databaseUrl ?? '';

describe.skipIf(!databaseUrl)('first message vertical slice', () => {
  const sockets: Socket[] = [];
  let context: ReturnType<typeof createDatabase>;
  let app: ReturnType<typeof buildApp>;
  let serverUrl: string;

  beforeEach(async () => {
    assert(databaseUrl, 'DEUCE_TEST_DATABASE_URL is required');
    context = createDatabase(testDatabaseUrl);
    await context.pool.query('truncate table messages restart identity');
    app = buildApp({ ...context, logger: false });
    await app.listen({ host: '127.0.0.1', port: 0 });
    serverUrl = app.listeningOrigin;
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await app.close();
  });

  test('persists, broadcasts, deduplicates, and recovers messages', async () => {
    const alice = await connectAs('alice');
    const bob = await connectAs('bob');
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
    await expect.poll(() => receivedByBob.length).toBe(1);

    const duplicateAck = await alice.emitWithAck('message:send', payload);
    expect(duplicateAck.ok).toBe(true);
    expect(duplicateAck.message.id).toBe(firstAck.message.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receivedByBob).toHaveLength(1);

    const stored = await fetchMessages(0);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(firstAck.message.id);

    bob.disconnect();
    const secondAck = await alice.emitWithAck('message:send', {
      clientMessageId: randomUUID(),
      channelId: 'general',
      body: 'message sent while Bob was offline',
    });
    expect(secondAck.ok).toBe(true);

    const recovered = await fetchMessages(firstAck.message.sequence);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.id).toBe(secondAck.message.id);

    for (const socket of sockets.splice(0)) socket.disconnect();
    await app.close();

    context = createDatabase(testDatabaseUrl);
    app = buildApp({ ...context, logger: false });
    await app.listen({ host: '127.0.0.1', port: 0 });
    serverUrl = app.listeningOrigin;

    const afterRestart = await fetchMessages(0);
    expect(afterRestart).toHaveLength(2);
    const aliceAfterRestart = await connectAs('alice');
    const thirdAck = await aliceAfterRestart.emitWithAck('message:send', {
      clientMessageId: randomUUID(),
      channelId: 'general',
      body: 'message after server restart',
    });
    expect(thirdAck.message.sequence).toBe(secondAck.message.sequence + 1);
  });

  async function connectAs(userId: 'alice' | 'bob'): Promise<Socket> {
    const socket = createSocket(serverUrl, {
      auth: { userId },
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

  async function fetchMessages(afterSequence: number): Promise<Message[]> {
    const response = await fetch(
      `${serverUrl}/messages?channelId=general&afterSequence=${afterSequence}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: Message[] };
    return body.messages;
  }
});
