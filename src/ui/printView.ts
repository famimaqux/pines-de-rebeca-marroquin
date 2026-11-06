import { currentLayout, sheetCopies } from '../layout/current';
import { expandCopies } from '../export/pdf';
import { ensureAll } from '../image/processor';
import { paperShortName, paperSize } from '../model/paper';
import { renderSheetCanvas } from '../render/sheet';
import { state } from '../state';
import { h } from './dom';
import { exportActions } from './exportPanel';
import { icon } from './icons';
import { sheetContext } from './sheetView';
import { toast } from './toast';

/**
 * Vista de impresión: pantalla completa con las hojas tal como saldrán
 * (papel blanco, líneas de corte, sin botones encima), con navegación,
 * opciones de guías, Imprimir, PDF y PNG/JPG en alta resolución.
 */
export function createPrintView(): { open: () => void } {
  let idx = 0;
  const canvasBox = h('div', { class: 'pv-paper' });
  const info = h('strong', { 'aria-live': 'polite' });
  const btn = (ico: string, label: string, fn: () => void, cls = 'pv-btn') => {
    const b = h('button', { type: 'button', class: cls, onclick: fn });
    b.innerHTML = `${icon(ico, 18)}<span>${label}</span>`;
    return b;
  };
  const prev = btn('left', 'Anterior', () => go(idx - 1));
  const next = btn('right', 'Siguiente', () => go(idx + 1));
  const chk = (label: string, key: 'cut' | 'center' | 'ruler') => {
    const inp = h('input', { type: 'checkbox', checked: state.guides[key] });
    inp.addEventListener('change', () => {
      state.guides[key] = inp.checked;
      render();
    });
    return h('label', { class: 'pv-check' }, inp, ' ', label);
  };
  const ppi = h('select', { 'aria-label': 'Resolución de la imagen' }, h('option', { value: '300' }, '300 ppp'), h('option', { value: '600' }, '600 ppp'));
  const dlg = h(
    'dialog',
    { class: 'print-view', 'aria-label': 'Vista de impresión' },
    h(
      'div',
      { class: 'pv-top' },
      h('div', { class: 'pv-nav' }, prev, info, next),
      h('div', { class: 'pv-opts' }, chk('Líneas de corte', 'cut'), chk('Marca de centro', 'center'), chk('Regla de 5 cm', 'ruler')),
      h(
        'div',
        { class: 'pv-actions' },
        btn('imprimir', 'Imprimir', () => void printNow(), 'pv-btn primary'),
        btn('download', 'PDF', () => exportActions.pdf()),
        btn('imagenes', 'PNG', () => exportActions.images('png', Number(ppi.value))),
        btn('imagenes', 'JPG', () => exportActions.images('jpg', Number(ppi.value))),
        ppi,
        btn('close', 'Cerrar', () => dlg.close()),
      ),
    ),
    h('div', { class: 'pv-stage' }, canvasBox),
    h('p', { class: 'pv-tip' }, 'Al imprimir: escala 100 % / “Tamaño real” y SIN “sin márgenes”. Papel fotográfico o couché delgado, calidad Alta.'),
  );
  document.body.append(dlg);

  function go(i: number) {
    const n = currentLayout().pages.length;
    idx = Math.max(0, Math.min(n - 1, i));
    render();
  }
  function render() {
    const L = currentLayout();
    const n = L.pages.length;
    info.textContent = n ? `Hoja ${idx + 1} de ${n} · ${paperShortName(state.paper)}` : 'Sin hojas';
    prev.disabled = idx <= 0;
    next.disabled = idx >= n - 1;
    const page = L.pages[idx];
    if (!page) return canvasBox.replaceChildren(h('p', {}, 'Agrega imágenes para ver las hojas.'));
    const { w, h: hh } = paperSize(state.paper);
    const box = dlg.querySelector<HTMLElement>('.pv-stage')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = Math.min((box.clientWidth - 40) / w, (box.clientHeight - 40) / hh);
    const c = renderSheetCanvas(page, sheetContext(), Math.max(1, k) * dpr, { guides: true, pageNumber: idx + 1, pageCount: n });
    c.style.width = `${w * k}px`;
    c.style.height = `${hh * k}px`;
    canvasBox.replaceChildren(c);
  }

  /** Imprime con el diálogo del navegador: una imagen por hoja a 300 ppp y @page del tamaño del papel. */
  async function printNow() {
    toast('Preparando la impresión a 300 ppp…');
    await ensureAll(state.designs);
    const L = currentLayout();
    const list = expandCopies(L.pages, sheetCopies(L.pages.length));
    const { w, h: hh } = paperSize(state.paper);
    const sc = sheetContext();
    const urls = list.map(({ page, index }) => renderSheetCanvas(page, sc, 300 / 25.4, { guides: true, pageNumber: index + 1, pageCount: L.pages.length }).toDataURL('image/png'));
    const host = h('div', { class: 'print-host' });
    const style = h('style', {}, `@page { size: ${w}mm ${hh}mm; margin: 0; } @media print { body > *:not(.print-host) { display: none !important; } .print-host img { display: block; width: ${w}mm; height: ${hh}mm; page-break-after: always; } }`);
    for (const u of urls) host.append(h('img', { src: u, alt: '' }));
    document.body.append(style, host);
    dlg.close();
    await Promise.all([...host.querySelectorAll('img')].map((i) => i.decode().catch(() => null)));
    window.print();
    setTimeout(() => {
      host.remove();
      style.remove();
    }, 1000);
  }

  window.addEventListener('resize', () => dlg.open && render());
  return {
    open() {
      idx = Math.min(state.sheet, Math.max(0, currentLayout().pages.length - 1));
      dlg.showModal();
      requestAnimationFrame(render);
    },
  };
}
