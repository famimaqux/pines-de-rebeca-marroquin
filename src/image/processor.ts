import type { Bitmap, Design } from '../model/design';
import { isIdentity, paramsKey, processPixels, processedSize, type ProcessParams } from './pixels';
import { getImage } from './store';
import type { ProcessRequest, ProcessResponse } from '../workers/process.worker';

/**
 * Entrega la imagen principal ya procesada (quitar fondo rápido, pincel,
 * color, nitidez). El trabajo pesado va en un Web Worker con OffscreenCanvas;
 * mientras tanto se dibuja la última versión lista y, al terminar, se avisa.
 */

const cache = new Map<string, Bitmap>();
const pending = new Map<string, Promise<Bitmap>>();
/** Último resultado por diseño, para no parpadear mientras se recalcula. */
const lastByDesign = new Map<number, Bitmap>();
const MAX_CACHE = 40;
const listeners = new Set<() => void>();

export const onProcessed = (fn: () => void) => listeners.add(fn);

export function paramsOf(d: Design): ProcessParams {
  return { quick: d.cutout.quick, tol: d.cutout.tol, soft: d.cutout.soft, ...d.adjust };
}

const keyOf = (d: Design) => `${d.image.imageId}|${paramsKey(paramsOf(d), d.cutout.maskId)}`;

/* ---------- Worker ---------- */
let worker: Worker | null = null;
let workerBroken = false;
let jobSeq = 0;
const jobs = new Map<number, { resolve: (b: Bitmap) => void; reject: (e: Error) => void }>();

const canUseWorker = () => !workerBroken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/process.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<ProcessResponse>) => {
      const j = jobs.get(e.data.job);
      if (!j) return;
      jobs.delete(e.data.job);
      if (e.data.result) j.resolve(e.data.result);
      else j.reject(new Error(e.data.error ?? 'Error al procesar la imagen'));
    };
    worker.onerror = () => {
      workerBroken = true;
      for (const j of jobs.values()) j.reject(new Error('worker'));
      jobs.clear();
      worker = null;
    };
  }
  return worker;
}

async function runInWorker(src: Bitmap, mask: Bitmap | null, w: number, h: number, params: ProcessParams): Promise<Bitmap> {
  const source = await createImageBitmap(src);
  const maskBmp = mask ? await createImageBitmap(mask) : null;
  const job = ++jobSeq;
  return new Promise<Bitmap>((resolve, reject) => {
    jobs.set(job, { resolve, reject });
    const msg: ProcessRequest = { job, source, mask: maskBmp, w, h, params };
    getWorker().postMessage(msg, maskBmp ? [source, maskBmp] : [source]);
  });
}

/** Respaldo sin Worker (navegadores antiguos). */
function runOnMainThread(src: Bitmap, mask: Bitmap | null, w: number, h: number, params: ProcessParams): Bitmap {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, w, h);
  const img = x.getImageData(0, 0, w, h);
  let m: Uint8ClampedArray | null = null;
  if (mask) {
    const mc = document.createElement('canvas');
    mc.width = w;
    mc.height = h;
    const mx = mc.getContext('2d', { willReadFrequently: true })!;
    mx.drawImage(mask, 0, 0, w, h);
    m = mx.getImageData(0, 0, w, h).data;
  }
  processPixels(img, params, m);
  x.putImageData(img, 0, 0);
  return c;
}

function remember(key: string, b: Bitmap) {
  cache.set(key, b);
  if (cache.size > MAX_CACHE) {
    // Se suelta la más antigua (el recolector de basura libera la memoria).
    cache.delete(cache.keys().next().value as string);
  }
}

/** Calcula (o reutiliza) la imagen procesada. */
export function ensureProcessed(d: Design): Promise<Bitmap | null> {
  const rec = getImage(d.image.imageId);
  if (!rec) return Promise.resolve(null);
  const params = paramsOf(d);
  if (isIdentity(params, d.cutout.maskId)) return Promise.resolve(rec.bitmap);
  const key = keyOf(d);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (!p) {
    const { w, h } = processedSize(rec.w, rec.h);
    const mask = getImage(d.cutout.maskId)?.bitmap ?? null;
    p = (canUseWorker() ? runInWorker(rec.bitmap, mask, w, h, params).catch(() => runOnMainThread(rec.bitmap, mask, w, h, params)) : Promise.resolve(runOnMainThread(rec.bitmap, mask, w, h, params)))
      .then((b) => {
        remember(key, b);
        return b;
      })
      .finally(() => pending.delete(key));
    pending.set(key, p);
    p.then(() => listeners.forEach((l) => l())).catch(() => {});
  }
  return p;
}

/**
 * Para dibujar ya: devuelve la versión lista o, si aún se procesa,
 * la última versión de ese diseño (o la original).
 */
export function processedNow(d: Design): Bitmap | null {
  const rec = getImage(d.image.imageId);
  if (!rec) return null;
  const params = paramsOf(d);
  if (isIdentity(params, d.cutout.maskId)) {
    lastByDesign.set(d.id, rec.bitmap);
    return rec.bitmap;
  }
  const hit = cache.get(keyOf(d));
  if (hit) {
    lastByDesign.set(d.id, hit);
    return hit;
  }
  void ensureProcessed(d);
  return lastByDesign.get(d.id) ?? rec.bitmap;
}

/** Espera a que todas las imágenes estén procesadas (antes de exportar). */
export async function ensureAll(designs: Design[]): Promise<void> {
  await Promise.all(designs.map((d) => ensureProcessed(d).catch(() => null)));
}

export function isProcessing(): boolean {
  return pending.size > 0;
}
