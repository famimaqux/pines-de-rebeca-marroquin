/**
 * Varita mágica (como en Photoshop/Photopea), sin DOM: se usa en el Web Worker y en los tests.
 * La selección es una máscara 0..255 del mismo tamaño que la imagen.
 */
import type { Pixels } from './pixels';

export type WandOp = 'new' | 'add' | 'sub';

export interface WandSeed {
  /** píxel donde se hizo clic */
  x: number;
  y: number;
  op: WandOp;
}

export interface WandOptions {
  /** 0..255: cuánto se puede parecer el color al del punto elegido */
  tol: number;
  /** true = solo la zona continua; false = ese color en toda la imagen */
  contiguous: boolean;
  /** suavizado del borde, en píxeles */
  soft: number;
  /** invertir el resultado */
  invert: boolean;
}

/** Zona de color parecido alrededor de (sx, sy). Devuelve 0 o 255 por píxel. */
export function wandRegion(img: Pixels, sx: number, sy: number, tol: number, contiguous: boolean): Uint8Array {
  const { data: p, width: w, height: h } = img;
  const out = new Uint8Array(w * h);
  const x0 = Math.round(sx);
  const y0 = Math.round(sy);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return out;
  const i0 = (y0 * w + x0) * 4;
  const [R, G, B, A] = [p[i0], p[i0 + 1], p[i0 + 2], p[i0 + 3]];
  const t2 = tol * tol;
  const near = (i: number) => {
    const dr = p[i * 4] - R;
    const dg = p[i * 4 + 1] - G;
    const db = p[i * 4 + 2] - B;
    const da = p[i * 4 + 3] - A;
    return dr * dr + dg * dg + db * db + da * da <= t2;
  };
  if (!contiguous) {
    for (let i = 0; i < w * h; i++) if (near(i)) out[i] = 255;
    return out;
  }
  // Relleno desde el punto (4 vecinos), con pila para no desbordar.
  const stack = new Int32Array(w * h);
  let sp = 0;
  const start = y0 * w + x0;
  out[start] = 255;
  stack[sp++] = start;
  while (sp) {
    const i = stack[--sp];
    const x = i % w;
    const push = (j: number) => {
      if (!out[j] && near(j)) {
        out[j] = 255;
        stack[sp++] = j;
      }
    };
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * h - w) push(i + w);
  }
  return out;
}

/** Suaviza el borde de la máscara (desenfoque de caja en dos pasadas). */
export function featherMask(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const rad = Math.round(r);
  if (rad <= 0) return m;
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  const n = 2 * rad + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -rad; x <= rad; x++) acc += m[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += m[y * w + Math.min(w - 1, x + rad + 1)] - m[y * w + Math.max(0, x - rad)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -rad; y <= rad; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(acc / n);
      acc += tmp[Math.min(h - 1, y + rad + 1) * w + x] - tmp[Math.max(0, y - rad) * w + x];
    }
  }
  return out;
}

/** Calcula la selección completa a partir de todos los clics (nuevo / sumar / restar). */
export function wandSelection(img: Pixels, seeds: WandSeed[], o: WandOptions): Uint8Array {
  const { width: w, height: h } = img;
  let sel: Uint8Array = new Uint8Array(w * h);
  for (const s of seeds) {
    const reg = wandRegion(img, s.x, s.y, o.tol, o.contiguous);
    if (s.op === 'new') sel = reg;
    else if (s.op === 'add') for (let i = 0; i < sel.length; i++) sel[i] = Math.max(sel[i], reg[i]);
    else for (let i = 0; i < sel.length; i++) if (reg[i]) sel[i] = 0;
  }
  if (o.invert) for (let i = 0; i < sel.length; i++) sel[i] = 255 - sel[i];
  return featherMask(sel, w, h, o.soft);
}

/**
 * Aplica la selección a la máscara del pincel (RGBA, R = borrar, G = restaurar).
 * 'erase' = la zona se vuelve transparente; 'restore' = vuelve a verse.
 */
export function applySelectionToMask(mask: Uint8ClampedArray, sel: Uint8Array, action: 'erase' | 'restore'): void {
  for (let i = 0; i < sel.length; i++) {
    const a = sel[i];
    if (!a) continue;
    const k = i * 4;
    if (action === 'erase') {
      mask[k] = Math.max(mask[k], a);
      mask[k + 1] = Math.round(mask[k + 1] * (1 - a / 255));
    } else {
      mask[k + 1] = Math.max(mask[k + 1], a);
      mask[k] = Math.round(mask[k] * (1 - a / 255));
    }
    mask[k + 3] = 255;
  }
}
