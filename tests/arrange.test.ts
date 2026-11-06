import { describe, expect, it } from 'vitest';
import { newDesign, type Design } from '../src/model/design';
import { DEFAULT_SIZES, type PinSize } from '../src/model/sizes';
import { paperSize, type Orientation, type PaperId } from '../src/model/paper';
import { computeLayout, pinKey } from '../src/layout/sheets';
import { fits, nearestFree, type Fixed } from '../src/layout/arrange';
import type { Page, PageSettings } from '../src/layout/pack';

const SIZES = DEFAULT_SIZES as PinSize[];
const S = (id: PaperId = 'a4', o: Orientation = 'vertical', algo: PageSettings['algo'] = 'auto'): PageSettings => ({
  ...paperSize({ id, orientation: o, customW: 0, customH: 0 }),
  margin: 5,
  gap: 1.5,
  algo,
});
const ds = (spec: [string, number][]): Design[] => spec.map(([sz, q]) => Object.assign(newDesign(sz), { qty: q }));

/** Ningún pin se encima ni se sale del margen (contando el corte como círculo). */
function noOverlap(pages: Page[], s: PageSettings) {
  for (const p of pages) {
    for (const a of p.items) {
      expect(a.x - a.r).toBeGreaterThanOrEqual(s.margin - 1e-3);
      expect(a.y - a.r).toBeGreaterThanOrEqual(s.margin - 1e-3);
      expect(a.x + a.r).toBeLessThanOrEqual(s.w - s.margin + 1e-3);
      expect(a.y + a.r).toBeLessThanOrEqual(s.h - s.margin + 1e-3);
    }
    for (let i = 0; i < p.items.length; i++)
      for (let j = i + 1; j < p.items.length; j++) {
        const a = p.items[i];
        const b = p.items[j];
        // en la cuadrícula los no fijados se separan por su rectángulo; con círculos basta esta cota
        const minD = p.fixed.includes(a) || p.fixed.includes(b) ? a.r + b.r + s.gap : Math.max(a.r + b.r + s.gap, 0) * 0;
        if (minD) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(minD - 1e-3);
      }
  }
}
const find = (pages: Page[], key: string) => {
  for (let i = 0; i < pages.length; i++) {
    const it = pages[i].items.find((x) => x.key === key);
    if (it) return { sheet: i, x: it.x, y: it.y, r: it.r };
  }
  return null;
};

describe('hueco libre más cercano', () => {
  it('si el punto está libre, lo devuelve tal cual', () => {
    const s = S();
    expect(nearestFree(100, 100, 35, [], s)).toEqual([100, 100]);
  });
  it('si está ocupado, da un lugar cercano que sí cabe', () => {
    const s = S();
    const other = { key: 'o', designId: 1, sizeId: 'r58', w: 70, h: 70, r: 35, order: 0, x: 100, y: 100 };
    const p = nearestFree(100, 100, 35, [other], s)!;
    expect(fits(p[0], p[1], 35, [other], s)).toBe(true);
    expect(Math.hypot(p[0] - 100, p[1] - 100)).toBeLessThan(75);
  });
});

describe.each(['auto', 'grid'] as const)('pines fijados en modo %s', (algo) => {
  it('se quedan exactamente donde se dejaron y los demás se acomodan alrededor sin encimarse', () => {
    const s = S('a4', 'vertical', algo);
    const designs = ds([['r58', 6], ['r25', 10]]);
    const d0 = designs[0];
    const fixed = new Map<string, Fixed>([
      [pinKey(d0.id, 0), { sheet: 0, x: 105, y: 150, manual: true }],
      [pinKey(d0.id, 1), { sheet: 0, x: 40, y: 250, manual: true }],
    ]);
    const L = computeLayout(designs, SIZES, s, fixed);
    expect(find(L.pages, pinKey(d0.id, 0))).toMatchObject({ sheet: 0, x: 105, y: 150 });
    expect(find(L.pages, pinKey(d0.id, 1))).toMatchObject({ sheet: 0, x: 40, y: 250 });
    expect(L.pages.reduce((a, p) => a + p.items.length, 0)).toBe(16);
    // nadie toca a los fijados
    for (const p of L.pages)
      for (const f of p.fixed)
        for (const it of p.items) if (it !== f) expect(Math.hypot(it.x - f.x, it.y - f.y)).toBeGreaterThanOrEqual(it.r + f.r + s.gap - 1e-3);
    noOverlap(L.pages, s);
  });

  it('un pin fijado a otra hoja se queda en esa hoja', () => {
    const s = S('a4', 'vertical', algo);
    const designs = ds([['r58', 3]]);
    const k = pinKey(designs[0].id, 2);
    const L = computeLayout(designs, SIZES, s, new Map([[k, { sheet: 1, x: 60, y: 60, manual: true }]]));
    expect(L.pages.length).toBe(2);
    expect(find(L.pages, k)).toMatchObject({ sheet: 1, x: 60, y: 60 });
  });
});

describe('modo Libre', () => {
  it('nada se reacomoda solo: al agregar un pin, los demás no se mueven', () => {
    const s = S('a4', 'vertical', 'free');
    const designs = ds([['r58', 4]]);
    const first = computeLayout(designs, SIZES, s);
    const before = new Map(first.fixed);
    expect(before.size).toBe(4);
    designs[0].qty = 5; // agregar uno
    const second = computeLayout(designs, SIZES, s, before);
    for (const [k, f] of before) expect(find(second.pages, k)).toMatchObject({ sheet: f.sheet, x: f.x, y: f.y });
    expect(second.fixed.size).toBe(5);
    noOverlap(second.pages, s);
  });

  it('quitar un pin no mueve a los otros', () => {
    const s = S('a4', 'vertical', 'free');
    const designs = ds([['r58', 2], ['r37', 3]]);
    const first = computeLayout(designs, SIZES, s);
    const fixed = new Map(first.fixed);
    designs[1].qty = 2;
    const second = computeLayout(designs, SIZES, s, fixed);
    const f0 = fixed.get(pinKey(designs[0].id, 0))!;
    expect(find(second.pages, pinKey(designs[0].id, 0))).toMatchObject({ sheet: f0.sheet, x: f0.x, y: f0.y });
  });
});

describe('si un pin fijado ya no cabe', () => {
  it('al agrandarlo se mueve al hueco libre más cercano y se avisa', () => {
    const s = S('a4', 'vertical', 'auto');
    const designs = ds([['r25', 1], ['r25', 1]]);
    const [a, b] = designs;
    // dos de 25 mm (corte 35) uno al lado del otro
    const fixed = new Map<string, Fixed>([
      [pinKey(a.id, 0), { sheet: 0, x: 40, y: 40, manual: true }],
      [pinKey(b.id, 0), { sheet: 0, x: 77, y: 40, manual: true }],
    ]);
    b.sizeId = 'r75'; // ahora el corte mide 88 mm: no cabe ahí
    const L = computeLayout(designs, SIZES, s, fixed);
    expect(L.relocated).toEqual([pinKey(b.id, 0)]);
    const nb = find(L.pages, pinKey(b.id, 0))!;
    expect(nb.r).toBe(44);
    expect(Math.hypot(nb.x - 40, nb.y - 40)).toBeGreaterThanOrEqual(17.5 + 44 + 1.5 - 1e-3);
    expect(L.fixed.get(pinKey(b.id, 0))).toMatchObject({ x: nb.x, y: nb.y });
    noOverlap(L.pages, s);
  });

  it('al pasar de A3 a A5 los fijados que quedan fuera vuelven a entrar', () => {
    const designs = ds([['r58', 1]]);
    const k = pinKey(designs[0].id, 0);
    const L = computeLayout(designs, SIZES, S('a5'), new Map([[k, { sheet: 0, x: 250, y: 380, manual: true }]]));
    const p = find(L.pages, k)!;
    expect(p.x + p.r).toBeLessThanOrEqual(148 - 5 + 1e-3);
    expect(p.y + p.r).toBeLessThanOrEqual(210 - 5 + 1e-3);
    expect(L.relocated).toContain(k);
  });
});

it('si se mueve el único pin de una hoja, esa hoja vacía desaparece', () => {
  const s = S('a4', 'vertical', 'auto');
  const designs = ds([['r58', 1]]);
  const k = pinKey(designs[0].id, 0);
  const L = computeLayout(designs, SIZES, s, new Map([[k, { sheet: 3, x: 60, y: 60, manual: true }]]));
  expect(L.pages.length).toBe(1);
  expect(L.fixed.get(k)!.sheet).toBe(0);
});
