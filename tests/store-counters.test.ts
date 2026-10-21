import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createStore } from '../src/store.js';

describe('store number counters', () => {
  const seedDir = mkdtempSync(join(tmpdir(), 'mock-suite-seed-'));
  writeFileSync(
    join(seedDir, 'topdesk.json'),
    JSON.stringify({ incidents: [{ number: 'I 2610 007' }, { number: 'I 2610 008' }, { number: 'I 2610 002' }] }),
  );
  afterAll(() => rmSync(seedDir, { recursive: true, force: true }));

  const highestIncident = (seed: ReturnType<ReturnType<typeof createStore>['get']>) =>
    Math.max(...(seed.topdesk.incidents as { number: string }[]).map((i) => Number(i.number.slice(-3))));

  it('continues at the highest seeded number + 1 and starts there again after reset', () => {
    const store = createStore(seedDir);
    store.defineCounter('topdesk.incident', highestIncident);

    expect(store.next('topdesk.incident')).toBe(9);
    expect(store.next('topdesk.incident')).toBe(10);

    store.reset();
    expect(store.next('topdesk.incident')).toBe(9);
  });
});
