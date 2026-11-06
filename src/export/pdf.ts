import { jsPDF } from 'jspdf';
import type { PinSize } from '../model/sizes';
import type { Page } from '../layout/pack';
import { sizedShapePath } from '../render/shapes';
import { renderSheetCanvas, rulerLabel, type GuideSettings, type SheetContext } from '../render/sheet';

/** Píxeles por mm a 300 ppp. */
export const PPM_300 = 300 / 25.4;

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [120, 120, 120];
}

/** Traza en el PDF (vectorial) la forma de w×h del molde, centrada en (cx, cy) mm. */
export function pdfShape(pdf: jsPDF, size: PinSize, w: number, h: number, cx: number, cy: number, style: 'S' | 'F' = 'S'): void {
  const p = sizedShapePath(size, w, h, cx, cy);
  let [px, py] = p.start;
  const rel = p.segs.map((s) => {
    const r = [s[0] - px, s[1] - py, s[2] - px, s[3] - py, s[4] - px, s[5] - py];
    px = s[4];
    py = s[5];
    return r;
  });
  pdf.lines(rel, p.start[0], p.start[1], [1, 1], style, true);
}

export function pdfCutLine(pdf: jsPDF, size: PinSize, cx: number, cy: number, g: GuideSettings): void {
  pdf.setDrawColor(...hexRgb(g.cutColor));
  pdf.setLineWidth(g.cutW);
  pdf.setLineDashPattern(g.dashed ? [1.2, 0.9] : [], 0);
  pdfShape(pdf, size, size.cutW, size.cutH, cx, cy);
}

export function pdfCenterMark(pdf: jsPDF, cx: number, cy: number): void {
  pdf.setLineDashPattern([], 0);
  pdf.setDrawColor(110);
  pdf.setLineWidth(0.15);
  pdf.line(cx - 1.2, cy, cx + 1.2, cy);
  pdf.line(cx, cy - 1.2, cx, cy + 1.2);
}

export function pdfRuler(pdf: jsPDF, paperH: number, margin: number, label: string): void {
  if (margin < 3.5) return;
  pdf.setLineDashPattern([], 0);
  pdf.setDrawColor(130);
  pdf.setLineWidth(0.2);
  const y = paperH - margin / 2;
  pdf.line(margin, y, margin + 50, y);
  for (let k = 0; k <= 50; k += 5) pdf.line(margin + k, y - (k % 10 ? 0.6 : 1.1), margin + k, y);
  pdf.setFontSize(6);
  pdf.setTextColor(130);
  pdf.text(label, margin + 52, y + 0.6);
}

/** PDF del tamaño exacto del papel (mm). */
export function newPdf(w: number, h: number, compress = true): jsPDF {
  return new jsPDF({ unit: 'mm', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress });
}

export interface PdfJob {
  pages: Page[];
  /** copias de cada hoja (por índice) */
  copies: number[];
  sc: SheetContext;
  onProgress?: (done: number, total: number) => void;
}

/** Lista final de hojas a imprimir, con las copias repetidas. */
export function expandCopies(pages: Page[], copies: number[]): { page: Page; index: number }[] {
  const out: { page: Page; index: number }[] = [];
  pages.forEach((page, index) => {
    const n = Math.max(1, Math.min(50, Math.floor(copies[index] ?? 1)));
    for (let k = 0; k < n; k++) out.push({ page, index });
  });
  return out;
}

/**
 * PDF A4: cada hoja es una imagen a 300 ppp con las líneas de corte, marcas,
 * regla y número de hoja encima en VECTORES (miden exactamente lo que deben).
 */
export async function buildPdf(job: PdfJob): Promise<Blob> {
  const W = job.sc.paperW;
  const H = job.sc.paperH;
  const pdf = newPdf(W, H);
  const list = expandCopies(job.pages, job.copies);
  const g = job.sc.guides;
  for (let i = 0; i < list.length; i++) {
    const { page, index } = list[i];
    if (i) pdf.addPage([W, H], W > H ? 'landscape' : 'portrait');
    const c = renderSheetCanvas(page, job.sc, PPM_300, { guides: false });
    pdf.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, W, H, undefined, 'FAST');
    c.width = c.height = 0; // liberar memoria
    for (const it of page.items) {
      const s = job.sc.sizes.get(it.sizeId);
      if (!s) continue;
      if (g.cut) pdfCutLine(pdf, s, it.x, it.y, g);
      if (g.center) pdfCenterMark(pdf, it.x, it.y);
    }
    if (g.ruler) pdfRuler(pdf, H, job.sc.margin, rulerLabel(index + 1, job.pages.length) + (list.length > job.pages.length ? ` · impresión ${i + 1}/${list.length}` : ''));
    job.onProgress?.(i + 1, list.length);
    // Ceder el hilo para que la barra de progreso se actualice.
    await new Promise((r) => setTimeout(r, 0));
  }
  return pdf.output('blob');
}

/**
 * Hoja de calibración: el contorno de corte (continuo) y de cara (punteado)
 * de cada molde, con su medida, más una regla de 50 mm. Imprímela al 100 %
 * y compárala con tus moldes reales.
 */
export function buildCalibrationPdf(sizes: PinSize[], margin = 10, W = 210, H = 297): Blob {
  const pdf = newPdf(W, H);
  pdf.setFontSize(14);
  pdf.setTextColor(60);
  pdf.text('Hoja de calibración · Pines de Rebeca Marroquín', margin, margin + 2);
  pdf.setFontSize(8);
  pdf.text('Imprime al 100 % (Tamaño real), sin "sin márgenes". Pon cada molde sobre su contorno: la línea continua es el corte.', margin, margin + 7);
  for (const p of calibrationLayout(sizes, margin, W, H)) {
    const s = p.size;
    pdf.setDrawColor(60);
    pdf.setLineWidth(0.25);
    pdf.setLineDashPattern([], 0);
    pdfShape(pdf, s, s.cutW, s.cutH, p.x, p.y);
    pdf.setDrawColor(150);
    pdf.setLineDashPattern([1, 0.8], 0);
    pdfShape(pdf, s, s.faceW, s.faceH, p.x, p.y);
    pdfCenterMark(pdf, p.x, p.y);
    pdf.setFontSize(7);
    pdf.setTextColor(80);
    const label = s.shape === 'circle' ? `${s.name} · corte ${s.cutW} mm` : `${s.name} · corte ${s.cutW}×${s.cutH} mm`;
    pdf.text(label, p.x, p.y + s.cutH / 2 + 3.5, { align: 'center' });
  }
  // Reglas: 50 mm horizontal y vertical
  const y = H - margin - 4;
  pdf.setLineDashPattern([], 0);
  pdf.setDrawColor(40);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, margin + 50, y);
  for (let k = 0; k <= 50; k += 1) pdf.line(margin + k, y - (k % 10 === 0 ? 3 : k % 5 === 0 ? 2 : 1), margin + k, y);
  pdf.line(W - margin, y, W - margin, y - 50);
  for (let k = 0; k <= 50; k += 1) pdf.line(W - margin, y - k, W - margin - (k % 10 === 0 ? 3 : k % 5 === 0 ? 2 : 1), y - k);
  pdf.setFontSize(8);
  pdf.setTextColor(40);
  pdf.text('50 mm: si con una regla no mide 50 mm exactos, revisa la escala de impresión.', margin, y + 5);
  return pdf.output('blob');
}

/** Posiciones de la hoja de calibración (estantes simples). */
export function calibrationLayout(sizes: PinSize[], margin: number, W = 210, H = 297): { size: PinSize; x: number; y: number }[] {
  const out: { size: PinSize; x: number; y: number }[] = [];
  const gap = 4;
  const labelH = 6;
  let x = margin;
  let y = margin + 12;
  let rowH = 0;
  const sorted = sizes.slice().sort((a, b) => b.cutH - a.cutH);
  for (const s of sorted) {
    if (x + s.cutW > W - margin) {
      x = margin;
      y += rowH + labelH + gap;
      rowH = 0;
    }
    if (y + s.cutH + labelH > H - margin - 20) break; // no cabe más en la hoja
    out.push({ size: s, x: x + s.cutW / 2, y: y + s.cutH / 2 });
    x += s.cutW + gap;
    rowH = Math.max(rowH, s.cutH);
  }
  return out;
}
