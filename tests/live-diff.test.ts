import { describe, expect, it } from 'vitest';
import { changedIds } from '../web/src/lib/liveState';

const sanne = { id: 'u1', displayName: 'Sanne de Vries', accountEnabled: true };
const piet = { id: 'u2', displayName: 'Piet Jansen', accountEnabled: true };
const ict = { id: 'g1', displayName: 'ICT', members: ['u2'] };

describe('changedIds (what a screen flashes after a refetch)', () => {
  it('flashes nothing on the first fetch', () => {
    expect(changedIds(undefined, { users: [sanne] })).toEqual(new Set());
  });

  it('flashes a new item', () => {
    expect(changedIds({ users: [piet] }, { users: [piet, sanne] })).toEqual(new Set(['u1']));
  });

  it('flashes a changed item, in any collection', () => {
    const prev = { users: [sanne, piet], groups: [ict] };
    const next = { users: [{ ...sanne, accountEnabled: false }, piet], groups: [{ ...ict, members: ['u2', 'u1'] }] };
    expect(changedIds(prev, next)).toEqual(new Set(['u1', 'g1']));
  });

  it('does not flash unchanged or removed items', () => {
    expect(changedIds({ users: [sanne, piet] }, { users: [piet] })).toEqual(new Set());
  });

  it('identifies items without an id by their key (Jira issues)', () => {
    const prev = { issues: [{ key: 'IAM-101', status: 'To Do' }] };
    const next = { issues: [{ key: 'IAM-101', status: 'Done' }, { key: 'IAM-105', status: 'To Do' }] };
    expect(changedIds(prev, next)).toEqual(new Set(['IAM-101', 'IAM-105']));
  });

  it('ignores collection keys that are not lists', () => {
    expect(changedIds({ users: [], meta: { n: 1 } }, { users: [], meta: { n: 2 } })).toEqual(new Set());
  });
});
