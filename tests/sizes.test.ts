import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZES, foldMargin, loadSizes, sanitizeSize, saveSizes } from '../src/model/sizes';

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('medidas de los moldes', () => {
  it('trae las 7 medidas de fábrica con cara y corte correctos', () => {
    const t = DEFAULT_SIZES.map((s) => [s.id, s.faceW, s.faceH, s.cutW, s.cutH]);
    expect(t).toEqual([
      ['r25', 25, 25, 35, 35],
      ['r32', 32, 32, 44, 44],
      ['r37', 37, 37, 49, 49],
      ['r44', 44, 44, 56, 56],
      ['r58', 58, 58, 70, 70],
      ['r75', 75, 75, 88, 88],
      ['h57', 57, 52, 68, 63],
    ]);
  });

  it('calcula el doblez', () => {
    expect(foldMargin(DEFAULT_SIZES[4])).toBe(6);
  });

  it('rechaza cortes menores que la cara y medidas absurdas', () => {
    expect(sanitizeSize({ shape: 'circle', faceW: 40, cutW: 30 })).toBeNull();
    expect(sanitizeSize({ shape: 'oval', faceW: 40, faceH: 30, cutW: 50, cutH: 0 })).toBeNull();
    expect(sanitizeSize({ shape: 'circle', faceW: 500, cutW: 600 })).toBeNull();
  });

  it('en el círculo el alto es igual al ancho', () => {
    const s = sanitizeSize({ shape: 'circle', faceW: 50, faceH: 10, cutW: 62, cutH: 1 })!;
    expect([s.faceH, s.cutH]).toEqual([50, 62]);
  });

  it('guarda y recupera moldes personalizados', () => {
    const st = memStorage();
    const custom = sanitizeSize({ shape: 'roundsq', faceW: 50, faceH: 50, cutW: 62, cutH: 62, custom: true })!;
    saveSizes([...DEFAULT_SIZES, custom], st);
    const back = loadSizes(st);
    expect(back).toHaveLength(8);
    expect(back[7]).toMatchObject({ shape: 'roundsq', faceW: 50, cutW: 62, custom: true });
  });

  it('si los datos guardados están dañados usa los de fábrica', () => {
    const st = memStorage();
    st.setItem('pines-rebeca.sizes.v1', '{no es json');
    expect(loadSizes(st)).toHaveLength(7);
  });
});
