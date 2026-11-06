import { newSticker, type Design } from './design';
import { DEFAULT_SIZES, type PinSize } from './sizes';

/**
 * Copiar partes del diseño de un pin a otro. Si son de distinto tamaño,
 * lo que se mide en mm (grosor del borde, letras, stickers…) se escala en
 * proporción para que se vea igual.
 */

export type SizeLookup = (id: string) => PinSize;
const defaultLookup: SizeLookup = (id) => DEFAULT_SIZES.find((s) => s.id === id) ?? DEFAULT_SIZES[0];
let lookup: SizeLookup = defaultLookup;
/** La app registra aquí su lista de moldes (incluidos los personalizados). */
export function setSizeLookup(fn: SizeLookup): void {
  lookup = fn;
}

export function scaleBetween(src: Design, dst: Design): number {
  const a = lookup(src.sizeId);
  const b = lookup(dst.sizeId);
  return Math.min(b.faceW / a.faceW, b.faceH / a.faceH);
}

export function copyBackground(src: Design, dst: Design): void {
  const k = scaleBetween(src, dst);
  dst.bg = { ...structuredClone(src.bg), ox: src.bg.ox * k, oy: src.bg.oy * k };
  dst.pattern = { ...src.pattern, scale: Math.max(2, src.pattern.scale * k) };
}

export function copyRing(src: Design, dst: Design): void {
  const k = scaleBetween(src, dst);
  dst.ring = { ...src.ring, width: Math.max(0.3, src.ring.width * k) };
}

export function copyTextStyle(src: Design, dst: Design, withText: boolean): void {
  const k = scaleBetween(src, dst);
  const keep = { top: dst.text.top, bottom: dst.text.bottom, middle: dst.text.middle };
  dst.text = {
    ...src.text,
    size: Math.max(1.5, src.text.size * k),
    middleSize: Math.max(1.5, src.text.middleSize * k),
    middleY: src.text.middleY * k,
    inset: src.text.inset * k,
    ...(withText ? {} : keep),
  };
}

export function copyStickers(src: Design, dst: Design): void {
  const k = scaleBetween(src, dst);
  dst.stickers = src.stickers.map((s) => ({ ...newSticker(s.emoji, s.size * k, s.x * k, s.y * k), rot: s.rot }));
}

export function copyAdjust(src: Design, dst: Design): void {
  dst.adjust = { ...src.adjust };
}

export function copyCutout(src: Design, dst: Design): void {
  // La máscara del pincel es de cada foto: no se copia.
  dst.cutout = { ...src.cutout, maskId: dst.cutout.maskId };
}

/** "Copiar estilo": fondo (con imagen de fondo), patrón, borde y estilo de letras. */
export function copyStyleScaled(src: Design, dst: Design): void {
  copyBackground(src, dst);
  copyRing(src, dst);
  copyTextStyle(src, dst, false);
}
