import type { BackgroundLayer, Design, PatternLayer, RingLayer, TextLayer } from './design';

/** Fondos prediseñados: color/degradado + patrón. Se aplican con "¿A qué pines lo aplico?". */
export interface BgPreset {
  name: string;
  bg: Partial<BackgroundLayer>;
  pattern: Partial<PatternLayer>;
}

export const BG_PRESETS: BgPreset[] = [
  { name: 'Cielo kawaii', bg: { type: 'radial', c1: '#FDFBFF', c2: '#CFC6FF' }, pattern: { type: 'estrellas', color: '#ffffff', alpha: 0.7, scale: 7 } },
  { name: 'Sakura', bg: { type: 'radial', c1: '#FFF1F6', c2: '#F7B6CF' }, pattern: { type: 'corazones', color: '#ffffff', alpha: 0.55, scale: 7 } },
  { name: 'Galaxia', bg: { type: 'radial', c1: '#5B3FA8', c2: '#140B33' }, pattern: { type: 'estrellas', color: '#FDE68A', alpha: 0.55, scale: 6 } },
  { name: 'Arcoíris pastel', bg: { type: 'arcoiris_r' }, pattern: { type: 'puntos', color: '#ffffff', alpha: 0.35, scale: 6 } },
  { name: 'Manga rayos', bg: { type: 'solido', c1: '#ffffff' }, pattern: { type: 'rayos', color: '#2B2540', alpha: 0.16, scale: 6 } },
  { name: 'Atardecer', bg: { type: 'lineal', c1: '#FFD9C2', c2: '#B8A6FF' }, pattern: { type: 'ninguno' } },
  { name: 'Menta rayitas', bg: { type: 'solido', c1: '#DDF5EE' }, pattern: { type: 'rayas', color: '#ffffff', alpha: 0.7, scale: 5 } },
  { name: 'Lunares retro', bg: { type: 'solido', c1: '#FFE9A8' }, pattern: { type: 'puntos', color: '#F28CA8', alpha: 0.6, scale: 7 } },
  { name: 'Picnic', bg: { type: 'solido', c1: '#ffffff' }, pattern: { type: 'cuadros', color: '#F7A8B8', alpha: 0.45, scale: 8 } },
  { name: 'Noche dorada', bg: { type: 'radial', c1: '#2C2554', c2: '#0F0C24' }, pattern: { type: 'puntos', color: '#E8C97A', alpha: 0.5, scale: 5 } },
];

export function applyBgPreset(d: Design, p: BgPreset): void {
  // conserva la imagen de fondo propia y su posición si ya tenía
  d.bg = { ...d.bg, type: 'ninguno', ...p.bg, ox: 0, oy: 0, zoom: 1, rot: 0 };
  d.pattern = { ...d.pattern, type: 'ninguno', ...p.pattern };
}

/** Modelos de círculo / borde. */
export interface RingPreset {
  name: string;
  ring: Partial<RingLayer>;
}

export const RING_PRESETS: RingPreset[] = [
  { name: 'Sin borde', ring: { type: 'ninguno' } },
  { name: 'Línea blanca', ring: { type: 'linea', color: '#ffffff', finish: 'plano', width: 1.5 } },
  { name: 'Doble dorado', ring: { type: 'doble', finish: 'oro', width: 2.6 } },
  { name: 'Puntitos', ring: { type: 'punteado', color: '#ffffff', finish: 'plano', width: 1.8 } },
  { name: 'Banda lavanda', ring: { type: 'banda', color: '#B8A6FF', finish: 'plano', width: 4.5 } },
  { name: 'Banda sakura', ring: { type: 'banda', color: '#F7B6CF', finish: 'plano', width: 4.5 } },
  { name: 'Banda plateada', ring: { type: 'banda', finish: 'plata', width: 4 } },
  { name: 'Oro rosa', ring: { type: 'linea', finish: 'rosa', width: 2.2 } },
];

export function applyRingPreset(d: Design, p: RingPreset): void {
  d.ring = { ...d.ring, ...p.ring };
}

/**
 * WordArt de un clic: estilo de las letras + forma del texto del centro
 * (arco arriba, arco abajo, onda o recto). Nunca cambian lo que dice el texto.
 */
export type WordArt = Partial<Omit<TextLayer, 'top' | 'bottom' | 'middle' | 'size' | 'middleY' | 'inset' | 'ox' | 'oy'>>;

export const WORDART: Record<string, WordArt> = {
  'Arco dorado': { font: 'Lobster', fill: 'degradado', color: '#FFF3B0', color2: '#C08A2A', outline: true, outlineColor: '#5A3D00', outlineWidth: 0.09, outline2: true, outline2Color: '#ffffff', outline2Width: 0.12, effect: 'brillo', shape: 'arcoArriba', bend: 0.55 },
  'Onda arcoíris': { font: 'Luckiest Guy', fill: 'arcoiris', outline: true, outlineColor: '#ffffff', outlineWidth: 0.2, outline2: true, outline2Color: '#3A3354', outline2Width: 0.08, effect: 'sombra', shape: 'onda', bend: 0.6 },
  'Pop doble contorno': { font: 'Bungee', fill: 'solido', color: '#FFD54F', outline: true, outlineColor: '#3A3354', outlineWidth: 0.1, outline2: true, outline2Color: '#ffffff', outline2Width: 0.14, effect: '3d', effectColor: '#F28CA8', shape: 'recto', bend: 0.5 },
  'Neón en arco': { font: 'Comfortaa', fill: 'solido', color: '#F5F3FF', outline: false, outline2: false, effect: 'neon', effectColor: '#B48CFF', shape: 'arcoArriba', bend: 0.45 },
  'Cómic onda': { font: 'Luckiest Guy', fill: 'solido', color: '#ffffff', outline: true, outlineColor: '#1F1A33', outlineWidth: 0.18, outline2: false, effect: '3d', effectColor: '#7FD3C4', shape: 'onda', bend: 0.45 },
  'Caramelo sonrisa': { font: 'Chewy', fill: 'alternado', color: '#F28CA8', color2: '#ffffff', outline: true, outlineColor: '#9C3D63', outlineWidth: 0.14, outline2: true, outline2Color: '#ffffff', outline2Width: 0.1, effect: 'ninguno', shape: 'arcoAbajo', bend: 0.5 },
  'Galaxia': { font: 'Baloo 2', fill: 'degradado', color: '#C9B8FF', color2: '#7FD3C4', outline: true, outlineColor: '#1C1440', outlineWidth: 0.12, outline2: true, outline2Color: '#E8C97A', outline2Width: 0.06, effect: 'brillo', shape: 'arcoArriba', bend: 0.35 },
  'Kawaii pastel': { font: 'Fredoka', fill: 'porLetra', letterColors: '#F7B6CF,#B8A6FF,#7FD3C4,#FFD9A8', outline: true, outlineColor: '#ffffff', outlineWidth: 0.22, outline2: true, outline2Color: '#8B7BE8', outline2Width: 0.07, effect: 'sombra', shape: 'recto', bend: 0.5 },
};

export function applyWordArt(d: Design, name: string): void {
  const w = WORDART[name];
  if (w) d.text = { ...d.text, ...w };
}
