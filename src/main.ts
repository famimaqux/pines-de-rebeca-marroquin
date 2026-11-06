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

/* ---------- Piezas ---------- */
const layers = createLayersPanel();
const editor = createEditor();
const sheet = createSheetView({ openEditor });
const strip = createDesignsStrip({ openEditor });
const exportPanel = createExportPanel();

/* ---------- Barra lateral ---------- */
const statusText = h('strong', { class: 'sel-text', 'aria-live': 'polite' });
const editBtn = h('button', { type: 'button', class: 'btn small', onclick: () => openEditor() }, '✎ Editar pin');
const selAllBtn = h('button', { type: 'button', class: 'btn ghost small', onclick: () => selectOnly(state.designs.map((d) => d.id)) }, 'Seleccionar todos');
const clearSelBtn = h('button', { type: 'button', class: 'btn ghost small', onclick: () => (state.selection.clear(), emit('list', 'view')) }, 'Quitar selección');
const handle = h('button', { type: 'button', class: 'side-handle', 'aria-label': 'Mostrar u ocultar el panel', 'aria-expanded': 'false' }, h('span', {}));
const status = h('div', { class: 'side-status' }, handle, statusText, h('div', { class: 'row wrap' }, editBtn, selAllBtn, clearSelBtn));

// Editor detallado (doble clic): se abre dentro de la misma barra.
const drawerQty = h('input', { type: 'number', min: 0, max: MAX_QTY, class: 'num', 'aria-label': 'Cantidad de este pin' });
drawerQty.addEventListener('change', () => {
  const d = current();
  if (!d) return;
  checkpoint();
  d.qty = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(drawerQty.value) || 0)));
  emit('list');
});
const drawerQtyActions = h('div', {});
const editorBox = h(
  'div',
  { class: 'side-editor', hidden: true },
  h('button', { type: 'button', class: 'btn ghost small back', onclick: () => closeEditor() }, '← Volver a la hoja'),
  h('div', { class: 'row wrap' }, h('label', { class: 'mini inline' }, h('span', {}, 'Cantidad ×'), drawerQty)),
  drawerQtyActions,
  editor.el,
);

const sizesDlg = h('dialog', { class: 'dialog wide', 'aria-label': 'Medidas de los moldes' });
sizesDlg.append(createSizesPanel({ getSizes: () => state.sizes, setSizes }), h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onclick: () => sizesDlg.close() }, 'Cerrar')));
document.body.append(sizesDlg);

const blank = (txt: string) => h('p', { class: 'muted small need-target' }, txt);
const NEED = 'Selecciona uno o más pines en la hoja (o en la tira de abajo) para cambiarlos.';

interface SideSection {
  id: string;
  title: string;
  body: HTMLElement[];
  open?: boolean;
  /** solo tiene sentido con un pin elegido */
  design?: boolean;
  /** se ve también dentro del editor detallado */
  inEditor?: boolean;
}
const sections: SideSection[] = [
  { id: 'papel', title: '📄 Papel', body: [sheet.paperBox] },
  { id: 'imagenes', title: '📷 Imágenes', body: [sheet.imagesBox, blank(NEED), layers.parts.imagen, layers.parts.quitar], open: true, inEditor: true },
  {
    id: 'tamano',
    title: '⭕ Tamaño',
    body: [sheet.sizeBox, h('button', { type: 'button', class: 'btn ghost small', onclick: () => sizesDlg.showModal() }, '📏 Editar medidas de los moldes…')],
    open: true,
  },
  { id: 'fondo', title: '🎨 Fondo', body: [blank(NEED), layers.parts.fondo, h('h3', { class: 'sub' }, 'Patrón'), layers.parts.patron], design: true, inEditor: true },
  { id: 'borde', title: '💍 Borde / modelo de círculo', body: [blank(NEED), layers.parts.borde], design: true, inEditor: true },
  { id: 'letras', title: '🔤 Letras', body: [blank(NEED), layers.parts.texto], design: true, inEditor: true },
  { id: 'stickers', title: '⭐ Stickers', body: [blank(NEED), layers.parts.stickers], design: true, inEditor: true },
  { id: 'color', title: '🌈 Color de impresión', body: [blank(NEED), layers.parts.mejora], design: true, inEditor: true },
  { id: 'acomodo', title: '🧩 Acomodo', body: [sheet.layoutBox] },
  { id: 'exportar', title: '🖨 Imprimir / Exportar', body: [exportPanel] },
];
const sectionEls = sections.map((s) => {
  const d = h('details', { class: `side-sec${s.design ? ' design' : ''}`, open: !!s.open, 'data-id': s.id }, h('summary', {}, s.title), h('div', { class: 'side-body' }, ...s.body));
  return { s, d };
});
const side = h('aside', { class: 'sidebar', 'aria-label': 'Controles' }, status, editorBox, h('div', { class: 'side-sections' }, ...sectionEls.map((x) => x.d)));

const setExpanded = (open: boolean) => {
  side.classList.toggle('expanded', open);
  handle.setAttribute('aria-expanded', String(open));
};
handle.addEventListener('click', () => setExpanded(!side.classList.contains('expanded')));
// Celular: deslizar hacia arriba abre el panel y hacia abajo lo cierra.
let swipeY: number | null = null;
status.addEventListener('pointerdown', (e) => (swipeY = e.clientY));
status.addEventListener('pointerup', (e) => {
  if (swipeY === null) return;
  const dy = e.clientY - swipeY;
  swipeY = null;
  if (dy < -30) setExpanded(true);
  else if (dy > 30) setExpanded(false);
});

/* ---------- Área de la hoja ---------- */
const undoBtn = h('button', { type: 'button', class: 'btn-icon', title: 'Deshacer (Ctrl+Z)', 'aria-label': 'Deshacer', onclick: () => undo() || toast('Nada que deshacer') }, '↶');
const redoBtn = h('button', { type: 'button', class: 'btn-icon', title: 'Rehacer (Ctrl+Y)', 'aria-label': 'Rehacer', onclick: () => redo() || toast('Nada que rehacer') }, '↷');
sheet.el.querySelector('.sheet-nav')?.append(h('span', { class: 'spacer' }), undoBtn, redoBtn);
const mainArea = h('div', { class: 'main-area' }, sheet.el, strip, sheet.summary);

app.replaceChildren(h('div', { class: 'workspace' }, side, mainArea));

/* ---------- Editor dentro de la barra ---------- */
let lastFocus: HTMLElement | null = null;
function openEditor() {
  const d = current();
  if (!d) return toast('Primero elige un pin en la hoja o en la tira de diseños');
  if (!state.selection.has(d.id)) state.selection = new Set([d.id]);
  if (!state.editorOpen) lastFocus = document.activeElement as HTMLElement | null;
  state.editorOpen = true;
  side.classList.add('expanded');
  emit('view', 'design', 'list');
  requestAnimationFrame(() => {
    side.scrollTop = 0;
    editorBox.querySelector<HTMLElement>('.back')?.focus();
  });
}
function closeEditor() {
  state.editorOpen = false;
  emit('view');
  lastFocus?.focus();
}

/* ---------- Atajos de teclado ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.editorOpen && !document.querySelector('dialog[open]')) {
    closeEditor();
    return;
  }
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
  if (state.editorOpen && !d) state.editorOpen = false;
  const targets = editTargets();
  const n = state.selection.size;
  const pins = targets.reduce((a, x) => a + x.qty, 0);
  statusText.textContent = n ? `${n === 1 ? '1 diseño seleccionado' : `${n} diseños seleccionados`} · ${pins} pin${pins === 1 ? '' : 'es'}` : 'Nada seleccionado';
  editBtn.disabled = !d;
  clearSelBtn.hidden = !n;
  selAllBtn.hidden = !state.designs.length || n === state.designs.length;
  side.classList.toggle('no-target', !n && !state.editorOpen);
  side.classList.toggle('editing', state.editorOpen);
  editorBox.hidden = !state.editorOpen;
  for (const { s, d: el } of sectionEls) el.hidden = state.editorOpen && !s.inEditor;
  layers.refresh();
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
window.addEventListener('resize', () => emit('view'));

/* ---------- Inicio ---------- */
emit('list', 'design', 'sizes', 'page', 'view');
// Volver a dibujar cuando terminen de cargar las fuentes incrustadas.
loadFonts().then(() => emit('design', 'list', 'view'));
