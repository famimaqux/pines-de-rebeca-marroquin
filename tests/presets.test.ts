import { describe, expect, it } from 'vitest';
import { newDesign } from '../src/model/design';
import { PRESETS, applyPreset, copyStyle, scaleDesign } from '../src/model/presets';
import { LETTERING, applyLettering } from '../src/model/lettering';
import { DEFAULT_SIZES } from '../src/model/sizes';

describe('estilos', () => {
  it('los estilos rápidos no borran los textos ni las imágenes', () => {
    for (const name of Object.keys(PRESETS)) {
      const d = newDesign('r58', 'img-1');
      d.bg.imageId = 'img-bg';
      Object.assign(d.text, { top: 'A', middle: 'Rebeca', bottom: 'B' });
      applyPreset(d, name);
      expect([d.text.top, d.text.middle, d.text.bottom, d.image.imageId, d.bg.imageId]).toEqual(['A', 'Rebeca', 'B', 'img-1', 'img-bg']);
    }
  });

  it('están los 9 estilos pedidos', () => {
    expect(Object.keys(PRESETS)).toEqual(['Minimal', 'Arcoíris', 'Kawaii', 'Retro sol', 'Dorado', 'Lunares', 'Neón', 'Rayitas', 'Colorear']);
  });

  it('copiar estilo incluye la imagen de fondo y conserva los textos del destino', () => {
    const a = newDesign('r58');
    applyPreset(a, 'Dorado');
    a.bg.imageId = 'papel';
    const b = newDesign('r25');
    b.text.middle = 'Mateo';
    copyStyle(a, b);
    expect(b.bg.imageId).toBe('papel');
    expect(b.ring.finish).toBe('oro');
    expect(b.text.middle).toBe('Mateo');
  });

  it('los modelos de letra cambian el aspecto, no el texto', () => {
    for (const name of Object.keys(LETTERING)) {
      const d = newDesign('r58');
      d.text.middle = 'Sofía';
      applyLettering(d, name);
      expect(d.text.middle).toBe('Sofía');
    }
  });

  it('escala texto, borde y stickers en proporción al cambiar de tamaño', () => {
    const d = newDesign('r58');
    d.text.size = 6;
    d.ring.width = 4;
    d.stickers.push({ id: 1, emoji: '⭐', size: 10, x: 0, y: 20, rot: 0 });
    const r58 = DEFAULT_SIZES.find((s) => s.id === 'r58')!;
    const r25 = DEFAULT_SIZES.find((s) => s.id === 'r25')!;
    scaleDesign(d, r58, r25);
    const k = 25 / 58;
    expect(d.sizeId).toBe('r25');
    expect(d.text.size).toBeCloseTo(6 * k);
    expect(d.ring.width).toBeCloseTo(4 * k);
    expect(d.stickers[0].y).toBeCloseTo(20 * k);
  });
});
