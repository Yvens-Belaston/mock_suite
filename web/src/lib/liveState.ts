/** One system's slice of `GET /admin/state`: collections of items keyed by name (`users`, `issues`, ...). */
export type SystemState = Record<string, unknown>;

/** The id a screen keys an item by: `id`, or `key` for items without one (Jira issues). */
export function itemId(item: unknown): string | undefined {
  if (typeof item !== 'object' || item === null) return undefined;
  const { id, key } = item as { id?: unknown; key?: unknown };
  const value = id ?? key;
  return value === undefined || value === null ? undefined : String(value);
}

/**
 * Ids of items that are new or different in `next` compared with `prev`, across all collections.
 * The first fetch (`prev` undefined) flashes nothing; removed items are not reported.
 */
export function changedIds(prev: SystemState | undefined, next: SystemState): Set<string> {
  const changed = new Set<string>();
  if (!prev) return changed;
  for (const [name, items] of Object.entries(next)) {
    if (!Array.isArray(items)) continue;
    const before = new Map<string, string>();
    const prevItems = prev[name];
    if (Array.isArray(prevItems)) {
      for (const item of prevItems) {
        const id = itemId(item);
        if (id !== undefined) before.set(id, JSON.stringify(item));
      }
    }
    for (const item of items) {
      const id = itemId(item);
      if (id !== undefined && before.get(id) !== JSON.stringify(item)) changed.add(id);
    }
  }
  return changed;
}
