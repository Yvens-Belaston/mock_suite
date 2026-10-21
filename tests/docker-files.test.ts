import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Read as plain text: no Docker daemon here (building/running the image is ticket 38).
const repo = fileURLToPath(new URL('../', import.meta.url));
const read = (file: string) => readFileSync(repo + file, 'utf8');
/** Instruction lines only (comments and blank lines dropped), so a commented-out rule doesn't count. */
const instructions = (text: string) =>
  text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

describe('Dockerfile', () => {
  const lines = instructions(read('Dockerfile'));
  const stages = lines.filter((l) => /^FROM\s/i.test(l));
  const runtime = lines.slice(lines.lastIndexOf(stages[stages.length - 1]));

  it('has three stages: web build, server build, node:20-alpine runtime', () => {
    expect(stages).toHaveLength(3);
    expect(stages[2]).toMatch(/^FROM node:20-alpine\b/);
    expect(lines.some((l) => /npm run build:web/.test(l))).toBe(true);
    expect(lines.some((l) => /npm run build(\s|$)/.test(l))).toBe(true);
  });

  it('installs only production dependencies in the runtime stage', () => {
    expect(runtime.some((l) => /^RUN npm ci\b.*--omit=dev/.test(l))).toBe(true);
  });

  it('ships dist/, web/dist, seed/ and config/ next to each other under /app', () => {
    expect(runtime).toContain('WORKDIR /app');
    for (const dir of ['dist', 'web/dist', 'seed', 'config']) {
      expect(runtime.some((l) => new RegExp(`^COPY\\b.*\\s\\S*${dir}/?\\s+(\\./|/app/)?${dir}/?$`).test(l)), dir).toBe(true);
    }
  });

  it('runs as a non-root user', () => {
    const user = runtime.filter((l) => /^USER\s/.test(l)).pop();
    expect(user).toBeDefined();
    expect(user).not.toMatch(/^USER\s+(root|0)(:|$)/);
  });

  it('exposes 8080, checks /health and starts the compiled server', () => {
    expect(runtime).toContain('EXPOSE 8080');
    expect(runtime.some((l) => /^HEALTHCHECK\b.*CMD\b.*(localhost|127\.0\.0\.1):8080\/health/.test(l))).toBe(true);
    expect(runtime.some((l) => /^CMD \["node", "dist\/server\.js"\]$/.test(l))).toBe(true);
  });

  it('copies a config/ dir that exists in the repo', () => {
    expect(existsSync(repo + 'config')).toBe(true);
  });
});

describe('docker-compose.yml', () => {
  const text = read('docker-compose.yml');
  const lines = text.split('\n').map((l) => l.trim());

  it('runs image ofelia/mock-suite:0.1.0 built from the repo on host port 8090', () => {
    expect(lines).toContain('build: .');
    expect(lines).toContain('image: ofelia/mock-suite:0.1.0');
    expect(lines).toContain('ports: ["8090:8080"]');
  });

  it('mounts seed/ and config/ read-only', () => {
    expect(lines).toContain('- ./seed:/app/seed:ro');
    expect(lines).toContain('- ./config:/app/config:ro');
  });

  it('sets the Bonita and latency environment from the spec', () => {
    for (const line of [
      'BONITA_ENABLED: "true"',
      'BONITA_URL: http://bonita:8080/bonita',
      'BONITA_USER: walter.bates',
      'BONITA_PASSWORD: bpm',
      'RESPONSE_DELAY_MS: "150"',
    ]) expect(lines).toContain(line);
  });

  it('keeps the host Bonita URL and the Bonita service as commented examples', () => {
    expect(lines).toContain('# BONITA_URL: http://host.docker.internal:8080/bonita');
    expect(lines).toContain('# bonita:');
    expect(lines).toContain("#   image: <presenter's Bonita image, pinned version>");
    expect(lines.filter((l) => l === 'networks: [demo]' || l === '#   networks: [demo]')).toHaveLength(2);
    expect(text).toMatch(/^networks:\n {2}demo: \{\}$/m);
  });
});

describe('.dockerignore', () => {
  const entries = instructions(read('.dockerignore'));

  it('keeps local installs, builds and secrets out of the build context', () => {
    for (const entry of ['node_modules', 'dist', 'web/dist', '.git', '.env', '.claude', '.scratch']) {
      expect(entries).toContain(entry);
    }
  });

  it('does not exclude what the image ships', () => {
    for (const kept of ['seed', 'config', 'src', 'web', 'package-lock.json']) expect(entries).not.toContain(kept);
  });
});
