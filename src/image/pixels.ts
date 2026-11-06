/**
 * Procesado de píxeles puro (sin DOM): se usa en el Web Worker, en el hilo
 * principal como respaldo y en los tests.
 */

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ProcessParams {
  quick: boolean;
  tol: number;
  soft: number;
  bright: number;
  contrast: number;
  sat: number;
  sharp: number;
  /** "Mejorar colores" automático 0..1 */
  auto: number;
}

/**
 * Quitar fondo "rápido": detecta el color dominante del borde y lo borra
 * rellenando desde los bordes todo lo que se le parezca (tolerancia).
 * Los píxeles del contorno se suavizan según `soft`.
 */
export function removeBackground(img: Pixels, tol: number, soft: number): void {
  const { data: p, width: w, height: h } = img;
  const N = w * h;
  if (!N) return;
  const key = (i: number) => ((p[i * 4] >> 4) << 8) | ((p[i * 4 + 1] >> 4) << 4) | (p[i * 4 + 2] >> 4);
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);

  // Color de fondo = el más frecuente en el borde (cuantizado), promediado.
  const counts = new Map<number, number>();
  for (const i of border) if (p[i * 4 + 3] > 0) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
  if (!counts.size) return;
  let bk = 0;
  let bc = -1;
  counts.forEach((c, k) => {
    if (c > bc) {
      bc = c;
      bk = k;
    }
  });
  let R = 0;
  let G = 0;
  let B = 0;
  let n = 0;
  for (const i of border)
    if (key(i) === bk) {
      R += p[i * 4];
      G += p[i * 4 + 1];
      B += p[i * 4 + 2];
      n++;
    }
  R /= n;
  G /= n;
  B /= n;

  const dist = (i: number) => {
    const a = p[i * 4] - R;
    const b = p[i * 4 + 1] - G;
    const c = p[i * 4 + 2] - B;
    return Math.sqrt(a * a + b * b + c * c);
  };
  const mark = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const push = (i: number) => {
    if (!mark[i] && p[i * 4 + 3] > 0 && dist(i) <= tol) {
      mark[i] = 1;
      stack[sp++] = i;
    }
  };
  for (const i of border) push(i);
  while (sp) {
    const i = stack[--sp];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < N - w) push(i + w);
  }
  for (let i = 0; i < N; i++) {
    if (mark[i]) {
      p[i * 4 + 3] = 0;
      continue;
    }
    if (soft > 0) {
      const x = i % w;
      const nb = (x > 0 && mark[i - 1]) || (x < w - 1 && mark[i + 1]) || (i >= w && mark[i - w]) || (i < N - w && mark[i + w]);
      if (nb) {
        const d = dist(i);
        if (d < tol + soft) p[i * 4 + 3] = Math.round(p[i * 4 + 3] * Math.max(0, (d - tol) / soft));
      }
    }
  }
}

/**
 * Nitidez con máscara de desenfoque (unsharp mask):
 * resultado = original + amount × (original − desenfocado).
 */
export function unsharp(img: Pixels, amount: number): void {
  if (amount <= 0) return;
  const { data: p, width: w, height: h } = img;
  const src = new Uint8ClampedArray(p);
  const tmp = new Float32Array(w * h * 3);
  // Desenfoque gaussiano 1-2-1 separable (radio 1).
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = Math.max(0, x - 1);
      const r = Math.min(w - 1, x + 1);
      for (let c = 0; c < 3; c++) tmp[(y * w + x) * 3 + c] = (src[(y * w + l) * 4 + c] + 2 * src[(y * w + x) * 4 + c] + src[(y * w + r) * 4 + c]) / 4;
    }
  for (let y = 0; y < h; y++) {
    const u = Math.max(0, y - 1);
    const d = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      for (let c = 0; c < 3; c++) {
        const blur = (tmp[(u * w + x) * 3 + c] + 2 * tmp[i * 3 + c] + tmp[(d * w + x) * 3 + c]) / 4;
        const o = src[i * 4 + c];
        p[i * 4 + c] = o + amount * 2 * (o - blur);
      }
    }
  }
}

/** Brillo, contraste y saturación. */
export function adjustColor(img: Pixels, bright: number, contrast: number, sat: number): void {
  if (bright === 1 && contrast === 1 && sat === 1) return;
  const p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i] * bright;
    let g = p[i + 1] * bright;
    let b = p[i + 2] * bright;
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    p[i] = l + (r - l) * sat;
    p[i + 1] = l + (g - l) * sat;
    p[i + 2] = l + (b - l) * sat;
  }
}

/**
 * Máscara del pincel: canal R = borrar (0..255), canal G = restaurar (0..255).
 * Restaurar devuelve la transparencia original (antes de quitar el fondo).
 */
export function applyMask(img: Pixels, original: Uint8ClampedArray, mask: Uint8ClampedArray): void {
  const p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    const erase = mask[i] / 255;
    const restore = mask[i + 1] / 255;
    if (!erase && !restore) continue;
    const a = p[i + 3] + (original[i + 3] - p[i + 3]) * restore;
    p[i + 3] = a * (1 - erase);
  }
}

/**
 * "Mejorar colores" automático, pensado para fotos opacas u oscuras:
 * 1) estira los niveles de cada canal (el 0,5 % más oscuro pasa a negro y el
 *    0,5 % más claro a blanco), lo que también quita dominantes de color;
 * 2) aclara los medios tonos (gamma) si la foto es oscura;
 * 3) aviva los colores apagados más que los que ya son vivos ("viveza").
 * `amount` 0..1 mezcla el resultado con el original.
 */
export function autoEnhance(img: Pixels, amount: number): void {
  if (amount <= 0) return;
  const p = img.data;
  const n = p.length / 4;
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let lumSum = 0;
  let counted = 0;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 16) continue; // ignora lo transparente (fondo quitado)
    hist[0][p[i]]++;
    hist[1][p[i + 1]]++;
    hist[2][p[i + 2]]++;
    lumSum += 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    counted++;
  }
  if (!counted) return;
  const clip = Math.max(1, Math.round(counted * 0.005));
  // Un mismo estiramiento para los tres canales: así el tono (rosa, azul…) no cambia.
  let L = 255;
  let Hh = 0;
  for (let c = 0; c < 3; c++) {
    let acc = 0;
    let l = 0;
    while (l < 255 && acc + hist[c][l] <= clip) acc += hist[c][l++];
    acc = 0;
    let h = 255;
    while (h > 0 && acc + hist[c][h] <= clip) acc += hist[c][h--];
    L = Math.min(L, l);
    Hh = Math.max(Hh, h);
  }
  // Como máximo se estira ×2 (para no exagerar en fotos casi planas).
  const MIN_RANGE = 255 / 2;
  if (Hh - L < MIN_RANGE) {
    const mid = (Hh + L) / 2;
    L = Math.max(0, mid - MIN_RANGE / 2);
    Hh = Math.min(255, L + MIN_RANGE);
  }
  const lo = [L, L, L];
  const hi = [Hh, Hh, Hh];
  // Gamma: si el promedio queda oscuro, aclarar los medios tonos.
  const mean = lumSum / counted / 255;
  const gamma = mean < 0.5 ? Math.max(0.7, 0.5 + mean * 0.9) : 1;
  const lut = [0, 1, 2].map((c) => {
    const t = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const x = Math.min(1, Math.max(0, (v - lo[c]) / Math.max(1, hi[c] - lo[c])));
      t[v] = Math.pow(x, gamma) * 255;
    }
    return t;
  });
  const vib = 0.45; // viveza
  for (let i = 0; i < n * 4; i += 4) {
    if (p[i + 3] === 0) continue;
    let r = lut[0][p[i]];
    let g = lut[1][p[i + 1]];
    let b = lut[2][p[i + 2]];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const satNow = mx ? (mx - mn) / mx : 0;
    const k = 1 + vib * (1 - satNow);
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * k;
    g = l + (g - l) * k;
    b = l + (b - l) * k;
    p[i] = p[i] + (r - p[i]) * amount;
    p[i + 1] = p[i + 1] + (g - p[i + 1]) * amount;
    p[i + 2] = p[i + 2] + (b - p[i + 2]) * amount;
  }
}

/** Cadena completa: quitar fondo → máscara del pincel → mejorar colores → nitidez → color. */
export function processPixels(img: Pixels, params: ProcessParams, mask: Uint8ClampedArray | null): void {
  const original = mask ? new Uint8ClampedArray(img.data) : null;
  if (params.quick) removeBackground(img, params.tol, params.soft);
  if (mask && original) applyMask(img, original, mask);
  autoEnhance(img, params.auto ?? 0);
  unsharp(img, params.sharp);
  adjustColor(img, params.bright, params.contrast, params.sat);
}

export function paramsKey(p: ProcessParams, maskId: string | null): string {
  return [p.quick ? 1 : 0, p.tol, p.soft, p.bright, p.contrast, p.sat, p.sharp, p.auto ?? 0, maskId ?? ''].join('|');
}

export function isIdentity(p: ProcessParams, maskId: string | null): boolean {
  return !p.quick && !maskId && p.bright === 1 && p.contrast === 1 && p.sat === 1 && p.sharp === 0 && !(p.auto > 0);
}

/** Tamaño máximo (px) de la imagen procesada: sobra para 88 mm a 300 ppp. */
export const MAX_PROCESS_PX = 2400;

export function processedSize(w: number, h: number): { w: number; h: number } {
  const s = Math.min(1, MAX_PROCESS_PX / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
