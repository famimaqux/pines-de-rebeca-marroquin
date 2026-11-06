import { describe, expect, it } from 'vitest';
import { layoutShaped } from '../src/render/text';
import { newDesign } from '../src/model/design';
import { BG_PRESETS, RING_PRESETS, WORDART, applyBgPreset, applyRingPreset, applyWordArt } from '../src/model/galleries';

// Contexto falso: cada letra mide 5 mm de ancho.
const ctx = { measureText: () => ({ width: 5 }) } as unknown as CanvasRenderingContext2D;

describe('formas WordArt del texto del centro', () => {
  it('recto: todas las letras a la misma altura y sin girar', () => {
    const g = layoutShaped(ctx, 'REBECA', 0, 100, 8, 'recto', 0.5);
    expect(new Set(g.map((x) => x.y)).size).toBe(1);
    expect(g.every((x) => x.rot === 0)).toBe(true);
  });

  it('arco hacia arriba: el centro queda más alto que las puntas', () => {
    const g = layoutShaped(ctx, 'REBECA', 0, 100, 8, 'arcoArriba', 0.6);
    const mid = (g[2].y + g[3].y) / 2;
    expect(mid).toBeLessThan(g[0].y);
    expect(mid).toBeLessThan(g[5].y);
    expect(g[0].rot).toBeLessThan(0);
    expect(g[5].rot).toBeGreaterThan(0);
  });

  it('arco hacia abajo: el centro queda más bajo que las puntas', () => {
    const g = layoutShaped(ctx, 'REBECA', 0, 100, 8, 'arcoAbajo', 0.6);
    const mid = (g[2].y + g[3].y) / 2;
    expect(mid).toBeGreaterThan(g[0].y);
  });

  it('onda: sube y baja, y más curvatura = más altura', () => {
    const low = layoutShaped(ctx, 'ONDAONDA', 0, 100, 8, 'onda', 0.2);
    const high = layoutShaped(ctx, 'ONDAONDA', 0, 100, 8, 'onda', 1);
    const span = (g: { y: number }[]) => Math.max(...g.map((x) => x.y)) - Math.min(...g.map((x) => x.y));
    expect(span(high)).toBeGreaterThan(span(low));
    expect(Math.min(...high.map((x) => x.y))).toBeLessThan(0);
    expect(Math.max(...high.map((x) => x.y))).toBeGreaterThan(0);
  });
});

describe('galerías', () => {
  it('hay entre 8 y 10 fondos prediseñados y 8 WordArt', () => {
    expect(BG_PRESETS.length).toBeGreaterThanOrEqual(8);
    expect(BG_PRESETS.length).toBeLessThanOrEqual(10);
    expect(Object.keys(WORDART)).toHaveLength(8);
  });

  it('aplicar un fondo cambia color y patrón pero conserva la imagen de fondo propia', () => {
    const d = newDesign('r58');
    d.bg.imageId = 'mi-papel';
    applyBgPreset(d, BG_PRESETS[1]);
    expect(d.bg.type).toBe(BG_PRESETS[1].bg.type);
    expect(d.pattern.type).toBe(BG_PRESETS[1].pattern.type);
    expect(d.bg.imageId).toBe('mi-papel');
  });

  it('aplicar un borde y un WordArt no cambia el texto', () => {
    const d = newDesign('r58');
    d.text.middle = 'Valentina';
    applyRingPreset(d, RING_PRESETS[2]);
    for (const name of Object.keys(WORDART)) applyWordArt(d, name);
    expect(d.ring.finish).toBe('oro');
    expect(d.text.middle).toBe('Valentina');
  });
});
