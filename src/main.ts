import './style.css';
import './v3.css';
import { loadFonts } from './fonts';
import { onProcessed } from './image/processor';
import { currentLayout } from './layout/current';
import { refreshFill, setFill, setFillOptions } from './layout/fillCtl';
import { isMessy, resetArrangement, setMode } from './layout/pinOps';
import { MAX_QTY, shortName } from './layout/sheets';
import { setSizeLookup } from './model/styleCopy';
import { checkpoint, current, emit, redo, setSheetIdsProvider, setSizes, sizeById, state, subscribe, undo } from './state';
import { applyWithScope } from './ui/applyScope';
import { h } from './ui/dom';
import { createDesignsStrip } from './ui/designsList';
import { createEditor } from './ui/editor';
import { createExportPanel, exportActions } from './ui/exportPanel';
import { icon, iconEl } from './ui/icons';
import { createLayersPanel } from './ui/layersPanel';
import { renderThumb } from './ui/preview';
import { createPrintView } from './ui/printView';
import { imagesFor } from './ui/resources';
import { createSheetView, qtyActions, summaryText } from './ui/sheetView';
import { createSizeList } from './ui/sizeList';
import { createSizesPanel } from './ui/sizesPanel';
import { toast } from './ui/toast';

setSizeLookup(sizeById);
setSheetIdsProvider(() => new Set((currentLayout().pages[state.sheet]?.items ?? []).map((i) => i.designId)));

const app = document.querySelector<HTMLElement>('#app')!;
document.body.classList.add('workspace-mode', 'v3');
document.querySelector('.app-header')?.remove(); // sin cabecera: el título va en el panel

/* ---------- Preferencias (se recuerdan en el navegador) ---------- */
type Tool = 'papel' | 'imagenes' | 'tamano' | 'fondo' | 'borde' | 'letras' | 'stickers' | 'color' | 'acomodo' | 'imprimir';
interface UiPrefs {
  left: boolean;
  right: boolean;
  bar: boolean;
  solo: boolean;
  tool: Tool;
}
const UI_KEY = 'pines-rebeca.ui.v3';
const ui: UiPrefs = { left: true, right: true, bar: true, solo: false, tool: 'tamano' };
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
/** Tableta y celular: riel abajo y paneles como hojas deslizables. */
const isCompact = () => window.matchMedia('(max-width: 1024px)').matches;
/** En tableta/celular los paneles empiezan cerrados. */
let sheetOpen: 'left' | 'right' | null = null;

/* ---------- Piezas ---------- */
const layers = createLayersPanel();
const edLayers = createLayersPanel({ idPrefix: 'ed-' });
const editor = createEditor([
  { id: 'image', label: 'Imagen', content: [edLayers.parts.imagen, h('h3', { class: 'sub' }, 'Ajustes de quitar fondo'), edLayers.parts.quitar, h('h3', { class: 'sub' }, 'Color de impresión'), edLayers.parts.mejora] },
  { id: 'bg', label: 'Fondo', content: [edLayers.parts.fondo, h('h3', { class: 'sub' }, 'Patrón'), edLayers.parts.patron, h('h3', { class: 'sub' }, 'Borde'), edLayers.parts.borde] },
  { id: 'text', label: 'Letras', content: [edLayers.parts.texto] },
  { id: 'sticker', label: 'Sticker', content: [edLayers.parts.stickers] },
]);
const sheet = createSheetView({ openEditor });
const strip = createDesignsStrip({ openEditor });
const exportPanel = createExportPanel();
const printView = createPrintView();

const sizesDlg = h('dialog', { class: 'dialog wide', 'aria-label': 'Medidas de los moldes' });
sizesDlg.append(createSizesPanel({ getSizes: () => state.sizes, setSizes }), h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn primary', onclick: () => sizesDlg.close() }, 'Cerrar')));
document.body.append(sizesDlg);

const iconBtn = (ico: string, label: string, onclick: () => void, cls = 'tb-btn', showLabel = true) => {
  const b = h('button', { type: 'button', class: cls, title: label, 'aria-label': label, onclick });
  b.innerHTML = icon(ico, 18) + (showLabel ? `<span>${label}</span>` : '');
  return b;
};

/* ---------- "Llenar hoja" (se usa en Acomodo y en la barra de abajo) ---------- */
function fillControls(): { el: HTMLElement; refresh: () => void } {
  const sw = h('input', { type: 'checkbox', role: 'switch', class: 'switch' });
  sw.addEventListener('change', () => {
    setFill(sw.checked);
    toast(sw.checked ? 'Hoja llena: los diseños se repiten hasta cubrir la hoja' : 'Volvieron las cantidades que tenías antes');
  });
  const mode = (v: 'equal' | 'proportional', label: string) => {
    const r = h('input', { type: 'radio', name: `fill-mode-${Math.random()}`, value: v });
    r.addEventListener('change', () => setFillOptions({ mode: v }));
    return { r, el: h('label', { class: 'radio' }, r, ' ', label) };
  };
  const eq = mode('equal', 'En partes iguales');
  const pr = mode('proportional', 'Según mis cantidades');
  pr.r.name = eq.r.name;
  const scopeSel = h('select', { 'aria-label': 'Cuántas hojas llenar' }, h('option', { value: '1' }, 'Esta hoja'), ...[2, 3, 4, 5, 6, 8, 10].map((n) => h('option', { value: String(n) }, `${n} hojas`)));
  scopeSel.addEventListener('change', () => setFillOptions({ sheets: Number(scopeSel.value) }));
  const el = h(
    'div',
    { class: 'fill-box' },
    h('label', { class: 'switch-row' }, h('span', {}, h('strong', {}, 'Llenar hoja'), h('small', {}, 'Repite tus diseños hasta cubrir la hoja')), sw),
    h('div', { class: 'fill-opts' }, h('span', { class: 'label' }, 'Reparto'), eq.el, pr.el, h('span', { class: 'label' }, 'Alcance'), scopeSel),
  );
  return {
    el,
    refresh: () => {
      sw.checked = state.fill.on;
      eq.r.checked = state.fill.mode === 'equal';
      pr.r.checked = state.fill.mode === 'proportional';
      scopeSel.value = String(state.fill.sheets);
    },
  };
}
const fillA = fillControls();
const fillB = fillControls();

/* ---------- "Ordenar" ---------- */
function ordenarBox(): HTMLElement {
  return h(
    'div',
    { class: 'order-box' },
    h('button', { type: 'button', class: 'btn primary full', onclick: () => doOrder('sheet') }, 'Ordenar solo esta hoja'),
    h('button', { type: 'button', class: 'btn ghost full', onclick: () => doOrder('all') }, 'Ordenar todas las hojas'),
    h('p', { class: 'muted small' }, 'Vuelve a acomodar los pines en orden automático y suelta los fijados. Ctrl+Z lo deshace.'),
  );
}
function doOrder(scope: 'sheet' | 'all') {
  resetArrangement(scope);
  closePopover();
  toast(scope === 'sheet' ? 'Hoja ordenada (Ctrl+Z para deshacer)' : 'Todas las hojas ordenadas (Ctrl+Z para deshacer)');
}

/* ---------- Panel izquierdo: una herramienta a la vez ---------- */
const toolInfo: Record<Tool, { label: string; ico: string; title: string }> = {
  papel: { label: 'Papel', ico: 'papel', title: 'Papel' },
  imagenes: { label: 'Imágenes', ico: 'imagenes', title: 'Imágenes' },
  tamano: { label: 'Tamaño', ico: 'tamano', title: 'Tamaño de pin' },
  fondo: { label: 'Fondo', ico: 'fondo', title: 'Fondo' },
  borde: { label: 'Borde', ico: 'borde', title: 'Borde / modelo de círculo' },
  letras: { label: 'Letras', ico: 'letras', title: 'Letras' },
  stickers: { label: 'Stickers', ico: 'stickers', title: 'Stickers' },
  color: { label: 'Color', ico: 'color', title: 'Color de impresión' },
  acomodo: { label: 'Acomodo', ico: 'acomodo', title: 'Acomodo' },
  imprimir: { label: 'Imprimir', ico: 'imprimir', title: 'Imprimir y exportar' },
};
const NEED = 'Toca uno o más pines en la hoja (o en “Tus diseños”) para cambiarlos.';
const blank = () => h('p', { class: 'need-target' }, NEED);
const repLabel = sheet.el.querySelector('.sheet-nav label.mini');
const toolContent: Record<Tool, HTMLElement[]> = {
  papel: [sheet.paperBox],
  imagenes: [sheet.imagesBox, blank(), layers.parts.imagen, layers.parts.quitar],
  tamano: [createSizeList(), h('button', { type: 'button', class: 'link-btn', onclick: () => sizesDlg.showModal() }, 'Editar medidas de los moldes')],
  fondo: [blank(), layers.parts.fondo, h('h3', { class: 'sub' }, 'Patrón'), layers.parts.patron],
  borde: [blank(), layers.parts.borde],
  letras: [blank(), layers.parts.texto],
  stickers: [blank(), layers.parts.stickers],
  color: [blank(), layers.parts.mejora],
  acomodo: [sheet.layoutBox, fillA.el, h('h3', { class: 'sub' }, 'Ordenar de nuevo'), ordenarBox(), ...(repLabel ? [h('h3', { class: 'sub' }, 'Copias de esta hoja'), repLabel as HTMLElement] : [])],
  imprimir: [h('button', { type: 'button', class: 'btn primary full', onclick: () => printView.open() }, 'Vista de impresión'), exportPanel],
};
const toolBody = h('div', { class: 'tool-body' });
const toolTitle = h('h2', { class: 'tool-title' });
const toolPanes = Object.fromEntries(
  (Object.keys(toolContent) as Tool[]).map((t) => [t, h('div', { class: `tool-pane${['fondo', 'borde', 'letras', 'stickers', 'color', 'imagenes'].includes(t) ? ' design' : ''}`, 'data-tool': t, hidden: true }, ...toolContent[t])]),
) as unknown as Record<Tool, HTMLElement>;
toolBody.append(...Object.values(toolPanes));

const selThumb = h('canvas', { class: 'sel-thumb', 'aria-hidden': 'true' });
const selTitle = h('strong', {});
const selSub = h('span', {});
const selCard = h('div', { class: 'sel-card' }, selThumb, h('div', {}, selTitle, selSub));

const applyBtns = (['selected', 'sheet', 'all', 'custom'] as const).map((k) =>
  h(
    'button',
    {
      type: 'button',
      class: 'apply-btn',
      'aria-pressed': 'false',
      onclick: async () => {
        state.applyTo = k;
        emit('view', 'list');
        if (k === 'custom') {
          const n = await applyWithScope({ title: 'Elige a qué pines van los cambios (Personalizado)', ask: true, apply: () => {} });
          if (!n && !state.customIds.size) {
            state.applyTo = 'selected';
            emit('view', 'list');
          }
        }
      },
    },
    { selected: 'Seleccionados', sheet: 'Toda la hoja', all: 'Todas las hojas', custom: 'Personalizado' }[k],
  ),
);
const applyBar = h('div', { class: 'apply-bar' }, h('span', { class: 'label' }, 'Aplicar a'), h('div', { class: 'apply-grid' }, ...applyBtns));

const closeLeft = iconBtn('close', 'Cerrar', () => setSheet(null), 'icon-only sheet-close', false);
const lpanel = h(
  'aside',
  { class: 'lpanel', 'aria-label': 'Herramienta' },
  h('div', { class: 'brand2' }, h('h1', {}, 'Pines de ', h('span', {}, 'Rebeca Marroquín')), h('p', {}, 'Estudio de pines · Epson L8050'), closeLeft),
  selCard,
  h('div', { class: 'tool-scroll' }, toolTitle, toolBody),
  applyBar,
);

/* ---------- Riel de íconos ---------- */
const logoBtn = h('button', { type: 'button', class: 'rail-logo', title: 'Mostrar u ocultar el panel', 'aria-label': 'Mostrar u ocultar el panel', onclick: () => setPanel('left', !panelOpen('left')) });
logoBtn.innerHTML = icon('heart', 22);
const railBtns = (Object.keys(toolInfo) as Tool[]).map((t) => {
  const b = h('button', { type: 'button', class: 'rail-btn', 'aria-pressed': 'false', 'data-tool': t, onclick: () => pickTool(t) });
  b.innerHTML = `${icon(toolInfo[t].ico, 22)}<span>${toolInfo[t].label}</span>`;
  return b;
});
const railDesigns = h('button', { type: 'button', class: 'rail-btn rail-designs', 'aria-pressed': 'false', onclick: () => setSheet(sheetOpen === 'right' ? null : 'right') });
railDesigns.innerHTML = `${icon('disenos', 22)}<span>Diseños</span>`;
const menuBtn = h('button', { type: 'button', class: 'rail-btn rail-menu', title: 'Más', 'aria-label': 'Más opciones' });
menuBtn.innerHTML = icon('menu', 22);
menuBtn.addEventListener('click', () =>
  openPopover(
    menuBtn,
    h(
      'div',
      { class: 'menu-list' },
      h('button', { type: 'button', onclick: () => (closePopover(), sizesDlg.showModal()) }, 'Medidas de los moldes'),
      h('button', { type: 'button', onclick: () => (closePopover(), printView.open()) }, 'Vista de impresión'),
      h('button', { type: 'button', onclick: () => (closePopover(), helpDlg.showModal()) }, 'Ayuda'),
    ),
  ),
);
const rail = h('nav', { class: 'rail', 'aria-label': 'Herramientas' }, logoBtn, ...railBtns, railDesigns, h('span', { class: 'rail-spacer' }), menuBtn);

function pickTool(t: Tool) {
  if (isCompact() && sheetOpen === 'left' && ui.tool === t) return setSheet(null);
  ui.tool = t;
  saveUi();
  if (isCompact()) setSheet('left');
  else if (!ui.left || ui.solo) {
    ui.left = true;
    ui.solo = false;
  }
  applyLayout();
  emit('view');
}

/* ---------- Centro: barra flotante de arriba ---------- */
const nav = sheet.el.querySelector('.sheet-nav')!;
const pageRow = nav.querySelector('.row')!;
const zoomBox = nav.querySelector('.zoom')!;
const finishedLbl = nav.querySelector('.finished-chk')!;
const [prevB, , nextB] = [...pageRow.children] as HTMLElement[];
prevB.innerHTML = icon('left', 18);
nextB.innerHTML = icon('right', 18);
const zb = zoomBox.querySelectorAll('button');
zb[0].innerHTML = icon('minus', 16);
zb[1].innerHTML = icon('plus', 16);
// "Regla" y "Ver terminados" como botones-interruptor con ícono (el nombre se oculta si falta espacio)
const asToggle = (lbl: Element | null, ico: string, text: string) => {
  if (!lbl) return;
  const inp = lbl.querySelector('input')!;
  const ic = h('span', { class: 'tb-ico', 'aria-hidden': 'true' });
  ic.innerHTML = icon(ico, 18);
  lbl.replaceChildren(inp, ic, h('span', { class: 'tb-lbl' }, text));
  lbl.setAttribute('title', text);
};
asToggle(zoomBox.querySelector('label.check'), 'ruler', 'Regla');
asToggle(finishedLbl, 'eye', 'Ver terminados');
const soloBtn = iconBtn('expand', 'Solo hoja', () => setSolo(!ui.solo), 'tb-btn');
const undoBtn = iconBtn('undo', 'Deshacer', () => undo() || toast('Nada que deshacer'), 'tb-btn icon-only', false);
const redoBtn = iconBtn('redo', 'Rehacer', () => redo() || toast('Nada que rehacer'), 'tb-btn icon-only', false);
const printBtn = h('button', { type: 'button', class: 'tb-btn pink', onclick: () => printView.open() }, 'Vista de impresión');
const topbar = h('div', { class: 'topbar' }, pageRow, h('span', { class: 'tb-sep' }), zoomBox, finishedLbl, soloBtn, h('span', { class: 'tb-sep' }), undoBtn, redoBtn, printBtn);
nav.replaceWith(topbar);

/* ---------- Centro: barra oscura de abajo ---------- */
const sumText = h('span', { class: 'bb-sum' });
const addB = iconBtn('plus', 'Agregar imágenes', () => document.getElementById('add-files')?.click(), 'bb-btn pink', false);
addB.insertAdjacentHTML('beforeend', '<b class="lg">Agregar imágenes</b><b class="sh">Agregar</b>');
const sizeB = h('button', { type: 'button', class: 'bb-btn' });
sizeB.addEventListener('click', () => openPopover(sizeB, h('div', { class: 'pop-size' }, createSizeList(() => closePopover()))));
const acomodoB = h('button', { type: 'button', class: 'bb-btn' }, 'Acomodo ▾');
acomodoB.addEventListener('click', () => {
  const mk = (v: 'auto' | 'grid' | 'free', label: string) =>
    h('button', { type: 'button', class: 'apply-btn', 'aria-pressed': String(state.page.algo === v || (v === 'auto' && state.page.algo === 'hex')), onclick: () => (setMode(v), closePopover()) }, label);
  openPopover(acomodoB, h('div', { class: 'pop-acomodo' }, h('span', { class: 'label' }, 'Modo'), h('div', { class: 'apply-grid three' }, mk('auto', 'Automático'), mk('grid', 'Cuadrícula'), mk('free', 'Libre')), fillB.el));
});
const fillB2 = h('button', { type: 'button', class: 'bb-btn', 'aria-pressed': 'false', onclick: () => setFill(!state.fill.on) });
const orderB = h('button', { type: 'button', class: 'bb-btn' });
orderB.innerHTML = `${icon('sort', 18)}<span>Ordenar</span>`;
orderB.addEventListener('click', () => openPopover(orderB, ordenarBox()));
const pdfB = iconBtn('download', 'PDF', () => exportActions.pdf(), 'bb-btn');
const hideBarB = iconBtn('down', 'Ocultar barra', () => setBar(false), 'bb-btn icon-only', false);
const bottombar = h('div', { class: 'bottombar' }, h('span', { class: 'bb-dot' }), sumText, addB, sizeB, acomodoB, fillB2, orderB, pdfB, hideBarB);
const showBarPill = h('button', { type: 'button', class: 'show-bar', onclick: () => setBar(true) });
const center = h('div', { class: 'center' }, sheet.el, topbar, bottombar, showBarPill);

/* ---------- Panel derecho ---------- */
const designsCount = h('span', { class: 'muted small' });
const hideRight = iconBtn('right', 'Ocultar panel', () => setPanel('right', false), 'icon-only round', false);
const closeRight = iconBtn('close', 'Cerrar', () => setSheet(null), 'icon-only sheet-close', false);
const drawerQty = h('input', { type: 'number', min: 0, max: MAX_QTY, class: 'num', 'aria-label': 'Cantidad de este pin' });
drawerQty.addEventListener('change', () => {
  const d = current();
  if (!d) return;
  checkpoint();
  d.qty = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(drawerQty.value) || 0)));
  emit('list');
});
const drawerQtyActions = h('div', {});
const edName = h('span', { class: 'muted small' });
const editorEmpty = h('div', { class: 'empty small' }, h('p', {}, 'Elige un diseño arriba o haz doble clic en un pin de la hoja para editarlo aquí.'));
const qtyBox = h('details', { class: 'more ed-qty' }, h('summary', {}, 'Cantidad de este pin'), h('label', { class: 'mini inline' }, h('span', {}, 'Cantidad ×'), drawerQty), drawerQtyActions);
const editorBox = h('section', { class: 'right-editor', 'aria-label': 'Editor de pin' }, h('div', { class: 'rp-head' }, h('h2', {}, 'Editor de pin'), edName), editorEmpty, editor.el, qtyBox);
const rpanel = h(
  'aside',
  { class: 'rpanel', 'aria-label': 'Tus diseños y editor de pin' },
  h('div', { class: 'rp-head top' }, h('h2', {}, 'Tus diseños'), designsCount, h('span', { class: 'spacer' }), hideRight, closeRight),
  h('div', { class: 'rp-scroll' }, h('section', { class: 'right-designs' }, strip), editorBox),
);
const rtab = h('button', { type: 'button', class: 'rtab', onclick: () => setPanel('right', true) }, 'Diseños y editor');

const scrim = h('div', { class: 'scrim', hidden: true, onclick: () => setSheet(null) });
const shell = h('div', { class: 'shell' }, rail, lpanel, center, rpanel, rtab, scrim);
app.replaceChildren(shell);

/* ---------- Popover sencillo ---------- */
let pop: HTMLElement | null = null;
function closePopover() {
  pop?.remove();
  pop = null;
}
function openPopover(anchor: HTMLElement, content: HTMLElement) {
  if (pop) {
    const same = pop.dataset.for === anchor.textContent;
    closePopover();
    if (same) return;
  }
  pop = h('div', { class: 'popover2', role: 'dialog' }, content);
  pop.dataset.for = anchor.textContent ?? '';
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  const up = r.top > window.innerHeight / 2;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pr.width - 8, r.left))}px`;
  pop.style.top = up ? `${Math.max(8, r.top - pr.height - 8)}px` : `${r.bottom + 8}px`;
  fillA.refresh();
  fillB.refresh();
}
document.addEventListener('pointerdown', (e) => {
  if (pop && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest('.bb-btn, .rail-menu')) closePopover();
});

/* ---------- Mostrar / ocultar ---------- */
function panelOpen(which: 'left' | 'right'): boolean {
  if (isCompact()) return sheetOpen === which;
  return !ui.solo && (which === 'left' ? ui.left : ui.right);
}
function setPanel(which: 'left' | 'right', open: boolean) {
  if (isCompact()) return setSheet(open ? which : null);
  ui.solo = false;
  if (which === 'left') ui.left = open;
  else ui.right = open;
  saveUi();
  applyLayout();
  emit('view');
}
function setSheet(which: 'left' | 'right' | null) {
  sheetOpen = which;
  applyLayout();
  emit('view');
}
function setBar(show: boolean) {
  ui.bar = show;
  if (show) ui.solo = false;
  saveUi();
  applyLayout();
  emit('view');
}
/** "Solo hoja": oculta los dos paneles y la barra de abajo; el mismo botón los vuelve a mostrar. */
function setSolo(on: boolean) {
  ui.solo = on;
  if (!on) ui.left = ui.right = ui.bar = true;
  saveUi();
  applyLayout();
  emit('view');
}
function applyLayout() {
  const compact = isCompact();
  shell.classList.toggle('compact', compact);
  shell.classList.toggle('solo', ui.solo);
  const leftOn = compact ? sheetOpen === 'left' : !ui.solo && ui.left;
  const rightOn = compact ? sheetOpen === 'right' : !ui.solo && ui.right;
  shell.classList.toggle('no-left', !leftOn);
  shell.classList.toggle('no-right', !rightOn);
  lpanel.hidden = !leftOn;
  rpanel.hidden = !rightOn;
  rtab.hidden = compact || rightOn || ui.solo;
  scrim.hidden = !(compact && sheetOpen);
  bottombar.hidden = ui.solo || !ui.bar;
  showBarPill.hidden = ui.solo || ui.bar;
  center.classList.toggle('bar-off', !ui.bar);
  soloBtn.setAttribute('aria-pressed', String(ui.solo));
  for (const [t, pane] of Object.entries(toolPanes)) pane.hidden = t !== ui.tool;
  toolTitle.textContent = toolInfo[ui.tool].title;
  railBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === ui.tool && leftOn)));
  railDesigns.setAttribute('aria-pressed', String(compact && sheetOpen === 'right'));
}
window.addEventListener('resize', () => {
  applyLayout();
  emit('view');
});

/* ---------- Abrir el editor ---------- */
function openEditor() {
  const d = current();
  if (!d) return toast('Primero toca un pin en la hoja o en “Tus diseños”');
  if (!state.selection.has(d.id)) state.selection = new Set([d.id]);
  state.editorOpen = true;
  if (isCompact()) setSheet('right');
  else if (!panelOpen('right')) setPanel('right', true);
  emit('view', 'design', 'list');
  const sc = rpanel.querySelector<HTMLElement>('.rp-scroll');
  requestAnimationFrame(() => sc?.scrollTo({ top: Math.max(0, editorBox.offsetTop - 8), behavior: 'smooth' }));
}

/* ---------- Ayuda ---------- */
const helpDlg = h(
  'dialog',
  { class: 'dialog', 'aria-labelledby': 'help-title' },
  h('h2', { id: 'help-title' }, 'Cómo se usa'),
  h(
    'ol',
    { class: 'help-list' },
    h('li', {}, 'Elige el papel y el tamaño de pin en el riel de la izquierda.'),
    h('li', {}, '“Agregar imágenes”: cada foto aparece como un pin y se acomoda sola.'),
    h('li', {}, 'Toca uno o varios pines y cámbiales fondo, borde o letras. “Aplicar a” decide a qué pines va el cambio.'),
    h('li', {}, 'Doble clic en un pin: se abre su editor a la derecha.'),
    h('li', {}, 'Arrastra los pines para moverlos; “Ordenar” los vuelve a acomodar.'),
    h('li', {}, '“Vista de impresión”: imprime al 100 % (Tamaño real) o guarda el PDF.'),
  ),
  h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn primary', onclick: () => helpDlg.close() }, '¡Entendido!')),
);
document.body.append(helpDlg);

/* ---------- Atajos de teclado ---------- */
document.addEventListener('keydown', (e) => {
  const tgt = e.target as HTMLElement;
  if (e.key === 'Escape') closePopover();
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
const applyLabels: Record<string, string> = {
  selected: '',
  sheet: 'los cambios van a toda la hoja',
  all: 'los cambios van a todas las hojas',
  custom: 'los cambios van a los pines elegidos',
};
subscribe(() => {
  // "Llenar hoja": si se agregaron o quitaron diseños, recalcular.
  if (refreshFill()) return;
  const d = current();
  const n = state.selection.size;
  const idx = d ? state.designs.indexOf(d) + 1 : 0;
  const pins = state.designs.filter((x) => state.selection.has(x.id)).reduce((a, x) => a + x.qty, 0);
  selTitle.textContent = n ? (n === 1 ? `${pins} pin${pins === 1 ? '' : 'es'} seleccionado${pins === 1 ? '' : 's'}` : `${n} diseños seleccionados · ${pins} pines`) : 'Nada seleccionado';
  selSub.textContent = state.applyTo !== 'selected' ? applyLabels[state.applyTo] : n === 1 && d ? `Diseño ${idx} · los cambios van a este pin` : n > 1 ? 'los cambios van a estos pines' : 'toca un pin de la hoja';
  if (d) renderThumb(selThumb, d, sizeById(d.sizeId), imagesFor(d), 34);
  selThumb.hidden = !d;
  shell.classList.toggle('no-target', !n && state.applyTo === 'selected');
  applyBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['selected', 'sheet', 'all', 'custom'][i] === state.applyTo)));
  // barra de abajo
  const sumParts = summaryText().replace(/ en la última hoja/, '').split(' · ');
  sumText.replaceChildren(...sumParts.map((t, i) => h('b', { class: i === 1 && sumParts.length > 2 ? 'lg' : '' }, `${i ? ' · ' : ''}${t}`)));
  sumText.title = sumParts.join(' · ');
  sizeB.innerHTML = `<b class="lg">Tamaño: </b>${shortName(sizeById(d?.sizeId ?? state.defSizeId))} ▾`;
  fillB2.innerHTML = `${icon('fill', 18)}<b>Llenar hoja<b class="lg">: ${state.fill.on ? 'Sí' : 'No'}</b></b>`;
  fillB2.setAttribute('aria-pressed', String(state.fill.on));
  orderB.classList.toggle('warn-on', isMessy());
  orderB.title = isMessy() ? 'La hoja está desordenada (pines movidos a mano): toca para ordenar' : 'Ordenar la hoja';
  const total = currentLayout().total;
  showBarPill.innerHTML = `${icon('up', 16)}<span>Mostrar barra · ${total} pin${total === 1 ? '' : 'es'}</span>`;
  // panel derecho
  designsCount.textContent = `${state.designs.length} diseño${state.designs.length === 1 ? '' : 's'} · ${total} pines`;
  edName.textContent = d ? `Diseño ${idx}` : '';
  const showEditor = !!d && (n > 0 || state.editorOpen);
  editorEmpty.hidden = showEditor;
  editor.el.hidden = !showEditor;
  qtyBox.hidden = !showEditor;
  fillA.refresh();
  fillB.refresh();
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
onProcessed(() => emit('design', 'list'));

/* ---------- Inicio ---------- */
applyLayout();
emit('list', 'design', 'sizes', 'page', 'view');
loadFonts().then(() => emit('design', 'list', 'view'));
void iconEl; // (disponible para otros módulos)

// Solo para pruebas automáticas: con "?debug" en la dirección se puede leer el acomodo.
if (new URLSearchParams(location.search).has('debug')) {
  void Promise.all([import('./layout/current'), import('./ui/wand')]).then(([m, w]) => {
    (window as unknown as Record<string, unknown>).__pines = { state, layout: () => m.currentLayout(), wand: w.wand };
  });
}
