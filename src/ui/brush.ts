import type { Design } from '../model/design';
import type { PinSize } from '../model/sizes';
import { imageScale } from '../render/drawPin';
import { processedSize } from '../image/pixels';
import { addImageBlob, canvasToBlob, getImage } from '../image/store';

/**
 * Pincel "borrar / restaurar" sobre la imagen principal.
 * Se pinta en dos capas alfa (borrar y restaurar) del mismo tamaño que la
 * imagen procesada; al soltar se combinan en una máscara RGBA
 * (R = borrar, G = restaurar) que se guarda como imagen y se puede deshacer.
 */

interface Working {
  key: string;
  w: number;
  h: number;
  erase: HTMLCanvasElement;
  restore: HTMLCanvasElement;
  dirty: boolean;
}

let work: Working | null = null;

const mk = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** Prepara las capas de trabajo para el diseño (cargando su máscara si tiene). */
function ensureWorking(d: Design): Working | null {
  const rec = getImage(d.image.imageId);
  if (!rec) return null;
  const key = `${d.id}|${d.image.imageId}|${d.cutout.maskId ?? ''}`;
  if (work && work.key === key) return work;
  const { w, h } = processedSize(rec.w, rec.h);
  const erase = mk(w, h);
  const restore = mk(w, h);
  const mask = getImage(d.cutout.maskId);
  if (mask) {
    // Separar los canales R (borrar) y G (restaurar) en dos capas alfa.
    const tmp = mk(w, h);
    const tx = tmp.getContext('2d', { willReadFrequently: true })!;
    tx.drawImage(mask.bitmap, 0, 0, w, h);
    const src = tx.getImageData(0, 0, w, h).data;
    const e = new ImageData(w, h);
    const r = new ImageData(w, h);
    for (let i = 0; i < src.length; i += 4) {
      e.data[i + 3] = src[i];
      r.data[i + 3] = src[i + 1];
    }
    erase.getContext('2d')!.putImageData(e, 0, 0);
    restore.getContext('2d')!.putImageData(r, 0, 0);
  }
  work = { key, w, h, erase, restore, dirty: false };
  return work;
}

/** Convierte un punto del pin (mm) a píxeles de la imagen procesada. */
export function mmToImagePx(d: Design, size: PinSize, w: number, h: number, x: number, y: number): { px: number; py: number; pxPerMm: number } {
  const s = imageScale(d, size, w, h);
  const a = (-d.image.rot * Math.PI) / 180;
  const dx = x - d.image.ox;
  const dy = y - d.image.oy;
  const rx = dx * Math.cos(a) - dy * Math.sin(a);
  const ry = dx * Math.sin(a) + dy * Math.cos(a);
  return { px: rx / s + w / 2, py: ry / s + h / 2, pxPerMm: 1 / s };
}

function dab(c: HTMLCanvasElement, x: number, y: number, r: number, hardness: number, remove: boolean) {
  const ctx = c.getContext('2d')!;
  ctx.globalCompositeOperation = remove ? 'destination-out' : 'source-over';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(Math.max(0.01, Math.min(0.99, hardness)), 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

let last: { x: number; y: number } | null = null;

/** Pinta un trazo del pincel entre el último punto y (x, y) mm. */
export function brushTo(d: Design, size: PinSize, x: number, y: number, mode: 'erase' | 'restore', sizeMm: number, hardness: number, start: boolean): void {
  const W = ensureWorking(d);
  if (!W) return;
  const p = mmToImagePx(d, size, W.w, W.h, x, y);
  const r = Math.max(1, (sizeMm / 2) * p.pxPerMm);
  const from = start || !last ? { x: p.px, y: p.py } : last;
  const dist = Math.hypot(p.px - from.x, p.py - from.y);
  const steps = Math.max(1, Math.ceil(dist / (r * 0.3)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = from.x + (p.px - from.x) * t;
    const cy = from.y + (p.py - from.y) * t;
    dab(mode === 'erase' ? W.erase : W.restore, cx, cy, r, hardness, false);
    dab(mode === 'erase' ? W.restore : W.erase, cx, cy, r, hardness, true);
  }
  last = { x: p.px, y: p.py };
  W.dirty = true;
}

/** Dibuja (en el editor) una vista de los trazos: rojo = se borra, verde = se restaura. */
export function drawBrushOverlay(ctx: CanvasRenderingContext2D, d: Design, size: PinSize): void {
  if (!work || !work.dirty || !work.key.startsWith(`${d.id}|`)) return;
  const { w, h } = work;
  const s = imageScale(d, size, w, h);
  const tint = (src: HTMLCanvasElement, color: string) => {
    const c = mk(w, h);
    const x = c.getContext('2d')!;
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, w, h);
    return c;
  };
  ctx.save();
  ctx.translate(d.image.ox, d.image.oy);
  ctx.rotate((d.image.rot * Math.PI) / 180);
  ctx.globalAlpha = 0.45;
  ctx.drawImage(tint(work.erase, '#ff2a55'), (-w * s) / 2, (-h * s) / 2, w * s, h * s);
  ctx.drawImage(tint(work.restore, '#20c070'), (-w * s) / 2, (-h * s) / 2, w * s, h * s);
  ctx.restore();
}

/** Al soltar: combina las capas en la máscara y devuelve su id (o null si no hubo cambios). */
export async function commitBrush(): Promise<string | null> {
  last = null;
  if (!work || !work.dirty) return null;
  const { w, h, erase, restore } = work;
  const e = erase.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const r = restore.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  for (let i = 0; i < e.length; i += 4) {
    out.data[i] = e[i + 3];
    out.data[i + 1] = r[i + 3];
    out.data[i + 3] = 255;
  }
  const c = mk(w, h);
  c.getContext('2d')!.putImageData(out, 0, 0);
  const rec = await addImageBlob(await canvasToBlob(c));
  // La capa de trabajo pasa a corresponder a la nueva máscara.
  work.key = work.key.replace(/\|[^|]*$/, `|${rec.id}`);
  work.dirty = false;
  return rec.id;
}

export function resetBrushWork(): void {
  work = null;
  last = null;
}
