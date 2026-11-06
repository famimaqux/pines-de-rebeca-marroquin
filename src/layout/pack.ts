/**
 * Acomodo automático de pines en hojas de papel (todo en mm).
 * Funciona con cualquier tamaño y orientación de papel.
 * - Cuadrícula ordenada: filas ("estantes"), fácil de cortar.
 * - Tresbolillo apretado: círculos tangentes (cada uno se apoya en dos vecinos).
 * - Automático: el que use menos hojas (empate → cuadrícula).
 * Siempre se colocan primero los más grandes; los pequeños rellenan huecos,
 * también en hojas anteriores.
 */

export const A4 = { w: 210, h: 297 } as const;

export type PackAlgo = 'auto' | 'grid' | 'hex';

export interface PageSettings {
  /** tamaño del papel (ya con la orientación aplicada), mm */
  w: number;
  h: number;
  margin: number;
  gap: number;
  algo: PackAlgo;
}

export interface PackItem {
  /** id del diseño */
  designId: number;
  sizeId: string;
  /** ancho y alto del corte */
  w: number;
  h: number;
  /** radio del círculo que envuelve el corte */
  r: number;
  /** orden original (para desempatar) */
  order: number;
}

export interface Placed extends PackItem {
  x: number;
  y: number;
}

interface Shelf {
  y: number;
  h: number;
  x: number;
}

export interface Page {
  items: Placed[];
  shelves: Shelf[];
  /** radio más chico que ya no cupo (para no volver a intentar) */
  fail: number;
}

export interface PackResult {
  pages: Page[];
  unfit: PackItem[];
  algo: 'grid' | 'hex';
}

const E = 1e-6;
export const newPage = (): Page => ({ items: [], shelves: [], fail: Infinity });

function usable(s: PageSettings) {
  return { x0: s.margin, y0: s.margin, x1: s.w - s.margin, y1: s.h - s.margin };
}

/** Busca la posición más arriba (y luego más a la izquierda) donde quepa un círculo de radio r. */
function hexPos(page: Page, r: number, s: PageSettings): [number, number] | null {
  const g = s.gap;
  const U = usable(s);
  const minX = U.x0 + r;
  const maxX = U.x1 - r;
  const minY = U.y0 + r;
  const maxY = U.y1 - r;
  if (minX > maxX + E || minY > maxY + E) return null;
  const C = page.items;
  const cand: [number, number][] = [[minX, minY]];
  for (const a of C) {
    const D = a.r + r + g;
    for (const x of [minX, maxX]) {
      const dx = x - a.x;
      if (Math.abs(dx) <= D) {
        const hh = Math.sqrt(D * D - dx * dx);
        cand.push([x, a.y + hh], [x, a.y - hh]);
      }
    }
    const dy = minY - a.y;
    if (Math.abs(dy) <= D) {
      const hh = Math.sqrt(D * D - dy * dy);
      cand.push([a.x + hh, minY], [a.x - hh, minY]);
    }
    cand.push([a.x + D, a.y], [a.x, a.y + D]);
  }
  // Tangente a dos círculos a la vez
  for (let i = 0; i < C.length; i++)
    for (let j = i + 1; j < C.length; j++) {
      const a = C[i];
      const b = C[j];
      const ra = a.r + r + g;
      const rb = b.r + r + g;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dd = Math.hypot(dx, dy);
      if (dd === 0 || dd > ra + rb || dd < Math.abs(ra - rb)) continue;
      const l = (ra * ra - rb * rb + dd * dd) / (2 * dd);
      const hh = Math.sqrt(Math.max(0, ra * ra - l * l));
      const mx = a.x + (dx * l) / dd;
      const my = a.y + (dy * l) / dd;
      cand.push([mx - (hh * dy) / dd, my + (hh * dx) / dd], [mx + (hh * dy) / dd, my - (hh * dx) / dd]);
    }
  let best: [number, number] | null = null;
  for (const [x, y] of cand) {
    if (x < minX - E || x > maxX + E || y < minY - E || y > maxY + E) continue;
    let ok = true;
    for (const a of C) {
      const D = a.r + r + g - 1e-4;
      const ex = x - a.x;
      const ey = y - a.y;
      if (ex * ex + ey * ey < D * D) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (!best || y < best[1] - 1e-3 || (Math.abs(y - best[1]) <= 1e-3 && x < best[0])) best = [x, y];
  }
  return best;
}

/** Cuadrícula por estantes: cada pieza w×h va en la primera fila donde quepa. */
function gridPos(page: Page, w: number, h: number, s: PageSettings): { x: number; y: number; commit: () => void } | null {
  const U = usable(s);
  const g = s.gap;
  for (const sh of page.shelves) {
    if (h <= sh.h + E && sh.x + w <= U.x1 + E) {
      return { x: sh.x + w / 2, y: sh.y + sh.h / 2, commit: () => void (sh.x += w + g) };
    }
  }
  const last = page.shelves[page.shelves.length - 1];
  const y = last ? last.y + last.h + g : U.y0;
  if (y + h > U.y1 + E || U.x0 + w > U.x1 + E) return null;
  const sh: Shelf = { y, h, x: U.x0 };
  return {
    x: U.x0 + w / 2,
    y: y + h / 2,
    commit: () => {
      page.shelves.push(sh);
      sh.x += w + g;
    },
  };
}

export function place(page: Page, it: PackItem, algo: 'grid' | 'hex', s: PageSettings): boolean {
  if (it.r >= page.fail) return false;
  if (algo === 'grid') {
    const p = gridPos(page, it.w, it.h, s);
    if (!p) {
      page.fail = Math.min(page.fail, it.r);
      return false;
    }
    p.commit();
    page.items.push({ ...it, x: p.x, y: p.y });
    return true;
  }
  const p = hexPos(page, it.r, s);
  if (!p) {
    page.fail = Math.min(page.fail, it.r);
    return false;
  }
  page.items.push({ ...it, x: p[0], y: p[1] });
  return true;
}

/** Ordena: primero los grandes; a igual tamaño, en el orden de la lista. */
export function sortItems(items: PackItem[]): PackItem[] {
  return items.slice().sort((a, b) => b.r - a.r || b.w * b.h - a.w * a.h || a.order - b.order);
}

export function packWith(items: PackItem[], algo: 'grid' | 'hex', s: PageSettings): PackResult {
  const pages: Page[] = [];
  const unfit: PackItem[] = [];
  for (const it of sortItems(items)) {
    let ok = false;
    for (const pg of pages)
      if (place(pg, it, algo, s)) {
        ok = true;
        break;
      }
    if (!ok) {
      const np = newPage();
      if (place(np, it, algo, s)) pages.push(np);
      else unfit.push(it);
    }
  }
  return { pages, unfit, algo };
}

/** Centra horizontalmente el contenido de cada hoja (márgenes iguales a ambos lados). */
export function centerPages(pages: Page[], s: PageSettings): void {
  const U = usable(s);
  for (const p of pages) {
    if (!p.items.length) continue;
    let l = Infinity;
    let r = -Infinity;
    for (const i of p.items) {
      const hw = p.shelves.length ? i.w / 2 : i.r;
      l = Math.min(l, i.x - hw);
      r = Math.max(r, i.x + hw);
    }
    const dx = (U.x0 + U.x1 - (l + r)) / 2;
    for (const i of p.items) i.x += dx;
  }
}

export function pack(items: PackItem[], s: PageSettings): PackResult {
  let res: PackResult;
  if (s.algo === 'auto') {
    const G = packWith(items, 'grid', s);
    const H = packWith(items, 'hex', s);
    res = H.pages.length < G.pages.length || (H.pages.length === G.pages.length && H.unfit.length < G.unfit.length) ? H : G;
  } else res = packWith(items, s.algo, s);
  return res;
}

function clonePage(p: Page): Page {
  return { items: p.items.map((i) => ({ ...i })), shelves: p.shelves.map((s) => ({ ...s })), fail: Infinity };
}

/** Cuántas piezas de un tamaño más caben en una hoja (vacía o ya empezada). */
export function countFit(page: Page, probe: Omit<PackItem, 'order' | 'designId'>, algo: 'grid' | 'hex', s: PageSettings, cap = 500): number {
  const pg = clonePage(page);
  let n = 0;
  while (n < cap && place(pg, { ...probe, designId: -1, order: 0 }, algo, s)) n++;
  return n;
}

const capCache = new Map<string, number>();

/** Capacidad máxima de una hoja vacía para un molde. */
export function capacity(probe: Omit<PackItem, 'order' | 'designId'>, algo: 'grid' | 'hex', s: PageSettings): number {
  const k = [probe.w, probe.h, probe.r, s.w, s.h, s.margin, s.gap, algo].join('|');
  let v = capCache.get(k);
  if (v === undefined) {
    v = countFit(newPage(), probe, algo, s);
    capCache.set(k, v);
  }
  return v;
}

export function bestCapacity(probe: Omit<PackItem, 'order' | 'designId'>, s: PageSettings): number {
  return s.algo === 'auto' ? Math.max(capacity(probe, 'grid', s), capacity(probe, 'hex', s)) : capacity(probe, s.algo, s);
}
