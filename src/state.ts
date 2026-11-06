import { newDesign, type Design } from './model/design';
import { DEFAULT_SIZE_ID, loadSizes, saveSizes, type PinSize } from './model/sizes';
import type { PackAlgo, PageSettings } from './layout/pack';
import type { Fixed } from './layout/arrange';
import { loadPaper, paperSize, savePaper, type PaperSettings } from './model/paper';
import { DEFAULT_GUIDES, type GuideSettings } from './render/sheet';

/**
 * Estado de la app + deshacer/rehacer.
 * El historial guarda copias de los diseños (son datos puros: las imágenes
 * viven en el almacén de imágenes y aquí solo van sus ids).
 */

export type DragTarget = 'image' | 'bg' | 'text' | 'sticker';
export type BrushMode = 'off' | 'erase' | 'restore' | 'wand';

/** Ajustes de acomodo (el tamaño del papel sale de `paper`). */
export interface PageOptions {
  margin: number;
  gap: number;
  algo: PackAlgo;
}

export interface AppState {
  paper: PaperSettings;
  /** hoja que se ve en pantalla (0 = la primera) */
  sheet: number;
  /** zoom de la hoja: 0 = ajustar a la pantalla; si no, px por mm */
  zoom: number;
  showRuler: boolean;
  /** "Ver pines terminados" en la hoja (solo vista) */
  showFinished: boolean;
  /** panel lateral del editor abierto */
  editorOpen: boolean;
  sizes: PinSize[];
  designs: Design[];
  /** pin que se edita en el panel lateral */
  selId: number | null;
  /** diseños seleccionados (los controles de la barra los cambian) */
  selection: Set<number>;
  /** pines seleccionados en la hoja ("idDiseño:copia"): son los que se mueven */
  pinSel: Set<string>;
  /** posiciones fijas: 📌 fijados a mano y, en modo Libre, todos */
  fixed: Map<string, Fixed>;
  defSizeId: string;
  page: PageOptions;
  guides: GuideSettings;
  /** copias por hoja (índice de hoja → número de veces) */
  copies: number[];
  dragTarget: DragTarget;
  finished: boolean;
  brush: { mode: BrushMode; size: number; hardness: number };
}

export const state: AppState = {
  paper: loadPaper(),
  sheet: 0,
  zoom: 0,
  showRuler: true,
  showFinished: false,
  editorOpen: false,
  sizes: loadSizes(),
  designs: [],
  selId: null,
  selection: new Set(),
  pinSel: new Set(),
  fixed: new Map(),
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
  /** cambió la configuración de la hoja o del papel */
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

/** Ajustes completos de la hoja (papel + márgenes + modo). */
export function pageSettings(): PageSettings {
  return { ...paperSize(state.paper), ...state.page };
}

export function setPaper(p: Partial<PaperSettings>): void {
  state.paper = { ...state.paper, ...p };
  savePaper(state.paper);
  emit('page');
}

/** Pines a los que afectan los controles de la barra: la selección o, si no hay, el pin actual. */
export function editTargets(): Design[] {
  if (state.selection.size) return state.designs.filter((d) => state.selection.has(d.id));
  const c = current();
  return c ? [c] : [];
}

/** Selecciona estos diseños (el primero queda como pin actual). */
export function selectOnly(ids: number[]): void {
  state.selection = new Set(ids);
  state.pinSel = new Set();
  if (ids.length) state.selId = ids[0];
  emit('list', 'design', 'view');
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
  fixed: string;
}

const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];
const MAX_HISTORY = 80;
let lastPush = 0;
let lastGroup = '';

const fixedJson = () => JSON.stringify([...state.fixed]);
const snap = (): Snapshot => ({ designs: JSON.stringify(state.designs), selId: state.selId, fixed: fixedJson() });

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

/** Guarda en el historial un estado anterior ya tomado (para cambios con vista previa). */
export function checkpointFrom(designsJson: string, selId: number | null, fixedJsonBefore: string = fixedJson()): void {
  undoStack.push({ designs: designsJson, selId, fixed: fixedJsonBefore });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  lastGroup = '';
  lastPush = Date.now();
}

function restore(s: Snapshot): void {
  state.designs = JSON.parse(s.designs) as Design[];
  state.fixed = new Map(JSON.parse(s.fixed) as [string, Fixed][]);
  state.pinSel = new Set([...state.pinSel].filter((k) => state.designs.some((d) => k.startsWith(`${d.id}:`))));
  state.selId = s.selId && state.designs.some((d) => d.id === s.selId) ? s.selId : (state.designs[0]?.id ?? null);
  for (const id of state.selection) if (!state.designs.some((d) => d.id === id)) state.selection.delete(id);
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
