import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, type ServerOptions } from '../src/server.js';

interface SseFrame {
  event?: string;
  data?: string;
  comment?: string;
}

/** Opens `/events` and yields parsed SSE frames as they arrive. */
async function openEvents(baseUrl: string) {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/events`, { signal: controller.signal });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  async function nextFrame(timeoutMs = 1000): Promise<SseFrame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end !== -1) {
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const frame: SseFrame = {};
        for (const line of raw.split('\n')) {
          if (line.startsWith(':')) frame.comment = line.slice(1).trim();
          else if (line.startsWith('event:')) frame.event = line.slice(6).trim();
          else if (line.startsWith('data:')) frame.data = line.slice(5).trim();
        }
        return frame;
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('timed out waiting for SSE frame');
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out waiting for SSE frame')), left)),
      ]);
      if (chunk.done) throw new Error('SSE stream ended');
      buffer += chunk.value;
    }
  }

  /** Skips heartbeats and returns the next named event. */
  async function nextEvent(timeoutMs = 1000): Promise<{ event: string; data: unknown }> {
    for (;;) {
      const frame = await nextFrame(timeoutMs);
      if (frame.event) return { event: frame.event, data: JSON.parse(frame.data ?? 'null') };
    }
  }

  return { res, nextFrame, nextEvent, close: () => controller.abort() };
}

describe('GET /events', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  const streams: Array<{ close(): void }> = [];

  async function start(options: ServerOptions = {}) {
    app = buildServer(options);
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  }

  afterEach(async () => {
    streams.splice(0).forEach((s) => s.close());
    await app.close();
  });

  async function connect() {
    const stream = await openEvents(baseUrl);
    streams.push(stream);
    return stream;
  }

  it('pushes a change event for a store write', async () => {
    await start();
    const stream = await connect();
    expect(stream.res.status).toBe(200);
    expect(stream.res.headers.get('content-type')).toMatch(/^text\/event-stream/);

    app.store.update('graph', () => ({
      entity: 'user',
      action: 'created',
      id: 'u-1',
      summary: 'Sanne de Vries aangemaakt',
    }));

    const { event, data } = await stream.nextEvent(1000);
    expect(event).toBe('change');
    expect(data).toEqual({
      system: 'graph',
      entity: 'user',
      action: 'created',
      id: 'u-1',
      summary: 'Sanne de Vries aangemaakt',
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
    });
  });

  it('broadcasts an admin reset event after POST /admin/reset', async () => {
    await start();
    const stream = await connect();

    const res = await fetch(`${baseUrl}/admin/reset`, { method: 'POST' });
    expect(res.status).toBe(204);

    const { event, data } = await stream.nextEvent(1000);
    expect(event).toBe('change');
    expect(data).toMatchObject({ system: 'admin', action: 'reset' });
  });

  it('pushes an admin/request/created change for a logged mock API call (single emitter)', async () => {
    app = buildServer({ responseDelayMs: 0 });
    app.post('/v1.0/standIn', async (_req, reply) => reply.code(201).send({ id: 'u-1' }));
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    const stream = await connect();

    const res = await fetch(`${baseUrl}/v1.0/standIn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Sanne de Vries' }),
    });
    expect(res.status).toBe(201);

    const { event, data } = await stream.nextEvent(1000);
    expect(event).toBe('change');
    expect(data).toMatchObject({
      system: 'admin',
      entity: 'request',
      action: 'created',
      summary: expect.stringContaining('POST /v1.0/standIn 201'),
    });
  });

  it('sends a `: ping` heartbeat comment on the heartbeat interval', async () => {
    await start({ heartbeatMs: 50 });
    const stream = await connect();

    const comments: string[] = [];
    while (comments.length < 2) {
      const frame = await stream.nextFrame(500);
      if (frame.comment === 'ping') comments.push(frame.comment);
    }
    expect(comments).toEqual(['ping', 'ping']);
  });

  it('stops sending to a connection once it closes', async () => {
    await start();
    const stream = await connect();
    stream.close();

    // The server sees the disconnect asynchronously; poll instead of a fixed sleep (flaky under load).
    await expect.poll(() => app.store.emitter.listenerCount('change'), { timeout: 1000, interval: 10 }).toBe(0);
  });
});
