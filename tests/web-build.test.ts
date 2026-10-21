import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const dist = join(import.meta.dirname, '..', 'web', 'dist');

describe('npm run build:web', () => {
  beforeAll(() => {
    execSync('npm run build:web', { stdio: 'pipe' });
  }, 120_000);

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
