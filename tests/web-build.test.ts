import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Build into a temp dir, not web/dist: a concurrent `npm run test:ui` / other run serving or rebuilding
// web/dist would otherwise race with this build (vite empties its outDir first -> ENOENT).
const dist = mkdtempSync(join(tmpdir(), 'web-build-test-'));

describe('npm run build:web', () => {
  beforeAll(() => {
    execSync(`npm run build:web -- --outDir ${JSON.stringify(dist)} --emptyOutDir`, { stdio: 'pipe' });
  }, 120_000);

  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  it('emits an index.html that loads its assets from /ui/', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(html).toMatch(/src="\/ui\/assets\/[^"]+\.js"/);
  });

  it('bundles the Gesimuleerd label', () => {
    const js = readdirSync(join(dist, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(dist, 'assets', f), 'utf8'))
      .join('\n');
    expect(js).toContain('Gesimuleerd');
  });
});
