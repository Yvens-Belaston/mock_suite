import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from '../web/src/lib/dutchDate';

describe('Dutch date format for the screens (spec 6.6)', () => {
  it('formats an instant as dd-MM-yyyy HH:mm in Amsterdam winter time (UTC+1)', () => {
    expect(formatDateTime('2026-12-01T08:00:00Z')).toBe('01-12-2026 09:00');
  });

  it('uses Amsterdam summer time (UTC+2) and crosses midnight correctly', () => {
    expect(formatDateTime('2026-07-14T22:30:00.000Z')).toBe('15-07-2026 00:30');
  });

  it('formats a calendar date (Jira due date, hire date) as dd-MM-yyyy without shifting the day', () => {
    expect(formatDate('2026-12-01')).toBe('01-12-2026');
    expect(formatDate('2026-07-14T22:30:00Z')).toBe('15-07-2026');
  });
});
