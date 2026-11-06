import { wandSelection, type WandOptions, type WandSeed } from '../image/wand';

/** Web Worker de la varita mágica: guarda los píxeles de la imagen y calcula la selección. */

export type WandRequest =
  | { type: 'load'; job: number; key: string; bitmap: ImageBitmap; w: number; h: number }
  | { type: 'select'; job: number; key: string; seeds: WandSeed[]; opts: WandOptions };

export interface WandResponse {
  job: number;
  sel?: Uint8Array;
  w?: number;
  h?: number;
  error?: string;
}

const ctx = self as unknown as { postMessage(msg: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<WandRequest>) => void) | null };
let cache: { key: string; data: Uint8ClampedArray; w: number; h: number } | null = null;

ctx.onmessage = (e: MessageEvent<WandRequest>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      const c = new OffscreenCanvas(m.w, m.h).getContext('2d', { willReadFrequently: true })!;
      c.drawImage(m.bitmap, 0, 0, m.w, m.h);
      m.bitmap.close();
      cache = { key: m.key, data: c.getImageData(0, 0, m.w, m.h).data, w: m.w, h: m.h };
      ctx.postMessage({ job: m.job } satisfies WandResponse);
      return;
    }
    if (!cache || cache.key !== m.key) throw new Error('imagen no cargada');
    const sel = wandSelection({ data: cache.data, width: cache.w, height: cache.h }, m.seeds, m.opts);
    ctx.postMessage({ job: m.job, sel, w: cache.w, h: cache.h } satisfies WandResponse, [sel.buffer]);
  } catch (err) {
    ctx.postMessage({ job: m.job, error: String(err) } satisfies WandResponse);
  }
};
