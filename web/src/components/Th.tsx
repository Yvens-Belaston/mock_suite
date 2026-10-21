import type { ReactNode } from 'react';

/** Table header cell shared by the TOPdesk tabs. */
export function Th({ children }: { children: ReactNode }) {
  return <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">{children}</th>;
}
