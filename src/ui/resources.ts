import type { Design } from '../model/design';
import type { PinImages } from '../render/drawPin';
import { processedNow } from '../image/processor';
import { getImage } from '../image/store';

/** Imágenes listas para dibujar un diseño (la principal ya procesada). */
export function imagesFor(d: Design): PinImages {
  return { main: processedNow(d), bg: getImage(d.bg.imageId)?.bitmap ?? null };
}
