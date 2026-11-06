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
  if (!chars.length) return [];
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

function gradList(t: TextLayer): string[] {
  const list = (t.gradColors ?? '')
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^#[0-9a-f]{3,8}$/i.test(x));
  return list.length ? list : [t.color, t.color2];
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
        const cols = gradList(t);
        const ang = (((t.gradAngle ?? 180) % 360) + 360) % 360;
        let gr: CanvasGradient;
        if (ang === 90 || ang === 270) {
          // de izquierda a derecha a lo ancho de TODA la palabra (como en CSS)
          const x0 = lineMinX - g.x;
          const x1 = lineMaxX - g.x;
          gr = ang === 90 ? ctx.createLinearGradient(x0, 0, x1, 0) : ctx.createLinearGradient(x1, 0, x0, 0);
        } else gr = ang === 0 ? ctx.createLinearGradient(0, fs * 0.45, 0, -fs * 0.45) : ctx.createLinearGradient(0, -fs * 0.45, 0, fs * 0.45);
        cols.forEach((c, i) => gr.addColorStop(cols.length === 1 ? 0 : i / (cols.length - 1), c));
        return gr;
      }
      default:
        return t.color;
    }
  };

  const lineMinX = Math.min(...glyphs.map((g) => g.x)) - fs * 0.35;
  const lineMaxX = Math.max(...glyphs.map((g) => g.x)) + fs * 0.35;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // 0) Brillo (resplandor suave alrededor de las letras)
  if (t.glow) {
    ctx.save();
    ctx.shadowColor = t.glow;
    ctx.shadowBlur = fs * 0.22 * dev;
    ctx.fillStyle = t.glow;
    ctx.strokeStyle = t.glow;
    ctx.lineWidth = outlineW || fs * 0.04;
    each((g) => {
      ctx.strokeText(g.c, 0, 0);
      ctx.fillText(g.c, 0, 0);
    });
    ctx.restore();
  }

  // 1) Efecto de fondo
  if (t.effect === '3d') {
    // sombra sólida en diagonal: tantos pasos como haga falta para la profundidad pedida
    const depth = Math.max(0.01, t.depth ?? 0.15);
    const steps = Math.max(2, Math.min(10, Math.round(depth / 0.02)));
    ctx.fillStyle = t.effectColor;
    ctx.strokeStyle = t.effectColor;
    ctx.lineWidth = outlineW;
    for (let s = steps; s >= 1; s--) {
      const off = (s / steps) * depth * fs;
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

  // 2) Segundo contorno (por fuera del primero)
  if (t.outline2) {
    ctx.strokeStyle = t.outline2Color;
    ctx.lineWidth = outlineW + fs * Math.max(0.03, t.outline2Width ?? 0.12) * 2;
    each((g) => ctx.strokeText(g.c, 0, 0));
  }

  // 2b) Contorno
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

/**
 * Texto del centro con forma WordArt: recto, arco hacia arriba (sonrisa
 * invertida), arco hacia abajo o en onda. `bend` 0..1 dice cuánto se curva.
 */
export function layoutShaped(ctx: Ctx, text: string, y: number, maxW: number, fs: number, shape: 'recto' | 'arcoArriba' | 'arcoAbajo' | 'onda', bend: number): Glyph[] {
  const line = layoutLine(ctx, text, y, maxW);
  if (shape === 'recto' || !line.length) return line;
  const b = Math.max(0.05, Math.min(1, bend));
  const half = Math.max(1, Math.max(...line.map((g) => Math.abs(g.x))) + fs * 0.3);
  if (shape === 'onda') {
    const amp = fs * 0.55 * b;
    const k = Math.PI / half; // una onda completa a lo ancho
    return line.map((g) => {
      const dy = Math.sin(g.x * k) * amp;
      const slope = Math.cos(g.x * k) * amp * k;
      return { ...g, y: g.y + dy, rot: Math.atan(slope) };
    });
  }
  // Arco: las letras siguen un círculo cuya flecha (altura) depende de `bend`.
  const sag = Math.max(0.5, half * 0.6 * b);
  const r = (half * half + sag * sag) / (2 * sag);
  const up = shape === 'arcoArriba';
  return line.map((g) => {
    const a = Math.asin(Math.max(-1, Math.min(1, g.x / r)));
    const dy = r - Math.cos(a) * r; // cuánto baja desde el centro del arco
    return { ...g, x: Math.sin(a) * r, y: up ? g.y - sag / 2 + dy : g.y + sag / 2 - dy, rot: up ? a : -a };
  });
}

/** Capa 6: textos de arriba, abajo y centro. */
export function drawTexts(ctx: Ctx, d: Design, size: PinSize): void {
  const t0 = d.text;
  if (!t0.top && !t0.bottom && !t0.middle) return;
  const t = t0.upper ? { ...t0, top: t0.top.toUpperCase(), bottom: t0.bottom.toUpperCase(), middle: t0.middle.toUpperCase() } : t0;
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
    paintGlyphs(ctx, layoutShaped(ctx, t.middle, t.middleY, maxW, ms, t.shape ?? 'recto', t.bend ?? 0.5), t, ms);
  }
  ctx.restore();
}
