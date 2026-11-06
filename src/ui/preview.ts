import type { Design } from '../model/design';
import type { PinSize } from '../model/sizes';
import { drawPin } from '../render/drawPin';
import { drawEditorGuides, drawGloss } from '../render/guides';

/** Espacio (px) arriba y abajo para las etiquetas de las guías. */
const LABEL_SPACE = 26;
const SIDE_SPACE = 8;

export interface PreviewOptions {
  finished: boolean;
}

/** Dibuja la vista previa del pin en un canvas que se adapta al ancho disponible. */
export function renderPreview(canvas: HTMLCanvasElement, d: Design, size: PinSize, opts: PreviewOptions): void {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cssW = Math.max(200, Math.min(460, canvas.parentElement?.clientWidth ?? 360));
  const maxDim = Math.max(size.cutW, size.cutH);
  const ppm = (cssW - 2 * SIDE_SPACE) / maxDim;
  const cssH = size.cutH * ppm + 2 * LABEL_SPACE;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * ppm, 0, 0, dpr * ppm, (dpr * cssW) / 2, (dpr * cssH) / 2);

  if (opts.finished) {
    drawPin(ctx, d, size, { faceOnly: true });
    drawGloss(ctx, size);
  } else {
    drawPin(ctx, d, size);
    drawEditorGuides(ctx, size, ppm);
  }
}
