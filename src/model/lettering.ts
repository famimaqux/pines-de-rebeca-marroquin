import type { Design, TextLayer } from './design';

/**
 * "Modelos de letra": estilos listos para nombres y frases.
 * Solo cambian el aspecto del texto (fuente, colores, contorno, efecto); nunca lo que dice.
 */
export type LetteringStyle = Partial<Omit<TextLayer, 'top' | 'bottom' | 'middle' | 'size' | 'middleSize' | 'middleY' | 'inset'>>;

export const LETTERING: Record<string, LetteringStyle> = {
  'Arcoíris': { font: 'Luckiest Guy', fill: 'arcoiris', outline: true, outlineColor: '#ffffff', outlineWidth: 0.22, effect: 'sombra' },
  'Caramelo': { font: 'Chewy', fill: 'alternado', color: '#ff4f9a', color2: '#ffffff', outline: true, outlineColor: '#b0175f', outlineWidth: 0.16, effect: 'ninguno' },
  'Dorado': { font: 'Lobster', fill: 'degradado', color: '#fff1a8', color2: '#b8862b', outline: true, outlineColor: '#5a3d00', outlineWidth: 0.1, effect: 'brillo' },
  'Plateado': { font: 'Bungee', fill: 'degradado', color: '#ffffff', color2: '#8c9197', outline: true, outlineColor: '#3b3f44', outlineWidth: 0.1, effect: 'brillo' },
  'Neón': { font: 'Comfortaa', fill: 'solido', color: '#ffe8fb', outline: false, effect: 'neon', effectColor: '#ff2fd0' },
  '3D pop': { font: 'Bungee', fill: 'solido', color: '#ffd60a', outline: true, outlineColor: '#222222', outlineWidth: 0.08, effect: '3d', effectColor: '#e85d9a' },
  'Cómic': { font: 'Luckiest Guy', fill: 'solido', color: '#ffffff', outline: true, outlineColor: '#111111', outlineWidth: 0.2, effect: '3d', effectColor: '#ff3d3d' },
  'Princesa': { font: 'Great Vibes', fill: 'degradado', color: '#ff8fc1', color2: '#9d1b8f', outline: true, outlineColor: '#ffffff', outlineWidth: 0.14, effect: 'brillo' },
  'Infantil': { font: 'Baloo 2', fill: 'porLetra', letterColors: '#ff8fab,#ffc75f,#9be15d,#5ec8f8,#b28dff', outline: true, outlineColor: '#ffffff', outlineWidth: 0.2, effect: 'sombra' },
  'Helado': { font: 'Chewy', fill: 'degradado', color: '#a0e7ff', color2: '#ffb3e6', outline: true, outlineColor: '#ffffff', outlineWidth: 0.2, effect: 'sombra' },
  'Pizarra': { font: 'Permanent Marker', fill: 'solido', color: '#ffffff', outline: false, effect: 'sombra' },
  'Elegante': { font: 'Dancing Script', fill: 'solido', color: '#3a2230', outline: true, outlineColor: '#ffffff', outlineWidth: 0.12, effect: 'ninguno' },
  'Para colorear': { font: 'Luckiest Guy', fill: 'contorno', outline: true, outlineColor: '#222222', outlineWidth: 0.07, effect: 'ninguno' },
};

export function applyLettering(d: Design, name: string): void {
  const st = LETTERING[name];
  if (st) d.text = { ...d.text, ...st };
}
