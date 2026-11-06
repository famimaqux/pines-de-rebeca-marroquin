import type { PinSize, Shape } from '../model/sizes';

/**
 * Cada forma se describe como un punto inicial + curvas bézier cúbicas.
 * Así la misma geometría sirve para el canvas y, más adelante, para las
 * líneas de corte vectoriales del PDF.
 */
export interface ShapePath {
  start: [number, number];
  /** [c1x, c1y, c2x, c2y, x, y] */
  segs: [number, number, number, number, number, number][];
}

/** Constante para aproximar un cuarto de círculo con una bézier. */
const K = 0.5522847498;

function ellipsePath(w: number, h: number, cx: number, cy: number): ShapePath {
  const rx = w / 2;
  const ry = h / 2;
  const kx = rx * K;
  const ky = ry * K;
  return {
    start: [cx + rx, cy],
    segs: [
      [cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
      [cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
      [cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
      [cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ],
  };
}

/** Corazón (misma curva que el prototipo, ajustada a su caja w×h). */
function heartPath(w: number, h: number, cx: number, cy: number): ShapePath {
  const x = cx - w / 2;
  const y = cy - h / 2;
  return {
    start: [cx, y + h * 0.28],
    segs: [
      [cx, y - h * 0.08, x, y - h * 0.08, x, y + h * 0.28],
      [x, y + h * 0.6, cx, y + h * 0.78, cx, y + h],
      [cx, y + h * 0.78, x + w, y + h * 0.6, x + w, y + h * 0.28],
      [x + w, y - h * 0.08, cx, y - h * 0.08, cx, y + h * 0.28],
    ],
  };
}

/** Radio de esquina del cuadrado redondeado para una caja dada. */
export function cornerRadius(w: number, h: number): number {
  return Math.min(w, h) * 0.18;
}

function roundSqPath(w: number, h: number, cx: number, cy: number, r: number): ShapePath {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const k = r * K;
  const line = (ax: number, ay: number, bx: number, by: number): ShapePath['segs'][number] => [ax, ay, bx, by, bx, by];
  return {
    start: [x0 + r, y0],
    segs: [
      line(x0 + r, y0, x1 - r, y0),
      [x1 - r + k, y0, x1, y0 + r - k, x1, y0 + r],
      line(x1, y0 + r, x1, y1 - r),
      [x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1],
      line(x1 - r, y1, x0 + r, y1),
      [x0 + r - k, y1, x0, y1 - r + k, x0, y1 - r],
      line(x0, y1 - r, x0, y0 + r),
      [x0, y0 + r - k, x0 + r - k, y0, x0 + r, y0],
    ],
  };
}

/**
 * Geometría de una forma de w×h centrada en (cx, cy).
 * `cornerR` solo se usa en el cuadrado redondeado; si no se da, se calcula.
 */
export function shapePath(shape: Shape, w: number, h: number, cx = 0, cy = 0, cornerR?: number): ShapePath {
  switch (shape) {
    case 'heart':
      return heartPath(w, h, cx, cy);
    case 'roundsq':
      return roundSqPath(w, h, cx, cy, cornerR ?? cornerRadius(w, h));
    case 'oval':
      return ellipsePath(w, h, cx, cy);
    case 'circle':
    default:
      return ellipsePath(w, w, cx, cy);
  }
}

type PathTarget = Pick<CanvasPath, 'moveTo' | 'bezierCurveTo' | 'closePath'>;

/** Añade la forma al trazado actual del contexto (no llama a beginPath). */
export function tracePath(ctx: PathTarget, p: ShapePath): void {
  ctx.moveTo(p.start[0], p.start[1]);
  for (const s of p.segs) ctx.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);
  ctx.closePath();
}

/** Atajo: traza la forma `shape` de w×h centrada en el origen. */
export function traceShape(ctx: PathTarget, shape: Shape, w: number, h: number, cx = 0, cy = 0, cornerR?: number): void {
  tracePath(ctx, shapePath(shape, w, h, cx, cy, cornerR));
}

/** Estrella de 5 puntas (para el patrón). */
export function traceStar(ctx: Pick<CanvasPath, 'moveTo' | 'lineTo' | 'closePath'>, cx: number, cy: number, r: number): void {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/**
 * Forma del molde de tamaño w×h, concéntrica a la cara. En el cuadrado
 * redondeado el radio de esquina crece con el margen para que corte y cara
 * queden paralelos.
 */
export function sizedShapePath(size: PinSize, w: number, h: number, cx = 0, cy = 0): ShapePath {
  const r = size.shape === 'roundsq' ? Math.max(0, cornerRadius(size.faceW, size.faceH) + (w - size.faceW) / 2) : undefined;
  return shapePath(size.shape, w, h, cx, cy, r);
}
