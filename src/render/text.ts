import { fontCss, type Design, type TextLayer } from '../model/design';
import type { PinSize } from '../model/sizes';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const RAINBOW_LETTERS = ['#ff4d6d', '#ff9f1c', '#ffd60a', '#2ec4b6', '#4cc9f0', '#7b6cff', '#d46bff'];

/** Cuánto ocupa el borde hacia adentro de la cara (para que el texto no lo pise). */
export function ringInset(d: Design): number {
  // Todos los tipos de borde terminan a `width` mm por dentro de la cara.
  return d.ring.type === 'ninguno' ? 0 : Math.max(0, d.ring.width);
}

/** Una letra ya colocada: posición, giro y escala horizontal. */
interface Glyph {
  c: string;
  x: number;
  y: number;
  rot: number;
  sx: number;
  /** índice de la letra (sin contar espacios) para los colores */
  n: number;
}

function indexLetters(chars: string[]): number[] {
  let n = 0;
  return chars.map((c) => (c.trim() ? n++ : n));
}

/** Coloca las letras siguiendo un arco de radio r (arriba o abajo, siempre legible). */
export function layoutArc(ctx: Ctx, text: string, r: number, top: boolean, fs: number): Glyph[] {
  const chars = [...text];
  const idx = indexLetters(chars);
  const gap = fs * 0.06;
  const widths = chars.map((c) => ctx.measureText(c).width + gap);
  const total = widths.reduce((a, b) => a + b, 0) - gap;
  // Si no cabe en media vuelta, se comprime.
  const maxArc = Math.PI * r * 0.92;
  const k = total > maxArc ? maxArc / total : 1;
  const dir = top ? 1 : -1;
  let ang = top ? -Math.PI / 2 - (total * k) / r / 2 : Math.PI / 2 + (total * k) / r / 2;
  const out: Glyph[] = [];
  chars.forEach((c, i) => {
    const half = ((widths[i] - gap) * k) / 2 / r;
    ang += dir * half;
    const rot = top ? ang + Math.PI / 2 : ang - Math.PI / 2;
    out.push({ c, x: Math.cos(ang) * r, y: Math.sin(ang) * r, rot, sx: k, n: idx[i] });
    ang += dir * (half + (gap * k) / r);
  });
  return out;
}

/** Coloca las letras en línea recta centrada en (0, y), comprimiendo si pasa de maxW. */
export function layoutLine(ctx: Ctx, text: string, y: number, maxW: number): Glyph[] {
  const chars = [...text];
  const idx = indexLetters(chars);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const k = total > maxW ? maxW / total : 1;
  let x = (-total * k) / 2;
  return chars.map((c, i) => {
    const g = { c, x: x + (widths[i] * k) / 2, y, rot: 0, sx: k, n: idx[i] };
    x += widths[i] * k;
    return g;
  });
}

function letterPalette(t: TextLayer): string[] {
  const list = t.letterColors
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^#[0-9a-f]{3,8}$/i.test(s));
  return list.length ? list : RAINBOW_LETTERS;
}

/** Píxeles de pantalla por unidad (mm) del contexto: las sombras no siguen la transformación. */
function deviceScale(ctx: Ctx): number {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

/** Dibuja un grupo de letras con el estilo de texto del diseño. */
export function paintGlyphs(ctx: Ctx, glyphs: Glyph[], t: TextLayer, fs: number): void {
  if (!glyphs.length) return;
  const palette = letterPalette(t);
  const dev = deviceScale(ctx);
  const outlineW = t.outline || t.fill === 'contorno' ? fs * Math.max(0.03, t.outlineWidth) * 2 : 0;
  const each = (fn: (g: Glyph) => void) => {
    for (const g of glyphs) {
      if (!g.c.trim()) continue;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rot);
      ctx.scale(g.sx, 1);
      fn(g);
      ctx.restore();
    }
  };
  const fillFor = (g: Glyph): string | CanvasGradient => {
    switch (t.fill) {
      case 'alternado':
        return g.n % 2 ? t.color2 : t.color;
      case 'porLetra':
        return palette[g.n % palette.length];
      case 'arcoiris':
        return RAINBOW_LETTERS[g.n % RAINBOW_LETTERS.length];
      case 'degradado': {
        const gr = ctx.createLinearGradient(0, -fs * 0.45, 0, fs * 0.45);
        gr.addColorStop(0, t.color);
        gr.addColorStop(1, t.color2);
        return gr;
      }
      default:
        return t.color;
    }
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // 1) Efecto de fondo
  if (t.effect === '3d') {
    const steps = 6;
    ctx.fillStyle = t.effectColor;
    ctx.strokeStyle = t.effectColor;
    ctx.lineWidth = outlineW;
    for (let s = steps; s >= 1; s--) {
      const off = s * fs * 0.025;
      each((g) => {
        if (outlineW) ctx.strokeText(g.c, off, off);
        ctx.fillText(g.c, off, off);
      });
    }
  } else if (t.effect === 'sombra' || t.effect === 'neon') {
    const neon = t.effect === 'neon';
    ctx.shadowColor = neon ? t.effectColor : 'rgba(0,0,0,0.38)';
    ctx.shadowBlur = (neon ? fs * 0.55 : fs * 0.12) * dev;
    ctx.shadowOffsetX = neon ? 0 : fs * 0.07 * dev;
    ctx.shadowOffsetY = neon ? 0 : fs * 0.09 * dev;
    ctx.fillStyle = neon ? t.effectColor : '#000';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = outlineW || fs * 0.05;
    const passes = neon ? 2 : 1;
    for (let p = 0; p < passes; p++)
      each((g) => {
        ctx.strokeText(g.c, 0, 0);
        ctx.fillText(g.c, 0, 0);
      });
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // 2) Contorno
  if (outlineW) {
    ctx.strokeStyle = t.outlineColor;
    ctx.lineWidth = outlineW;
    each((g) => ctx.strokeText(g.c, 0, 0));
  }

  // 3) Relleno (en "solo contorno" queda hueco para colorear a mano)
  if (t.fill === 'contorno') {
    ctx.fillStyle = '#ffffff';
    each((g) => ctx.fillText(g.c, 0, 0));
  } else {
    each((g) => {
      ctx.fillStyle = fillFor(g);
      ctx.fillText(g.c, 0, 0);
    });
  }

  // 4) Brillo encima
  if (t.effect === 'brillo' || t.effect === 'neon') {
    each((g) => {
      const gr = ctx.createLinearGradient(0, -fs * 0.45, 0, fs * 0.1);
      gr.addColorStop(0, t.effect === 'neon' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.75)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr;
      ctx.fillText(g.c, 0, 0);
    });
  }
  ctx.restore();
}

/** Capa 6: textos de arriba, abajo y centro. */
export function drawTexts(ctx: Ctx, d: Design, size: PinSize): void {
  const t = d.text;
  if (!t.top && !t.bottom && !t.middle) return;
  ctx.save();
  ctx.translate(t.ox ?? 0, t.oy ?? 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fs = Math.max(0.5, t.size);
  ctx.font = fontCss(t.font, fs);
  const band = d.ring.type === 'banda';
  if (size.shape === 'circle') {
    // Sobre la banda: centrado en ella. Si no, por dentro del borde.
    const rad = band ? size.faceW / 2 - d.ring.width / 2 - t.inset * 0.3 : size.faceW / 2 - ringInset(d) - fs * 0.55 - t.inset;
    if (rad > fs) {
      if (t.top) paintGlyphs(ctx, layoutArc(ctx, t.top, rad, true, fs), t, fs);
      if (t.bottom) paintGlyphs(ctx, layoutArc(ctx, t.bottom, rad, false, fs), t, fs);
    }
  } else {
    const maxW = size.faceW * 0.7;
    const edge = size.faceH / 2 - ringInset(d) - fs * 0.6 - t.inset;
    // El corazón es más angosto abajo: el texto inferior va más arriba.
    const topY = size.shape === 'heart' ? -size.faceH * 0.18 : -edge;
    const botY = size.shape === 'heart' ? size.faceH * 0.2 : edge;
    if (t.top) paintGlyphs(ctx, layoutLine(ctx, t.top, topY, maxW), t, fs);
    if (t.bottom) paintGlyphs(ctx, layoutLine(ctx, t.bottom, botY, size.shape === 'heart' ? maxW * 0.7 : maxW), t, fs);
  }

  if (t.middle) {
    const ms = Math.max(0.5, t.middleSize);
    ctx.font = fontCss(t.font, ms);
    const maxW = size.faceW * (size.shape === 'heart' ? 0.72 : 0.84) - 2 * ringInset(d);
    paintGlyphs(ctx, layoutLine(ctx, t.middle, t.middleY, maxW), t, ms);
  }
  ctx.restore();
}
