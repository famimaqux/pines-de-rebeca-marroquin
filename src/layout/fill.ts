import type { Design } from '../model/design';
import type { PinSize } from '../model/sizes';
import type { Fixed } from './arrange';
import type { PageSettings } from './pack';
import { computeLayout } from './sheets';

/**
 * "Llenar hoja": repite los diseños que existen hasta cubrir la capacidad de
 * la hoja (o de N hojas), con el tamaño de cada pin y el acomodo elegido.
 *
 * - "equal": en partes iguales; el sobrante se reparte de uno en uno, en orden.
 * - "proportional": proporcional a las cantidades de antes de llenar.
 * Los diseños se intercalan (A, B, C, A, B, C…).
 */
export type FillMode = 'equal' | 'proportional';

export interface FillOptions {
  mode: FillMode;
  /** cuántas hojas llenar (1 = "Esta hoja") */
  sheets: number;
  /** cantidades de antes de llenar (para "Según mis cantidades") */
  weights?: Record<number, number>;
}

/** Siguiente diseño a sumar: el que más "crédito" tiene (reparto suave e intercalado). */
function makePicker(ids: number[], mode: FillMode, weights: Record<number, number> = {}) {
  const w = ids.map((id) => (mode === 'proportional' ? Math.max(0.0001, weights[id] ?? 1) : 1));
  const total = w.reduce((a, b) => a + b, 0);
  const credit = ids.map(() => 0);
  const count = ids.map(() => 0);
  return {
    /** Devuelve el índice elegido entre los que todavía caben. */
    next(open: boolean[]): number {
      for (let i = 0; i < ids.length; i++) credit[i] += w[i] / total;
      let best = -1;
      for (let i = 0; i < ids.length; i++) {
        if (!open[i]) continue;
        // a igual crédito, gana el que tiene menos y luego el primero de la lista
        if (best < 0 || credit[i] > credit[best] + 1e-9 || (Math.abs(credit[i] - credit[best]) <= 1e-9 && count[i] < count[best])) best = i;
      }
      if (best >= 0) {
        credit[best] -= 1;
        count[best]++;
      }
      return best;
    },
    undo(i: number) {
      credit[i] += 1;
      count[i]--;
    },
  };
}

/**
 * Calcula cuántos pines de cada diseño caben para llenar `opts.sheets` hojas.
 * No modifica los diseños: devuelve las cantidades nuevas por id.
 */
export function computeFill(designs: Design[], sizes: PinSize[], settings: PageSettings, fixed: ReadonlyMap<string, Fixed>, opts: FillOptions): Record<number, number> {
  const ids = designs.map((d) => d.id);
  const qty: Record<number, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  if (!ids.length) return qty;
  const sheets = Math.max(1, Math.floor(opts.sheets));
  const work = designs.map((d) => ({ ...d, qty: 0 }));
  const fits = () => {
    const L = computeLayout(work, sizes, settings, fixed, undefined, true);
    return L.unfit.length === 0 && L.pages.length <= sheets;
  };
  const picker = makePicker(ids, opts.mode, opts.weights);
  const open = ids.map(() => true);
  // Seguridad: nunca más de lo que cabría con el pin más chico.
  for (let guard = 0; guard < 5000 && open.some(Boolean); guard++) {
    const i = picker.next(open);
    if (i < 0) break;
    work[i].qty++;
    if (!fits()) {
      work[i].qty--;
      picker.undo(i);
      open[i] = false; // este diseño ya no cabe; los demás pueden seguir
    }
  }
  for (const d of work) qty[d.id] = d.qty;
  return qty;
}

/** Cantidades a restaurar al apagar "Llenar hoja" (los diseños nuevos quedan en 1). */
export function restoredQuantities(designs: Design[], saved: Record<number, number>): Record<number, number> {
  return Object.fromEntries(designs.map((d) => [d.id, saved[d.id] ?? 1]));
}
