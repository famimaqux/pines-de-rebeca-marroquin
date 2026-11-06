import { describe, expect, it } from 'vitest';
import { newPdf, pdfShape } from '../src/export/pdf';
import { DEFAULT_SIZES, type PinSize } from '../src/model/sizes';
import { paperSize, type PaperId } from '../src/model/paper';

const PT = 72 / 25.4;
const NUM = String.raw`-?(?:\d+\.?\d*|\.\d+)`;
const LINE = new RegExp(String.raw`^((?:${NUM} ){2}(?:(?:${NUM} ){4})?)(m|c)$`);

/** Lee del PDF (sin comprimir) los puntos finales de cada tramo y devuelve su caja en mm. */
function pathBox(pdfText: string) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const raw of pdfText.split('\n')) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const n = m[1].trim().split(' ').map(Number);
    xs.push(n[n.length - 2]);
    ys.push(n[n.length - 1]);
  }
  return { w: (Math.max(...xs) - Math.min(...xs)) / PT, h: (Math.max(...ys) - Math.min(...ys)) / PT, n: xs.length };
}

const size = (id: string) => DEFAULT_SIZES.find((s) => s.id === id)! as PinSize;

describe.each(['a4', 'a5', 'carta'] as PaperId[])('PDF en %s', (id) => {
  const { w, h } = paperSize({ id, orientation: 'vertical', customW: 0, customH: 0 });

  it('la página tiene el tamaño exacto del papel', () => {
    const out = newPdf(w, h, false).output();
    const mb = /\/MediaBox \[0 0 (\S+) (\S+)\]/.exec(out)!;
    expect(Number(mb[1]) / PT).toBeCloseTo(w, 1);
    expect(Number(mb[2]) / PT).toBeCloseTo(h, 1);
  });

  it('un círculo de corte de 70 mm mide 70 mm', () => {
    const pdf = newPdf(w, h, false);
    const r58 = size('r58');
    pdfShape(pdf, r58, r58.cutW, r58.cutH, w / 2, h / 2);
    const box = pathBox(pdf.output());
    expect(box.n).toBeGreaterThanOrEqual(5);
    expect(box.w).toBeCloseTo(70, 1);
    expect(box.h).toBeCloseTo(70, 1);
  });

  it('el corazón de corte mide 68 mm de ancho', () => {
    const pdf = newPdf(w, h, false);
    const heart = size('h57');
    pdfShape(pdf, heart, heart.cutW, heart.cutH, w / 2, h / 2);
    expect(pathBox(pdf.output()).w).toBeCloseTo(68, 1);
  });
});

it('A4 horizontal: la página es 297 × 210 mm', () => {
  const { w, h } = paperSize({ id: 'a4', orientation: 'horizontal', customW: 0, customH: 0 });
  const out = newPdf(w, h, false).output();
  const mb = /\/MediaBox \[0 0 (\S+) (\S+)\]/.exec(out)!;
  expect(Number(mb[1]) / PT).toBeCloseTo(297, 1);
  expect(Number(mb[2]) / PT).toBeCloseTo(210, 1);
});
