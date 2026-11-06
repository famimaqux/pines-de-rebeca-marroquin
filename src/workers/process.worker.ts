import { processPixels, type ProcessParams } from '../image/pixels';

/** Web Worker: procesa la imagen (quitar fondo rápido, máscara, color, nitidez) con OffscreenCanvas. */

export interface ProcessRequest {
  job: number;
  source: ImageBitmap;
  mask: ImageBitmap | null;
  w: number;
  h: number;
  params: ProcessParams;
}

export interface ProcessResponse {
  job: number;
  result?: ImageBitmap;
  error?: string;
}

const ctx = self as unknown as { postMessage(msg: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<ProcessRequest>) => void) | null };

ctx.onmessage = (e: MessageEvent<ProcessRequest>) => {
  const { job, source, mask, w, h, params } = e.data;
  try {
    const canvas = new OffscreenCanvas(w, h);
    const c = canvas.getContext('2d', { willReadFrequently: true })!;
    c.imageSmoothingQuality = 'high';
    c.drawImage(source, 0, 0, w, h);
    source.close();
    const img = c.getImageData(0, 0, w, h);
    let maskData: Uint8ClampedArray | null = null;
    if (mask) {
      const mc = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
      mc.drawImage(mask, 0, 0, w, h);
      mask.close();
      maskData = mc.getImageData(0, 0, w, h).data;
    }
    processPixels(img, params, maskData);
    c.putImageData(img, 0, 0);
    const result = canvas.transferToImageBitmap();
    ctx.postMessage({ job, result } satisfies ProcessResponse, [result]);
  } catch (err) {
    ctx.postMessage({ job, error: String(err) } satisfies ProcessResponse);
  }
};
