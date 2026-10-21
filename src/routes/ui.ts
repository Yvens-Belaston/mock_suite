import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Serves the built screens (`web/dist`) at `/ui/`. Paths with a file extension are files (404 when
 * missing); every other path gets `index.html` so the React router can pick the screen.
 */
export function uiRoutes(webDist: string) {
  return async function (app: FastifyInstance): Promise<void> {
    await app.register(fastifyStatic, { root: webDist, serve: false });

    app.get('/ui', (_req, reply) => reply.redirect('/ui/'));

    app.get('/ui/*', (req, reply) => {
      const path = (req.params as { '*': string })['*'];
      if (/\.[a-z0-9]+$/i.test(path)) return reply.sendFile(path);
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
  };
}
