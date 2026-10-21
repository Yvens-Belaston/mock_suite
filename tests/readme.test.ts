import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The presenter README: start, reset, connect Bonita, change the contract, rehearse.
const repo = fileURLToPath(new URL('../', import.meta.url));
const readme = () => readFileSync(repo + 'README.md', 'utf8');

describe('README', () => {
  it('exists', () => {
    expect(existsSync(repo + 'README.md')).toBe(true);
  });

  it('covers start, reset, connecting Bonita, the contract and rehearsal', () => {
    const text = readme();
    for (const needle of [
      'docker compose up',
      'POST /admin/reset',
      'http://localhost:8090/ui/overview',
      'host.docker.internal',
      'http://mock-suite:8080',
      'config/bonita-contract.json',
      'scripts/demo-run.sh',
    ]) {
      expect(text, needle).toContain(needle);
    }
  });

  it('has a base-URL row per connector, with the demo and the real-tenant value', () => {
    const rows = readme().split('\n').filter((l) => l.startsWith('|'));
    // Connector rows carry the demo base URL; this keeps the screens table out of the match.
    const row = (name: string) => rows.find((r) => r.includes(name) && r.includes('http://mock-suite:8080'));
    for (const name of ['TOPdesk', 'Graph token', 'Graph API', 'Jira', ...['hr-onboarding', 'servicedesk', 'facilities', 'automation-coe', 'algemeen'].map((c) => `/teams/hook/${c}`)]) {
      expect(row(name), name).toBeDefined();
    }
    expect(row('Graph token')).toContain('login.microsoftonline.com');
    expect(row('Graph API')).toContain('graph.microsoft.com');
    expect(row('Jira')).toContain('atlassian.net');
  });

  it('only names npm scripts that package.json defines', () => {
    const scripts = Object.keys(JSON.parse(readFileSync(repo + 'package.json', 'utf8')).scripts);
    const named = [...readme().matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) expect(scripts, name).toContain(name);
  });
});
