/** Page-wide toast queue; `<Shell>` renders it. Call `toast()` from anywhere. */

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export const TOAST_MS = 5000;
const MAX_TOASTS = 4;

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Show `message` for 5 s (newest at the bottom, at most four at once). */
export function toast(message: string, tone: ToastTone = 'info'): void {
  const id = ++seq;
  toasts = [...toasts, { id, message, tone }].slice(-MAX_TOASTS);
  emit();
  setTimeout(() => dismissToast(id), TOAST_MS);
}

export function subscribeToasts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getToasts(): Toast[] {
  return toasts;
}
