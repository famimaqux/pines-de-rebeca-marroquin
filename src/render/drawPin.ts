import { bitmapSize, type Bitmap, type Design, type RingFinish } from '../model/design';
import type { PinSize } from '../model/sizes';
import { sizedShapePath, tracePath, traceShape, traceStar } from './shapes';
import { drawTexts } from './text';

/**
 * Dibuja un pin completo, capa por capa (de abajo hacia arriba):
 * 1 fondo → 2 imagen de fondo → 3 patrón → 4 imagen principal → 5 borde → 6 texto → 7 stickers.
 *
 * El contexto debe venir ya escalado a milímetros y con el origen en el centro del pin.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const RAINBOW = ['#ff4d6d', '#ff9f1c', '#ffe066', '#5ce1a6', '#4cc9f0', '#7b6cff', '#d46bff'];

export const METALS: Record<Exclude<RingFinish, 'plano'>, string[]> = {
  oro: ['#8a6a1f', '#f7e39a', '#b8902f', '#fff3b8', '#9c7a26'],
  plata: ['#7d8288', '#f4f6f8', '#a9aeb4', '#ffffff', '#8c9197'],
  rosa: ['#9a5a4e', '#f6c9bb', '#c48473', '#ffe3da', '#a8665a'],
};

/** Imágenes ya resueltas (la principal, procesada) para dibujar el pin. */
export interface PinImages {
  main: Bitmap | null;
  bg: Bitmap | null;
}

export interface DrawOptions {
  /** Recortar todo a la cara visible (vista "pin terminado"). */
  faceOnly?: boolean;
}

/** Traza una forma del molde de tamaño w×h, concéntrica a la cara. */
export function traceSized(ctx: Pick<CanvasPath, 'moveTo' | 'bezierCurveTo' | 'closePath'>, size: PinSize, w: number, h: number): void {
  tracePath(ctx, sizedShapePath(size, w, h));
}

export function drawPin(ctx: Ctx, d: Design, size: PinSize, imgs: PinImages, opts: DrawOptions = {}): void {
  const { cutW, cutH, faceW, faceH } = size;
  ctx.save();
  ctx.beginPath();
  if (opts.faceOnly) traceSized(ctx, size, faceW, faceH);
  else traceSized(ctx, size, cutW, cutH);
  ctx.clip();

  // Papel blanco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-cutW / 2, -cutH / 2, cutW, cutH);

  drawBackground(ctx, d, size, imgs.bg);
  drawMainImage(ctx, d, size, imgs.main);
  drawRing(ctx, d, size);
  drawTexts(ctx, d, size);
  drawStickers(ctx, d);

  ctx.restore();
}

/* ---------- 1–3. Capa de fondo (color/degradado + imagen + patrón) ---------- */

function drawBackground(ctx: Ctx, d: Design, size: PinSize, bgImage: Bitmap | null): void {
  const bg = d.bg;
  if (bg.type === 'ninguno' && !bgImage && d.pattern.type === 'ninguno') return;
  const bw = size.cutW;
  const bh = size.cutH;
  const R = Math.max(bw, bh) / 2;
  const zoom = Math.max(0.05, bg.zoom);

  ctx.save();
  ctx.translate(bg.ox, bg.oy);
  ctx.rotate((bg.rot * Math.PI) / 180);
  ctx.scale(zoom, zoom);

  // Área a pintar: lo bastante grande para cubrir el pin aunque se mueva o se achique.
  const E = (R * 3 + Math.hypot(bg.ox, bg.oy)) / Math.min(1, zoom);
  let fill: string | CanvasGradient | null = null;
  switch (bg.type) {
    case 'solido':
      fill = bg.c1;
      break;
    case 'lineal': {
      const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      g.addColorStop(0, bg.c1);
      g.addColorStop(1, bg.c2);
      fill = g;
      break;
    }
    case 'radial': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, bg.c1);
      g.addColorStop(1, bg.c2);
      fill = g;
      break;
    }
    case 'arcoiris':
    case 'arcoiris_r': {
      const g = bg.type === 'arcoiris' ? ctx.createLinearGradient(0, -bh / 2, 0, bh / 2) : ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
      fill = g;
      break;
    }
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(-E, -E, 2 * E, 2 * E);
  }

  if (bgImage) {
    const { w, h } = bitmapSize(bgImage);
    if (w && h) {
      const s = Math.max(bw / w, bh / h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bgImage, (-w * s) / 2, (-h * s) / 2, w * s, h * s);
    }
  }

  drawPattern(ctx, d, E);
  ctx.restore();
}

function drawPattern(ctx: Ctx, d: Design, extent: number): void {
  const p = d.pattern;
  if (p.type === 'ninguno') return;
  const s = Math.max(1, p.scale);
  const R = extent;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
  ctx.fillStyle = p.color;
  ctx.beginPath();
  // Cuadrícula de motivos alineada al centro para que el patrón quede simétrico.
  const each = (fn: (x: number, y: number) => void) => {
    const n = Math.ceil(R / s);
    for (let j = -n; j <= n; j++) {
      const off = j % 2 ? s / 2 : 0;
      for (let i = -n - 1; i <= n; i++) fn(i * s + off, j * s);
    }
  };
  switch (p.type) {
    case 'puntos':
      each((x, y) => {
        ctx.moveTo(x + s * 0.18, y);
        ctx.arc(x, y, s * 0.18, 0, Math.PI * 2);
      });
      break;
    case 'estrellas':
      each((x, y) => traceStar(ctx, x, y, s * 0.26));
      break;
    case 'corazones':
      each((x, y) => traceShape(ctx, 'heart', s * 0.5, s * 0.46, x, y));
      break;
    case 'rayas':
      ctx.rotate(-Math.PI / 4);
      for (let x = -R * 1.5; x <= R * 1.5; x += s) ctx.rect(x, -R * 1.5, s * 0.42, R * 3);
      break;
    case 'cuadros': {
      const c = s / 1.4;
      const n = Math.ceil(R / c);
      for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) if ((i + j) & 1) ctx.rect(i * c, j * c, c, c);
      break;
    }
    case 'rayos': {
      const n = Math.max(8, Math.round(140 / s)) * 2;
      for (let k = 0; k < n; k += 2) {
        const a = (k * 2 * Math.PI) / n;
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R * 1.6, a, a + (2 * Math.PI) / n);
        ctx.closePath();
      }
      break;
    }
  }
  ctx.fill();
  ctx.restore();
}

/* ---------- 4. Imagen principal ---------- */

function drawMainImage(ctx: Ctx, d: Design, size: PinSize, src: Bitmap | null): void {
  const im = d.image;
  if (!src) return;
  const { w, h } = bitmapSize(src);
  if (!w || !h) return;
  ctx.save();
  const toFace = im.clip === 'cara';
  if (toFace) {
    ctx.beginPath();
    traceSized(ctx, size, size.faceW, size.faceH);
    ctx.clip();
  }
  const s = imageScale(d, size, w, h);
  ctx.translate(im.ox, im.oy);
  ctx.rotate((im.rot * Math.PI) / 180);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (-w * s) / 2, (-h * s) / 2, w * s, h * s);
  ctx.restore();
}

/** mm por píxel de la imagen principal (de tamaño w×h) en el pin. */
export function imageScale(d: Design, size: PinSize, w: number, h: number): number {
  const toFace = d.image.clip === 'cara';
  const boxW = toFace ? size.faceW : size.cutW;
  const boxH = toFace ? size.faceH : size.cutH;
  const base = d.image.fit === 'encajar' ? Math.min(boxW / w, boxH / h) : Math.max(boxW / w, boxH / h);
  return base * d.image.zoom;
}

/**
 * Resolución real de impresión (ppp) de la imagen principal:
 * píxeles de la imagen original por pulgada en el papel.
 */
export function effectivePpi(d: Design, size: PinSize, origW: number, origH: number): number {
  const mmPerPx = imageScale(d, size, origW, origH);
  return 25.4 / mmPerPx;
}

/* ---------- 5. Borde / aro ---------- */

function ringPaint(ctx: Ctx, d: Design, size: PinSize): string | CanvasGradient {
  const f = d.ring.finish;
  if (f === 'plano') return d.ring.color;
  const stops = METALS[f];
  const g = ctx.createLinearGradient(-size.cutW / 2, -size.cutH / 2, size.cutW / 2, size.cutH / 2);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function drawRing(ctx: Ctx, d: Design, size: PinSize): void {
  const r = d.ring;
  if (r.type === 'ninguno' || r.width <= 0) return;
  const w = r.width;
  const { faceW: fw, faceH: fh } = size;
  ctx.save();
  const paint = ringPaint(ctx, d, size);
  ctx.strokeStyle = paint;
  ctx.fillStyle = paint;
  // Trazo centrado a k/2 por dentro del borde de la cara.
  const inset = (k: number) => {
    ctx.beginPath();
    traceSized(ctx, size, fw - k, fh - k);
  };
  switch (r.type) {
    case 'linea':
      inset(w);
      ctx.lineWidth = w;
      ctx.stroke();
      break;
    case 'doble':
      inset(w / 3);
      ctx.lineWidth = w / 3;
      ctx.stroke();
      inset((w * 5) / 3);
      ctx.lineWidth = w / 3;
      ctx.stroke();
      break;
    case 'punteado':
      inset(w);
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.setLineDash([0.01, w * 1.9]);
      ctx.stroke();
      break;
    case 'banda':
      // Desde el corte (cubre también el doblez) hasta w mm dentro de la cara.
      ctx.beginPath();
      traceSized(ctx, size, size.cutW, size.cutH);
      traceSized(ctx, size, fw - 2 * w, fh - 2 * w);
      ctx.fill('evenodd');
      break;
  }
  ctx.restore();
}

/* ---------- 7. Stickers (emoji) ---------- */

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function drawStickers(ctx: Ctx, d: Design): void {
  for (const st of d.stickers) {
    if (!st.emoji || st.size <= 0) continue;
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.rotate((st.rot * Math.PI) / 180);
    ctx.font = `${st.size}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.emoji, 0, 0);
    ctx.restore();
  }
}
