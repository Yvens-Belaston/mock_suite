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
  // The demo run is rehearsed with BONITA_ENABLED=false (callback B stays silent).
  process.env.BONITA_ENABLED = 'false';
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

describe('scripts/demo-run.sh', () => {
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

  it('moves the laptop change to done and archives Sanne in TOPdesk (created first, since she is not seeded)', async () => {
    // This test's own server (port 0), so resetting it cannot touch other worktrees.
    await fetch(`${base}/admin/reset`, { method: 'POST' });
    const before = await (await fetch(`${base}/admin/state`)).json();
    const changeCount = before.topdesk.changes.length;

    await run('bash', [SCRIPT], { env: { ...process.env, BASE: base, PAUSE: '0' } });

    const state = await (await fetch(`${base}/admin/state`)).json();
    expect(state.topdesk.changes).toHaveLength(changeCount + 1);
    const laptop = state.topdesk.changes.at(-1);
    expect(laptop.briefDescription).toMatch(/laptop/i);
    expect(laptop.processingStatus).toBe('simple_done');
    expect(laptop.progressTrail.map((e: { text: string }) => e.text)).toEqual(['Change aangemaakt', 'Gestart', 'Uitgevoerd']);

    const sannes = state.topdesk.persons.filter((p: { email?: string }) => p.email === SANNE_UPN);
    expect(sannes).toHaveLength(1);
    expect(sannes[0].dynamicName).toBe('Sanne de Vries');
    expect(sannes[0].archived).toBe(true);
  }, 30_000);

  it('creates the SAP and Zaaksysteem access issues on the IAM board and moves one to Done', async () => {
    await fetch(`${base}/admin/reset`, { method: 'POST' });
    const before = await (await fetch(`${base}/admin/state`)).json();
    const seedKeys = new Set(before.jira.issues.map((i: { key: string }) => i.key));

    await run('bash', [SCRIPT], { env: { ...process.env, BASE: base, PAUSE: '0' } });

    const state = await (await fetch(`${base}/admin/state`)).json();
    const created = state.jira.issues.filter((i: { key: string }) => !seedKeys.has(i.key));
    expect(created).toHaveLength(2);
    const [sap, zaak] = created;
    expect(sap.fields.project.key).toBe('IAM');
    expect(sap.fields.summary).toMatch(/SAP/);
    expect(zaak.fields.project.key).toBe('IAM');
    expect(zaak.fields.summary).toMatch(/Zaaksysteem/);
    for (const issue of created) {
      expect(issue.fields.labels).toEqual(['case-1042']);
      expect(issue.fields.description).toMatchObject({ type: 'doc', version: 1 });
      expect(JSON.stringify(issue.fields.description)).toContain('Sanne de Vries');
    }
    expect(sap.fields.status.name).toBe('Done');
    expect(zaak.fields.status.name).toBe('To Do');
  }, 30_000);

  it('posts the spec 4.5 escalation card to the Facilities channel', async () => {
    await fetch(`${base}/admin/reset`, { method: 'POST' });
    const before = await (await fetch(`${base}/admin/state`)).json();
    const count = before.teams.messages.length;

    await run('bash', [SCRIPT], { env: { ...process.env, BASE: base, PAUSE: '0' } });

    const state = await (await fetch(`${base}/admin/state`)).json();
    expect(state.teams.messages).toHaveLength(count + 1);
    const msg = state.teams.messages.at(-1);
    expect(msg.channelId).toBe('facilities');
    // Spec section 4.5, verbatim.
    expect(msg.payload).toEqual({
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          type: 'AdaptiveCard', version: '1.5',
          body: [{ type: 'Container', style: 'attention', items: [
            { type: 'TextBlock', text: '⚠️ Taak verlopen: werkplek inrichten', weight: 'Bolder', size: 'Medium' },
            { type: 'FactSet', facts: [
              { title: 'Medewerker', value: 'Sanne de Vries' },
              { title: 'Startdatum', value: '01-12-2026' },
              { title: 'Verantwoordelijk', value: 'Lotte Jansen (Facilities)' },
              { title: 'Escalatie naar', value: 'Ruben de Boer' },
            ] },
          ] }],
          actions: [{ type: 'Action.OpenUrl', title: 'Open in Ofelia', url: 'http://localhost:8080/bonita/apps/userAppBonita/task-list' }],
        },
      }],
    });
  }, 30_000);

  it('stops with a non-zero exit when a call fails', async () => {
    await expect(
      run('bash', [SCRIPT], { env: { ...process.env, BASE: 'http://127.0.0.1:1', PAUSE: '0' } }),
    ).rejects.toMatchObject({ code: expect.any(Number) });
  });
});
