import type { FastifyInstance } from 'fastify';
import { bonitaConfig } from '../bonita.js';
import type { Store } from '../store.js';
import { createOnboardingIncident, parseOnboardingForm } from './topdesk-onboarding.js';

export function adminRoutes(store: Store) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get('/admin/state', async () => ({
      ...store.get(),
      events: store.events,
      requests: store.requests,
      config: { bonitaEnabled: bonitaConfig().enabled },
    }));

    /**
     * The TOPdesk screen form (spec 4.6, callback A steps 1-2): creates the onboarding incident.
     * Ticket 29 starts the Bonita case here, after the incident exists, and adds `caseId` to the reply.
     */
    app.post('/admin/topdesk/onboarding', async (req, reply) => {
      const form = parseOnboardingForm(req.body);
      if (typeof form === 'string') return reply.code(400).send({ message: form });
      const result = createOnboardingIncident(store, form);
      if (!result.ok) return reply.code(result.status).send({ message: result.message });
      return reply.code(201).send({ incident: result.incident });
    });

    /** Newest first; `limit` defaults to 50 and is capped by the log size. */
    app.get<{ Querystring: { limit?: string } }>('/admin/requests', async (req) => {
      const parsed = Number.parseInt(req.query.limit ?? '', 10);
      const limit = Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
      return [...store.requests].reverse().slice(0, limit);
    });

    app.post('/admin/reset', async (_req, reply) => {
      store.reset();
      return reply.code(204).send();
    });
  };
}
