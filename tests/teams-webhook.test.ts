import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

interface TeamsMessage {
  id: string;
  channelId: string;
  receivedAt: string;
  payload: unknown;
}

const escalationCard = {
  type: 'message',
  attachments: [
    {
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        type: 'AdaptiveCard',
        version: '1.5',
        body: [{ type: 'TextBlock', text: '⚠️ Taak verlopen: werkplek inrichten', weight: 'Bolder' }],
      },
    },
  ],
};

describe('Teams Workflows webhook', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function messages(channelId: string): Promise<TeamsMessage[]> {
    const res = await request(app.server).get('/admin/state');
    return (res.body.teams.messages as TeamsMessage[]).filter((m) => m.channelId === channelId);
  }

  it('stores an Adaptive Card post as a raw message and answers 202 with an empty body', async () => {
    const before = await messages('facilities');
    const res = await request(app.server).post('/teams/hook/facilities').send(escalationCard);
    expect(res.status).toBe(202);
    expect(res.text).toBe('');

    const after = await messages('facilities');
    expect(after).toHaveLength(before.length + 1);
    const stored = after[after.length - 1];
    expect(stored.payload).toEqual(escalationCard);
    expect(stored.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Number.isNaN(Date.parse(stored.receivedAt))).toBe(false);
  });

  it('accepts a legacy MessageCard', async () => {
    const card = { '@type': 'MessageCard', '@context': 'http://schema.org/extensions', summary: 'Test', text: 'Hallo' };
    const res = await request(app.server).post('/teams/hook/servicedesk').send(card);
    expect(res.status).toBe(202);
    expect((await messages('servicedesk')).at(-1)?.payload).toEqual(card);
  });

  it('accepts plain text and ignores an Authorization: Bearer header', async () => {
    const res = await request(app.server)
      .post('/teams/hook/algemeen')
      .set('Authorization', 'Bearer eyJ-any-token')
      .send({ text: 'Goedemorgen' });
    expect(res.status).toBe(202);
    expect((await messages('algemeen')).at(-1)?.payload).toEqual({ text: 'Goedemorgen' });
  });

  it('answers 404 for an unknown channel and stores nothing', async () => {
    const before = (await request(app.server).get('/admin/state')).body.teams.messages.length;
    const res = await request(app.server).post('/teams/hook/bestaat-niet').send({ text: 'Hallo' });
    expect(res.status).toBe(404);
    expect((await request(app.server).get('/admin/state')).body.teams.messages).toHaveLength(before);
  });

  it.each([
    ['an unrelated object', { foo: 'bar' }],
    ['a message without an Adaptive Card attachment', { type: 'message', attachments: [{ contentType: 'text/html' }] }],
    ['an array', [1, 2]],
  ])('answers 400 for %s and stores nothing', async (_label, body) => {
    const before = (await messages('facilities')).length;
    const res = await request(app.server).post('/teams/hook/facilities').send(body);
    expect(res.status).toBe(400);
    expect(await messages('facilities')).toHaveLength(before);
  });

  it('seeds two older messages per channel', async () => {
    const state = (await request(app.server).get('/admin/state')).body.teams;
    for (const channel of state.channels as { id: string }[]) {
      expect(await messages(channel.id)).toHaveLength(2);
    }
  });
});
