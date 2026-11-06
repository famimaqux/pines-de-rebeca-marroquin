/**
 * Un "diseño" es un pin con sus capas. Todas las medidas en mm,
 * con el origen en el centro del pin.
 *
 * Los diseños son datos puros (se pueden copiar con JSON): las imágenes
 * se guardan aparte en el almacén de imágenes y aquí solo va su id.
 */

/** Cualquier imagen que se pueda dibujar en canvas. */
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
  imageId: string | null;
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
  imageId: string | null;
  /** cubrir = llena todo; encajar = se ve la imagen completa (deja ver el fondo) */
  fit: 'cubrir' | 'encajar';
  /** corte = llega hasta el borde del papel; cara = solo la parte visible */
  clip: 'corte' | 'cara';
  zoom: number;
  ox: number;
  oy: number;
  rot: number;
}

/** Quitar fondo (rápido) + correcciones a mano con pincel. */
export interface CutoutSettings {
  quick: boolean;
  /** tolerancia de color 0..120 */
  tol: number;
  /** suavizado del borde 0..60 */
  soft: number;
  /** Máscara del pincel (R = borrar, G = restaurar), mismo tamaño que la imagen procesada. */
  maskId: string | null;
}

/** Mejora de impresión. */
export interface Adjustments {
  bright: number;
  contrast: number;
  sat: number;
  /** nitidez (unsharp mask) 0..1 */
  sharp: number;
  /** "Mejorar colores" automático 0..1 (niveles, viveza y aclarado) */
  auto: number;
}

export interface RingLayer {
  type: RingType;
  color: string;
  finish: RingFinish;
  /** grosor en mm */
  width: number;
}

/** Cómo se rellenan las letras. */
export type TextFill = 'solido' | 'degradado' | 'arcoiris' | 'alternado' | 'porLetra' | 'contorno';
export type TextEffect = 'ninguno' | 'sombra' | '3d' | 'neon' | 'brillo';
/** Forma WordArt del texto del centro. */
export type TextShape = 'recto' | 'arcoArriba' | 'arcoAbajo' | 'onda';

export interface TextLayer {
  /** Texto curvo de arriba (recto en formas no redondas). */
  top: string;
  /** Texto curvo de abajo. */
  bottom: string;
  /** Texto recto en el centro (ideal para un nombre grande). */
  middle: string;
  font: string;
  /** tamaño de letra en mm (arriba/abajo) */
  size: number;
  /** tamaño del texto del centro, mm */
  middleSize: number;
  /** posición vertical del texto del centro, mm */
  middleY: number;
  fill: TextFill;
  color: string;
  color2: string;
  /** colores para "por letra", separados por coma */
  letterColors: string;
  /** contorno */
  outline: boolean;
  outlineColor: string;
  /** grosor del contorno, relativo al tamaño de letra (0.05..0.5) */
  outlineWidth: number;
  /** segundo contorno, por fuera del primero (estilo WordArt) */
  outline2: boolean;
  outline2Color: string;
  /** grosor del segundo contorno, relativo al tamaño de letra */
  outline2Width: number;
  /** forma del texto del centro */
  shape: TextShape;
  /** cuánto se curva (arco u onda), 0..1 */
  bend: number;
  /** colores del degradado (separados por coma); si está vacío se usan color y color2 */
  gradColors: string;
  /** ángulo del degradado: 180 = de arriba a abajo, 90 = de izquierda a derecha */
  gradAngle: number;
  /** color del brillo (resplandor suave); vacío = sin brillo */
  glow: string;
  /** profundidad de la sombra 3D, relativa al tamaño de letra */
  depth: number;
  /** escribir en MAYÚSCULAS */
  upper: boolean;
  effect: TextEffect;
  effectColor: string;
  /** cuánto se mete hacia el centro, mm */
  inset: number;
  /** posición de todo el bloque de letras (se arrastra en el editor), mm */
  ox: number;
  oy: number;
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
  cutout: CutoutSettings;
  adjust: Adjustments;
  ring: RingLayer;
  text: TextLayer;
  stickers: Sticker[];
}

export interface FontDef {
  family: string;
  weight: number;
  /** 'italic' para las cursivas */
  style?: string;
}

/** Fuentes incrustadas en la app (funcionan sin internet). */
export const FONTS: readonly FontDef[] = [
  { family: 'Fredoka', weight: 600 },
  { family: 'Pacifico', weight: 400 },
  { family: 'Bebas Neue', weight: 400 },
  { family: 'Poppins', weight: 600 },
  { family: 'Caveat', weight: 700 },
  { family: 'Lobster', weight: 400 },
  { family: 'Baloo 2', weight: 800 },
  { family: 'Dancing Script', weight: 700 },
  { family: 'Luckiest Guy', weight: 400 },
  { family: 'Chewy', weight: 400 },
  { family: 'Permanent Marker', weight: 400 },
  { family: 'Great Vibes', weight: 400 },
  { family: 'Bungee', weight: 400 },
  { family: 'Comfortaa', weight: 700 },
  { family: 'Kaushan Script', weight: 400 },
  { family: 'Yellowtail', weight: 400 },
  { family: 'Rubik Bubbles', weight: 400 },
  { family: 'Londrina Outline', weight: 400 },
  { family: 'Rock Salt', weight: 400 },
  { family: 'Fredericka the Great', weight: 400 },
  { family: 'Cabin Sketch', weight: 700 },
  { family: 'Alex Brush', weight: 400 },
  { family: 'Andika', weight: 700 },
  { family: 'Lilita One', weight: 400 },
  { family: 'Bangers', weight: 400 },
  { family: 'Monoton', weight: 400 },
  { family: 'Cinzel Decorative', weight: 700 },
  { family: 'Sedgwick Ave Display', weight: 400 },
  { family: 'Titan One', weight: 400 },
  { family: 'Bowlby One', weight: 400 },
  { family: 'Sniglet', weight: 800 },
  { family: 'Anton', weight: 400 },
  { family: 'Cormorant Garamond', weight: 500, style: 'italic' },
  { family: 'Archivo Black', weight: 400 },
  { family: 'Cinzel', weight: 700 },
  { family: 'Fredoka Bold', weight: 700 },
];

export const EMOJIS = ['⭐', '💖', '🌸', '🦋', '🌈', '✨', '🍓', '🐱', '🎀', '🔥', '⚡', '🌙', '☀️', '🍀', '🎵', '👑', '🌻', '🐾', '💫', '🍒', '🐶', '🌷', '💎', '🦄'];

export const NEUTRAL_ADJUST: Adjustments = { bright: 1, contrast: 1, sat: 1, sharp: 0, auto: 0 };
/** "Optimizar para Epson L8050". */
export const EPSON_ADJUST: Adjustments = { bright: 1.04, contrast: 1.08, sat: 1.15, sharp: 0.35, auto: 0 };

let nextId = 1;
let nextStickerId = 1;

/** Evita choques de id al abrir proyectos guardados. */
export function bumpIds(designs: Design[]): void {
  for (const d of designs) {
    nextId = Math.max(nextId, d.id + 1);
    for (const s of d.stickers) nextStickerId = Math.max(nextStickerId, s.id + 1);
  }
}

export function newSticker(emoji = '⭐', size = 10, x = 0, y = 16): Sticker {
  return { id: nextStickerId++, emoji, size, x, y, rot: 0 };
}

export function newDesign(sizeId: string, imageId: string | null = null): Design {
  return {
    id: nextId++,
    sizeId,
    qty: 1,
    bg: { type: 'ninguno', c1: '#ffffff', c2: '#ffd1e8', ox: 0, oy: 0, zoom: 1, rot: 0, imageId: null },
    pattern: { type: 'ninguno', color: '#ff6fa8', alpha: 0.35, scale: 7 },
    image: { imageId, fit: 'cubrir', clip: 'corte', zoom: 1, ox: 0, oy: 0, rot: 0 },
    cutout: { quick: false, tol: 35, soft: 15, maskId: null },
    adjust: { ...NEUTRAL_ADJUST },
    ring: { type: 'ninguno', color: '#ffffff', finish: 'plano', width: 2 },
    text: {
      top: '',
      bottom: '',
      middle: '',
      font: 'Fredoka',
      size: 5,
      middleSize: 9,
      middleY: 0,
      fill: 'solido',
      color: '#2a2230',
      color2: '#ff5fa2',
      letterColors: '#ff4d6d,#ff9f1c,#ffd60a,#2ec4b6,#4cc9f0,#7b6cff',
      outline: true,
      outlineColor: '#ffffff',
      outlineWidth: 0.22,
      outline2: false,
      outline2Color: '#2e1065',
      outline2Width: 0.12,
      shape: 'recto',
      bend: 0.5,
      gradColors: '',
      gradAngle: 180,
      glow: '',
      depth: 0.15,
      upper: false,
      effect: 'ninguno',
      effectColor: '#7a1b4a',
      inset: 1.5,
      ox: 0,
      oy: 0,
    },
    stickers: [],
  };
}

/** Copia profunda con id nuevo (los stickers también reciben id nuevo). */
export function cloneDesign(d: Design): Design {
  const c = structuredClone(d);
  c.id = nextId++;
  c.stickers = c.stickers.map((s) => ({ ...s, id: nextStickerId++ }));
  return c;
}

/** Rellena campos que falten (proyectos de versiones anteriores). */
export function normalizeDesign(raw: Partial<Design>, fallbackSize: string): Design {
  const base = newDesign(raw.sizeId ?? fallbackSize);
  nextId--; // newDesign consumió un id que no usaremos
  const d: Design = {
    ...base,
    ...raw,
    bg: { ...base.bg, ...raw.bg },
    pattern: { ...base.pattern, ...raw.pattern },
    image: { ...base.image, ...raw.image },
    cutout: { ...base.cutout, ...raw.cutout },
    adjust: { ...base.adjust, ...raw.adjust },
    ring: { ...base.ring, ...raw.ring },
    text: { ...base.text, ...raw.text },
    stickers: (raw.stickers ?? []).map((s) => ({ ...newSticker(), ...s })),
    id: typeof raw.id === 'number' ? raw.id : nextId++,
  };
  return d;
}

export function bitmapSize(b: Bitmap): { w: number; h: number } {
  if (typeof HTMLImageElement !== 'undefined' && b instanceof HTMLImageElement) {
    return { w: b.naturalWidth, h: b.naturalHeight };
  }
  return { w: b.width, h: b.height };
}

export function fontCss(family: string, sizePx: number): string {
  const f = FONTS.find((x) => x.family === family) ?? FONTS[0];
  // "Fredoka Bold" es la misma familia Fredoka con peso 700
  const fam = f.family === 'Fredoka Bold' ? 'Fredoka' : f.family;
  return `${f.style ? f.style + ' ' : ''}${f.weight} ${sizePx}px "${fam}"`;
}
