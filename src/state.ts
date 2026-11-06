import { newDesign, type Design } from './model/design';
import { DEFAULT_SIZE_ID, loadSizes, saveSizes, type PinSize } from './model/sizes';
import type { PageSettings } from './layout/pack';
import { DEFAULT_GUIDES, type GuideSettings } from './render/sheet';

/**
 * Estado de la app + deshacer/rehacer.
 * El historial guarda copias de los diseños (son datos puros: las imágenes
 * viven en el almacén de imágenes y aquí solo van sus ids).
 */

export type DragTarget = 'image' | 'bg' | 'sticker';
export type BrushMode = 'off' | 'erase' | 'restore';

export interface AppState {
  sizes: PinSize[];
  designs: Design[];
  selId: number | null;
  defSizeId: string;
  page: PageSettings;
  guides: GuideSettings;
  /** copias por hoja (índice de hoja → número de veces) */
  copies: number[];
  dragTarget: DragTarget;
  finished: boolean;
  brush: { mode: BrushMode; size: number; hardness: number };
}

export const state: AppState = {
  sizes: loadSizes(),
  designs: [],
  selId: null,
  defSizeId: DEFAULT_SIZE_ID,
  page: { margin: 5, gap: 1.5, algo: 'auto' },
  guides: { ...DEFAULT_GUIDES },
  copies: [],
  dragTarget: 'image',
  finished: false,
  brush: { mode: 'off', size: 4, hardness: 0.6 },
};

export type ChangeKind =
  /** cambió el aspecto de un diseño (redibujar editor y miniatura) */
  | 'design'
  /** cambió la lista de diseños, cantidades o la selección */
  | 'list'
  /** cambió la configuración de la hoja */
  | 'page'
  /** cambiaron los moldes */
  | 'sizes'
  /** cambió algo solo visual del editor (modo de arrastre, vista terminada…) */
  | 'view';

type Listener = (kinds: Set<ChangeKind>) => void;
const listeners = new Set<Listener>();
let pendingKinds = new Set<ChangeKind>();
let scheduled = false;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Avisa a la interfaz (agrupado en un solo cuadro de animación). */
export function emit(...kinds: ChangeKind[]): void {
  kinds.forEach((k) => pendingKinds.add(k));
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const ks = pendingKinds;
    pendingKinds = new Set();
    listeners.forEach((l) => l(ks));
  });
}

export const current = (): Design | null => state.designs.find((d) => d.id === state.selId) ?? null;
export const sizeById = (id: string): PinSize => state.sizes.find((s) => s.id === id) ?? state.sizes[0];

export function setSizes(list: PinSize[]): void {
  state.sizes = list;
  saveSizes(list);
  for (const d of state.designs) if (!list.some((s) => s.id === d.sizeId)) d.sizeId = list[0].id;
  if (!list.some((s) => s.id === state.defSizeId)) state.defSizeId = list[0].id;
  emit('sizes', 'list', 'design');
}

/* ---------- Deshacer / rehacer ---------- */

interface Snapshot {
  designs: string;
  selId: number | null;
}

const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];
const MAX_HISTORY = 80;
let lastPush = 0;
let lastGroup = '';

const snap = (): Snapshot => ({ designs: JSON.stringify(state.designs), selId: state.selId });

/**
 * Llamar ANTES de modificar los diseños. Los cambios seguidos del mismo
 * grupo (p. ej. arrastrar un control) se agrupan en un solo paso de deshacer.
 */
export function checkpoint(group = ''): void {
  const now = Date.now();
  if (group && group === lastGroup && now - lastPush < 900) {
    lastPush = now;
    return;
  }
  undoStack.push(snap());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  lastPush = now;
  lastGroup = group;
}

function restore(s: Snapshot): void {
  state.designs = JSON.parse(s.designs) as Design[];
  state.selId = s.selId && state.designs.some((d) => d.id === s.selId) ? s.selId : (state.designs[0]?.id ?? null);
  lastGroup = '';
  emit('list', 'design');
}

export function undo(): boolean {
  const s = undoStack.pop();
  if (!s) return false;
  redoStack.push(snap());
  restore(s);
  return true;
}

export function redo(): boolean {
  const s = redoStack.pop();
  if (!s) return false;
  undoStack.push(snap());
  restore(s);
  return true;
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

/** Ids de imagen que el historial aún podría necesitar. */
export function historyImageIds(): Set<string> {
  const ids = new Set<string>();
  const re = /"(?:imageId|maskId)":"([^"]+)"/g;
  for (const s of [...undoStack, ...redoStack]) for (const m of s.designs.matchAll(re)) ids.add(m[1]);
  return ids;
}

export function clearHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
}

/* ---------- Acciones frecuentes ---------- */

export function addDesign(d: Design, select = true): Design {
  state.designs.push(d);
  if (select) state.selId = d.id;
  emit('list', 'design');
  return d;
}

export function blankDesign(): Design {
  return newDesign(state.defSizeId);
}
