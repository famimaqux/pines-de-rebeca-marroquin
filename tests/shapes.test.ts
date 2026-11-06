import { describe, expect, it } from 'vitest';
import { shapePath, type ShapePath } from '../src/render/shapes';

/** Caja de la forma muestreando las curvas bézier. */
function bbox(p: ShapePath) {
  let [x, y] = p.start;
  const xs = [x];
  const ys = [y];
  for (const [c1x, c1y, c2x, c2y, ex, ey] of p.segs) {
    for (let i = 1; i <= 200; i++) {
      const t = i / 200;
      const u = 1 - t;
      xs.push(u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex);
      ys.push(u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey);
    }
    [x, y] = [ex, ey];
  }
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

describe('formas', () => {
  it.each(['circle', 'oval', 'roundsq'] as const)('%s mide exactamente su caja', (shape) => {
    const b = bbox(shapePath(shape, 70, shape === 'circle' ? 70 : 50));
    expect(b.w).toBeCloseTo(70, 3);
    expect(b.h).toBeCloseTo(shape === 'circle' ? 70 : 50, 3);
  });

  it('el corazón cabe en su caja (68×63) sin salirse más de 1 mm', () => {
    const b = bbox(shapePath('heart', 68, 63));
    expect(b.w).toBeGreaterThan(67);
    expect(b.w).toBeLessThan(69);
    expect(b.h).toBeLessThanOrEqual(63.5);
  });
});
