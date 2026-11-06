import { checkpoint, emit, pageSettings, state } from '../state';
import { computeFill, restoredQuantities, type FillMode } from './fill';

/**
 * Interruptor "Llenar hoja": guarda las cantidades de antes, llena la(s)
 * hoja(s) y se recalcula solo si se agregan o quitan diseños.
 */

let lastSig = '';
const sig = () =>
  JSON.stringify([
    state.designs.map((d) => [d.id, d.sizeId]),
    state.sizes.map((s) => [s.id, s.cutW, s.cutH]),
    pageSettings(),
    state.fill.mode,
    state.fill.sheets,
    [...state.fixed].filter(([, f]) => f.manual),
  ]);

function apply(): void {
  const q = computeFill(state.designs, state.sizes, pageSettings(), state.fixed, { mode: state.fill.mode, sheets: state.fill.sheets, weights: state.fill.saved });
  for (const d of state.designs) d.qty = q[d.id] ?? d.qty;
  lastSig = sig();
}

export function setFill(on: boolean): void {
  if (on === state.fill.on) return;
  checkpoint();
  if (on) {
    state.fill.saved = Object.fromEntries(state.designs.map((d) => [d.id, d.qty]));
    state.fill.on = true;
    apply();
  } else {
    const q = restoredQuantities(state.designs, state.fill.saved);
    for (const d of state.designs) d.qty = q[d.id];
    state.fill.on = false;
  }
  emit('list', 'page');
}

export function setFillOptions(p: { mode?: FillMode; sheets?: number }): void {
  if (p.mode) state.fill.mode = p.mode;
  if (p.sheets) state.fill.sheets = Math.max(1, Math.min(20, Math.floor(p.sheets)));
  if (state.fill.on) {
    checkpoint();
    apply();
  }
  emit('list', 'page');
}

/** Llamar tras cada cambio: si "Llenar hoja" está activo y cambió algo, recalcula. */
export function refreshFill(): boolean {
  if (!state.fill.on) return false;
  const s = sig();
  if (s === lastSig) return false;
  // Diseños nuevos: guardar su cantidad "de antes" (1) para cuando se apague.
  for (const d of state.designs) if (!(d.id in state.fill.saved)) state.fill.saved[d.id] = 1;
  apply();
  emit('list', 'page');
  return true;
}
