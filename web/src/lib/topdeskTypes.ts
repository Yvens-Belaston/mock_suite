import type { useLiveState } from '../components/Shell';

/** Stored TOPdesk incident as returned by `/admin/state`.topdesk.incidents (spec section 3). */
export interface Incident {
  id: string;
  number: string;
  briefDescription: string;
  request: string;
  caller: { id: string; dynamicName: string; email: string } | null;
  category: { name: string } | null;
  subcategory: { name: string } | null;
  operatorGroup: { name: string } | null;
  processingStatus: { name: string } | null;
  closed: boolean;
  externalNumber: string;
  actions: { date: string; text: string; author: string }[];
  createdAt: string;
}

/** The `topdesk` slice of `/admin/state`. */
export interface TopdeskState {
  incidents?: Incident[];
  changes?: unknown[];
  persons?: unknown[];
  [key: string]: unknown;
}

export type Live = ReturnType<typeof useLiveState<TopdeskState>>;
