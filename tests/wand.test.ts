import { describe, expect, it } from 'vitest';
import { applySelectionToMask, featherMask, wandRegion, wandSelection } from '../src/image/wand';
import { applyMask, type Pixels } from '../src/image/pixels';

/**
 * Imagen de prueba 40×40: fondo blanco liso, un cuadrado rojo (10..29) y,
 * aparte, un puntito blanco aislado DENTRO del rojo (19..20) y una franja
 * azul a la derecha (34..39) que no toca al rojo.
 */
function img(): Pixels {
  const w = 40;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c = [255, 255, 255];
      if (x >= 10 && x < 30 && y >= 10 && y < 30) c = [220, 30, 40];
      if (x >= 19 && x < 21 && y >= 19 && y < 21) c = [255, 255, 255];
      if (x >= 34) c = [30, 60, 220];
      data.set([...c, 255], i);
    }
  return { data, width: w, height: w };
}
const count = (m: Uint8Array) => m.reduce((a, v) => a + (v > 127 ? 1 : 0), 0);
const at = (m: Uint8Array, x: number, y: number) => m[y * 40 + x];
const opts = { tol: 40, contiguous: true, soft: 0, invert: false };

describe('varita mágica', () => {
  it('un clic en el fondo blanco liso selecciona todo el fondo continuo', () => {
    const m = wandRegion(img(), 2, 2, 40, true);
    // blanco total = 40×34 (sin la franja azul) − 400 del cuadrado rojo; el puntito blanco interior NO (no es continuo)
    expect(count(m)).toBe(40 * 34 - 400);
    expect(at(m, 20, 20)).toBe(0);
    expect(at(m, 15, 15)).toBe(0);
    expect(at(m, 36, 5)).toBe(0);
  });

  it('"todo ese color en la imagen" incluye también el blanco aislado', () => {
    const m = wandRegion(img(), 2, 2, 40, false);
    expect(at(m, 20, 20)).toBe(255);
    expect(count(m)).toBe(40 * 34 - 400 + 4);
  });

  it('la tolerancia decide cuánto se parece el color', () => {
    const p = img();
    // un gris claro casi blanco en la esquina
    p.data.set([235, 235, 235, 255], 0);
    expect(at(wandRegion(p, 5, 5, 10, true), 0, 0)).toBe(0);
    expect(at(wandRegion(p, 5, 5, 40, true), 0, 0)).toBe(255);
  });

  it('Mayús + clic suma otra zona y Alt + clic la resta', () => {
    const p = img();
    const both = wandSelection(p, [{ x: 2, y: 2, op: 'new' }, { x: 36, y: 20, op: 'add' }], opts);
    expect(at(both, 2, 2)).toBe(255);
    expect(at(both, 36, 20)).toBe(255);
    const minus = wandSelection(p, [{ x: 2, y: 2, op: 'new' }, { x: 36, y: 20, op: 'add' }, { x: 36, y: 20, op: 'sub' }], opts);
    expect(at(minus, 36, 20)).toBe(0);
    expect(at(minus, 2, 2)).toBe(255);
  });

  it('invertir: seleccionar el fondo e invertir deja solo la figura', () => {
    const inv = wandSelection(img(), [{ x: 2, y: 2, op: 'new' }], { ...opts, invert: true });
    expect(at(inv, 15, 15)).toBe(255); // rojo
    expect(at(inv, 20, 20)).toBe(255); // blanco interior (no era parte del fondo)
    expect(at(inv, 2, 2)).toBe(0);
  });

  it('el suavizado deja un borde gradual', () => {
    const m = featherMask(wandRegion(img(), 2, 2, 40, true), 40, 40, 2);
    const edge = at(m, 10, 20); // primer píxel rojo junto al fondo
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    expect(at(m, 2, 2)).toBe(255);
  });

  it('"Borrar selección" vuelve transparente la zona y "Restaurar" la recupera', () => {
    const p = img();
    const sel = wandSelection(p, [{ x: 2, y: 2, op: 'new' }], opts);
    const mask = new Uint8ClampedArray(40 * 40 * 4);
    applySelectionToMask(mask, sel, 'erase');
    const out = { data: new Uint8ClampedArray(p.data), width: 40, height: 40 };
    applyMask(out, p.data, mask);
    expect(out.data[(2 * 40 + 2) * 4 + 3]).toBe(0);
    expect(out.data[(15 * 40 + 15) * 4 + 3]).toBe(255);
    applySelectionToMask(mask, sel, 'restore');
    const back = { data: new Uint8ClampedArray(p.data), width: 40, height: 40 };
    applyMask(back, p.data, mask);
    expect(back.data[(2 * 40 + 2) * 4 + 3]).toBe(255);
  });
});
