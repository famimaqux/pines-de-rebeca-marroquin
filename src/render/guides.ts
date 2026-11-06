import type { PinSize } from '../model/sizes';
import { traceSized } from './drawPin';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

export function sizeLabel(w: number, h: number, shape: PinSize['shape']): string {
  return shape === 'circle' ? `${fmt(w)} mm` : `${fmt(w)}×${fmt(h)} mm`;
}

/**
 * Guías del editor: zona que se dobla (sombreada), contorno de corte (continuo)
 * y contorno de cara visible (punteado), con etiquetas.
 * `pxPerMm` sirve para que líneas y letras tengan un grosor constante en pantalla.
 */
export function drawEditorGuides(ctx: Ctx, size: PinSize, pxPerMm: number): void {
  const px = 1 / pxPerMm;
  ctx.save();

  // Zona que se dobla detrás de la chapa
  ctx.beginPath();
  traceSized(ctx, size, size.cutW, size.cutH);
  traceSized(ctx, size, size.faceW, size.faceH);
  ctx.fillStyle = 'rgba(30, 27, 75, 0.28)';
  ctx.fill('evenodd');

  // Corte (continuo)
  ctx.beginPath();
  traceSized(ctx, size, size.cutW, size.cutH);
  ctx.lineWidth = 1.5 * px;
  ctx.strokeStyle = '#7C3AED';
  ctx.stroke();

  // Cara visible (punteado)
  ctx.beginPath();
  traceSized(ctx, size, size.faceW, size.faceH);
  ctx.setLineDash([5 * px, 4 * px]);
  ctx.lineWidth = 1.5 * px;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.lineDashOffset = 4.5 * px;
  ctx.strokeStyle = '#3a2230';
  ctx.stroke();
  ctx.setLineDash([]);

  // Etiquetas
  const fs = 12 * px;
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  const label = (text: string, y: number, color: string, base: CanvasTextBaseline) => {
    ctx.textBaseline = base;
    ctx.lineWidth = 3.5 * px;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, 0, y);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, y);
  };
  label(`✂ corte ${sizeLabel(size.cutW, size.cutH, size.shape)}`, -size.cutH / 2 - 4 * px, '#7C3AED', 'bottom');
  label(`cara visible ${sizeLabel(size.faceW, size.faceH, size.shape)}`, size.cutH / 2 + 4 * px, '#3a2230', 'top');
  ctx.restore();
}

/** Brillo simulado para la vista "pin terminado". */
export function drawGloss(ctx: Ctx, size: PinSize): void {
  const { faceW: w, faceH: h } = size;
  ctx.save();
  ctx.beginPath();
  traceSized(ctx, size, w, h);
  ctx.clip();
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 3, h / 3);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.08)');
  g.addColorStop(0.36, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
  // Canto metálico de la chapa
  ctx.save();
  ctx.beginPath();
  traceSized(ctx, size, w, h);
  ctx.lineWidth = Math.max(w, h) * 0.012;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.stroke();
  ctx.restore();
}
