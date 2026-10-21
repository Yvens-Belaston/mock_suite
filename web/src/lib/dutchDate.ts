/** The one date formatter of the screens (spec 6.6): Dutch order, 24-hour clock, Europe/Amsterdam. */
const parts = new Intl.DateTimeFormat('nl-NL', {
  timeZone: 'Europe/Amsterdam',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function amsterdam(iso: string): Record<string, string> {
  return Object.fromEntries(parts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
}

/** `2026-12-01T08:00:00Z` -> `01-12-2026 09:00` (Amsterdam time). */
export function formatDateTime(iso: string): string {
  const p = amsterdam(iso);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

/** `2026-12-01` -> `01-12-2026`. A plain calendar date is not shifted; an instant uses its Amsterdam day. */
export function formatDate(iso: string): string {
  const plain = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plain) return `${plain[3]}-${plain[2]}-${plain[1]}`;
  const p = amsterdam(iso);
  return `${p.day}-${p.month}-${p.year}`;
}
