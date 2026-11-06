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

/** 'free' = modo Libre (nada se reacomoda solo); para calcular capacidades cuenta como automático. */
export type PackAlgo = 'auto' | 'grid' | 'hex' | 'free';

export interface PageSettings {
  /** tamaño del papel (ya con la orientación aplicada), mm */
  w: number;
  h: number;
  margin: number;
  gap: number;
  algo: PackAlgo;
}

export interface PackItem {
  /** identidad del pin: "idDiseño:copia" */
  key: string;
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
  /** pines fijados (📌 o en modo Libre): obstáculos que el acomodo esquiva */
  fixed: Placed[];
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
export const newPage = (): Page => ({ items: [], fixed: [], shelves: [], fail: Infinity });

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

/** ¿Un rectángulo w×h centrado en (cx, cy) choca con algún pin fijado? Devuelve el que estorba. */
function blockedBy(page: Page, cx: number, cy: number, w: number, h: number, g: number): Placed | null {
  for (const o of page.fixed) {
    const nx = Math.max(cx - w / 2, Math.min(o.x, cx + w / 2));
    const ny = Math.max(cy - h / 2, Math.min(o.y, cy + h / 2));
    if (Math.hypot(o.x - nx, o.y - ny) < o.r + g - 1e-4) return o;
  }
  return null;
}

/**
 * Cuadrícula por estantes: cada pieza w×h va en la primera fila donde quepa.
 * Si hay pines fijados, se salta el tramo que ocupan y sigue a su derecha.
 */
function gridPos(page: Page, w: number, h: number, s: PageSettings): { x: number; y: number; commit: () => void } | null {
  const U = usable(s);
  const g = s.gap;
  for (const sh of page.shelves) {
    if (h > sh.h + E) continue;
    let x = sh.x;
    const cy = sh.y + sh.h / 2;
    while (x + w <= U.x1 + E) {
      const b = blockedBy(page, x + w / 2, cy, w, h, g);
      if (!b) {
        const at = x;
        return { x: at + w / 2, y: cy, commit: () => void (sh.x = at + w + g) };
      }
      x = Math.max(x + 0.5, b.x + b.r + g);
    }
  }
  const last = page.shelves[page.shelves.length - 1];
  let y = last ? last.y + last.h + g : U.y0;
  while (y + h <= U.y1 + E) {
    let x = U.x0;
    while (x + w <= U.x1 + E) {
      const b = blockedBy(page, x + w / 2, y + h / 2, w, h, g);
      if (!b) {
        const at = x;
        const yy = y;
        return {
          x: at + w / 2,
          y: yy + h / 2,
          commit: () => void page.shelves.push({ y: yy, h, x: at + w + g }),
        };
      }
      x = Math.max(x + 0.5, b.x + b.r + g);
    }
    y += 1; // la fila está tapada por pines fijados: probar un poco más abajo
  }
  return null;
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

/** Acomoda `items`; `start` son hojas que ya traen pines fijados (se respetan). */
export function packWith(items: PackItem[], algo: 'grid' | 'hex', s: PageSettings, start: Page[] = []): PackResult {
  const pages: Page[] = start.map(clonePage);
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
    // Las hojas con pines fijados no se mueven (si no, los fijados se correrían).
    if (p.fixed.length) continue;
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
  if (s.algo === 'auto' || s.algo === 'free') {
    const G = packWith(items, 'grid', s);
    const H = packWith(items, 'hex', s);
    res = H.pages.length < G.pages.length || (H.pages.length === G.pages.length && H.unfit.length < G.unfit.length) ? H : G;
  } else res = packWith(items, s.algo, s);
  return res;
}

export function clonePage(p: Page): Page {
  const items = p.items.map((i) => ({ ...i }));
  const fixedKeys = new Set(p.fixed.map((f) => f.key));
  return { items, fixed: items.filter((i) => fixedKeys.has(i.key)), shelves: p.shelves.map((s) => ({ ...s })), fail: Infinity };
}

/** Cuántas piezas de un tamaño más caben en una hoja (vacía o ya empezada). */
export function countFit(page: Page, probe: Omit<PackItem, 'order' | 'designId' | 'key'>, algo: 'grid' | 'hex', s: PageSettings, cap = 500): number {
  const pg = clonePage(page);
  let n = 0;
  while (n < cap && place(pg, { ...probe, designId: -1, order: 0, key: `probe:${n}` }, algo, s)) n++;
  return n;
}

const capCache = new Map<string, number>();

/** Capacidad máxima de una hoja vacía para un molde. */
export function capacity(probe: Omit<PackItem, 'order' | 'designId' | 'key'>, algo: 'grid' | 'hex', s: PageSettings): number {
  const k = [probe.w, probe.h, probe.r, s.w, s.h, s.margin, s.gap, algo].join('|');
  let v = capCache.get(k);
  if (v === undefined) {
    v = countFit(newPage(), probe, algo, s);
    capCache.set(k, v);
  }
  return v;
}

export function bestCapacity(probe: Omit<PackItem, 'order' | 'designId' | 'key'>, s: PageSettings): number {
  return s.algo === 'grid' || s.algo === 'hex' ? capacity(probe, s.algo, s) : Math.max(capacity(probe, 'grid', s), capacity(probe, 'hex', s));
}
