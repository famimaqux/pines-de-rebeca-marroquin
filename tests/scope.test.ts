import { describe, expect, it } from 'vitest';
import { availableScopes, targetIds, type ScopeContext } from '../src/model/scope';
import { newDesign } from '../src/model/design';
import { copyBackground, copyRing, copyStickers, copyStyleScaled, copyTextStyle } from '../src/model/styleCopy';
import { applyPreset } from '../src/model/presets';

const ctx = (o: Partial<ScopeContext> = {}): ScopeContext => ({
  all: [1, 2, 3, 4, 5],
  currentId: 2,
  selection: new Set([3, 4]),
  sheetIds: new Set([1, 2, 3]),
  customIds: new Set([5, 1]),
  ...o,
});

describe('¿A qué pines lo aplico?', () => {
  it('cada opción elige los pines correctos', () => {
    const c = ctx();
    expect(targetIds('this', c)).toEqual([2]);
    expect(targetIds('selected', c)).toEqual([3, 4]);
    expect(targetIds('sheet', c)).toEqual([1, 2, 3]);
    expect(targetIds('all', c)).toEqual([1, 2, 3, 4, 5]);
    expect(targetIds('custom', c)).toEqual([1, 5]); // en el orden de la lista
  });

  it('sin selección no se ofrece "Pines seleccionados"; sin pin actual no se ofrece "Solo este pin"', () => {
    expect(availableScopes(ctx({ selection: new Set() }))).not.toContain('selected');
    expect(availableScopes(ctx({ currentId: null }))).not.toContain('this');
    expect(availableScopes(ctx())).toEqual(['this', 'selected', 'sheet', 'all', 'custom']);
  });

  it('ignora ids que ya no existen', () => {
    expect(targetIds('this', ctx({ currentId: 99 }))).toEqual([]);
    expect(targetIds('selected', ctx({ selection: new Set([99, 4]) }))).toEqual([4]);
  });
});

describe('copiar partes del diseño (con escala entre tamaños)', () => {
  it('fondo, borde y letras de un 58 mm a un 25 mm se escalan en proporción', () => {
    const a = newDesign('r58');
    applyPreset(a, 'Dorado');
    a.bg.imageId = 'papel';
    a.text.size = 5.8;
    a.text.middle = 'Ana';
    const b = newDesign('r25');
    b.text.middle = 'Luis';
    copyStyleScaled(a, b);
    const k = 25 / 58;
    expect(b.bg.imageId).toBe('papel');
    expect(b.ring.width).toBeCloseTo(a.ring.width * k);
    expect(b.text.size).toBeCloseTo(Math.max(1.5, 5.8 * k));
    expect(b.text.middle).toBe('Luis');
  });

  it('el texto se copia solo si se pide', () => {
    const a = newDesign('r58');
    a.text.middle = 'Ana';
    const b = newDesign('r58');
    b.text.middle = 'Luis';
    copyTextStyle(a, b, false);
    expect(b.text.middle).toBe('Luis');
    copyTextStyle(a, b, true);
    expect(b.text.middle).toBe('Ana');
  });

  it('copiar fondo y borde no toca la imagen principal ni los textos', () => {
    const a = newDesign('r58', 'foto-a');
    applyPreset(a, 'Neón');
    const b = newDesign('r58', 'foto-b');
    b.text.top = 'Hola';
    copyBackground(a, b);
    copyRing(a, b);
    expect(b.image.imageId).toBe('foto-b');
    expect(b.text.top).toBe('Hola');
    expect(b.bg.type).toBe(a.bg.type);
    expect(b.ring.color).toBe(a.ring.color);
  });

  it('los stickers copiados reciben ids nuevos', () => {
    const a = newDesign('r58');
    a.stickers.push({ id: 500, emoji: '⭐', size: 10, x: 0, y: 10, rot: 0 });
    const b = newDesign('r58');
    copyStickers(a, b);
    expect(b.stickers).toHaveLength(1);
    expect(b.stickers[0].id).not.toBe(500);
    expect(b.stickers[0].emoji).toBe('⭐');
  });
});
