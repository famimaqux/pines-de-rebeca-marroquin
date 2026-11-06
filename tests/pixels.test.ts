import { describe, expect, it } from 'vitest';
import { adjustColor, applyMask, processPixels, removeBackground, unsharp, type Pixels } from '../src/image/pixels';

/** Imagen de prueba: fondo blanco con un cuadrado rojo en el centro (y un hueco blanco dentro). */
function testImage(w = 40, h = 40): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inSquare = x >= 10 && x < 30 && y >= 10 && y < 30;
      const hole = x >= 18 && x < 22 && y >= 18 && y < 22; // blanco encerrado: NO debe borrarse
      const red = inSquare && !hole;
      data[i] = 255;
      data[i + 1] = red ? 30 : 255;
      data[i + 2] = red ? 40 : 255;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}
const alpha = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];

describe('quitar fondo rápido', () => {
  it('borra el fondo blanco y conserva la figura', () => {
    const img = testImage();
    removeBackground(img, 35, 0);
    expect(alpha(img, 0, 0)).toBe(0);
    expect(alpha(img, 39, 39)).toBe(0);
    expect(alpha(img, 5, 20)).toBe(0);
    expect(alpha(img, 12, 12)).toBe(255);
    expect(alpha(img, 29, 29)).toBe(255);
  });

  it('no borra el blanco encerrado dentro de la figura (relleno desde los bordes)', () => {
    const img = testImage();
    removeBackground(img, 35, 0);
    expect(alpha(img, 20, 20)).toBe(255);
  });

  it('cuenta los píxeles: fondo borrado = total − cuadrado', () => {
    const img = testImage();
    removeBackground(img, 35, 15);
    let transparent = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 0) transparent++;
    expect(transparent).toBe(40 * 40 - 20 * 20);
  });

  it('con tolerancia alta también se lleva un fondo gris claro con ruido', () => {
    const img = testImage();
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 1] > 200) img.data[i] = img.data[i + 1] = img.data[i + 2] = 235 + ((i / 4) % 7);
    removeBackground(img, 40, 0);
    expect(alpha(img, 0, 0)).toBe(0);
    expect(alpha(img, 15, 15)).toBe(255);
  });
});

describe('mejora de impresión', () => {
  it('brillo, contraste y saturación neutros no cambian nada', () => {
    const img = testImage();
    const before = new Uint8ClampedArray(img.data);
    adjustColor(img, 1, 1, 1);
    expect(img.data).toEqual(before);
  });

  it('saturación 0 deja la imagen en grises', () => {
    const img = testImage();
    adjustColor(img, 1, 1, 0);
    const i = (15 * 40 + 15) * 4;
    expect(img.data[i]).toBe(img.data[i + 1]);
    expect(img.data[i + 1]).toBe(img.data[i + 2]);
  });

  it('la nitidez aumenta el contraste en los bordes', () => {
    const img = testImage();
    unsharp(img, 0.35);
    const edgeOut = (20 * 40 + 9) * 4; // blanco junto al rojo
    const edgeIn = (20 * 40 + 10) * 4; // rojo junto al blanco
    expect(img.data[edgeOut + 1]).toBe(255);
    expect(img.data[edgeIn + 1]).toBeLessThan(30);
  });
});

describe('pincel borrar / restaurar', () => {
  it('borrar hace transparente y restaurar recupera lo que quitó el modo rápido', () => {
    const img = testImage();
    const mask = new Uint8ClampedArray(img.data.length);
    mask[(12 * 40 + 12) * 4] = 255; // borrar (12,12): era rojo
    mask[(2 * 40 + 2) * 4 + 1] = 255; // restaurar (2,2): era fondo
    processPixels(img, { quick: true, tol: 35, soft: 0, bright: 1, contrast: 1, sat: 1, sharp: 0 }, mask);
    expect(alpha(img, 12, 12)).toBe(0);
    expect(alpha(img, 2, 2)).toBe(255);
    expect(alpha(img, 3, 3)).toBe(0);
  });

  it('applyMask sin trazos no cambia nada', () => {
    const img = testImage();
    const before = new Uint8ClampedArray(img.data);
    applyMask(img, before, new Uint8ClampedArray(img.data.length));
    expect(img.data).toEqual(before);
  });
});
