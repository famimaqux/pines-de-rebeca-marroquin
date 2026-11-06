import './style.css';
import { loadFonts } from './fonts';
import { onProcessed } from './image/processor';
import { MAX_QTY } from './layout/sheets';
import { setSizeLookup } from './model/styleCopy';
import { checkpoint, current, editTargets, emit, redo, selectOnly, setSizes, sizeById, state, subscribe, undo } from './state';
import { h } from './ui/dom';
import { createDesignsStrip } from './ui/designsList';
import { createEditor } from './ui/editor';
import { createExportPanel } from './ui/exportPanel';
import { createLayersPanel } from './ui/layersPanel';
import { createSheetView, qtyActions } from './ui/sheetView';
import { createSizesPanel } from './ui/sizesPanel';
import { toast } from './ui/toast';

setSizeLookup(sizeById);

const app = document.querySelector<HTMLElement>('#app')!;
document.body.classList.add('workspace-mode');

/* ---------- Preferencias de la pantalla (se recuerdan) ---------- */
interface UiPrefs {
  left: boolean;
  right: boolean;
  leftW: number;
  rightW: number;
}
const UI_KEY = 'pines-rebeca.ui.v1';
const ui: UiPrefs = { left: true, right: true, leftW: 320, rightW: 360 };
try {
  Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) ?? '{}'));
} catch {
  /* sin almacenamiento */
}
const saveUi = () => {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    /* sin almacenamiento */
  }
};
const isCompact = () => window.matchMedia('(max-width: 1100px)').matches;

/* ---------- Piezas ---------- */
const layers = createLayersPanel(); // barra izquierda
const edLayers = createLayersPanel({ idPrefix: 'ed-' }); // pestañas del editor (derecha)
const editor = createEditor([
  { id: 'image', label: '🖼 Imagen', content: [edLayers.parts.imagen, h('h3', { class: 'sub' }, 'Quitar fondo rápido'), edLayers.parts.quitar, h('h3', { class: 'sub' }, 'Color de impresión'), edLayers.parts.mejora] },
  { id: 'bg', label: '🎨 Fondo', content: [edLayers.parts.fondo, h('h3', { class: 'sub' }, 'Patrón'), edLayers.parts.patron, h('h3', { class: 'sub' }, 'Borde / modelo de círculo'), edLayers.parts.borde] },
  { id: 'text', label: '🔤 Letras', content: [edLayers.parts.texto] },
  { id: 'sticker', label: '⭐ Sticker', content: [edLayers.parts.stickers] },
]);
const sheet = createSheetView({ openEditor });
const strip = createDesignsStrip({ openEditor });
const exportPanel = createExportPanel();

/* ---------- Barra izquierda: secciones principales ---------- */
const statusText = h('strong', { class: 'sel-text', 'aria-live': 'polite' });
const editBtn = h('button', { type: 'button', class: 'btn small', onclick: () => openEditor() }, '✎ Editar pin');
const selAllBtn = h('button', { type: 'button', class: 'btn ghost small', onclick: () => selectOnly(state.designs.map((d) => d.id)) }, 'Seleccionar todos');
const clearSelBtn = h('button', { type: 'button', class: 'btn ghost small', onclick: () => (state.selection.clear(), state.pinSel.clear(), emit('list', 'view')) }, 'Quitar selección');
const closeLeft = h('button', { type: 'button', class: 'btn-icon panel-close', 'aria-label': 'Cerrar el panel', onclick: () => setPanel('left', false) }, '✕');
const status = h('div', { class: 'side-status' }, h('div', { class: 'row between' }, statusText, closeLeft), h('div', { class: 'row wrap' }, editBtn, selAllBtn, clearSelBtn));

const sizesDlg = h('dialog', { class: 'dialog wide', 'aria-label': 'Medidas de los moldes' });
sizesDlg.append(createSizesPanel({ getSizes: () => state.sizes, setSizes }), h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onclick: () => sizesDlg.close() }, 'Cerrar')));
document.body.append(sizesDlg);

const blank = (txt: string) => h('p', { class: 'muted small need-target' }, txt);
const NEED = 'Selecciona uno o más pines en la hoja o en “Tus diseños” para cambiarlos.';

interface SideSection {
  id: string;
  title: string;
  body: HTMLElement[];
  open?: boolean;
  design?: boolean;
}
const sections: SideSection[] = [
  { id: 'papel', title: '📄 Papel', body: [sheet.paperBox] },
  { id: 'imagenes', title: '📷 Imágenes', body: [sheet.imagesBox, blank(NEED), layers.parts.imagen, layers.parts.quitar], open: true },
  {
    id: 'tamano',
    title: '⭕ Tamaño',
    body: [sheet.sizeBox, h('button', { type: 'button', class: 'btn ghost small', onclick: () => sizesDlg.showModal() }, '📏 Editar medidas de los moldes…')],
    open: true,
  },
  { id: 'fondo', title: '🎨 Fondo', body: [blank(NEED), layers.parts.fondo, h('h3', { class: 'sub' }, 'Patrón'), layers.parts.patron], design: true },
  { id: 'borde', title: '💍 Borde / modelo de círculo', body: [blank(NEED), layers.parts.borde], design: true },
  { id: 'letras', title: '🔤 Letras', body: [blank(NEED), layers.parts.texto], design: true },
  { id: 'stickers', title: '⭐ Stickers', body: [blank(NEED), layers.parts.stickers], design: true },
  { id: 'color', title: '🌈 Color de impresión', body: [blank(NEED), layers.parts.mejora], design: true },
  { id: 'acomodo', title: '🧩 Acomodo', body: [sheet.layoutBox] },
  { id: 'exportar', title: '🖨 Imprimir / Exportar', body: [exportPanel] },
];
const sectionEls = sections.map((s) =>
  h('details', { class: `side-sec${s.design ? ' design' : ''}`, open: !!s.open, 'data-id': s.id }, h('summary', {}, s.title), h('div', { class: 'side-body' }, ...s.body)),
);
const side = h('aside', { class: 'sidebar left-panel', 'aria-label': 'Controles' }, status, h('div', { class: 'side-sections' }, ...sectionEls));

/* ---------- Panel derecho: Tus diseños + Editor de pin ---------- */
const handleR = h('button', { type: 'button', class: 'side-handle', 'aria-label': 'Mostrar u ocultar el panel', 'aria-expanded': 'false' }, h('span', {}));
const closeRight = h('button', { type: 'button', class: 'btn-icon panel-close', 'aria-label': 'Ocultar el panel derecho', onclick: () => setPanel('right', false) }, '✕');
const drawerQty = h('input', { type: 'number', min: 0, max: MAX_QTY, class: 'num', 'aria-label': 'Cantidad de este pin' });
drawerQty.addEventListener('change', () => {
  const d = current();
  if (!d) return;
  checkpoint();
  d.qty = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(drawerQty.value) || 0)));
  emit('list');
});
const drawerQtyActions = h('div', {});
const editorEmpty = h('div', { class: 'empty small' }, h('p', {}, 'Elige un diseño en la lista de arriba o haz doble clic en un pin de la hoja para editarlo aquí.'));
const editorBox = h(
  'section',
  { class: 'right-editor', 'aria-label': 'Editor de pin' },
  h('div', { class: 'right-head' }, h('h2', {}, '✎ Editor de pin')),
  editorEmpty,
  editor.el,
  h('div', { class: 'ed-qty' }, h('label', { class: 'mini inline' }, h('span', {}, 'Cantidad ×'), drawerQty), drawerQtyActions),
);
const designsBox = h('section', { class: 'right-designs' }, strip);
// "Tus diseños" se puede plegar para dejarle más lugar al editor.
const foldBtn = h('button', { type: 'button', class: 'btn-icon fold', 'aria-expanded': 'true', 'aria-label': 'Plegar o desplegar “Tus diseños”', title: 'Plegar / desplegar' }, '▾');
foldBtn.addEventListener('click', () => {
  const folded = designsBox.classList.toggle('collapsed');
  foldBtn.setAttribute('aria-expanded', String(!folded));
  foldBtn.textContent = folded ? '▸' : '▾';
});
strip.querySelector('.strip-head')?.prepend(foldBtn);
const right = h('aside', { class: 'right-panel', 'aria-label': 'Tus diseños y editor de pin' }, h('div', { class: 'right-top' }, handleR, closeRight), designsBox, editorBox);

handleR.addEventListener('click', () => toggleSheet());
const toggleSheet = (open = !right.classList.contains('expanded')) => {
  right.classList.toggle('expanded', open);
  handleR.setAttribute('aria-expanded', String(open));
};
// Celular: deslizar hacia arriba abre el panel y hacia abajo lo cierra.
let swipeY: number | null = null;
handleR.addEventListener('pointerdown', (e) => (swipeY = e.clientY));
handleR.addEventListener('pointerup', (e) => {
  if (swipeY === null) return;
  const dy = e.clientY - swipeY;
  swipeY = null;
  if (dy < -30) toggleSheet(true);
  else if (dy > 30) toggleSheet(false);
});

/* ---------- Centro: la hoja ---------- */
const undoBtn = h('button', { type: 'button', class: 'btn-icon', title: 'Deshacer (Ctrl+Z)', 'aria-label': 'Deshacer', onclick: () => undo() || toast('Nada que deshacer') }, '↶');
const redoBtn = h('button', { type: 'button', class: 'btn-icon', title: 'Rehacer (Ctrl+Y)', 'aria-label': 'Rehacer', onclick: () => redo() || toast('Nada que rehacer') }, '↷');
const leftBtn = h('button', { type: 'button', class: 'btn ghost small panel-btn', title: 'Mostrar u ocultar la barra izquierda', 'aria-pressed': 'true', onclick: () => setPanel('left', !panelOpen('left')) }, '☰ Herramientas');
const rightBtn = h('button', { type: 'button', class: 'btn ghost small panel-btn', title: 'Mostrar u ocultar el panel derecho', 'aria-pressed': 'true', onclick: () => setPanel('right', !panelOpen('right')) }, 'Diseños ☰');
const onlyBtn = h(
  'button',
  {
    type: 'button',
    class: 'btn ghost small panel-btn',
    title: 'Ocultar las dos barras',
    onclick: () => {
      const both = panelOpen('left') || panelOpen('right');
      setPanel('left', !both);
      setPanel('right', !both);
    },
  },
  '⛶ Solo hoja',
);
const nav = sheet.el.querySelector('.sheet-nav')!;
nav.prepend(leftBtn);
nav.append(h('span', { class: 'spacer' }), undoBtn, redoBtn, onlyBtn, rightBtn);
const center = h('div', { class: 'main-area' }, sheet.el, sheet.summary);

/* ---------- Bordes para ensanchar ---------- */
const mkResizer = (which: 'left' | 'right') => {
  const r = h('div', { class: `resizer ${which}`, role: 'separator', 'aria-orientation': 'vertical', 'aria-label': which === 'left' ? 'Ensanchar la barra izquierda' : 'Ensanchar el panel derecho', tabindex: 0 });
  let start: { x: number; w: number } | null = null;
  r.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, w: which === 'left' ? ui.leftW : ui.rightW };
    r.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
  });
  r.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const w = Math.round(Math.min(620, Math.max(260, start.w + (which === 'left' ? dx : -dx))));
    if (which === 'left') ui.leftW = w;
    else ui.rightW = w;
    applyLayout();
  });
  const end = () => {
    if (!start) return;
    start = null;
    document.body.classList.remove('resizing');
    saveUi();
    emit('view');
  };
  r.addEventListener('pointerup', end);
  r.addEventListener('pointercancel', end);
  r.addEventListener('keydown', (e) => {
    const k = e.key === 'ArrowRight' ? 20 : e.key === 'ArrowLeft' ? -20 : 0;
    if (!k) return;
    e.preventDefault();
    if (which === 'left') ui.leftW = Math.min(620, Math.max(260, ui.leftW + k));
    else ui.rightW = Math.min(620, Math.max(260, ui.rightW - k));
    applyLayout();
    saveUi();
  });
  return r;
};
const resL = mkResizer('left');
const resR = mkResizer('right');

const scrim = h('div', { class: 'scrim', hidden: true, onclick: () => setPanel('left', false) });
const workspace = h('div', { class: 'workspace three' }, side, resL, center, resR, right, scrim);
app.replaceChildren(workspace);

/* ---------- Mostrar / ocultar paneles ---------- */
// En tableta/celular la izquierda es un cajón (empieza cerrado) y la derecha un panel inferior.
let drawerOpen = false;
function panelOpen(which: 'left' | 'right'): boolean {
  if (isCompact()) return which === 'left' ? drawerOpen : right.classList.contains('expanded');
  return which === 'left' ? ui.left : ui.right;
}
function setPanel(which: 'left' | 'right', open: boolean) {
  if (isCompact()) {
    if (which === 'left') drawerOpen = open;
    else toggleSheet(open);
  } else {
    if (which === 'left') ui.left = open;
    else ui.right = open;
    saveUi();
  }
  applyLayout();
  emit('view');
}
function applyLayout() {
  const compact = isCompact();
  workspace.classList.toggle('compact', compact);
  if (compact) {
    workspace.style.gridTemplateColumns = '';
    side.classList.toggle('open', drawerOpen);
    scrim.hidden = !drawerOpen;
  } else {
    side.classList.remove('open');
    scrim.hidden = true;
    workspace.style.gridTemplateColumns = `${ui.left ? ui.leftW : 0}px ${ui.left ? 6 : 0}px minmax(0, 1fr) ${ui.right ? 6 : 0}px ${ui.right ? ui.rightW : 0}px`;
  }
  side.hidden = !compact && !ui.left;
  right.hidden = !compact && !ui.right;
  resL.hidden = compact || !ui.left;
  resR.hidden = compact || !ui.right;
  leftBtn.setAttribute('aria-pressed', String(panelOpen('left')));
  rightBtn.setAttribute('aria-pressed', String(panelOpen('right')));
  onlyBtn.setAttribute('aria-pressed', String(!panelOpen('left') && !panelOpen('right')));
}
window.addEventListener('resize', () => {
  applyLayout();
  emit('view');
});
applyLayout();

/* ---------- Abrir el editor (doble clic o "Editar") ---------- */
function openEditor() {
  const d = current();
  if (!d) return toast('Primero elige un pin en la hoja o en “Tus diseños”');
  if (!state.selection.has(d.id)) state.selection = new Set([d.id]);
  state.editorOpen = true;
  if (!panelOpen('right')) setPanel('right', true);
  if (isCompact()) toggleSheet(true);
  emit('view', 'design', 'list');
  requestAnimationFrame(() => editorBox.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/* ---------- Atajos de teclado ---------- */
document.addEventListener('keydown', (e) => {
  const tgt = e.target as HTMLElement;
  // En los campos de texto se deja el deshacer propio del navegador.
  if (tgt.matches('input[type="text"], input[type="number"], textarea')) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (!undo()) toast('Nada que deshacer');
  } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
    e.preventDefault();
    if (!redo()) toast('Nada que rehacer');
  }
});

/* ---------- Refrescos ---------- */
let qtySig = '';
subscribe(() => {
  const d = current();
  const targets = editTargets();
  const n = state.selection.size;
  const pins = targets.reduce((a, x) => a + x.qty, 0);
  statusText.textContent = n ? `${n === 1 ? '1 diseño seleccionado' : `${n} diseños seleccionados`} · ${pins} pin${pins === 1 ? '' : 'es'}` : 'Nada seleccionado';
  editBtn.disabled = !d;
  clearSelBtn.hidden = !n;
  selAllBtn.hidden = !state.designs.length || n === state.designs.length;
  side.classList.toggle('no-target', !n);
  // El editor muestra el diseño actual (el último elegido).
  const showEditor = !!d && (n > 0 || state.editorOpen);
  editorEmpty.hidden = showEditor;
  editor.el.hidden = !showEditor;
  (editorBox.querySelector('.ed-qty') as HTMLElement).hidden = !showEditor;
  layers.refresh();
  edLayers.refresh();
  if (d) {
    if (document.activeElement !== drawerQty) drawerQty.value = String(d.qty);
    const sig = `${d.id}|${d.sizeId}`;
    if (sig !== qtySig) {
      qtySig = sig;
      drawerQtyActions.replaceChildren(qtyActions(d));
    }
  }
});
// Cuando el Worker termina de procesar una imagen, redibujar.
onProcessed(() => emit('design', 'list'));

/* ---------- Inicio ---------- */
emit('list', 'design', 'sizes', 'page', 'view');
// Volver a dibujar cuando terminen de cargar las fuentes incrustadas.
loadFonts().then(() => emit('design', 'list', 'view'));

// Solo para pruebas automáticas: con "?debug" en la dirección se puede leer el acomodo.
if (new URLSearchParams(location.search).has('debug')) {
  void Promise.all([import('./layout/current'), import('./ui/wand')]).then(([m, w]) => {
    (window as unknown as Record<string, unknown>).__pines = { state, layout: () => m.currentLayout(), wand: w.wand };
  });
}
