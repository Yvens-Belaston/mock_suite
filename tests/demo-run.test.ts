import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

const run = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../scripts/demo-run.sh', import.meta.url));
const AUTH = { authorization: 'Bearer mock-token' };
const SANNE_UPN = 'sanne.devries@demo-amsterdam.onmicrosoft.com';
const PIETER = '7d2f0c1a-0001-4b6e-9c3d-000000000001';
const M365_E3 = '05e9a617-0261-4cee-bb44-138d3ef5d965';

let app: FastifyInstance;
let base: string;

beforeAll(async () => {
  app = buildServer({ responseDelayMs: 0 });
  // Port 0: the OS picks a free port, so parallel worktrees never collide.
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app.close();
});

async function graph(path: string) {
  const res = await fetch(`${base}${path}`, { headers: AUTH });
  return res.json();
}

describe('scripts/demo-run.sh (Entra part)', () => {
  it('onboards Sanne de Vries and then runs the Graph offboarding, exiting 0', async () => {
    const { stdout } = await run('bash', [SCRIPT], { env: { ...process.env, BASE: base, PAUSE: '0' } });
    expect(stdout).toContain('offboarding');

    const sanne = await graph(`/v1.0/users/${SANNE_UPN}?$select=id,displayName,accountEnabled,assignedLicenses`);
    expect(sanne.displayName).toBe('Sanne de Vries');
    expect(sanne.accountEnabled).toBe(false);
    expect(sanne.assignedLicenses).toEqual([{ skuId: M365_E3 }]);

    // Joined GG-Digitalisering and GG-VPN-Gebruikers; offboarding removed VPN.
    const memberOf = await graph(`/v1.0/users/${sanne.id}/memberOf`);
    expect(memberOf.value.map((g: { displayName: string }) => g.displayName)).toEqual(['GG-Digitalisering']);

    const state = await (await fetch(`${base}/admin/state`)).json();
    const stored = state.graph.users.find((u: { id: string }) => u.id === sanne.id);
    expect(stored.managerId).toBe(PIETER);
    expect(stored.signInSessionsRevokedAt).not.toBeNull();
  }, 30_000);

  it('stops with a non-zero exit when a call fails', async () => {
    await expect(
      run('bash', [SCRIPT], { env: { ...process.env, BASE: 'http://127.0.0.1:1', PAUSE: '0' } }),
    ).rejects.toMatchObject({ code: expect.any(Number) });
  });
});
