import './style.css';
import { loadFonts } from './fonts';
import { newDesign, newSticker } from './model/design';
import { applyPreset } from './model/presets';
import { onProcessed } from './image/processor';
import { emit, redo, setSizes, state, subscribe, undo } from './state';
import { h } from './ui/dom';
import { createDesignsList } from './ui/designsList';
import { createEditor } from './ui/editor';
import { createLayersPanel } from './ui/layersPanel';
import { createSizesPanel } from './ui/sizesPanel';
import { toast } from './ui/toast';

/* ---------- Pestañas ---------- */
interface Tab {
  id: string;
  label: string;
  panel: HTMLElement;
}

const app = document.querySelector<HTMLElement>('#app')!;

const layers = createLayersPanel();
const editor = createEditor();
const designsList = createDesignsList();

const designTab = h(
  'div',
  { class: 'design-grid' },
  designsList,
  editor.el,
  h('section', { class: 'card layers-card', 'aria-labelledby': 'layers-title' }, h('h2', { id: 'layers-title' }, 'Capas del pin'), layers.el),
);

const sizesTab = h('div', { class: 'stack' }, createSizesPanel({ getSizes: () => state.sizes, setSizes }));

const tabs: Tab[] = [
  { id: 'disenar', label: '🎨 Diseñar', panel: designTab },
  { id: 'medidas', label: '📏 Medidas', panel: sizesTab },
];

const tabBar = h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Secciones' });
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
app.replaceChildren(tabBar, ...tabs.map((t) => t.panel));

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
subscribe((k) => {
  if (k.has('design') || k.has('list') || k.has('view') || k.has('sizes')) layers.refresh();
});
// Cuando el Worker termina de procesar una imagen, redibujar.
onProcessed(() => emit('design', 'list'));
window.addEventListener('resize', () => emit('view'));

/* ---------- Inicio ---------- */
function demo() {
  const d = newDesign(state.defSizeId);
  applyPreset(d, 'Kawaii');
  d.text.top = 'Pines de';
  d.text.middle = 'Rebeca';
  d.text.middleSize = 10;
  Object.assign(d.text, { font: 'Luckiest Guy', fill: 'arcoiris', outline: true, outlineColor: '#ffffff', outlineWidth: 0.22, effect: 'sombra' });
  d.stickers.push(newSticker('🌸', 9, 0, 15));
  state.designs.push(d);
  state.selId = d.id;
}

demo();
let saved = 'disenar';
try {
  saved = localStorage.getItem('pines-rebeca.tab') ?? 'disenar';
} catch {
  /* sin almacenamiento */
}
showTab(tabs.some((t) => t.id === saved) ? saved : 'disenar');
emit('list', 'design', 'sizes');
// Volver a dibujar cuando terminen de cargar las fuentes incrustadas.
loadFonts().then(() => emit('design', 'list', 'view'));
