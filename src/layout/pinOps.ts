import { checkpoint, emit, pageSettings, state } from '../state';
import { currentLayout, locate } from './current';
import { fits, nearestFree, type Fixed } from './arrange';
import { parseKey, pinKey } from './sheets';
import type { Placed } from './pack';

/**
 * Acciones sobre pines de la hoja: mover (uno o varios), fijar 📌, mover a
 * otra hoja, duplicar, eliminar, modo Libre y "Reacomodar todo".
 * Todas se pueden deshacer con Ctrl+Z.
 */

const isFree = () => state.page.algo === 'free';

/**
 * Obstáculos de una hoja: todos los pines que ya están en ella (sin los que se mueven).
 * Así, si sueltas un pin encima de otro, el que se mueve va al hueco libre más cercano.
 */
function obstacles(sheet: number, exclude: ReadonlySet<string>): Placed[] {
  const page = currentLayout().pages[sheet];
  if (!page) return [];
  return page.items.filter((it) => !exclude.has(it.key));
}

/**
 * Mueve un grupo de pines (dx, dy) mm, manteniendo su distancia entre ellos.
 * Si alguno cae encima de otro o fuera del margen, va al hueco libre más cercano.
 * Devuelve cuántos tuvieron que reubicarse.
 */
/** Resultado del último movimiento (para el aviso). */
export let lastMoveSwapped = false;

export function movePins(keys: string[], dx: number, dy: number, toSheet?: number): number {
  lastMoveSwapped = false;
  if (!keys.length) return 0;
  // Un solo pin soltado encima de otro sin hueco cerca: intercambian lugar.
  if (keys.length === 1 && toSheet === undefined) {
    const sw = trySwap(keys[0], dx, dy);
    if (sw) return 0;
  }
  const s = pageSettings();
  const moving = new Set(keys);
  // Obstáculos por hoja de destino (sin los que se mueven) + los ya ubicados del grupo.
  const bySheet = new Map<number, Placed[]>();
  const plan: [string, Fixed][] = [];
  let bumped = 0;
  for (const k of keys) {
    const loc = locate(k);
    if (!loc) continue;
    const sheet = toSheet ?? loc.sheet;
    if (!bySheet.has(sheet)) bySheet.set(sheet, obstacles(sheet, moving));
    const others = bySheet.get(sheet)!;
    let x = loc.x + dx;
    let y = loc.y + dy;
    if (!fits(x, y, loc.r, others, s)) {
      const spot = nearestFree(x, y, loc.r, others, s);
      if (!spot) continue;
      [x, y] = spot;
      bumped++;
    }
    others.push({ key: k, designId: -1, sizeId: '', w: loc.r * 2, h: loc.r * 2, r: loc.r, order: 0, x, y });
    // Movido a mano = fijado 📌 (en Libre ya está fijo de por sí).
    const manual = isFree() ? (state.fixed.get(k)?.manual ?? false) : true;
    plan.push([k, { sheet, x, y, manual }]);
  }
  if (!plan.length) return 0;
  checkpoint();
  for (const [k, f] of plan) state.fixed.set(k, f);
  state.messy = true;
  emit('page', 'list');
  return bumped;
}

function trySwap(key: string, dx: number, dy: number): boolean {
  const s = pageSettings();
  const loc = locate(key);
  if (!loc) return false;
  const x = loc.x + dx;
  const y = loc.y + dy;
  const others = obstacles(loc.sheet, new Set([key]));
  if (fits(x, y, loc.r, others, s)) return false;
  const under = others.find((o) => Math.hypot(o.x - x, o.y - y) <= o.r);
  if (!under) return false;
  const spot = nearestFree(x, y, loc.r, others, s);
  if (spot && Math.hypot(spot[0] - x, spot[1] - y) <= loc.r) return false; // hay hueco cerca: mejor ahí
  // El movido va al lugar del otro y el otro al lugar del movido (si caben).
  const rest = others.filter((o) => o.key !== under.key);
  const meAt: [number, number] = fits(under.x, under.y, loc.r, rest, s) ? [under.x, under.y] : (nearestFree(under.x, under.y, loc.r, rest, s) ?? [loc.x, loc.y]);
  const meP = { ...under, key, x: meAt[0], y: meAt[1], r: loc.r };
  const otherAt: [number, number] = fits(loc.x, loc.y, under.r, [...rest, meP], s) ? [loc.x, loc.y] : (nearestFree(loc.x, loc.y, under.r, [...rest, meP], s) ?? [under.x, under.y]);
  checkpoint();
  const manualOf = (k: string) => (isFree() ? (state.fixed.get(k)?.manual ?? false) : true);
  state.fixed.set(key, { sheet: loc.sheet, x: meAt[0], y: meAt[1], manual: manualOf(key) });
  state.fixed.set(under.key, { sheet: loc.sheet, x: otherAt[0], y: otherAt[1], manual: manualOf(under.key) });
  lastMoveSwapped = true;
  state.messy = true;
  emit('page', 'list');
  return true;
}

/** Fija 📌 o suelta los pines (soltarlos los devuelve al acomodo automático). */
export function togglePin(keys: string[]): 'pinned' | 'released' | null {
  if (!keys.length || isFree()) return null;
  const allPinned = keys.every((k) => state.fixed.get(k)?.manual);
  checkpoint();
  for (const k of keys) {
    if (allPinned) state.fixed.delete(k);
    else {
      const loc = locate(k);
      if (loc) state.fixed.set(k, { sheet: loc.sheet, x: loc.x, y: loc.y, manual: true });
    }
  }
  emit('page', 'list');
  return allPinned ? 'released' : 'pinned';
}

/** Mueve pines a otra hoja (o a una hoja nueva si `sheet` = número de hojas). */
export function moveToSheet(keys: string[], sheet: number): number {
  const L = currentLayout();
  const target = Math.max(0, Math.min(L.pages.length, Math.floor(sheet)));
  const first = keys.map(locate).find(Boolean);
  if (!first) return 0;
  // Se conserva la distribución del grupo; si no cabe, cada uno busca su hueco.
  movePins(keys, 0, 0, target);
  state.sheet = Math.min(target, currentLayout().pages.length - 1);
  emit('view');
  return keys.length;
}

/** Elimina pines (baja la cantidad de su diseño; si queda en 0, se borra el diseño). */
export function deletePins(keys: string[]): number {
  if (!keys.length) return 0;
  checkpoint();
  const byDesign = new Map<number, number[]>();
  for (const k of keys) {
    const { designId, copy } = parseKey(k);
    byDesign.set(designId, [...(byDesign.get(designId) ?? []), copy]);
  }
  for (const [designId, copies] of byDesign) {
    const d = state.designs.find((x) => x.id === designId);
    if (!d) continue;
    // Renumerar las copias que siguen, de mayor a menor para no pisarse.
    for (const c of copies.sort((a, b) => b - a)) {
      state.fixed.delete(pinKey(designId, c));
      for (let j = c + 1; j < d.qty; j++) {
        const f = state.fixed.get(pinKey(designId, j));
        state.fixed.delete(pinKey(designId, j));
        if (f) state.fixed.set(pinKey(designId, j - 1), f);
      }
      d.qty--;
    }
    if (d.qty <= 0) {
      state.designs = state.designs.filter((x) => x.id !== designId);
      state.selection.delete(designId);
      if (state.selId === designId) state.selId = state.designs[0]?.id ?? null;
    }
  }
  state.pinSel.clear();
  emit('list', 'design', 'page');
  return keys.length;
}

/** Duplica pines: cada copia nueva aparece junto a su original. */
export function duplicatePins(keys: string[]): string[] {
  if (!keys.length) return [];
  checkpoint();
  const s = pageSettings();
  const made: string[] = [];
  for (const k of keys) {
    const { designId } = parseKey(k);
    const d = state.designs.find((x) => x.id === designId);
    const loc = locate(k);
    if (!d || !loc) continue;
    const nk = pinKey(designId, d.qty);
    d.qty++;
    made.push(nk);
    const orig = state.fixed.get(k);
    if (isFree() || orig?.manual) {
      const others = obstacles(loc.sheet, new Set());
      const extra = made
        .map((m) => state.fixed.get(m))
        .filter((f): f is Fixed => !!f && f.sheet === loc.sheet)
        .map((f) => ({ x: f.x, y: f.y, r: loc.r }) as Placed);
      const spot = nearestFree(loc.x + loc.r * 2 + s.gap, loc.y, loc.r, [...others, ...extra], s);
      if (spot) state.fixed.set(nk, { sheet: loc.sheet, x: spot[0], y: spot[1], manual: orig?.manual ?? false });
    }
  }
  state.pinSel = new Set(made);
  emit('list', 'design', 'page');
  return made;
}

/** Cambia el modo de acomodo. Al pasar a Libre se congelan las posiciones actuales. */
export function setMode(mode: 'auto' | 'grid' | 'free'): void {
  if (mode === state.page.algo) return;
  checkpoint();
  if (mode === 'free') {
    const L = currentLayout();
    L.pages.forEach((p, sheet) => {
      for (const it of p.items) {
        const prev = state.fixed.get(it.key);
        state.fixed.set(it.key, { sheet, x: it.x, y: it.y, manual: prev?.manual ?? false });
      }
    });
  } else {
    for (const [k, f] of [...state.fixed]) if (!f.manual) state.fixed.delete(k);
  }
  state.page.algo = mode;
  emit('page', 'list');
}

/**
 * "Ordenar": vuelve a acomodar en orden automático y suelta los fijados 📌.
 * `scope` = 'sheet' (solo la hoja que se ve) o 'all' (todas). Un solo Ctrl+Z lo deshace.
 */
export function resetArrangement(scope: 'sheet' | 'all' = 'all'): void {
  checkpoint();
  if (scope === 'all') state.fixed.clear();
  else for (const [k, f] of [...state.fixed]) if (f.sheet === state.sheet) state.fixed.delete(k);
  if (scope === 'all' || ![...state.fixed.values()].some((f) => f.manual)) state.messy = false;
  emit('page', 'list');
}

/** ¿La hoja está "desordenada"? (pines movidos o fijados a mano) */
export function isMessy(): boolean {
  return state.messy || [...state.fixed.values()].some((f) => f.manual);
}

export const isPinned = (key: string) => !!state.fixed.get(key)?.manual;
