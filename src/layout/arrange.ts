import { centerPages, newPage, packWith, type PackItem, type PackResult, type Page, type PageSettings, type Placed } from './pack';

/**
 * Acomodo con pines fijados.
 * - Un pin "fijado" tiene hoja y posición propias. Los fijados a mano (📌)
 *   se respetan en Automático y Cuadrícula; en modo Libre TODOS los pines
 *   quedan fijos (nada se reacomoda solo).
 * - Si un fijado ya no cabe donde está (p. ej. porque se agrandó), se mueve
 *   al hueco libre más cercano y se avisa.
 */

export type ArrangeMode = 'auto' | 'grid' | 'free';

export interface Fixed {
  sheet: number;
  x: number;
  y: number;
  /** true = fijado a mano (📌); false = fijo solo por estar en modo Libre */
  manual: boolean;
}

export interface ArrangeResult extends PackResult {
  /** posiciones fijas finales (para guardarlas): incluye reubicados y, en Libre, los nuevos */
  fixed: Map<string, Fixed>;
  /** pines fijados que se tuvieron que mover porque ya no cabían */
  relocated: string[];
}

const E = 1e-3;

/** ¿Cabe un círculo de radio r en (x, y) sin salirse del margen ni tocar a `others`? */
export function fits(x: number, y: number, r: number, others: readonly Placed[], s: PageSettings): boolean {
  if (x - r < s.margin - E || y - r < s.margin - E || x + r > s.w - s.margin + E || y + r > s.h - s.margin + E) return false;
  for (const o of others) if (Math.hypot(o.x - x, o.y - y) < o.r + r + s.gap - E) return false;
  return true;
}

/**
 * Hueco libre más cercano a (x, y) para un pin de radio r.
 * Busca en anillos cada vez más grandes alrededor del punto pedido.
 */
export function nearestFree(x: number, y: number, r: number, others: readonly Placed[], s: PageSettings): [number, number] | null {
  // Primero, el mismo punto metido dentro del margen.
  const cx = Math.min(s.w - s.margin - r, Math.max(s.margin + r, x));
  const cy = Math.min(s.h - s.margin - r, Math.max(s.margin + r, y));
  if (fits(cx, cy, r, others, s)) return [cx, cy];
  const maxR = Math.hypot(s.w, s.h);
  for (let rad = 1; rad <= maxR; rad += 1) {
    const steps = Math.max(12, Math.ceil((2 * Math.PI * rad) / 1.5));
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (!fits(px, py, r, others, s)) continue;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) {
        bd = d;
        best = [px, py];
      }
    }
    if (best) return best;
  }
  return null;
}

export function arrange(items: PackItem[], fixedIn: ReadonlyMap<string, Fixed>, s: PageSettings, mode: ArrangeMode): ArrangeResult {
  const fixedOut = new Map<string, Fixed>();
  const relocated: string[] = [];
  const pages: Page[] = [];
  const pageAt = (i: number) => {
    while (pages.length <= i) pages.push(newPage());
    return pages[i];
  };
  const put = (it: PackItem, sheet: number, x: number, y: number, f: Fixed) => {
    const pl: Placed = { ...it, x, y };
    const pg = pageAt(sheet);
    pg.items.push(pl);
    pg.fixed.push(pl);
    fixedOut.set(it.key, { ...f, sheet, x, y });
  };

  // 1) Pines fijados, en su hoja y posición (en el orden de la lista).
  const loose: PackItem[] = [];
  const fixedItems: [PackItem, Fixed][] = [];
  for (const it of items) {
    const f = fixedIn.get(it.key);
    if (f && (mode === 'free' || f.manual)) fixedItems.push([it, f]);
    else loose.push(it);
  }
  for (const [it, f] of fixedItems) {
    const sheet = Math.max(0, Math.floor(f.sheet));
    const pg = pageAt(sheet);
    if (fits(f.x, f.y, it.r, pg.items, s)) {
      put(it, sheet, f.x, f.y, f);
      continue;
    }
    // Ya no cabe (se agrandó, cambió el papel o el margen): al hueco libre más cercano.
    let done = false;
    for (let sh = sheet; sh < sheet + 50 && !done; sh++) {
      const spot = nearestFree(f.x, f.y, it.r, pageAt(sh).items, s);
      if (spot) {
        put(it, sh, spot[0], spot[1], f);
        relocated.push(it.key);
        done = true;
      }
    }
    if (!done) loose.push(it); // ni en una hoja nueva: lo acomoda el automático
  }

  // 2) El resto se acomoda solo alrededor de los fijados.
  const algoOf = (m: ArrangeMode, sAlgo: PageSettings['algo']): 'grid' | 'hex' | 'best' => (m === 'grid' ? 'grid' : sAlgo === 'hex' ? 'hex' : 'best');
  const algo = algoOf(mode, s.algo);
  let res: PackResult;
  if (algo === 'best') {
    const G = packWith(loose, 'grid', s, pages);
    const H = packWith(loose, 'hex', s, pages);
    res = H.pages.length < G.pages.length || (H.pages.length === G.pages.length && H.unfit.length < G.unfit.length) ? H : G;
  } else res = packWith(loose, algo, s, pages);

  // 3) Quitar hojas vacías (p. ej. si se movió el último pin de una hoja) y renumerar.
  const kept: Page[] = [];
  const remap = new Map<number, number>();
  res.pages.forEach((p, i) => {
    if (p.items.length) {
      remap.set(i, kept.length);
      kept.push(p);
    }
  });
  for (const [k, f] of fixedOut) {
    const to = remap.get(f.sheet);
    if (to !== undefined) fixedOut.set(k, { ...f, sheet: to });
  }
  centerPages(kept, s);
  // En Libre, los recién colocados también quedan fijos desde ya (ya centrados).
  if (mode === 'free') {
    kept.forEach((p, sheet) => {
      for (const it of p.items) if (!fixedOut.has(it.key)) fixedOut.set(it.key, { sheet, x: it.x, y: it.y, manual: false });
    });
  }
  return { pages: kept, unfit: res.unfit, algo: res.algo, fixed: fixedOut, relocated };
}
