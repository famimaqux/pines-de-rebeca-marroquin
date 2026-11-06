import { describe, expect, it } from 'vitest';
import { newDesign } from '../src/model/design';
import { DEFAULT_SIZES, type PinSize } from '../src/model/sizes';
import { PAPERS, paperSize, type Orientation, type PaperId } from '../src/model/paper';
import { computeLayout, capacityOf } from '../src/layout/sheets';
import { capacity, type Page, type PageSettings } from '../src/layout/pack';

const SIZES = DEFAULT_SIZES as PinSize[];
const size = (id: string) => SIZES.find((s) => s.id === id)!;
const settings = (id: PaperId, o: Orientation, algo: PageSettings['algo'] = 'auto'): PageSettings => ({
  ...paperSize({ id, orientation: o, customW: 200, customH: 250 }),
  margin: 5,
  gap: 1.5,
  algo,
});

function designs(spec: [string, number][]) {
  return spec.map(([sizeId, qty]) => Object.assign(newDesign(sizeId), { qty }));
}

/** Comprueba que nada se encime ni salga del margen. */
function checkPages(pages: Page[], s: PageSettings) {
  const E = 1e-3;
  for (const p of pages) {
    const grid = p.shelves.length > 0;
    for (const a of p.items) {
      const hw = grid ? a.w / 2 : a.r;
      const hh = grid ? a.h / 2 : a.r;
      expect(a.x - hw).toBeGreaterThanOrEqual(s.margin - E);
      expect(a.y - hh).toBeGreaterThanOrEqual(s.margin - E);
      expect(a.x + hw).toBeLessThanOrEqual(s.w - s.margin + E);
      expect(a.y + hh).toBeLessThanOrEqual(s.h - s.margin + E);
    }
    for (let i = 0; i < p.items.length; i++)
      for (let j = i + 1; j < p.items.length; j++) {
        const a = p.items[i];
        const b = p.items[j];
        if (grid) {
          // cuadrícula: los rectángulos de corte quedan separados al menos `gap`
          const sepX = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
          const sepY = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
          expect(Math.max(sepX, sepY)).toBeGreaterThanOrEqual(s.gap - E);
        } else {
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r + s.gap - E);
        }
      }
  }
}

describe('papel', () => {
  it('A4 vertical y horizontal miden lo correcto', () => {
    expect(paperSize({ id: 'a4', orientation: 'vertical', customW: 0, customH: 0 })).toEqual({ w: 210, h: 297 });
    expect(paperSize({ id: 'a4', orientation: 'horizontal', customW: 0, customH: 0 })).toEqual({ w: 297, h: 210 });
  });
  it('personalizado usa las medidas escritas', () => {
    expect(paperSize({ id: 'custom', orientation: 'vertical', customW: 180, customH: 120 })).toEqual({ w: 120, h: 180 });
  });
});

describe('capacidad por molde en A4 (margen 5, separación 1,5)', () => {
  const s = settings('a4', 'vertical');
  it.each(['r25', 'r32', 'r37', 'r44', 'r58', 'r75', 'h57'])('%s: la cuadrícula da filas × columnas y el automático nunca menos', (id) => {
    const sz = size(id);
    const cols = Math.floor((s.w - 2 * s.margin + s.gap) / (sz.cutW + s.gap));
    const rows = Math.floor((s.h - 2 * s.margin + s.gap) / (sz.cutH + s.gap));
    expect(capacity({ sizeId: id, w: sz.cutW, h: sz.cutH, r: Math.max(sz.cutW, sz.cutH) / 2 }, 'grid', s)).toBe(cols * rows);
    expect(capacityOf(sz, s)).toBeGreaterThanOrEqual(cols * rows);
  });
  it('58 mm: 8 por hoja en cuadrícula (2 × 4); 25 mm: 35 (5 × 7)', () => {
    expect(capacity({ sizeId: 'r58', w: 70, h: 70, r: 35 }, 'grid', s)).toBe(8);
    expect(capacity({ sizeId: 'r25', w: 35, h: 35, r: 17.5 }, 'grid', s)).toBe(35);
  });
});

const combos = PAPERS.filter((p) => p.id !== 'custom').flatMap((p) => (['vertical', 'horizontal'] as const).map((o) => [p.id, o] as const));

describe.each(combos)('acomodo en %s %s', (id, o) => {
  for (const algo of ['auto', 'grid', 'hex'] as const) {
    it(`${algo}: sin solapes ni salidas del margen, con redondos y corazón mezclados`, () => {
      const s = settings(id, o, algo);
      const L = computeLayout(designs([['r58', 9], ['h57', 3], ['r25', 14], ['r32', 5]]), SIZES, s);
      expect(L.total).toBe(31);
      expect(L.unfit.length).toBe(0);
      expect(L.pages.reduce((a, p) => a + p.items.length, 0)).toBe(31);
      checkPages(L.pages, s);
    });
  }
});

it('primero los grandes: el corazón y los 58 mm van antes que los 25 mm', () => {
  const s = settings('a4', 'vertical', 'grid');
  const L = computeLayout(designs([['r25', 3], ['h57', 1], ['r58', 2]]), SIZES, s);
  const order = L.pages[0].items.map((i) => i.sizeId);
  expect(order.indexOf('r25')).toBeGreaterThan(order.lastIndexOf('r58'));
  expect(order.indexOf('r25')).toBeGreaterThan(order.indexOf('h57'));
});

it('los chicos rellenan huecos de hojas anteriores', () => {
  const s = settings('a4', 'vertical', 'grid');
  // 9 de 58 mm → 2 hojas (8 + 1). Los 25 mm van primero a los huecos de la hoja 1.
  const L = computeLayout(designs([['r58', 9], ['r25', 2]]), SIZES, s);
  expect(L.pages.length).toBe(2);
  expect(L.pages[0].items.filter((i) => i.sizeId === 'r25').length).toBe(2);
});

it('pasar de A3 a A4 reacomoda todo dentro del A4', () => {
  const ds = designs([['r58', 30]]);
  const a3 = computeLayout(ds, SIZES, settings('a3', 'vertical'));
  const a4s = settings('a4', 'vertical');
  const a4 = computeLayout(ds, SIZES, a4s);
  expect(a3.pages.length).toBeLessThan(a4.pages.length);
  expect(a4.pages.reduce((a, p) => a + p.items.length, 0)).toBe(30);
  checkPages(a4.pages, a4s);
});
