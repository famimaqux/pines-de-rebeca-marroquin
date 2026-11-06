import { pageSettings, state } from '../state';
import { capacityOf, computeLayout, parseKey, type Layout } from './sheets';

/** Acomodo del proyecto actual, recalculado solo cuando cambia algo que lo afecta. */
let cached: { sig: string; layout: Layout } | null = null;
const relocateListeners = new Set<(keys: string[]) => void>();
/** Avisos de "este pin ya no cabía y lo moví". */
export const onRelocated = (fn: (keys: string[]) => void) => relocateListeners.add(fn);

function signature(): string {
  return JSON.stringify([
    state.designs.map((d) => [d.id, d.sizeId, d.qty]),
    state.sizes.map((s) => [s.id, s.cutW, s.cutH]),
    pageSettings(),
    [...state.fixed],
    state.fill.on,
  ]);
}

export function currentLayout(): Layout {
  const sig = signature();
  if (cached && cached.sig === sig) return cached.layout;
  const layout = computeLayout(state.designs, state.sizes, pageSettings(), state.fixed, undefined, state.fill.on);
  // Guardar las posiciones fijas finales (reubicados, Libre, hojas renumeradas) y
  // olvidar las de pines que ya no existen.
  const next = new Map(layout.fixed);
  for (const [k, f] of state.fixed) {
    if (next.has(k)) continue;
    const { designId, copy } = parseKey(k);
    const d = state.designs.find((x) => x.id === designId);
    // Se conserva si el pin existe pero no se usó (p. ej. fijado no manual fuera de Libre)
    if (d && copy < d.qty && f.manual) next.set(k, f);
  }
  state.fixed = next;
  if (layout.relocated.length) relocateListeners.forEach((l) => l(layout.relocated));
  // La firma se calcula DESPUÉS de guardar las posiciones: así el siguiente llamado reutiliza este acomodo.
  cached = { sig: signature(), layout };
  return layout;
}

export function capacityFor(sizeId: string): number {
  const s = state.sizes.find((x) => x.id === sizeId);
  return s ? capacityOf(s, pageSettings()) : 0;
}

/** Copias de cada hoja (mínimo 1), del mismo largo que el acomodo. */
export function sheetCopies(n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.max(1, Math.min(50, Math.floor(state.copies[i] ?? 1))));
}

/** Dónde está cada pin en el acomodo actual. */
export function locate(key: string): { sheet: number; x: number; y: number; r: number } | null {
  const L = currentLayout();
  for (let i = 0; i < L.pages.length; i++) {
    const it = L.pages[i].items.find((x) => x.key === key);
    if (it) return { sheet: i, x: it.x, y: it.y, r: it.r };
  }
  return null;
}
