import type { Design, TextLayer } from './design';
import { WORDART } from './galleries';

/**
 * Estilos de letra de un clic. Solo cambian el aspecto del texto (fuente,
 * colores, contornos, efectos, forma); nunca lo que dice.
 *
 * - "Quiz" y "Culto": reproducen el aspecto de los modelos de letra y de los
 *   títulos de las plantillas del proyecto quiz-familia (no se copió código).
 */
export type LetteringStyle = Partial<Omit<TextLayer, 'top' | 'bottom' | 'middle' | 'size' | 'middleSize' | 'middleY' | 'inset' | 'ox' | 'oy'>>;

export type LetteringCategory = 'quiz' | 'culto' | 'wordart' | 'kawaii';
export const CATEGORY_LABELS: Record<LetteringCategory, string> = { quiz: 'Quiz', culto: 'Culto', wordart: 'WordArt', kawaii: 'Kawaii' };

export interface LetteringEntry {
  id: string;
  name: string;
  cat: LetteringCategory;
  style: LetteringStyle;
  /** fondo de la muestra (para estilos claros como Tiza o Neón) */
  sample?: string;
}

/** Todo lo que un estilo "limpia" antes de aplicarse (para no arrastrar efectos del anterior). */
const RESET: LetteringStyle = {
  fill: 'solido',
  gradColors: '',
  gradAngle: 180,
  outline: false,
  outline2: false,
  effect: 'ninguno',
  glow: '',
  depth: 0.15,
  upper: false,
  shape: 'recto',
};

/** Convierte un modelo "cartel" (relleno, borde, sombra 3D, brillo) al estilo de letra de los pines. */
function cartel(font: string, c: { relleno: string[]; angulo?: number; porLetra?: boolean; borde?: string; grosor?: number; sombra?: string; prof?: number; brillo?: string }): LetteringStyle {
  const st: LetteringStyle = { font };
  if (c.porLetra && c.relleno.length > 1) Object.assign(st, { fill: 'porLetra', letterColors: c.relleno.join(',') });
  else if (c.relleno.length > 1) Object.assign(st, { fill: 'degradado', gradColors: c.relleno.join(','), gradAngle: c.angulo ?? 180, color: c.relleno[0], color2: c.relleno[c.relleno.length - 1] });
  else Object.assign(st, { fill: 'solido', color: c.relleno[0] });
  // En CSS el trazo va centrado y por detrás del relleno: se ve la mitad.
  if (c.borde) Object.assign(st, { outline: true, outlineColor: c.borde, outlineWidth: (c.grosor ?? 0.06) / 2 });
  if (c.sombra) Object.assign(st, { effect: '3d', effectColor: c.sombra, depth: c.prof ?? 0.06 });
  if (c.brillo) st.glow = c.brillo;
  return st;
}

const QUIZ: [string, string, LetteringStyle, string?][] = [
  ['creativo', 'Creativo', cartel('Kaushan Script', { relleno: ['#67E8F9', '#0EA5E9'], borde: '#0B1E3F', grosor: 0.05, sombra: '#0B1E3F', prof: 0.08 })],
  ['deseos', 'Deseos', cartel('Yellowtail', { relleno: ['#FFFFFF'], borde: '#1F2937', grosor: 0.05, sombra: '#A3E635', prof: 0.08 })],
  ['colorido', 'Colorido', cartel('Pacifico', { relleno: ['#F472B6', '#FB923C', '#FACC15', '#38BDF8'], angulo: 90, brillo: '#F0ABFC' })],
  ['burbuja', 'Burbuja', cartel('Rubik Bubbles', { relleno: ['#FFFFFF'], borde: '#111827', grosor: 0.05, sombra: '#111827', prof: 0.06 })],
  ['molde', 'Molde', cartel('Bebas Neue', { relleno: ['#111827'] })],
  ['contornoq', 'Contorno', cartel('Londrina Outline', { relleno: ['#111827'] })],
  ['pastelq', 'Tarjeta pastel', cartel('Fredoka Bold', { relleno: ['#F9A8D4'], borde: '#DB2777', grosor: 0.04 })],
  ['pincel', 'Pincel', cartel('Rock Salt', { relleno: ['#111827'] })],
  ['tiza', 'Tiza', cartel('Fredericka the Great', { relleno: ['#F8FAFC'], brillo: '#CBD5E1' }), '#1F3A2E'],
  ['boceto', 'Lápiz', cartel('Cabin Sketch', { relleno: ['#334155'] })],
  ['caligrafia', 'Caligrafía', cartel('Alex Brush', { relleno: ['#111827'] })],
  ['escolar', 'Escolar', cartel('Andika', { relleno: ['#1E293B'] })],
  ['abecedario', 'Abecedario', cartel('Fredoka Bold', { relleno: ['#60A5FA', '#F87171', '#FBBF24', '#34D399', '#A78BFA', '#FB923C'], porLetra: true })],
  ['chocolate', 'Chocolate', cartel('Lilita One', { relleno: ['#B45309', '#5B2A0E'], borde: '#FDE68A', grosor: 0.04, sombra: '#3B1A08', prof: 0.06 })],
  ['comicq', 'Cómic', cartel('Bangers', { relleno: ['#FDE047', '#84CC16'], borde: '#111827', grosor: 0.06, sombra: '#111827', prof: 0.08 })],
  ['fuego', 'Fuego', cartel('Luckiest Guy', { relleno: ['#FDE047', '#F97316', '#DC2626'], borde: '#111827', grosor: 0.05, sombra: '#111827', prof: 0.06 })],
  ['neonq', 'Neón', cartel('Monoton', { relleno: ['#F0ABFC'], brillo: '#E879F9' }), '#140F2A'],
  ['retro', 'Retro 3D', cartel('Bungee', { relleno: ['#FDE047'], sombra: '#EF4444', prof: 0.12 })],
  ['oro', 'Oro', cartel('Cinzel Decorative', { relleno: ['#FEF3C7', '#F59E0B', '#92400E'], sombra: '#1C1917', prof: 0.04 })],
  ['grafiti', 'Grafiti', cartel('Sedgwick Ave Display', { relleno: ['#A855F7', '#EC4899'], angulo: 90, borde: '#111827', grosor: 0.05, sombra: '#111827', prof: 0.06 })],
  ['hielo', 'Hielo', cartel('Titan One', { relleno: ['#F0F9FF', '#38BDF8'], borde: '#0C4A6E', grosor: 0.04, brillo: '#BAE6FD' })],
  ['dulce', 'Dulce', cartel('Chewy', { relleno: ['#FB7185'], borde: '#FFFFFF', grosor: 0.06, sombra: '#BE185D', prof: 0.06 })],
  ['sello', 'Sello', cartel('Bowlby One', { relleno: ['#FFFFFF'], borde: '#111827', grosor: 0.08, sombra: '#111827', prof: 0.04 })],
  ['fiesta', 'Fiesta', cartel('Sniglet', { relleno: ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#A855F7'], porLetra: true, borde: '#FFFFFF', grosor: 0.05, sombra: '#1F2937', prof: 0.05 })],
];

const CULTO: [string, string, LetteringStyle, string?][] = [
  ['bienvenida', 'Bienvenida', { font: 'Great Vibes', fill: 'solido', color: '#A7F3D0', effect: 'sombra' }, '#134E4A'],
  ['adoracion', 'Adoración', { font: 'Cormorant Garamond', fill: 'solido', color: '#FFF7E6', glow: '#C9A15A' }, '#2A1E0C'],
  ['celebracion', 'Celebración', { font: 'Archivo Black', fill: 'solido', color: '#FFFFFF', effect: '3d', effectColor: '#7C2D92', depth: 0.06, upper: true }, '#C084FC'],
  ['jovenes', 'Noche de jóvenes', { font: 'Bebas Neue', fill: 'degradado', gradColors: '#22D3EE,#FB7185', gradAngle: 180, color: '#22D3EE', color2: '#FB7185' }, '#0B0420'],
  ['ofrenda', 'Ofrenda', { font: 'Cinzel', fill: 'solido', color: '#FDE68A', effect: 'sombra' }, '#052E2B'],
  ['avivamiento', 'Avivamiento', { font: 'Anton', fill: 'degradado', gradColors: '#FFFFFF,#FDBA74', gradAngle: 180, color: '#FFFFFF', color2: '#FDBA74', upper: true }, '#4A1A06'],
  ['diafiesta', 'Día de fiesta', { font: 'Archivo Black', fill: 'solido', color: '#FFFFFF', outline: true, outlineColor: '#1F1147', outlineWidth: 0.1 }, '#FDE047'],
  ['dominical', 'Escuela dominical', cartel('Luckiest Guy', { relleno: ['#FFFFFF'], borde: '#1E3A8A', grosor: 0.08, sombra: '#1E3A8A', prof: 0.06 }), '#BAE6FD'],
];

/** Estilos "Kawaii" que ya existían en la app. */
const KAWAII: [string, string, LetteringStyle][] = [
  ['k-arcoiris', 'Arcoíris', { font: 'Luckiest Guy', fill: 'arcoiris', outline: true, outlineColor: '#ffffff', outlineWidth: 0.22, effect: 'sombra' }],
  ['k-caramelo', 'Caramelo', { font: 'Chewy', fill: 'alternado', color: '#ff4f9a', color2: '#ffffff', outline: true, outlineColor: '#b0175f', outlineWidth: 0.16 }],
  ['k-dorado', 'Dorado', { font: 'Lobster', fill: 'degradado', color: '#fff1a8', color2: '#b8862b', outline: true, outlineColor: '#5a3d00', outlineWidth: 0.1, effect: 'brillo' }],
  ['k-plateado', 'Plateado', { font: 'Bungee', fill: 'degradado', color: '#ffffff', color2: '#8c9197', outline: true, outlineColor: '#3b3f44', outlineWidth: 0.1, effect: 'brillo' }],
  ['k-neon', 'Neón rosa', { font: 'Comfortaa', fill: 'solido', color: '#ffe8fb', effect: 'neon', effectColor: '#ff2fd0' }],
  ['k-3dpop', '3D pop', { font: 'Bungee', fill: 'solido', color: '#ffd60a', outline: true, outlineColor: '#222222', outlineWidth: 0.08, effect: '3d', effectColor: '#e85d9a' }],
  ['k-comic', 'Cómic', { font: 'Luckiest Guy', fill: 'solido', color: '#ffffff', outline: true, outlineColor: '#111111', outlineWidth: 0.2, effect: '3d', effectColor: '#ff3d3d' }],
  ['k-princesa', 'Princesa', { font: 'Great Vibes', fill: 'degradado', color: '#ff8fc1', color2: '#9d1b8f', outline: true, outlineColor: '#ffffff', outlineWidth: 0.14, effect: 'brillo' }],
  ['k-infantil', 'Infantil', { font: 'Baloo 2', fill: 'porLetra', letterColors: '#ff8fab,#ffc75f,#9be15d,#5ec8f8,#b28dff', outline: true, outlineColor: '#ffffff', outlineWidth: 0.2, effect: 'sombra' }],
  ['k-helado', 'Helado', { font: 'Chewy', fill: 'degradado', color: '#a0e7ff', color2: '#ffb3e6', outline: true, outlineColor: '#ffffff', outlineWidth: 0.2, effect: 'sombra' }],
  ['k-pizarra', 'Pizarra', { font: 'Permanent Marker', fill: 'solido', color: '#ffffff', effect: 'sombra' }],
  ['k-elegante', 'Elegante', { font: 'Dancing Script', fill: 'solido', color: '#3a2230', outline: true, outlineColor: '#ffffff', outlineWidth: 0.12 }],
  ['k-colorear', 'Para colorear', { font: 'Luckiest Guy', fill: 'contorno', outline: true, outlineColor: '#222222', outlineWidth: 0.07 }],
];

export const LETTERING_CATALOG: LetteringEntry[] = [
  ...QUIZ.map(([id, name, style, sample]) => ({ id, name, cat: 'quiz' as const, style, sample })),
  ...CULTO.map(([id, name, style, sample]) => ({ id, name, cat: 'culto' as const, style, sample })),
  ...Object.entries(WORDART).map(([name, style]) => ({ id: `w-${name}`, name, cat: 'wordart' as const, style })),
  ...KAWAII.map(([id, name, style]) => ({ id, name, cat: 'kawaii' as const, style })),
];

/** Compatibilidad: estilos por nombre (los "Kawaii" de antes). */
export const LETTERING: Record<string, LetteringStyle> = Object.fromEntries(KAWAII.map(([, name, st]) => [name, st]));

export function applyLetteringEntry(d: Design, e: LetteringEntry): void {
  d.text = { ...d.text, ...RESET, ...e.style };
}

export function applyLettering(d: Design, name: string): void {
  const e = LETTERING_CATALOG.find((x) => x.name === name || x.id === name);
  if (e) applyLetteringEntry(d, e);
}
