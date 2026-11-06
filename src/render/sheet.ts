import type { Design } from '../model/design';
import type { PinSize } from '../model/sizes';
import { A4, type Page } from '../layout/pack';
import { drawPin, traceSized, type PinImages } from './drawPin';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface GuideSettings {
  /** dibujar línea de corte */
  cut: boolean;
  /** grosor de la línea de corte, mm */
  cutW: number;
  cutColor: string;
  dashed: boolean;
  center: boolean;
  ruler: boolean;
}

export const DEFAULT_GUIDES: GuideSettings = { cut: true, cutW: 0.25, cutColor: '#7a7a7a', dashed: false, center: true, ruler: true };

export interface SheetContext {
  designs: Map<number, Design>;
  sizes: Map<string, PinSize>;
  images: (d: Design) => PinImages;
  margin: number;
  guides: GuideSettings;
}

export function drawCutLine(ctx: Ctx, size: PinSize, g: GuideSettings): void {
  ctx.save();
  ctx.beginPath();
  traceSized(ctx, size, size.cutW, size.cutH);
  ctx.lineWidth = g.cutW;
  ctx.strokeStyle = g.cutColor;
  if (g.dashed) ctx.setLineDash([1.2, 0.9]);
  ctx.stroke();
  ctx.restore();
}

export function drawCenterMark(ctx: Ctx): void {
  ctx.save();
  ctx.lineWidth = 0.15;
  ctx.strokeStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath();
  ctx.moveTo(-1.2, 0);
  ctx.lineTo(1.2, 0);
  ctx.moveTo(0, -1.2);
  ctx.lineTo(0, 1.2);
  ctx.stroke();
  ctx.restore();
}

/** Regla de 50 mm en el margen inferior: sirve para comprobar que se imprimió al 100 %. */
export function drawRuler(ctx: Ctx, margin: number, label: string): void {
  if (margin < 3.5) return;
  const y = A4.h - margin / 2;
  ctx.save();
  ctx.strokeStyle = '#888';
  ctx.fillStyle = '#888';
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(margin + 50, y);
  for (let i = 0; i <= 50; i += 5) {
    const t = i % 10 ? 0.6 : 1.1;
    ctx.moveTo(margin + i, y - t);
    ctx.lineTo(margin + i, y);
  }
  ctx.stroke();
  ctx.font = '2.2px Poppins, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, margin + 52, y - 0.4);
  ctx.restore();
}

export interface RenderSheetOptions {
  /** líneas de corte, marcas y regla dibujadas en la imagen */
  guides: boolean;
  /** recuadro del margen (solo en pantalla) */
  marginBox?: boolean;
  pageNumber?: number;
  pageCount?: number;
}

/** Dibuja una hoja A4 completa en un contexto escalado a mm. */
export function drawSheet(ctx: Ctx, page: Page, sc: SheetContext, o: RenderSheetOptions): void {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, A4.w, A4.h);
  if (o.marginBox) {
    ctx.save();
    ctx.strokeStyle = '#f0c6d6';
    ctx.lineWidth = 0.3;
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(sc.margin, sc.margin, A4.w - 2 * sc.margin, A4.h - 2 * sc.margin);
    ctx.restore();
  }
  for (const it of page.items) {
    const d = sc.designs.get(it.designId);
    const s = sc.sizes.get(it.sizeId);
    if (!d || !s) continue;
    ctx.save();
    ctx.translate(it.x, it.y);
    drawPin(ctx, d, s, sc.images(d));
    if (o.guides && sc.guides.cut) drawCutLine(ctx, s, sc.guides);
    if (o.guides && sc.guides.center) drawCenterMark(ctx);
    ctx.restore();
  }
  if (o.guides && sc.guides.ruler) drawRuler(ctx, sc.margin, rulerLabel(o.pageNumber, o.pageCount));
}

export function rulerLabel(n?: number, total?: number): string {
  return `50 mm · imprime al 100 % (Tamaño real)${n ? ` · hoja ${n}/${total}` : ''}`;
}

/** Crea un canvas con la hoja a `ppm` píxeles por mm (300 ppp = 300/25.4). */
export function renderSheetCanvas(page: Page, sc: SheetContext, ppm: number, o: RenderSheetOptions): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(A4.w * ppm);
  c.height = Math.round(A4.h * ppm);
  const ctx = c.getContext('2d')!;
  ctx.scale(ppm, ppm);
  drawSheet(ctx, page, sc, o);
  return c;
}
