import './style.css';
import { loadFonts } from './fonts';
import { onProcessed } from './image/processor';
import { MAX_QTY } from './layout/sheets';
import { checkpoint, current, emit, redo, setSizes, state, subscribe, undo } from './state';
import { h } from './ui/dom';
import { createDesignsStrip } from './ui/designsList';
import { createEditor } from './ui/editor';
import { createLayersPanel } from './ui/layersPanel';
import { createSheetView, qtyActions } from './ui/sheetView';
import { createSizesPanel } from './ui/sizesPanel';
import { toast } from './ui/toast';

const app = document.querySelector<HTMLElement>('#app')!;

/* ---------- Editor en panel lateral ---------- */
const layers = createLayersPanel();
const editor = createEditor();

const drawerQty = h('input', { type: 'number', min: 0, max: MAX_QTY, class: 'num', 'aria-label': 'Cantidad de este pin' });
drawerQty.addEventListener('change', () => {
  const d = current();
  if (!d) return;
  checkpoint();
  d.qty = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(drawerQty.value) || 0)));
  emit('list');
});
const drawerQtyActions = h('div', {});
const closeBtn = h('button', { type: 'button', class: 'btn-icon close', 'aria-label': 'Cerrar el editor', onclick: () => closeEditor() }, '✕');
const drawer = h(
  'aside',
  { class: 'drawer', 'aria-label': 'Editor del pin', hidden: true, tabindex: -1 },
  h(
    'div',
    { class: 'drawer-head' },
    h('h2', {}, '✎ Editar pin'),
    h('label', { class: 'mini inline' }, h('span', {}, 'Cantidad ×'), drawerQty),
    drawerQtyActions,
    closeBtn,
  ),
  h('div', { class: 'drawer-body' }, editor.el, h('section', { class: 'card layers-card', 'aria-labelledby': 'layers-title' }, h('h2', { id: 'layers-title' }, 'Capas del pin'), layers.el)),
);

let lastFocus: HTMLElement | null = null;
function openEditor() {
  if (!current()) return toast('Primero elige un pin en la hoja o en tus diseños');
  if (!state.editorOpen) lastFocus = document.activeElement as HTMLElement | null;
  state.editorOpen = true;
  emit('view', 'design');
  requestAnimationFrame(() => drawer.focus());
}
function closeEditor() {
  state.editorOpen = false;
  emit('view');
  lastFocus?.focus();
}

/* ---------- Pestañas ---------- */
const sheetView = createSheetView({ openEditor });
const strip = createDesignsStrip({ openEditor });

// La tira de miniaturas va entre la barra de herramientas y la hoja.
sheetView.el.insertBefore(strip, sheetView.el.querySelector('.sheet-nav'));
const sheetTab = h('div', { class: 'sheet-tab' }, sheetView.el);
const sizesTab = h('div', { class: 'stack' }, createSizesPanel({ getSizes: () => state.sizes, setSizes }));

const tabs = [
  { id: 'hoja', label: '🗒 Hoja', panel: sheetTab },
  { id: 'medidas', label: '📏 Medidas', panel: sizesTab },
];
const tabBar = h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Secciones' });
const undoBtn = h('button', { type: 'button', class: 'btn ghost small', title: 'Deshacer (Ctrl+Z)', onclick: () => undo() || toast('Nada que deshacer') }, '↶');
const redoBtn = h('button', { type: 'button', class: 'btn ghost small', title: 'Rehacer (Ctrl+Y)', onclick: () => redo() || toast('Nada que rehacer') }, '↷');

function showTab(id: string) {
  for (const t of tabs) {
    const on = t.id === id;
    t.panel.hidden = !on;
    document.getElementById(`tab-${t.id}`)?.setAttribute('aria-selected', String(on));
  }
  try {
    localStorage.setItem('pines-rebeca.tab', id);
  } catch {
    /* sin almacenamiento */
  }
  emit('view');
}
for (const t of tabs) {
  t.panel.setAttribute('role', 'tabpanel');
  t.panel.id = `panel-${t.id}`;
  t.panel.setAttribute('aria-labelledby', `tab-${t.id}`);
  tabBar.append(h('button', { type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-controls': `panel-${t.id}`, onclick: () => showTab(t.id) }, t.label));
}
tabBar.append(h('span', { class: 'spacer' }), undoBtn, redoBtn);

app.replaceChildren(tabBar, ...tabs.map((t) => t.panel), sheetView.summary, drawer);

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
subscribe((k) => {
  const d = current();
  if (state.editorOpen && !d) state.editorOpen = false;
  drawer.hidden = !state.editorOpen;
  document.body.classList.toggle('drawer-open', state.editorOpen);
  if (state.editorOpen && (k.has('design') || k.has('list') || k.has('view') || k.has('sizes'))) layers.refresh();
  if (d) {
    if (document.activeElement !== drawerQty) drawerQty.value = String(d.qty);
    const sig = `${d.id}|${d.sizeId}`;
    if (sig !== qtySig) {
      qtySig = sig;
      drawerQtyActions.replaceChildren(qtyActions(d));
    }
  }
  undoBtn.disabled = false;
  redoBtn.disabled = false;
});
// Cuando el Worker termina de procesar una imagen, redibujar.
onProcessed(() => emit('design', 'list'));
window.addEventListener('resize', () => emit('view'));

/* ---------- Inicio ---------- */
let saved = 'hoja';
try {
  saved = localStorage.getItem('pines-rebeca.tab') ?? 'hoja';
} catch {
  /* sin almacenamiento */
}
showTab(tabs.some((t) => t.id === saved) ? saved : 'hoja');
emit('list', 'design', 'sizes', 'page');
// Volver a dibujar cuando terminen de cargar las fuentes incrustadas.
loadFonts().then(() => emit('design', 'list', 'view'));
