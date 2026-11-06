/**
 * Un "diseño" es un pin con sus capas. Todas las medidas en mm,
 * con el origen en el centro del pin.
 */

/** Cualquier imagen que se pueda dibujar en canvas y de la que conozcamos el tamaño. */
export type Bitmap = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

export type BgType = 'ninguno' | 'solido' | 'lineal' | 'radial' | 'arcoiris' | 'arcoiris_r';
export type PatternType = 'ninguno' | 'puntos' | 'rayas' | 'cuadros' | 'estrellas' | 'corazones' | 'rayos';
export type RingType = 'ninguno' | 'linea' | 'doble' | 'punteado' | 'banda';
export type RingFinish = 'plano' | 'oro' | 'plata' | 'rosa';

export interface BackgroundLayer {
  type: BgType;
  c1: string;
  c2: string;
  /** Transformación propia de la capa de fondo (independiente de la imagen). */
  ox: number;
  oy: number;
  zoom: number;
  /** grados */
  rot: number;
  /** Imagen opcional (foto, textura, papel) dentro de la capa de fondo. */
  image: Bitmap | null;
}

export interface PatternLayer {
  type: PatternType;
  color: string;
  /** 0..1 */
  alpha: number;
  /** separación entre motivos, mm */
  scale: number;
}

export interface ImageLayer {
  src: Bitmap | null;
  /** cubrir = llena todo; encajar = se ve la imagen completa (deja ver el fondo) */
  fit: 'cubrir' | 'encajar';
  /** corte = llega hasta el borde del papel; cara = solo la parte visible */
  clip: 'corte' | 'cara';
  zoom: number;
  ox: number;
  oy: number;
  rot: number;
}

export interface RingLayer {
  type: RingType;
  color: string;
  finish: RingFinish;
  /** grosor en mm */
  width: number;
}

export interface TextLayer {
  top: string;
  bottom: string;
  font: string;
  /** tamaño de letra en mm */
  size: number;
  color: string;
  /** contorno blanco */
  outline: boolean;
  /** cuánto se mete hacia el centro, mm */
  inset: number;
}

export interface Sticker {
  id: number;
  emoji: string;
  /** tamaño en mm */
  size: number;
  x: number;
  y: number;
  rot: number;
}

export interface Design {
  id: number;
  sizeId: string;
  qty: number;
  bg: BackgroundLayer;
  pattern: PatternLayer;
  image: ImageLayer;
  ring: RingLayer;
  text: TextLayer;
  stickers: Sticker[];
}

export interface FontDef {
  family: string;
  weight: number;
}

/** Fuentes incrustadas en la app (funcionan sin internet). */
export const FONTS: readonly FontDef[] = [
  { family: 'Fredoka', weight: 600 },
  { family: 'Pacifico', weight: 400 },
  { family: 'Bebas Neue', weight: 400 },
  { family: 'Poppins', weight: 600 },
  { family: 'Caveat', weight: 700 },
  { family: 'Lobster', weight: 400 },
];

export const EMOJIS = ['⭐', '💖', '🌸', '🦋', '🌈', '✨', '🍓', '🐱', '🎀', '🔥', '⚡', '🌙', '☀️', '🍀', '🎵', '👑', '🌻', '🐾', '💫', '🍒', '🐶', '🌷', '💎', '🦄'];

let nextId = 1;
let nextStickerId = 1;

export function newSticker(emoji = '⭐', size = 10, x = 0, y = 16): Sticker {
  return { id: nextStickerId++, emoji, size, x, y, rot: 0 };
}

export function newDesign(sizeId: string, image: Bitmap | null = null): Design {
  return {
    id: nextId++,
    sizeId,
    qty: 1,
    bg: { type: 'ninguno', c1: '#ffffff', c2: '#ffd1e8', ox: 0, oy: 0, zoom: 1, rot: 0, image: null },
    pattern: { type: 'ninguno', color: '#ff6fa8', alpha: 0.35, scale: 7 },
    image: { src: image, fit: 'cubrir', clip: 'corte', zoom: 1, ox: 0, oy: 0, rot: 0 },
    ring: { type: 'ninguno', color: '#ffffff', finish: 'plano', width: 2 },
    text: { top: '', bottom: '', font: 'Fredoka', size: 5, color: '#2a2230', outline: true, inset: 1.5 },
    stickers: [],
  };
}

export function bitmapSize(b: Bitmap): { w: number; h: number } {
  if (typeof HTMLImageElement !== 'undefined' && b instanceof HTMLImageElement) {
    return { w: b.naturalWidth, h: b.naturalHeight };
  }
  return { w: b.width, h: b.height };
}

export function fontCss(family: string, sizePx: number): string {
  const f = FONTS.find((x) => x.family === family) ?? FONTS[0];
  return `${f.weight} ${sizePx}px "${f.family}"`;
}
