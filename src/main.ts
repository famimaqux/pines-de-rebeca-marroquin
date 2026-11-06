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
// Orbes de color del fondo (decoración)
document.body.prepend(...['b', 'r', 'y', 'g'].map((c) => h('div', { class: `orb ${c}`, 'aria-hidden': 'true' })));

/* ---------- Preferencias de la pantalla (se recuerdan) ---------- */
interface UiPrefs {
  left: boolean;
  right: boolean;
  leftW: number;
  rightW: number;
  /** pestaña del panel en pantallas medianas y celular */
  dock: 'tools' | 'editor';
}
const UI_KEY = 'pines-rebeca.ui.v2';
const ui: UiPrefs = { left: true, right: true, leftW: 330, rightW: 370, dock: 'tools' };
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
/** Pantalla mediana o celular: la hoja + un panel con pestañas (nada tapa la hoja). */
const isCompact = () => window.matchMedia('(max-width: 1180px)').matches;

/* ---------- Piezas ---------- */
const layers = createLayersPanel(); // panel izquierdo
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

const panelHead = (color: 'blue' | 'red' | 'green', ico: string, title: string, jp: string) =>
  h('div', { class: `panel-head ${color}` }, h('h2', {}, h('span', { class: 'ico', 'aria-hidden': 'true' }, ico), title), h('span', { class: 'jp', 'aria-hidden': 'true' }, jp));

/* ---------- Panel izquierdo: Herramientas ---------- */
const statusText = h('strong', { class: 'sel-text', 'aria-live': 'polite' });
const editBtn = h('button', { type: 'button', class: 'btn small primary', onclick: () => openEditor() }, '✎ Editar pin');
const selAllBtn = h('button', { type: 'button', class: 'btn small ghost', onclick: () => selectOnly(state.designs.map((d) => d.id)) }, 'Seleccionar todos');
const clearSelBtn = h('button', { type: 'button', class: 'btn small ghost', onclick: () => (state.selection.clear(), state.pinSel.clear(), emit('list', 'view')) }, 'Quitar selección');
const status = h('div', { class: 'side-status' }, statusText, h('div', { class: 'btn-row' }, editBtn, selAllBtn, clearSelBtn));

const sizesDlg = h('dialog', { class: 'dialog wide', 'aria-label': 'Medidas de los moldes' });
sizesDlg.append(createSizesPanel({ getSizes: () => state.sizes, setSizes }), h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn primary', onclick: () => sizesDlg.close() }, 'Cerrar')));
document.body.append(sizesDlg);

const blank = (txt: string) => h('p', { class: 'muted small need-target' }, txt);
const NEED = 'Toca uno o más pines en la hoja (o en “Tus diseños”) para cambiarlos.';

interface SideSection {
  id: string;
  icon: string;
  title: string;
  color: 'blue' | 'red' | 'yellow' | 'green';
  body: HTMLElement[];
  open?: boolean;
  design?: boolean;
}
const sections: SideSection[] = [
  { id: 'papel', icon: '📄', title: 'Papel', color: 'blue', body: [sheet.paperBox] },
  { id: 'imagenes', icon: '📷', title: 'Imágenes', color: 'red', body: [sheet.imagesBox], open: true },
  {
    id: 'tamano',
    icon: '⭕',
    title: 'Tamaño',
    color: 'yellow',
    body: [sheet.sizeBox, h('button', { type: 'button', class: 'btn ghost small full', onclick: () => sizesDlg.showModal() }, '📏 Editar medidas de los moldes')],
    open: true,
  },
  { id: 'fondo', icon: '🎨', title: 'Fondo', color: 'green', body: [blank(NEED), layers.parts.fondo], design: true },
  { id: 'borde', icon: '💍', title: 'Borde', color: 'blue', body: [blank(NEED), layers.parts.borde], design: true },
  { id: 'letras', icon: '🔤', title: 'Letras', color: 'red', body: [blank(NEED), layers.parts.texto], design: true },
  { id: 'stickers', icon: '⭐', title: 'Stickers', color: 'yellow', body: [blank(NEED), layers.parts.stickers], design: true },
  { id: 'color', icon: '🌈', title: 'Color de impresión', color: 'green', body: [blank(NEED), layers.parts.mejora], design: true },
  { id: 'acomodo', icon: '🧩', title: 'Acomodo', color: 'blue', body: [sheet.layoutBox] },
  { id: 'exportar', icon: '🖨', title: 'Imprimir / Exportar', color: 'green', body: [exportPanel] },
];
const sectionEls = sections.map((s) =>
  h(
    'details',
    { class: `side-sec sec${s.design ? ' design' : ''}`, open: !!s.open, 'data-id': s.id, 'data-color': s.color },
    h('summary', { class: 'sec-head' }, h('span', { class: 'left' }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, s.icon), s.title), h('span', { class: 'chev', 'aria-hidden': 'true' }, '▾')),
    h('div', { class: 'side-body sec-body' }, ...s.body),
  ),
);
const side = h(
  'aside',
  { class: 'sidebar left-panel panel', 'aria-label': 'Herramientas' },
  panelHead('blue', '🎨', 'Herramientas', '道具'),
  status,
  h('div', { class: 'side-sections panel-body' }, ...sectionEls),
);

/* ---------- Panel derecho: Tus diseños + Editor de pin ---------- */
const drawerQty = h('input', { type: 'number', min: 0, max: MAX_QTY, class: 'num', 'aria-label': 'Cantidad de este pin' });
drawerQty.addEventListener('change', () => {
  const d = current();
  if (!d) return;
  checkpoint();
  d.qty = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(drawerQty.value) || 0)));
  emit('list');
});
const drawerQtyActions = h('div', {});
const editorEmpty = h('div', { class: 'empty small' }, h('p', {}, '👆 Elige un diseño en “Tus diseños” o haz doble clic en un pin de la hoja para editarlo aquí.'));
const qtyBox = h('details', { class: 'more ed-qty' }, h('summary', {}, '🔢 Cantidad de este pin'), h('label', { class: 'mini inline' }, h('span', {}, 'Cantidad ×'), drawerQty), drawerQtyActions);
const editorBox = h('section', { class: 'right-editor', 'aria-label': 'Editor de pin' }, editorEmpty, editor.el, qtyBox);
const designsBox = h('section', { class: 'right-designs' }, strip);
const foldBtn = h('button', { type: 'button', class: 'btn-icon fold', 'aria-expanded': 'true', 'aria-label': 'Plegar o desplegar “Tus diseños”', title: 'Plegar / desplegar' }, '▾');
foldBtn.addEventListener('click', () => {
  const folded = designsBox.classList.toggle('collapsed');
  foldBtn.setAttribute('aria-expanded', String(!folded));
  foldBtn.textContent = folded ? '▸' : '▾';
});
strip.querySelector('.strip-head')?.prepend(foldBtn);
const rightScroll = h('div', { class: 'right-scroll' }, designsBox, editorBox);
const right = h('aside', { class: 'right-panel panel', 'aria-label': 'Tus diseños y editor de pin' }, panelHead('red', '✎', 'Editor de pin', '編集'), rightScroll);

/* ---------- Centro: la hoja ---------- */
const leftBtn = h('button', { type: 'button', class: 'toolbar-pill panel-btn', title: 'Mostrar u ocultar las herramientas', 'aria-pressed': 'true', onclick: () => setPanel('left', !ui.left) }, '☰ Herramientas');
const rightBtn = h('button', { type: 'button', class: 'toolbar-pill panel-btn', title: 'Mostrar u ocultar el editor', 'aria-pressed': 'true', onclick: () => setPanel('right', !ui.right) }, 'Editor ☰');
const onlyBtn = h(
  'button',
  {
    type: 'button',
    class: 'toolbar-pill panel-btn',
    title: 'Ocultar las dos barras',
    onclick: () => {
      const both = ui.left || ui.right;
      ui.left = !both;
      ui.right = !both;
      saveUi();
      applyLayout();
      emit('view');
    },
  },
  '⛶ Solo hoja',
);
const nav = sheet.el.querySelector('.sheet-nav')!;
nav.classList.add('sheet-toolbar');
nav.prepend(leftBtn);
nav.append(h('span', { class: 'spacer' }), onlyBtn, rightBtn);
const center = h('div', { class: 'main-area sheet-col' }, sheet.el, sheet.summary);

/* ---------- Pestañas del panel (pantalla mediana y celular) ---------- */
const dockTabs = h('div', { class: 'dock-tabs', role: 'tablist', 'aria-label': 'Panel' });
const dockBtn = (id: UiPrefs['dock'], label: string) =>
  h('button', { type: 'button', role: 'tab', class: 'toolbar-pill', 'aria-selected': 'false', onclick: () => setDock(id) }, label);
const dockTools = dockBtn('tools', '🎨 Herramientas');
const dockEditor = dockBtn('editor', '✎ Diseños y editor');
dockTabs.append(dockTools, dockEditor);
function setDock(id: UiPrefs['dock']) {
  ui.dock = id;
  saveUi();
  applyLayout();
}

/* ---------- Bordes para ensanchar ---------- */
const mkResizer = (which: 'left' | 'right') => {
  const r = h('div', { class: `resizer ${which}`, role: 'separator', 'aria-orientation': 'vertical', 'aria-label': which === 'left' ? 'Ensanchar las herramientas' : 'Ensanchar el editor', tabindex: 0 });
  let start: { x: number; w: number } | null = null;
  r.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, w: which === 'left' ? ui.leftW : ui.rightW };
    r.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
  });
  r.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const w = Math.round(Math.min(620, Math.max(280, start.w + (which === 'left' ? dx : -dx))));
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
    if (which === 'left') ui.leftW = Math.min(620, Math.max(280, ui.leftW + k));
    else ui.rightW = Math.min(620, Math.max(280, ui.rightW - k));
    applyLayout();
    saveUi();
  });
  return r;
};
const resL = mkResizer('left');
const resR = mkResizer('right');

const workspace = h('div', { class: 'workspace three' }, side, resL, center, resR, right, dockTabs);
app.replaceChildren(workspace);

/* ---------- Mostrar / ocultar paneles ---------- */
function setPanel(which: 'left' | 'right', open: boolean) {
  if (isCompact()) {
    setDock(which === 'left' ? 'tools' : 'editor');
    return;
  }
  if (which === 'left') ui.left = open;
  else ui.right = open;
  saveUi();
  applyLayout();
  emit('view');
}
function applyLayout() {
  const compact = isCompact();
  workspace.classList.toggle('compact', compact);
  if (compact) {
    workspace.style.gridTemplateColumns = '';
    side.hidden = ui.dock !== 'tools';
    right.hidden = ui.dock !== 'editor';
    resL.hidden = resR.hidden = true;
  } else {
    workspace.style.gridTemplateColumns = `${ui.left ? ui.leftW : 0}px ${ui.left ? 14 : 0}px minmax(0, 1fr) ${ui.right ? 14 : 0}px ${ui.right ? ui.rightW : 0}px`;
    side.hidden = !ui.left;
    right.hidden = !ui.right;
    resL.hidden = !ui.left;
    resR.hidden = !ui.right;
  }
  dockTabs.hidden = !compact;
  dockTools.setAttribute('aria-selected', String(ui.dock === 'tools'));
  dockEditor.setAttribute('aria-selected', String(ui.dock === 'editor'));
  leftBtn.hidden = rightBtn.hidden = onlyBtn.hidden = compact;
  leftBtn.setAttribute('aria-pressed', String(ui.left));
  rightBtn.setAttribute('aria-pressed', String(ui.right));
  onlyBtn.setAttribute('aria-pressed', String(!ui.left && !ui.right));
}
window.addEventListener('resize', () => {
  applyLayout();
  emit('view');
});
applyLayout();

/* ---------- Abrir el editor (doble clic o "Editar") ---------- */
function openEditor() {
  const d = current();
  if (!d) return toast('Primero toca un pin en la hoja o en “Tus diseños”');
  if (!state.selection.has(d.id)) state.selection = new Set([d.id]);
  state.editorOpen = true;
  if (isCompact()) setDock('editor');
  else if (!ui.right) setPanel('right', true);
  emit('view', 'design', 'list');
  // El editor se muestra en su panel: la hoja NO se tapa ni se mueve.
  requestAnimationFrame(() => rightScroll.scrollTo({ top: Math.max(0, editorBox.offsetTop - 8), behavior: 'smooth' }));
}

/* ---------- Encabezado: deshacer, rehacer, ayuda ---------- */
document.getElementById('hdr-undo')?.addEventListener('click', () => undo() || toast('Nada que deshacer'));
document.getElementById('hdr-redo')?.addEventListener('click', () => redo() || toast('Nada que rehacer'));
const helpDlg = h(
  'dialog',
  { class: 'dialog', 'aria-labelledby': 'help-title' },
  h('h2', { id: 'help-title' }, '✨ Cómo se usa'),
  h(
    'ol',
    { class: 'help-list' },
    h('li', {}, 'Elige el papel y el tamaño de pin (a la izquierda).'),
    h('li', {}, '“📷 Agregar imágenes”: cada foto aparece como un pin en la hoja y se acomoda sola.'),
    h('li', {}, 'Toca uno o varios pines y cámbiales fondo, borde o letras con un clic.'),
    h('li', {}, 'Doble clic en un pin: se abre su editor a la derecha (mover la foto, quitar fondo, varita…).'),
    h('li', {}, 'Arrastra los pines para moverlos; quedan fijados 📌.'),
    h('li', {}, '“🖨 Imprimir / Exportar”: guarda el PDF e imprime al 100 % (Tamaño real).'),
  ),
  h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn primary', onclick: () => helpDlg.close() }, '¡Entendido!')),
);
document.body.append(helpDlg);
document.getElementById('hdr-help')?.addEventListener('click', () => helpDlg.showModal());

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
  const showEditor = !!d && (n > 0 || state.editorOpen);
  editorEmpty.hidden = showEditor;
  editor.el.hidden = !showEditor;
  qtyBox.hidden = !showEditor;
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
