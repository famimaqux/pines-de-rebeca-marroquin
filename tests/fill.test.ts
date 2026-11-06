import { describe, expect, it } from 'vitest';
import { newDesign } from '../src/model/design';
import { DEFAULT_SIZES, type PinSize } from '../src/model/sizes';
import { paperSize } from '../src/model/paper';
import { computeFill } from '../src/layout/fill';
import { capacityOf, computeLayout } from '../src/layout/sheets';
import type { PageSettings } from '../src/layout/pack';

const SIZES = DEFAULT_SIZES as PinSize[];
const A4: PageSettings = { ...paperSize({ id: 'a4', orientation: 'vertical', customW: 0, customH: 0 }), margin: 5, gap: 1.5, algo: 'auto' };
const NONE = new Map();

function overlaps(designs: ReturnType<typeof newDesign>[]) {
  const L = computeLayout(designs, SIZES, A4, NONE, undefined, true);
  let bad = 0;
  for (const p of L.pages)
    for (let i = 0; i < p.items.length; i++)
      for (let j = i + 1; j < p.items.length; j++) {
        const a = p.items[i];
        const b = p.items[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + A4.gap - 1e-3 && !(p.shelves.length && (Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + A4.gap - 1e-3 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 + A4.gap - 1e-3))) bad++;
      }
  return { bad, pages: L.pages.length, unfit: L.unfit.length, L };
}

describe.each([
  ['r58', 'de 58 mm'],
  ['r25', 'de 25 mm'],
])('Llenar hoja con pines %s', (sizeId) => {
  const cap = capacityOf(SIZES.find((s) => s.id === sizeId)!, A4);

  it.each([1, 2, 3])('%i diseño(s): llena la hoja exacta, en partes iguales y sin solapes', (n) => {
    const ds = Array.from({ length: n }, () => newDesign(sizeId));
    const q = computeFill(ds, SIZES, A4, NONE, { mode: 'equal', sheets: 1 });
    const counts = ds.map((d) => q[d.id]);
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total).toBe(cap);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    // el sobrante va de uno en uno y en orden: los primeros reciben uno más
    for (let i = 1; i < counts.length; i++) expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
    ds.forEach((d) => (d.qty = q[d.id]));
    const r = overlaps(ds);
    expect(r.pages).toBe(1);
    expect(r.unfit).toBe(0);
    expect(r.bad).toBe(0);
  });
});

it('"Según mis cantidades": reparte en proporción a las cantidades de antes', () => {
  const ds = [newDesign('r25'), newDesign('r25')];
  const q = computeFill(ds, SIZES, A4, NONE, { mode: 'proportional', sheets: 1, weights: { [ds[0].id]: 3, [ds[1].id]: 1 } });
  const a = q[ds[0].id];
  const b = q[ds[1].id];
  expect(a + b).toBe(capacityOf(SIZES.find((s) => s.id === 'r25')!, A4));
  expect(a / (a + b)).toBeGreaterThan(0.7);
  expect(a / (a + b)).toBeLessThan(0.8);
});

it('"N hojas": llena varias hojas', () => {
  const ds = [newDesign('r58')];
  const cap = capacityOf(SIZES.find((s) => s.id === 'r58')!, A4);
  const q = computeFill(ds, SIZES, A4, NONE, { mode: 'equal', sheets: 3 });
  expect(q[ds[0].id]).toBe(cap * 3);
});

it('los diseños se intercalan (A, B, C, A, B, C…), no se agrupan', () => {
  const ds = [newDesign('r58'), newDesign('r58'), newDesign('r58')];
  const q = computeFill(ds, SIZES, A4, NONE, { mode: 'equal', sheets: 1 });
  ds.forEach((d) => (d.qty = q[d.id]));
  const L = computeLayout(ds, SIZES, A4, NONE, undefined, true);
  const seq = L.pages[0].items.slice(0, 6).map((i) => ds.findIndex((d) => d.id === i.designId));
  expect(seq).toEqual([0, 1, 2, 0, 1, 2]);
});

it('mezcla de tamaños: los chicos rellenan los huecos sin salirse de la hoja', () => {
  const ds = [newDesign('r58'), newDesign('r25')];
  const q = computeFill(ds, SIZES, A4, NONE, { mode: 'equal', sheets: 1 });
  ds.forEach((d) => (d.qty = q[d.id]));
  const r = overlaps(ds);
  expect(r.pages).toBe(1);
  expect(r.unfit).toBe(0);
  expect(q[ds[0].id]).toBeGreaterThan(0);
  expect(q[ds[1].id]).toBeGreaterThan(0);
});

import { restoredQuantities } from '../src/layout/fill';
import { pinKey } from '../src/layout/sheets';

it('al desactivar "Llenar hoja" vuelven las cantidades de antes (los nuevos quedan en 1)', () => {
  const ds = [newDesign('r58'), newDesign('r58'), newDesign('r25')];
  const saved = { [ds[0].id]: 2, [ds[1].id]: 5 };
  const q = computeFill(ds, SIZES, A4, NONE, { mode: 'equal', sheets: 1 });
  ds.forEach((d) => (d.qty = q[d.id]));
  const back = restoredQuantities(ds, saved);
  expect(back).toEqual({ [ds[0].id]: 2, [ds[1].id]: 5, [ds[2].id]: 1 });
});

it('Ordenar después de mover pines: sin fijados, todo vuelve al acomodo automático', () => {
  const ds = [newDesign('r58'), newDesign('r58')];
  ds[0].qty = 3;
  ds[1].qty = 3;
  const fresh = computeLayout(ds, SIZES, A4, NONE);
  // mover a mano dos pines (quedan fijados)
  const moved = new Map([
    [pinKey(ds[0].id, 0), { sheet: 0, x: 150, y: 240, manual: true }],
    [pinKey(ds[1].id, 2), { sheet: 0, x: 45, y: 250, manual: true }],
  ]);
  const messy = computeLayout(ds, SIZES, A4, moved);
  expect(JSON.stringify(messy.pages[0].items.map((i) => [i.key, i.x, i.y]))).not.toBe(JSON.stringify(fresh.pages[0].items.map((i) => [i.key, i.x, i.y])));
  // "Ordenar" = soltar los fijados
  const ordered = computeLayout(ds, SIZES, A4, new Map());
  expect(ordered.pages.map((p) => p.items.map((i) => [i.key, i.x, i.y]))).toEqual(fresh.pages.map((p) => p.items.map((i) => [i.key, i.x, i.y])));
});
