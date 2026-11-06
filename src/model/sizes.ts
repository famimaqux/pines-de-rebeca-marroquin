/**
 * Medidas de los moldes. Todas las unidades están en milímetros.
 * "Cara visible" = lo que se ve del pin terminado.
 * "Corte" = el papel a recortar; el sobrante (corte − cara) se dobla detrás de la chapa.
 */

export type Shape = 'circle' | 'heart' | 'roundsq' | 'oval';

export const SHAPE_LABELS: Record<Shape, string> = {
  circle: 'Círculo',
  heart: 'Corazón',
  roundsq: 'Cuadrado redondeado',
  oval: 'Óvalo',
};

export interface PinSize {
  id: string;
  name: string;
  shape: Shape;
  faceW: number;
  faceH: number;
  cutW: number;
  cutH: number;
  /** true = molde agregado por la usuaria (se puede borrar). */
  custom?: boolean;
}

export const DEFAULT_SIZES: readonly PinSize[] = [
  { id: 'r25', name: 'Redondo 25 mm', shape: 'circle', faceW: 25, faceH: 25, cutW: 35, cutH: 35 },
  { id: 'r32', name: 'Redondo 32 mm', shape: 'circle', faceW: 32, faceH: 32, cutW: 44, cutH: 44 },
  { id: 'r37', name: 'Redondo 37 mm', shape: 'circle', faceW: 37, faceH: 37, cutW: 49, cutH: 49 },
  { id: 'r44', name: 'Redondo 44 mm', shape: 'circle', faceW: 44, faceH: 44, cutW: 56, cutH: 56 },
  { id: 'r58', name: 'Redondo 58 mm', shape: 'circle', faceW: 58, faceH: 58, cutW: 70, cutH: 70 },
  { id: 'r75', name: 'Redondo 75 mm', shape: 'circle', faceW: 75, faceH: 75, cutW: 88, cutH: 88 },
  { id: 'h57', name: 'Corazón 57×52', shape: 'heart', faceW: 57, faceH: 52, cutW: 68, cutH: 63 },
];

export const DEFAULT_SIZE_ID = 'r58';
const STORAGE_KEY = 'pines-rebeca.sizes.v1';

/** Medio ancho de doblez (lo que se va detrás), en mm. */
export function foldMargin(s: PinSize): number {
  return Math.min(s.cutW - s.faceW, s.cutH - s.faceH) / 2;
}

/** Radio del círculo que envuelve al corte (para el acomodo en hoja). */
export function packRadius(s: PinSize): number {
  return Math.max(s.cutW, s.cutH) / 2;
}

/** Normaliza y valida un molde. Devuelve null si las medidas no tienen sentido. */
export function sanitizeSize(raw: Partial<PinSize>): PinSize | null {
  const shape: Shape = raw.shape && raw.shape in SHAPE_LABELS ? raw.shape : 'circle';
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const faceW = num(raw.faceW);
  const cutW = num(raw.cutW);
  // En el círculo el alto es igual al ancho.
  const faceH = shape === 'circle' ? faceW : num(raw.faceH);
  const cutH = shape === 'circle' ? cutW : num(raw.cutH);
  const vals = [faceW, faceH, cutW, cutH];
  if (vals.some((v) => !(v > 0 && v <= 200))) return null;
  if (cutW < faceW || cutH < faceH) return null;
  return {
    id: String(raw.id || `c${Date.now().toString(36)}`),
    name: String(raw.name || '').trim() || autoName(shape, faceW, faceH),
    shape,
    faceW,
    faceH,
    cutW,
    cutH,
    custom: raw.custom ? true : undefined,
  };
}

const cmTxt = (mm: number) => (mm / 10).toLocaleString('es', { maximumFractionDigits: 2 });

/**
 * Texto de la lista de tamaños, en mm y cm, con el corte:
 * "58 mm · 5,8 cm (corte 7 cm)" o "Corazón 5,7 × 5,2 cm (corte 6,8 × 6,3 cm)".
 */
export function sizeOptionLabel(s: PinSize): string {
  let t: string;
  if (s.shape === 'circle') t = `${s.faceW} mm · ${cmTxt(s.faceW)} cm (corte ${cmTxt(s.cutW)} cm)`;
  else t = `${SHAPE_LABELS[s.shape]} ${cmTxt(s.faceW)} × ${cmTxt(s.faceH)} cm (corte ${cmTxt(s.cutW)} × ${cmTxt(s.cutH)} cm)`;
  if (s.id === 'r58') t += ' ★ el más común';
  if (s.id === 'r75') t += ' · requiere otro molde';
  // Solo se antepone el nombre si la usuaria le puso uno propio.
  if (s.custom && s.name !== autoName(s.shape, s.faceW, s.faceH)) t = `${s.name} · ${t}`;
  return t;
}

export function autoName(shape: Shape, faceW: number, faceH: number): string {
  if (shape === 'circle') return `Redondo ${faceW} mm`;
  return `${SHAPE_LABELS[shape]} ${faceW}×${faceH}`;
}

/** Lee los moldes guardados; si no hay (o fallan), usa los de fábrica. */
export function loadSizes(storage: Pick<Storage, 'getItem'> | null = safeStorage()): PinSize[] {
  try {
    const txt = storage?.getItem(STORAGE_KEY);
    if (txt) {
      const list = (JSON.parse(txt) as Partial<PinSize>[])
        .map(sanitizeSize)
        .filter((s): s is PinSize => s !== null);
      if (list.length) return list;
    }
  } catch {
    /* almacenamiento bloqueado o datos dañados: usar los de fábrica */
  }
  return DEFAULT_SIZES.map((s) => ({ ...s }));
}

export function saveSizes(list: PinSize[], storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* sin almacenamiento (modo privado): se pierde al recargar */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
