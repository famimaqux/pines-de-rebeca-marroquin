import type { Design } from '../model/design';
import type { PinSize } from '../model/sizes';
import { drawPin, traceSized, type PinImages } from '../render/drawPin';
import { drawEditorGuides, drawGloss } from '../render/guides';

/** Espacio (px) arriba y abajo para las etiquetas de las guías. */
const LABEL_SPACE = 26;
const SIDE_SPACE = 8;

export interface PreviewOptions {
  finished: boolean;
  /** Dibujo extra encima del pin (p. ej. el trazo del pincel), en mm. */
  overlay?: (ctx: CanvasRenderingContext2D) => void;
}

/** Geometría del último dibujo: sirve para pasar de píxeles de pantalla a mm. */
export interface PreviewGeometry {
  ppm: number;
  cssW: number;
  cssH: number;
}

/** Dibuja la vista previa del pin en un canvas que se adapta al ancho disponible. */
export function renderPreview(canvas: HTMLCanvasElement, d: Design, size: PinSize, imgs: PinImages, opts: PreviewOptions): PreviewGeometry {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  // El ancho sale de la tarjeta del editor (no del propio contenedor del lienzo, que crece con él).
  const host = (canvas.closest('.preview') as HTMLElement | null) ?? canvas.parentElement;
  const cssW = Math.max(200, Math.min(480, (host?.clientWidth ?? 380) - 34));
  const maxDim = Math.max(size.cutW, size.cutH);
  const ppm = (cssW - 2 * SIDE_SPACE) / maxDim;
  const cssH = size.cutH * ppm + 2 * LABEL_SPACE;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * ppm, 0, 0, dpr * ppm, (dpr * cssW) / 2, (dpr * cssH) / 2);

  if (opts.finished) {
    drawPin(ctx, d, size, imgs, { faceOnly: true });
    drawGloss(ctx, size);
  } else {
    drawPin(ctx, d, size, imgs);
    opts.overlay?.(ctx);
    drawEditorGuides(ctx, size, ppm);
  }
  return { ppm, cssW, cssH };
}

/** Miniatura cuadrada del pin con su línea de corte. */
export function renderThumb(canvas: HTMLCanvasElement, d: Design, size: PinSize, imgs: PinImages, cssPx = 56): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(cssPx * dpr);
  canvas.style.width = canvas.style.height = `${cssPx}px`;
  const ctx = canvas.getContext('2d')!;
  const s = canvas.width / (Math.max(size.cutW, size.cutH) + 2);
  ctx.setTransform(s, 0, 0, s, canvas.width / 2, canvas.height / 2);
  drawPin(ctx, d, size, imgs);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  traceSized(ctx, size, size.cutW, size.cutH);
  ctx.stroke();
}
