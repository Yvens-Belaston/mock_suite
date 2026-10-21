import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

export interface StubCall {
  method: string;
  url: string;
  headers: FastifyRequest['headers'];
  body: unknown;
}

export interface BonitaStub {
  /** Base URL to use as BONITA_URL, e.g. http://127.0.0.1:12345/bonita */
  url: string;
  /** Every request the stub received (login included), in order. */
  calls: StubCall[];
  /** Number of successful POST /loginservice calls. */
  logins: () => number;
  /** Drop the current session so the next API call gets 401 (simulates a Bonita restart). */
  expireSession: () => void;
  close: () => Promise<void>;
}

export interface BonitaStubOptions {
  user?: string;
  password?: string;
  /** Register extra routes before the stub starts listening, e.g. app.get('/bonita/API/bpm/process', ...). */
  routes?: (app: FastifyInstance) => void;
}

/**
 * Tiny fake Bonita for tests.
 * - POST /bonita/loginservice: form username/password/redirect=false -> 204 + JSESSIONID and X-Bonita-API-Token cookies.
 * - /bonita/API/*: 401 unless both cookies and the X-Bonita-API-Token header match the current session.
 * - Built-in route: GET /bonita/API/system/session/unusedid -> 200 { user_name }.
 */
export async function startBonitaStub(opts: BonitaStubOptions = {}): Promise<BonitaStub> {
  const user = opts.user ?? 'walter.bates';
  const password = opts.password ?? 'bpm';
  const app = Fastify({ logger: false });
  const calls: StubCall[] = [];
  let logins = 0;
  let session: { id: string; token: string } | undefined;

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  app.addHook('preValidation', async (req) => {
    calls.push({ method: req.method, url: req.url, headers: req.headers, body: req.body });
  });

  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/bonita/API/')) return;
    const cookie = req.headers.cookie ?? '';
    const ok =
      session !== undefined &&
      cookie.includes(`JSESSIONID=${session.id}`) &&
      cookie.includes(`X-Bonita-API-Token=${session.token}`) &&
      req.headers['x-bonita-api-token'] === session.token;
    if (!ok) return reply.code(401).send({ message: 'unauthorized' });
  });

  app.post('/bonita/loginservice', async (req, reply) => {
    const form = (req.body ?? {}) as Record<string, string>;
    if (form.username !== user || form.password !== password || form.redirect !== 'false') {
      return reply.code(401).send();
    }
    logins += 1;
    session = { id: `sess-${logins}`, token: `token-${logins}` };
    reply.header('set-cookie', [
      `JSESSIONID=${session.id}; Path=/bonita; HttpOnly`,
      `X-Bonita-API-Token=${session.token}; Path=/bonita`,
    ]);
    return reply.code(204).send();
  });

  app.get('/bonita/API/system/session/unusedid', async () => ({ user_name: user }));

  opts.routes?.(app);

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}/bonita`,
    calls,
    logins: () => logins,
    expireSession: () => {
      session = undefined;
    },
    close: () => app.close(),
  };
}
