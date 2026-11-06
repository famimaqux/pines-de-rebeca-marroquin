import type { Design } from '../model/design';
import type { PinSize } from '../model/sizes';
import { processedSize } from '../image/pixels';
import { addImageBlob, canvasToBlob, getImage } from '../image/store';
import { applySelectionToMask, wandSelection, type WandOp, type WandOptions, type WandSeed } from '../image/wand';
import { imageScale } from '../render/drawPin';
import type { WandRequest, WandResponse } from '../workers/wand.worker';
import { mmToImagePx, resetBrushWork } from './brush';

/**
 * Varita mágica del editor: guarda los clics (nuevo / sumar / restar), pide la
 * selección al Web Worker y la aplica a la máscara (la misma del pincel).
 */

export const wand = {
  opts: { tol: 32, contiguous: true, soft: 1, invert: false } as WandOptions,
  /** botón de modo para el celular (equivale a Mayús / Alt) */
  op: 'new' as WandOp,
  seeds: [] as WandSeed[],
  /** clave de la imagen (diseño + imagen) a la que pertenece la selección */
  key: '',
  sel: null as Uint8Array | null,
  w: 0,
  h: 0,
};

const listeners = new Set<() => void>();
export const onWandChanged = (fn: () => void) => listeners.add(fn);
const changed = () => listeners.forEach((l) => l());

/* ---------- Worker ---------- */
let worker: Worker | null = null;
let job = 0;
const pending = new Map<number, (r: WandResponse) => void>();
let loadedKey = '';
const canWorker = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/wand.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WandResponse>) => {
      pending.get(e.data.job)?.(e.data);
      pending.delete(e.data.job);
    };
  }
  return worker;
}
const send = (msg: WandRequest, transfer: Transferable[] = []) =>
  new Promise<WandResponse>((res) => {
    pending.set(msg.job, res);
    getWorker().postMessage(msg, transfer);
  });

/** Píxeles de la imagen para el respaldo sin Worker. */
function pixelsMain(d: Design, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(getImage(d.image.imageId)!.bitmap, 0, 0, w, h);
  return { data: x.getImageData(0, 0, w, h).data, width: w, height: h };
}

let seq = 0;
/** Recalcula la selección con los clics y opciones actuales. */
export async function recompute(d: Design): Promise<void> {
  const rec = getImage(d.image.imageId);
  if (!rec || !wand.seeds.length) {
    wand.sel = null;
    changed();
    return;
  }
  const { w, h } = processedSize(rec.w, rec.h);
  const key = `${d.id}|${d.image.imageId}`;
  const my = ++seq;
  let sel: Uint8Array;
  if (canWorker()) {
    if (loadedKey !== key) {
      const bmp = await createImageBitmap(rec.bitmap);
      await send({ type: 'load', job: ++job, key, bitmap: bmp, w, h }, [bmp]);
      loadedKey = key;
    }
    const r = await send({ type: 'select', job: ++job, key, seeds: wand.seeds, opts: { ...wand.opts } });
    if (!r.sel) return;
    sel = r.sel;
  } else sel = wandSelection(pixelsMain(d, w, h), wand.seeds, wand.opts);
  if (my !== seq) return; // llegó una respuesta más nueva
  Object.assign(wand, { sel, w, h, key });
  changed();
}

/** Clic en la vista previa (mm del pin). Mayús = sumar, Alt = restar. */
export function wandClick(d: Design, size: PinSize, x: number, y: number, mods: { shift: boolean; alt: boolean }): void {
  const rec = getImage(d.image.imageId);
  if (!rec) return;
  const { w, h } = processedSize(rec.w, rec.h);
  const p = mmToImagePx(d, size, w, h, x, y);
  if (p.px < 0 || p.py < 0 || p.px >= w || p.py >= h) return;
  const key = `${d.id}|${d.image.imageId}`;
  if (wand.key !== key) clearWand();
  wand.key = key;
  const op: WandOp = mods.alt ? 'sub' : mods.shift ? 'add' : wand.op;
  if (!wand.seeds.length && op === 'sub') return; // no hay nada que restar
  if (op === 'new') wand.seeds = [];
  wand.seeds.push({ x: Math.floor(p.px), y: Math.floor(p.py), op: wand.seeds.length ? op : 'new' });
  void recompute(d);
}

export function clearWand(): void {
  wand.seeds = [];
  wand.sel = null;
  wand.opts.invert = false;
  changed();
}

export const hasSelection = () => !!wand.sel && wand.seeds.length > 0;

/** Lienzos del resaltado (relleno celeste + borde blanco), armados una vez por selección. */
let overlayFor: Uint8Array | null = null;
let fillCanvas: HTMLCanvasElement | null = null;
let edgeCanvas: HTMLCanvasElement | null = null;
function buildOverlay() {
  const { w, h, sel } = wand;
  if (!sel || overlayFor === sel) return;
  overlayFor = sel;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  fillCanvas = mk();
  edgeCanvas = mk();
  const fi = fillCanvas.getContext('2d')!.createImageData(w, h);
  const ed = edgeCanvas.getContext('2d')!.createImageData(w, h);
  for (let i = 0; i < sel.length; i++) {
    const a = sel[i];
    if (!a) continue;
    const k = i * 4;
    const xx = i % w;
    const edge = a > 127 && ((xx > 0 && sel[i - 1] < 128) || (xx < w - 1 && sel[i + 1] < 128) || (i >= w && sel[i - w] < 128) || (i < sel.length - w && sel[i + w] < 128));
    if (edge) ed.data.set([255, 255, 255, 255], k);
    fi.data.set([20, 200, 255, Math.round(a * 0.5)], k);
  }
  fillCanvas.getContext('2d')!.putImageData(fi, 0, 0);
  edgeCanvas.getContext('2d')!.putImageData(ed, 0, 0);
}

/** Selección resaltada (celeste semitransparente con borde que "late") sobre la imagen del pin. */
export function drawWandOverlay(ctx: CanvasRenderingContext2D, d: Design, size: PinSize, t: number): void {
  if (!wand.sel || wand.key !== `${d.id}|${d.image.imageId}`) return;
  buildOverlay();
  if (!fillCanvas || !edgeCanvas) return;
  const { w, h } = wand;
  const s = imageScale(d, size, w, h);
  ctx.save();
  ctx.translate(d.image.ox, d.image.oy);
  ctx.rotate((d.image.rot * Math.PI) / 180);
  ctx.drawImage(fillCanvas, (-w * s) / 2, (-h * s) / 2, w * s, h * s);
  ctx.globalAlpha = 0.45 + 0.45 * Math.sin(t / 180);
  ctx.drawImage(edgeCanvas, (-w * s) / 2, (-h * s) / 2, w * s, h * s);
  ctx.restore();
}

/** Aplica la selección a la máscara del diseño y devuelve el id de la máscara nueva. */
export async function applyWand(d: Design, action: 'erase' | 'restore'): Promise<string | null> {
  if (!wand.sel) return null;
  const { w, h, sel } = wand;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const old = getImage(d.cutout.maskId);
  let mask: ImageData;
  if (old) {
    x.drawImage(old.bitmap, 0, 0, w, h);
    mask = x.getImageData(0, 0, w, h);
  } else {
    mask = x.createImageData(w, h);
    for (let i = 3; i < mask.data.length; i += 4) mask.data[i] = 255;
  }
  applySelectionToMask(mask.data, sel, action);
  x.putImageData(mask, 0, 0);
  const rec = await addImageBlob(await canvasToBlob(c));
  resetBrushWork(); // el pincel recargará la máscara nueva
  return rec.id;
}
