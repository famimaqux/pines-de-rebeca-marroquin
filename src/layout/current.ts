import { pageSettings, state } from '../state';
import { capacityOf, computeLayout, type Layout } from './sheets';

/** Acomodo del proyecto actual, recalculado solo cuando cambia algo que lo afecta. */
let cached: { sig: string; layout: Layout } | null = null;

function signature(): string {
  return JSON.stringify([
    state.designs.map((d) => [d.id, d.sizeId, d.qty]),
    state.sizes.map((s) => [s.id, s.cutW, s.cutH]),
    pageSettings(),
  ]);
}

export function currentLayout(): Layout {
  const sig = signature();
  if (!cached || cached.sig !== sig) cached = { sig, layout: computeLayout(state.designs, state.sizes, pageSettings()) };
  return cached.layout;
}

export function capacityFor(sizeId: string): number {
  const s = state.sizes.find((x) => x.id === sizeId);
  return s ? capacityOf(s, pageSettings()) : 0;
}

/** Copias de cada hoja (mínimo 1), del mismo largo que el acomodo. */
export function sheetCopies(n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.max(1, Math.min(50, Math.floor(state.copies[i] ?? 1))));
}
