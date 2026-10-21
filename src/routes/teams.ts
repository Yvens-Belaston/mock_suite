import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Store } from '../store.js';

export interface TeamsChannel {
  id: string;
  name: string;
}

export interface TeamsMessage {
  id: string;
  channelId: string;
  receivedAt: string;
  /** Raw JSON as Bonita posted it. */
  payload: unknown;
}

const ADAPTIVE_CARD = 'application/vnd.microsoft.card.adaptive';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Adaptive Card wrapper, legacy `@type: MessageCard`, or plain `{"text": "..."}`. */
export function isTeamsPayload(body: unknown): boolean {
  if (!isObject(body)) return false;
  if (body['@type'] === 'MessageCard') return true;
  if (typeof body.text === 'string') return true;
  return (
    body.type === 'message' &&
    Array.isArray(body.attachments) &&
    body.attachments.some((a) => isObject(a) && a.contentType === ADAPTIVE_CARD && isObject(a.content))
  );
}

/** Teams Workflows webhook (spec 4.5). No auth: any `Authorization` header is ignored. */
export function teamsRoutes(store: Store) {
  return async function (app: FastifyInstance): Promise<void> {
    app.post<{ Params: { channel: string } }>('/teams/hook/:channel', async (req, reply) => {
      const channel = (store.get().teams.channels as TeamsChannel[]).find((c) => c.id === req.params.channel);
      if (!channel) return reply.code(404).send();
      if (!isTeamsPayload(req.body)) {
        return reply.code(400).send({
          error: {
            code: 'InvalidRequestContent',
            message: 'Expected an Adaptive Card message, a MessageCard or {"text": "..."}.',
          },
        });
      }

      const message: TeamsMessage = {
        id: randomUUID(),
        channelId: channel.id,
        receivedAt: new Date().toISOString(),
        payload: req.body,
      };
      store.update('teams', (t) => {
        (t.messages as TeamsMessage[]).push(message);
        return { entity: 'message', action: 'created', id: message.id, summary: `Bericht in ${channel.name}` };
      });
      return reply.code(202).send();
    });
  };
}
