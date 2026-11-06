import type { Design } from '../model/design';
import { packRadius, type PinSize } from '../model/sizes';
import { bestCapacity, centerPages, countFit, pack, type PackItem, type PackResult, type Page, type PageSettings } from './pack';

export const MAX_QTY = 999;

export function probeFor(s: PinSize): Omit<PackItem, 'order' | 'designId'> {
  return { sizeId: s.id, w: s.cutW, h: s.cutH, r: packRadius(s) };
}

export function buildItems(designs: Design[], sizes: PinSize[]): PackItem[] {
  const items: PackItem[] = [];
  designs.forEach((d, order) => {
    const s = sizes.find((x) => x.id === d.sizeId);
    if (!s) return;
    const n = Math.max(0, Math.min(MAX_QTY, Math.floor(d.qty)));
    for (let k = 0; k < n; k++) items.push({ ...probeFor(s), designId: d.id, order });
  });
  return items;
}

export interface Layout extends PackResult {
  total: number;
  /** cuántos más de cada molde caben en la última hoja */
  free: Record<string, number>;
}

export function computeLayout(designs: Design[], sizes: PinSize[], settings: PageSettings): Layout {
  const items = buildItems(designs, sizes);
  const res = pack(items, settings);
  const free: Record<string, number> = {};
  const last = res.pages[res.pages.length - 1];
  if (last) for (const s of sizes) free[s.id] = countFit(last, probeFor(s), res.algo, settings, 300);
  centerPages(res.pages, settings);
  return { ...res, total: items.length, free };
}

export function capacityOf(s: PinSize, settings: PageSettings): number {
  return bestCapacity(probeFor(s), settings);
}

/** Etiqueta de la hoja, p. ej. "6× 58 mm + 12× 25 mm". */
export function pageLabel(p: Page, sizes: PinSize[]): string {
  const count = new Map<string, number>();
  for (const it of p.items) count.set(it.sizeId, (count.get(it.sizeId) ?? 0) + 1);
  return [...count.entries()]
    .map(([id, n]) => {
      const s = sizes.find((x) => x.id === id);
      return `${n}× ${s ? shortName(s) : id}`;
    })
    .join(' + ');
}

export function shortName(s: PinSize): string {
  return s.shape === 'circle' ? `${s.faceW} mm` : s.name;
}
