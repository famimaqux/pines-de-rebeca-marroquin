import './style.css';
import { loadFonts } from './fonts';
import { newDesign, newSticker, type Design } from './model/design';
import { DEFAULT_SIZE_ID, loadSizes, type PinSize } from './model/sizes';
import { h } from './ui/dom';
import { createLayersPanel } from './ui/layersPanel';
import { renderPreview } from './ui/preview';
import { createSizesPanel } from './ui/sizesPanel';

/* ---------- Estado ---------- */
let sizes: PinSize[] = loadSizes();
const design: Design = demoDesign();
let finished = false;

function demoDesign(): Design {
  const d = newDesign(DEFAULT_SIZE_ID);
  d.bg.type = 'radial';
  d.bg.c1 = '#ffe3f0';
  d.bg.c2 = '#e6dcff';
  d.pattern = { type: 'corazones', color: '#ff7eb6', alpha: 0.35, scale: 7 };
  d.ring = { type: 'banda', color: '#ff8fc1', finish: 'plano', width: 4.5 };
  d.text = { ...d.text, top: 'Pines de', bottom: 'Rebeca', size: 4, color: '#ffffff', outline: false, inset: 0 };
  d.stickers.push(newSticker('🌸', 12, 0, 2));
  return d;
}

const sizeOf = (d: Design): PinSize => sizes.find((s) => s.id === d.sizeId) ?? sizes[0];

/* ---------- Interfaz ---------- */
const app = document.querySelector<HTMLElement>('#app')!;
const canvas = h('canvas', { class: 'pin-canvas', role: 'img', 'aria-label': 'Vista previa del pin' });
const sizeSelect = h('select', { id: 'size-select' });
const finishedChk = h('input', { type: 'checkbox', id: 'finished' });
const note = h('p', { class: 'note small' });

let raf = 0;
function redraw() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const s = sizeOf(design);
    renderPreview(canvas, design, s, { finished });
    note.textContent = finished
      ? 'Así se verá el pin terminado: solo la cara visible.'
      : `La zona oscura (${((Math.min(s.cutW - s.faceW, s.cutH - s.faceH)) / 2).toLocaleString('es')} mm) se dobla detrás de la chapa: no se verá. Pon lo importante dentro de la línea punteada.`;
  });
}

function fillSizeSelect() {
  if (!sizes.some((s) => s.id === design.sizeId)) design.sizeId = sizes[0].id;
  sizeSelect.replaceChildren(...sizes.map((s) => h('option', { value: s.id, selected: s.id === design.sizeId }, s.name)));
}

sizeSelect.addEventListener('change', () => {
  design.sizeId = sizeSelect.value;
  redraw();
});
finishedChk.addEventListener('change', () => {
  finished = finishedChk.checked;
  redraw();
});

const layers = createLayersPanel({ getDesign: () => design, changed: redraw });
const sizesPanel = createSizesPanel({
  getSizes: () => sizes,
  setSizes: (list) => {
    sizes = list;
    fillSizeSelect();
    redraw();
  },
});

app.replaceChildren(
  h(
    'div',
    { class: 'editor' },
    h(
      'section',
      { class: 'card preview', 'aria-labelledby': 'preview-title' },
      h('h2', { id: 'preview-title' }, 'Vista previa del pin'),
      h('div', { class: 'row wrap' }, h('label', { for: 'size-select' }, 'Molde'), sizeSelect, h('label', { class: 'check', for: 'finished' }, finishedChk, ' Ver pin terminado')),
      h('div', { class: 'canvas-wrap' }, canvas),
      note,
    ),
    h('section', { class: 'card', 'aria-label': 'Capas del pin' }, h('h2', {}, 'Capas'), layers.el),
  ),
  sizesPanel,
);

fillSizeSelect();
layers.refresh();
redraw();
window.addEventListener('resize', redraw);
// Volver a dibujar cuando terminen de cargar las fuentes incrustadas.
loadFonts().then(redraw);
