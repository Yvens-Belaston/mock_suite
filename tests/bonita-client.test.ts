import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bonitaFetch, createBonitaClient, resetBonitaClient } from '../src/bonita.js';
import { startBonitaStub, type BonitaStub } from './helpers/bonita-stub.js';

const SESSION = '/API/system/session/unusedid';

describe('Bonita client', () => {
  let stub: BonitaStub;

  beforeEach(async () => {
    stub = await startBonitaStub();
  });

  afterEach(async () => {
    await stub.close();
  });

  it('logs in once and reuses the session for two calls', async () => {
    const client = createBonitaClient({ url: stub.url, user: 'walter.bates', password: 'bpm' });

    const first = await client.fetch(SESSION);
    const second = await client.fetch(SESSION);

    expect(first.status).toBe(200);
    expect(await second.json()).toEqual({ user_name: 'walter.bates' });
    expect(stub.logins()).toBe(1);
  });

  it('logs in again once after a 401 and the call succeeds', async () => {
    const client = createBonitaClient({ url: stub.url, user: 'walter.bates', password: 'bpm' });
    await client.fetch(SESSION);

    stub.expireSession();
    const res = await client.fetch(SESSION);

    expect(res.status).toBe(200);
    expect(stub.logins()).toBe(2);
  });

  it('returns the 401 when Bonita still refuses after the re-login', async () => {
    const refusing = await startBonitaStub({
      routes: (app) => app.get('/bonita/API/always-401', async (_req, reply) => reply.code(401).send()),
    });
    try {
      const client = createBonitaClient({ url: refusing.url, user: 'walter.bates', password: 'bpm' });

      const res = await client.fetch('/API/always-401');

      expect(res.status).toBe(401);
      expect(refusing.logins()).toBe(2);
    } finally {
      await refusing.close();
    }
  });

  describe('bonitaFetch (configured from the environment)', () => {
    const saved = { ...process.env };

    afterEach(() => {
      process.env = { ...saved };
      resetBonitaClient();
    });

    it('uses BONITA_URL, BONITA_USER and BONITA_PASSWORD', async () => {
      const custom = await startBonitaStub({ user: 'helen.kelly', password: 'secret' });
      try {
        process.env.BONITA_URL = custom.url;
        process.env.BONITA_USER = 'helen.kelly';
        process.env.BONITA_PASSWORD = 'secret';

        const res = await bonitaFetch(SESSION);

        expect(await res.json()).toEqual({ user_name: 'helen.kelly' });
      } finally {
        await custom.close();
      }
    });

    it('refuses to call Bonita when BONITA_ENABLED=false', async () => {
      process.env.BONITA_URL = stub.url;
      process.env.BONITA_ENABLED = 'false';

      await expect(bonitaFetch(SESSION)).rejects.toThrow(/disabled/);
      expect(stub.calls).toHaveLength(0);
    });
  });
});
