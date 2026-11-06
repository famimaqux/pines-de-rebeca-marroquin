/** Papeles disponibles (medidas en mm, en vertical). */

export type PaperId = 'a4' | 'a5' | 'a3' | 'carta' | 'oficio' | 'custom';
export type Orientation = 'vertical' | 'horizontal';

export interface PaperDef {
  id: PaperId;
  name: string;
  w: number;
  h: number;
}

export const PAPERS: readonly PaperDef[] = [
  { id: 'a4', name: 'A4 (21 × 29,7 cm)', w: 210, h: 297 },
  { id: 'a5', name: 'A5 (14,8 × 21 cm)', w: 148, h: 210 },
  { id: 'a3', name: 'A3 (29,7 × 42 cm)', w: 297, h: 420 },
  { id: 'carta', name: 'Carta (21,6 × 27,9 cm)', w: 215.9, h: 279.4 },
  { id: 'oficio', name: 'Oficio (21,6 × 33 cm)', w: 216, h: 330 },
  { id: 'custom', name: 'Personalizado…', w: 210, h: 297 },
];

export interface PaperSettings {
  id: PaperId;
  orientation: Orientation;
  /** solo para "Personalizado", en mm */
  customW: number;
  customH: number;
}

export const DEFAULT_PAPER: PaperSettings = { id: 'a4', orientation: 'vertical', customW: 210, customH: 297 };

/** La Epson L8050 imprime como máximo A4. */
export const PRINTER_MAX = { w: 215.9, h: 297 };

export const MIN_PAPER_MM = 50;
export const MAX_PAPER_MM = 1000;

/** Ancho y alto finales (mm) según papel y orientación. */
export function paperSize(p: PaperSettings): { w: number; h: number } {
  const def = PAPERS.find((x) => x.id === p.id) ?? PAPERS[0];
  let w = def.id === 'custom' ? p.customW : def.w;
  let h = def.id === 'custom' ? p.customH : def.h;
  w = clamp(w);
  h = clamp(h);
  const small = Math.min(w, h);
  const big = Math.max(w, h);
  return p.orientation === 'horizontal' ? { w: big, h: small } : { w: small, h: big };
}

const clamp = (v: number) => (Number.isFinite(v) ? Math.min(MAX_PAPER_MM, Math.max(MIN_PAPER_MM, v)) : 210);

/** ¿Este papel entra en la impresora (en alguna orientación)? */
export function fitsPrinter(p: PaperSettings): boolean {
  const { w, h } = paperSize(p);
  const a = Math.min(w, h);
  const b = Math.max(w, h);
  return a <= PRINTER_MAX.w + 0.01 && b <= PRINTER_MAX.h + 0.01;
}

/** Nombre corto para el resumen ("A4", "Carta", "20 × 25 cm"). */
export function paperShortName(p: PaperSettings): string {
  if (p.id === 'custom') {
    const { w, h } = paperSize(p);
    return `${cm(w)} × ${cm(h)} cm`;
  }
  return (PAPERS.find((x) => x.id === p.id) ?? PAPERS[0]).name.split(' (')[0];
}

export const cm = (mm: number) => (mm / 10).toLocaleString('es', { maximumFractionDigits: 2 });

const KEY = 'pines-rebeca.paper.v1';

export function loadPaper(storage: Pick<Storage, 'getItem'> | null = safe()): PaperSettings {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? 'null') as Partial<PaperSettings> | null;
    if (raw && PAPERS.some((x) => x.id === raw.id)) {
      return {
        id: raw.id!,
        orientation: raw.orientation === 'horizontal' ? 'horizontal' : 'vertical',
        customW: clamp(Number(raw.customW)),
        customH: clamp(Number(raw.customH)),
      };
    }
  } catch {
    /* datos dañados: por defecto */
  }
  return { ...DEFAULT_PAPER };
}

export function savePaper(p: PaperSettings, storage: Pick<Storage, 'setItem'> | null = safe()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin almacenamiento */
  }
}

function safe(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
