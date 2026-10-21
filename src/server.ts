import Fastify, { type FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook('onResponse', async (req, reply) => {
    const path = req.url.split('?')[0];
    const ms = Math.round(reply.elapsedTime);
    process.stdout.write(`${req.method} ${path} ${reply.statusCode} · ${ms} ms\n`);
  });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  const app = buildServer();
  app.listen({ port, host: '0.0.0.0' }).then(
    () => process.stdout.write(`mock-suite listening on http://localhost:${port}\n`),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
