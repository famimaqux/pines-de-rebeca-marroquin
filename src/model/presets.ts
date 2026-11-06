import { newDesign, type Design } from './design';
import type { PinSize } from './sizes';

/** Partes del diseño que forman su "estilo" (todo menos la imagen principal y los textos). */
export type Style = Pick<Design, 'bg' | 'pattern' | 'ring'> & { text: Omit<Design['text'], 'top' | 'bottom' | 'middle'> };

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

const base = (): Style => {
  const d = newDesign('x');
  const { top: _t, bottom: _b, middle: _m, ...text } = d.text;
  return { bg: d.bg, pattern: d.pattern, ring: d.ring, text };
};

export const PRESETS: Record<string, DeepPartial<Style>> = {
  Minimal: {},
  Arcoíris: {
    bg: { type: 'arcoiris' },
    pattern: { type: 'puntos', color: '#ffffff', alpha: 0.3, scale: 6 },
    ring: { type: 'linea', color: '#ffffff', width: 1.6 },
    text: { font: 'Fredoka', color: '#ffffff', outline: false, inset: 2.5 },
  },
  Kawaii: {
    bg: { type: 'radial', c1: '#ffe3f0', c2: '#e6dcff' },
    pattern: { type: 'corazones', color: '#ff7eb6', alpha: 0.35, scale: 7 },
    ring: { type: 'banda', color: '#ff8fc1', finish: 'plano', width: 4.5 },
    text: { font: 'Fredoka', color: '#ffffff', outline: false, inset: 0, size: 4 },
  },
  'Retro sol': {
    bg: { type: 'radial', c1: '#ffcf6b', c2: '#ff6f61' },
    pattern: { type: 'rayos', color: '#ffffff', alpha: 0.28, scale: 8 },
    ring: { type: 'linea', color: '#3b2a20', width: 1.2 },
    text: { font: 'Bebas Neue', color: '#3b2a20', outline: true, inset: 2 },
  },
  Dorado: {
    bg: { type: 'radial', c1: '#2b2346', c2: '#120e22' },
    pattern: { type: 'estrellas', color: '#f5e08a', alpha: 0.35, scale: 7 },
    ring: { type: 'banda', finish: 'oro', width: 5 },
    text: { font: 'Poppins', color: '#3a2a05', outline: false, inset: 0, size: 4 },
  },
  Lunares: {
    bg: { type: 'solido', c1: '#2bb3c0' },
    pattern: { type: 'puntos', color: '#ffffff', alpha: 0.55, scale: 6 },
    ring: { type: 'doble', color: '#ffffff', width: 2.6 },
    text: { font: 'Fredoka', color: '#ffffff', outline: false, inset: 1.5 },
  },
  Neón: {
    bg: { type: 'lineal', c1: '#140028', c2: '#3d0070' },
    pattern: { type: 'estrellas', color: '#ffffff', alpha: 0.45, scale: 6 },
    ring: { type: 'linea', color: '#39ff14', width: 1.4 },
    text: { font: 'Bebas Neue', color: '#39ff14', outline: false, inset: 2.5 },
  },
  Rayitas: {
    bg: { type: 'solido', c1: '#fff3c4' },
    pattern: { type: 'rayas', color: '#ffb300', alpha: 0.35, scale: 6 },
    ring: { type: 'punteado', color: '#e0457b', width: 1.6 },
    text: { font: 'Caveat', color: '#e0457b', outline: true, inset: 3 },
  },
  Colorear: {
    bg: { type: 'ninguno' },
    pattern: { type: 'ninguno' },
    ring: { type: 'linea', color: '#222222', width: 0.8 },
    text: { font: 'Poppins', color: '#222222', outline: false },
  },
};

/** Aplica un estilo rápido: conserva la imagen, los textos, la imagen de fondo y los stickers. */
export function applyPreset(d: Design, name: string): void {
  const p = PRESETS[name];
  if (!p) return;
  const b = base();
  const keepBgImage = d.bg.imageId;
  d.bg = { ...b.bg, ...p.bg, imageId: keepBgImage };
  d.pattern = { ...b.pattern, ...p.pattern };
  d.ring = { ...b.ring, ...p.ring };
  d.text = { ...d.text, ...b.text, ...p.text };
}

/** Copia el estilo de `from` a `to` (incluye la imagen de fondo y su posición). */
export function copyStyle(from: Design, to: Design): void {
  to.bg = structuredClone(from.bg);
  to.pattern = structuredClone(from.pattern);
  to.ring = structuredClone(from.ring);
  to.text = { ...structuredClone(from.text), top: to.text.top, bottom: to.text.bottom, middle: to.text.middle };
}

/**
 * Adapta un diseño hecho para `from` a otro molde `to`, escalando en proporción
 * todo lo que se mide en mm (texto, borde, stickers, posiciones).
 */
export function scaleDesign(d: Design, from: PinSize, to: PinSize): void {
  const k = Math.min(to.faceW / from.faceW, to.faceH / from.faceH);
  d.sizeId = to.id;
  d.image.ox *= k;
  d.image.oy *= k;
  d.bg.ox *= k;
  d.bg.oy *= k;
  d.pattern.scale = Math.max(2, d.pattern.scale * k);
  d.ring.width = Math.max(0.3, d.ring.width * k);
  d.text.size = Math.max(1.5, d.text.size * k);
  d.text.inset *= k;
  for (const s of d.stickers) {
    s.size *= k;
    s.x *= k;
    s.y *= k;
  }
}
