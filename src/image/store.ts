import type { Bitmap } from '../model/design';

/**
 * Almacén de imágenes: los diseños solo guardan un id; aquí está el archivo
 * original (para guardar el proyecto) y su versión decodificada (para dibujar).
 */
export interface StoredImage {
  id: string;
  blob: Blob;
  bitmap: Bitmap;
  w: number;
  h: number;
}

const images = new Map<string, StoredImage>();
const listeners = new Set<() => void>();

export const onImagesChanged = (fn: () => void) => listeners.add(fn);

function newImageId(): string {
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function decode(blob: Blob): Promise<{ bitmap: Bitmap; w: number; h: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { bitmap: bmp, w: bmp.width, h: bmp.height };
    } catch {
      /* algunos formatos solo los decodifica <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { bitmap: img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    // La imagen ya está decodificada; el URL se puede liberar un poco después.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export async function addImageBlob(blob: Blob, id = newImageId()): Promise<StoredImage> {
  const { bitmap, w, h } = await decode(blob);
  if (!w || !h) throw new Error('La imagen está vacía o no se pudo leer');
  const rec = { id, blob, bitmap, w, h };
  images.set(id, rec);
  listeners.forEach((l) => l());
  return rec;
}

export function canvasToBlob(c: HTMLCanvasElement | OffscreenCanvas, type = 'image/png', quality?: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo crear la imagen'))), type, quality));
}

export const getImage = (id: string | null | undefined): StoredImage | undefined => (id ? images.get(id) : undefined);
export const allImageIds = () => [...images.keys()];

/** Borra del almacén las imágenes que ya ningún diseño (ni el historial) usa. */
export function pruneImages(keep: Set<string>): void {
  for (const id of images.keys()) if (!keep.has(id)) images.delete(id);
}

export function clearImages(): void {
  images.clear();
}
