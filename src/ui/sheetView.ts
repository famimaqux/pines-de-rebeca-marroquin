import type { Design } from '../model/design';
import { PAPERS, cm, fitsPrinter, paperShortName, paperSize, type PaperId } from '../model/paper';
import { MAX_QTY, pageLabel, shortName } from '../layout/sheets';
import { sizeOptionLabel, type PinSize } from '../model/sizes';
import { scaleDesign } from '../model/presets';
import { applyWithScope, askAgain, onScopePrefsChanged, scopePrefs } from './applyScope';
import { SCOPE_LABELS } from '../model/scope';
import { openCustomSize } from './customSize';
import { capacityFor, currentLayout, sheetCopies } from '../layout/current';
import type { Page, Placed } from '../layout/pack';
import { deletePins, duplicatePins, isPinned, lastMoveSwapped, movePins, moveToSheet, resetArrangement, setMode, togglePin } from '../layout/pinOps';
import { locate, onRelocated } from '../layout/current';
import { parseKey } from '../layout/sheets';
import { drawSheet, type SheetContext } from '../render/sheet';
import { drawPin, traceSized } from '../render/drawPin';
import { drawGloss } from '../render/guides';
import { checkpoint, emit, setPaper, setSizes, sizeById, state, subscribe } from '../state';
import { fmtNum, h } from './dom';
import { addFiles } from './designsList';
import { imagesFor } from './resources';
import { toast } from './toast';

export function sheetContext(): SheetContext {
  const { w, h: hh } = paperSize(state.paper);
  return {
    paperW: w,
    paperH: hh,
    designs: new Map(state.designs.map((d) => [d.id, d])),
    sizes: new Map(state.sizes.map((s) => [s.id, s])),
    images: imagesFor,
    margin: state.page.margin,
    guides: state.guides,
  };
}

/** Botones por diseño: "Llenar 1 hoja", "+1 hoja" y "Rellenar huecos". */
export function qtyActions(d: Design): HTMLElement {
  const btn = (label: string, title: string, fn: () => void) => h('button', { type: 'button', class: 'chip', title, onclick: fn }, label);
  const name = sizeById(d.sizeId).name;
  return h(
    'div',
    { class: 'chips' },
    btn('Llenar 1 hoja', `Cantidad = lo que entra en una hoja de ${name}`, () => {
      checkpoint();
      d.qty = capacityFor(d.sizeId);
      emit('list');
      toast(`Cantidad = ${d.qty} (una hoja completa de ${name})`);
    }),
    btn('+1 hoja', 'Sumar una hoja completa de este diseño', () => {
      checkpoint();
      d.qty = Math.min(MAX_QTY, d.qty + capacityFor(d.sizeId));
      emit('list');
    }),
    btn('Rellenar huecos', 'Agregar los que aún caben en la última hoja', () => {
      const n = currentLayout().free[d.sizeId] ?? 0;
      if (!n) return toast('No quedan huecos para este tamaño en la última hoja');
      checkpoint();
      d.qty = Math.min(MAX_QTY, d.qty + n);
      emit('list');
      toast(`Se agregaron ${n} pines en los huecos`);
    }),
  );
}

/** Frase corta del resumen: "18 pines · 2 hojas A4 · caben 3 más en la última hoja". */
export function summaryText(): string {
  const L = currentLayout();
  const paper = paperShortName(state.paper);
  if (!L.total) return `Sin pines todavía · hoja ${paper}`;
  const P = L.pages.length;
  const parts = [`${L.total} ${L.total === 1 ? 'pin' : 'pines'}`, `${P} ${P === 1 ? 'hoja' : 'hojas'} ${paper}`];
  // Tamaño que más se usa (por cantidad de pines): de ese se dice cuántos más caben.
  const count = new Map<string, number>();
  for (const d of state.designs) if (d.qty > 0) count.set(d.sizeId, (count.get(d.sizeId) ?? 0) + d.qty);
  const used = [...count.keys()];
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const main = top ? ([top, L.free[top] ?? 0] as const) : undefined;
  if (main && main[1] > 0) parts.push(`caben ${main[1]} más${used.length > 1 ? ` de ${shortName(sizeById(main[0]))}` : ''} en la última hoja`);
  else parts.push('última hoja aprovechada al máximo');
  if (L.unfit.length) parts.push(`⚠️ ${L.unfit.length} no caben en este papel`);
  return parts.join(' · ');
}

export interface SheetViewHooks {
  openEditor: () => void;
}

const RULER_PX = 22;

export interface SheetViewParts {
  /** hoja con su barra superior (zoom, Hoja 1 de N, ver terminados) */
  el: HTMLElement;
  summary: HTMLElement;
  paperBox: HTMLElement;
  imagesBox: HTMLElement;
  sizeBox: HTMLElement;
  layoutBox: HTMLElement;
}

export function createSheetView(hooks: SheetViewHooks): SheetViewParts {
  /* ---------- Papel ---------- */
  const paperSel = h('select', { id: 'paper', 'aria-label': 'Papel' }, ...PAPERS.map((p) => h('option', { value: p.id }, p.name)));
  const cw = h('input', { type: 'number', min: 5, max: 100, step: 0.1, class: 'num', 'aria-label': 'Ancho del papel en cm' });
  const ch = h('input', { type: 'number', min: 5, max: 100, step: 0.1, class: 'num', 'aria-label': 'Alto del papel en cm' });
  const customBox = h('span', { class: 'row custom-paper' }, cw, '×', ch, 'cm');
  paperSel.addEventListener('change', () => {
    state.sheet = 0;
    setPaper({ id: paperSel.value as PaperId });
  });
  const setCustom = () => {
    const w = parseFloat(cw.value.replace(',', '.')) * 10;
    const hh = parseFloat(ch.value.replace(',', '.')) * 10;
    if (w > 0 && hh > 0) setPaper({ customW: w, customH: hh });
  };
  cw.addEventListener('change', setCustom);
  ch.addEventListener('change', setCustom);

  const orientBtns = (['vertical', 'horizontal'] as const).map((o) =>
    h('button', { type: 'button', class: 'seg', 'aria-pressed': 'false', onclick: () => setPaper({ orientation: o }) }, o === 'vertical' ? '▯ Vertical' : '▭ Horizontal'),
  );

  /* ---------- Agregar imágenes ---------- */
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', id: 'add-files' });
  file.addEventListener('change', async () => {
    if (file.files) await addAndShow(file.files);
    file.value = '';
  });
  const addBtn = h('label', { for: 'add-files', class: 'btn', role: 'button', tabindex: 0 }, '📷 Agregar imágenes');
  addBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      file.click();
    }
  });
  const defSize = h('select', { id: 'def-size', 'aria-label': 'Tamaño de pin' });
  const sample = h('canvas', { class: 'size-sample', 'aria-hidden': 'true' });
  const sampleTxt = h('span', { class: 'muted small size-sample-txt' });
  defSize.addEventListener('change', async () => {
    let to: PinSize | null = state.sizes.find((s) => s.id === defSize.value) ?? null;
    if (defSize.value === '__custom') {
      const made = await openCustomSize();
      if (!made) return emit('view');
      setSizes([...state.sizes, made]);
      to = made;
    }
    if (!to) return;
    state.defSizeId = to.id;
    emit('view');
    if (!state.designs.length) return toast(`Los pines nuevos serán de ${sizeOptionLabel(to)}`);
    const target = to;
    // Si hay pines seleccionados en la hoja se aplica directo a ellos.
    await applyWithScope({
      title: `Cambiar el tamaño a ${shortName(target)}`,
      selectionFirst: true,
      apply: (d) => {
        if (d.sizeId !== target.id) scaleDesign(d, sizeById(d.sizeId), target);
      },
    });
  });
  // Indicador "aplicando sin preguntar"
  const scopeChip = h('button', { type: 'button', class: 'chip scope-chip', hidden: true, onclick: () => askAgain() });
  onScopePrefsChanged(() => {
    const p = scopePrefs();
    scopeChip.hidden = !p.dontAsk;
    scopeChip.textContent = `🎯 Aplicando a: ${p.lastScope ? SCOPE_LABELS[p.lastScope] : ''} · volver a preguntar`;
  });

  /* ---------- Acomodo ---------- */
  const algo = h(
    'select',
    { id: 'pg-algo', 'aria-label': 'Modo de acomodo' },
    h('option', { value: 'auto' }, 'Automático (menos hojas)'),
    h('option', { value: 'grid' }, 'Cuadrícula ordenada'),
    h('option', { value: 'free' }, 'Libre (nada se mueve solo)'),
  );
  algo.addEventListener('change', () => {
    setMode(algo.value as 'auto' | 'grid' | 'free');
    toast(
      algo.value === 'free'
        ? 'Modo Libre: cada pin se queda donde lo dejes; los nuevos van al primer hueco libre.'
        : 'Los pines se acomodan solos; los fijados 📌 se respetan.',
      4000,
    );
  });
  const resetBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn ghost small',
      onclick: () => {
        resetArrangement();
        toast('Se soltaron los pines fijados y todo se volvió a acomodar');
      },
    },
    '🔄 Reacomodar todo',
  );
  const modeHelp = h('p', { class: 'muted small' }, 'Arrastra un pin para moverlo: queda fijado 📌 y los demás se ordenan alrededor.');
  const margin = h('input', { type: 'range', min: 0, max: 20, step: 0.5, id: 'pg-margin' });
  const marginOut = h('output', { for: 'pg-margin' });
  const gap = h('input', { type: 'range', min: 0, max: 10, step: 0.5, id: 'pg-gap' });
  const gapOut = h('output', { for: 'pg-gap' });
  margin.addEventListener('input', () => {
    state.page.margin = parseFloat(margin.value);
    emit('page');
  });
  gap.addEventListener('input', () => {
    state.page.gap = parseFloat(gap.value);
    emit('page');
  });
  const pageOpts = h(
    'div',
    {},
    h(
      'div',
      { class: 'side-fields' },
      h('div', { class: 'field' }, h('label', { for: 'pg-margin' }, 'Margen ', marginOut), margin),
      h('div', { class: 'field' }, h('label', { for: 'pg-gap' }, 'Separación ', gapOut), gap),
      h(
        'button',
        {
          type: 'button',
          class: 'btn ghost small',
          onclick: () => {
            Object.assign(state.page, { margin: 5, gap: 1.5 });
            emit('page');
          },
        },
        'Por defecto (5 / 1,5 mm)',
      ),
    ),
  );

  /* ---------- Zoom ---------- */
  const zoomOut = h('output', { class: 'zoom-out' });
  const zoomBy = (k: number) => {
    state.zoom = Math.min(12, Math.max(0.6, currentPpm() * k));
    emit('view');
  };
  const rulerChk = h('input', { type: 'checkbox', id: 'ruler-chk' });
  rulerChk.addEventListener('change', () => {
    state.showRuler = rulerChk.checked;
    emit('view');
  });
  const zoomBox = h(
    'div',
    { class: 'row zoom', role: 'group', 'aria-label': 'Zoom de la hoja' },
    h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Alejar', onclick: () => zoomBy(1 / 1.2) }, '−'),
    zoomOut,
    h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Acercar', onclick: () => zoomBy(1.2) }, '+'),
    h('button', { type: 'button', class: 'btn ghost small', onclick: () => ((state.zoom = 0), emit('view')) }, '⤢ Ajustar'),
    h('label', { class: 'check', for: 'ruler-chk' }, rulerChk, ' Regla'),
  );
  const finishedChk = h('input', { type: 'checkbox', id: 'finished-all' });
  finishedChk.addEventListener('change', () => {
    state.showFinished = finishedChk.checked;
    emit('view');
  });

  const paperBox = h(
    'div',
    { class: 'side-fields' },
    h('label', { for: 'paper' }, 'Papel'),
    paperSel,
    customBox,
    h('div', { class: 'segmented', role: 'group', 'aria-label': 'Orientación' }, ...orientBtns),
  );
  const imagesBox = h(
    'div',
    { class: 'side-fields' },
    file,
    addBtn,
    h('p', { class: 'muted small' }, 'Puedes elegir muchas a la vez o arrastrarlas a la hoja. Cada imagen aparece como un pin y se acomoda sola.'),
  );
  const sizeBox = h(
    'div',
    { class: 'side-fields' },
    h('label', { for: 'def-size' }, 'Tamaño de pin'),
    defSize,
    h('div', { class: 'row' }, sample, sampleTxt),
    scopeChip,
  );
  const layoutBox = h('div', { class: 'side-fields' }, h('label', { for: 'pg-algo' }, 'Modo de acomodo'), algo, modeHelp, resetBtn, pageOpts);

  /* ---------- Aviso de impresora ---------- */
  const printerWarn = h('div', { class: 'warn banner', role: 'alert', hidden: true });

  /* ---------- Navegación de hojas ---------- */
  const prev = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Hoja anterior', onclick: () => goSheet(state.sheet - 1) }, '◀');
  const next = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Hoja siguiente', onclick: () => goSheet(state.sheet + 1) }, '▶');
  const pageInfo = h('strong', { 'aria-live': 'polite' });
  const pageTag = h('span', { class: 'muted small' });
  const rep = h('input', { type: 'number', min: 1, max: 50, value: '1', class: 'num', 'aria-label': 'Repetir esta hoja (veces)' });
  rep.addEventListener('change', () => {
    const n = Math.max(1, Math.min(50, Math.floor(Number(rep.value) || 1)));
    rep.value = String(n);
    state.copies[state.sheet] = n;
    emit('page');
  });
  const nav = h(
    'div',
    { class: 'sheet-nav' },
    h('div', { class: 'row' }, prev, pageInfo, next),
    zoomBox,
    h('label', { class: 'check finished-chk', for: 'finished-all' }, finishedChk, ' 👁 Terminados'),
    h('label', { class: 'mini inline' }, h('span', { title: 'Repetir esta hoja (copias)' }, '🔁 ×'), rep),
    pageTag,
  );

  /* ---------- Hoja ---------- */
  const canvas = h('canvas', { class: 'sheet-canvas', role: 'img', tabindex: 0 });
  const scroller = h('div', { class: 'sheet-scroller' }, canvas);
  const emptyMsg = h(
    'div',
    { class: 'sheet-empty' },
    h('p', { class: 'big' }, 'Tu hoja está vacía'),
    h('p', { class: 'muted' }, 'Toca “📷 Agregar imágenes” o arrastra tus fotos aquí: cada imagen aparece como un pin y se acomoda sola.'),
  );
  // Lupa: vista ampliada del pin terminado al pasar el mouse
  const loupe = h('canvas', { class: 'loupe', 'aria-hidden': 'true', hidden: true });
  const actionBar = h('div', { class: 'sel-bar', role: 'toolbar', 'aria-label': 'Acciones de la selección', hidden: true });
  const dropPrev = h('div', { class: 'drop-zone left', hidden: true });
  const dropNext = h('div', { class: 'drop-zone right', hidden: true });
  const stage = h('div', { class: 'sheet-stage' }, scroller, emptyMsg, loupe, actionBar, dropPrev, dropNext);

  const summary = h('div', { class: 'summary-bar', role: 'status', 'aria-live': 'polite' });
  const summaryText$ = h('span', {});
  const editBtn = h('button', { type: 'button', class: 'btn small', onclick: () => hooks.openEditor() }, '✎ Editar pin');
  summary.append(summaryText$, editBtn);

  const el = h('section', { class: 'sheet-view', 'aria-label': 'Hoja de pines' }, nav, printerWarn, stage);

  /* ---------- Dibujo ---------- */
  let geo = { ppm: 1, ox: 0, oy: 0 };
  interface Guide {
    axis: 'x' | 'y';
    at: number;
  }
  let drag: { keys: Set<string>; primary: string; x0: number; y0: number; dx: number; dy: number; active: boolean; guides: Guide[]; target: number | null } | null = null;
  let marquee: { x0: number; y0: number; x1: number; y1: number; add: boolean } | null = null;

  function currentPpm(): number {
    const { w, h: hh } = paperSize(state.paper);
    if (state.zoom > 0) return state.zoom;
    const pad = state.showRuler ? RULER_PX + 14 : 14;
    // La hoja se ajusta al espacio disponible (ancho y alto del área de la hoja).
    const availW = Math.max(160, stage.clientWidth - 20 - pad);
    const availH = Math.max(200, stage.clientHeight - 20 - pad);
    return Math.max(0.6, Math.min(availW / w, availH / hh));
  }

  function goSheet(i: number) {
    const n = currentLayout().pages.length;
    state.sheet = Math.max(0, Math.min(Math.max(0, n - 1), i));
    emit('view');
  }

  function render() {
    const L = currentLayout();
    const { w: W, h: H } = paperSize(state.paper);
    const n = L.pages.length;
    if (state.sheet > Math.max(0, n - 1)) state.sheet = Math.max(0, n - 1);
    const page = L.pages[state.sheet];

    // Controles
    paperSel.value = state.paper.id;
    customBox.hidden = state.paper.id !== 'custom';
    if (state.paper.id === 'custom' && document.activeElement !== cw && document.activeElement !== ch) {
      cw.value = String(Math.round(state.paper.customW) / 10);
      ch.value = String(Math.round(state.paper.customH) / 10);
    }
    orientBtns[0].setAttribute('aria-pressed', String(state.paper.orientation === 'vertical'));
    orientBtns[1].setAttribute('aria-pressed', String(state.paper.orientation === 'horizontal'));
    defSize.replaceChildren(
      ...state.sizes.map((s) => h('option', { value: s.id, selected: s.id === state.defSizeId }, sizeOptionLabel(s))),
      h('option', { value: '__custom' }, 'Personalizado… (escribo cara y corte en mm)'),
    );
    drawSample(sizeById(state.defSizeId));
    algo.value = state.page.algo === 'hex' ? 'auto' : state.page.algo;
    const nPinned = [...state.fixed.values()].filter((f) => f.manual).length;
    resetBtn.textContent = nPinned ? `🔄 Reacomodar todo (soltar ${nPinned} fijado${nPinned === 1 ? '' : 's'})` : '🔄 Reacomodar todo';
    margin.value = String(state.page.margin);
    marginOut.textContent = `${fmtNum(state.page.margin)} mm`;
    gap.value = String(state.page.gap);
    gapOut.textContent = `${fmtNum(state.page.gap)} mm`;
    rulerChk.checked = state.showRuler;
    finishedChk.checked = state.showFinished;

    // Aviso de impresora
    if (!fitsPrinter(state.paper)) {
      const name = state.paper.id === 'a3' ? 'A3' : `este papel (${cm(W)} × ${cm(H)} cm)`;
      printerWarn.replaceChildren(
        h('span', {}, `🖨 Tu impresora Epson L8050 no imprime ${name}: imprime como máximo A4. Puedes llevarlo a una imprenta o pasar a A4.`),
        h(
          'button',
          {
            type: 'button',
            class: 'btn small',
            onclick: () => {
              state.sheet = 0;
              setPaper({ id: 'a4' });
              toast(`Listo: todo se reacomodó en A4 (${currentLayout().pages.length} hoja(s))`);
            },
          },
          'Pasar todo a A4',
        ),
      );
      printerWarn.hidden = false;
    } else printerWarn.hidden = true;

    // Navegación
    pageInfo.textContent = n ? `Hoja ${state.sheet + 1} de ${n}` : 'Hoja 1 de 1';
    prev.disabled = state.sheet <= 0;
    next.disabled = state.sheet >= n - 1;
    pageTag.textContent = page ? pageLabel(page, state.sizes) : '';
    rep.value = String(sheetCopies(Math.max(1, n))[state.sheet] ?? 1);
    rep.disabled = !n;
    emptyMsg.hidden = L.total > 0;

    // Canvas
    const ppm = currentPpm();
    const ruler = state.showRuler ? RULER_PX : 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.round(W * ppm + ruler + 8);
    const cssH = Math.round(H * ppm + ruler + 8);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    geo = { ppm, ox: ruler + 4, oy: ruler + 4 };
    zoomOut.textContent = `${Math.round((ppm / (96 / 25.4)) * 100)} %`;
    canvas.setAttribute('aria-label', `Hoja ${state.sheet + 1} de ${Math.max(1, n)}, papel ${paperShortName(state.paper)}${page ? ': ' + pageLabel(page, state.sizes) : ''}. Doble clic en un pin para editarlo.`);

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (ruler) drawCmRulers(ctx, W, H, ppm, geo.ox, geo.oy);
    ctx.save();
    ctx.translate(geo.ox, geo.oy);
    // sombra del papel
    ctx.shadowColor = 'rgba(46,16,101,.2)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W * ppm, H * ppm);
    ctx.restore();
    ctx.save();
    ctx.translate(geo.ox, geo.oy);
    ctx.scale(ppm, ppm);
    const sc = sheetContext();
    // Mientras se arrastra, los pines del grupo se dibujan en su nueva posición.
    const shown: Page | undefined = page && drag?.active ? { ...page, items: page.items.map((it) => (drag!.keys.has(it.key) ? { ...it, x: it.x + drag!.dx, y: it.y + drag!.dy } : it)) } : page;
    if (shown) drawSheet(ctx, shown, sc, { guides: true, marginBox: !state.showFinished, finished: state.showFinished, pageNumber: state.sheet + 1, pageCount: n });
    else drawSheet(ctx, { items: [], fixed: [], shelves: [], fail: Infinity }, sc, { guides: false, marginBox: true });
    if (shown) {
      for (const it of shown.items) {
        const s = sc.sizes.get(it.sizeId);
        if (!s) continue;
        const picked = state.pinSel.has(it.key);
        const designSel = !picked && !state.pinSel.size && state.selection.has(it.designId);
        ctx.save();
        ctx.translate(it.x, it.y);
        if (picked || designSel) {
          ctx.lineWidth = (picked ? 2.6 : 2) / ppm;
          ctx.strokeStyle = '#7C3AED';
          ctx.setLineDash(picked ? [] : [6 / ppm, 4 / ppm]);
          ctx.beginPath();
          traceSized(ctx, s, s.cutW + 2.5, s.cutH + 2.5);
          ctx.stroke();
        }
        // 📌 en los fijados a mano
        if (isPinned(it.key) && state.page.algo !== 'free') {
          const fs = Math.max(4, 13 / ppm);
          ctx.setLineDash([]);
          ctx.font = `${fs}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('📌', it.r * 0.72, -it.r * 0.72);
        }
        ctx.restore();
      }
    }
    // Guías de alineación
    if (drag?.active && drag.guides.length) {
      ctx.save();
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1 / ppm;
      ctx.setLineDash([4 / ppm, 3 / ppm]);
      ctx.beginPath();
      for (const g of drag.guides) {
        if (g.axis === 'x') {
          ctx.moveTo(g.at, 0);
          ctx.lineTo(g.at, H);
        } else {
          ctx.moveTo(0, g.at);
          ctx.lineTo(W, g.at);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
    // Recuadro de selección
    if (marquee) {
      ctx.save();
      ctx.fillStyle = 'rgba(6, 182, 212, .12)';
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1 / ppm;
      const x = Math.min(marquee.x0, marquee.x1);
      const y = Math.min(marquee.y0, marquee.y1);
      ctx.fillRect(x, y, Math.abs(marquee.x1 - marquee.x0), Math.abs(marquee.y1 - marquee.y0));
      ctx.strokeRect(x, y, Math.abs(marquee.x1 - marquee.x0), Math.abs(marquee.y1 - marquee.y0));
      ctx.restore();
    }
    ctx.restore();
    renderActionBar();

    summaryText$.textContent = summaryText();
    editBtn.disabled = state.selId === null;
  }

  /** Círculo de muestra del tamaño elegido (escala fija: 88 mm = 44 px). */
  function drawSample(s: PinSize) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = 46;
    sample.width = sample.height = px * dpr;
    sample.style.width = sample.style.height = `${px}px`;
    const c = sample.getContext('2d')!;
    const k = (px * dpr) / 92;
    c.setTransform(k, 0, 0, k, (px * dpr) / 2, (px * dpr) / 2);
    c.clearRect(-50, -50, 100, 100);
    c.beginPath();
    traceSized(c, s, s.cutW, s.cutH);
    c.fillStyle = '#EDE9FE';
    c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = '#7C3AED';
    c.stroke();
    c.beginPath();
    traceSized(c, s, s.faceW, s.faceH);
    c.setLineDash([3, 2]);
    c.strokeStyle = '#3a2230';
    c.stroke();
    sampleTxt.textContent = s.shape === 'circle' ? `${s.faceW} mm` : `${s.faceW}×${s.faceH} mm`;
  }

  /** Reglas en cm arriba y a la izquierda del papel. */
  function drawCmRulers(ctx: CanvasRenderingContext2D, W: number, H: number, ppm: number, ox: number, oy: number) {
    ctx.save();
    ctx.fillStyle = '#F5F3FF';
    ctx.fillRect(ox, 0, W * ppm, RULER_PX);
    ctx.fillRect(0, oy, RULER_PX, H * ppm);
    ctx.strokeStyle = '#8B7FD1';
    ctx.fillStyle = '#5B5590';
    ctx.lineWidth = 1;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = ppm < 1.5 ? 2 : 1; // cada cuántos mm una rayita
    ctx.beginPath();
    for (let mm = 0; mm <= W; mm += step) {
      const x = ox + mm * ppm + 0.5;
      const len = mm % 10 === 0 ? 10 : mm % 5 === 0 ? 6 : 3;
      ctx.moveTo(x, RULER_PX);
      ctx.lineTo(x, RULER_PX - len);
      if (mm % 10 === 0 && (ppm >= 1.4 || mm % 50 === 0)) ctx.fillText(String(mm / 10), x, 1);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let mm = 0; mm <= H; mm += step) {
      const y = oy + mm * ppm + 0.5;
      const len = mm % 10 === 0 ? 10 : mm % 5 === 0 ? 6 : 3;
      ctx.moveTo(RULER_PX, y);
      ctx.lineTo(RULER_PX - len, y);
      if (mm % 10 === 0 && mm && (ppm >= 1.4 || mm % 50 === 0)) ctx.fillText(String(mm / 10), 1, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- Selección, mover arrastrando, recuadro ---------- */
  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - geo.ox) / geo.ppm, y: (e.clientY - r.top - geo.oy) / geo.ppm };
  };
  const hit = (e: { clientX: number; clientY: number }): Placed | null => {
    const page = currentLayout().pages[state.sheet];
    if (!page) return null;
    const { x, y } = toMm(e);
    let best: Placed | null = null;
    let bd = Infinity;
    for (const it of page.items) {
      const d = Math.hypot(x - it.x, y - it.y);
      if (d <= it.r && d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  };

  /** Pasa la selección de pines de la hoja a la selección de diseños (la que usa la barra). */
  const syncSelection = (primary?: number) => {
    const ids = [...new Set([...state.pinSel].map((k) => parseKey(k).designId))];
    state.selection = new Set(ids);
    if (primary !== undefined) state.selId = primary;
    else if (ids.length) state.selId = ids[0];
    emit('list', 'design', 'view');
  };
  const selectPins = (keys: string[], add = false) => {
    if (!add) state.pinSel = new Set();
    for (const k of keys) state.pinSel.add(k);
    syncSelection(keys.length ? parseKey(keys[keys.length - 1]).designId : undefined);
  };
  /** Pines sobre los que actúan las acciones: los elegidos en la hoja o, si no, los de los diseños seleccionados en esta hoja. */
  const actionKeys = (): string[] => {
    if (state.pinSel.size) return [...state.pinSel];
    const page = currentLayout().pages[state.sheet];
    return page ? page.items.filter((it) => state.selection.has(it.designId)).map((it) => it.key) : [];
  };

  /** Guías de alineación y "imán": centro y bordes del pin vs. otros pines y el centro de la hoja. */
  const SNAP_PX = 6;
  function snapDelta(dx: number, dy: number): { dx: number; dy: number; guides: Guide[] } {
    const page = currentLayout().pages[state.sheet];
    if (!drag || !page) return { dx, dy, guides: [] };
    const p = page.items.find((i) => i.key === drag!.primary);
    if (!p) return { dx, dy, guides: [] };
    const { w: W, h: H } = paperSize(state.paper);
    const tol = SNAP_PX / geo.ppm;
    const xs: number[] = [W / 2];
    const ys: number[] = [H / 2];
    for (const o of page.items) {
      if (drag.keys.has(o.key)) continue;
      xs.push(o.x, o.x - o.r, o.x + o.r);
      ys.push(o.y, o.y - o.r, o.y + o.r);
    }
    const guides: Guide[] = [];
    const best = (vals: number[], mine: number[]) => {
      let b: { d: number; at: number } | null = null;
      for (const v of vals)
        for (const m of mine) {
          const d = v - m;
          if (Math.abs(d) <= tol && (!b || Math.abs(d) < Math.abs(b.d))) b = { d, at: v };
        }
      return b;
    };
    const nx = p.x + dx;
    const ny = p.y + dy;
    const bx = best(xs, [nx, nx - p.r, nx + p.r]);
    const by = best(ys, [ny, ny - p.r, ny + p.r]);
    if (bx) {
      dx += bx.d;
      guides.push({ axis: 'x', at: bx.at });
    }
    if (by) {
      dy += by.d;
      guides.push({ axis: 'y', at: by.at });
    }
    return { dx, dy, guides };
  }

  let lastTap = { t: 0, key: '' };
  let pan: { x: number; y: number; sl: number; st: number } | null = null;
  let downAt = { x: 0, y: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    downAt = { x: e.clientX, y: e.clientY };
    const it = hit(e);
    const add = e.ctrlKey || e.metaKey || e.shiftKey;
    if (!it) {
      // En el celular, arrastrar en un lugar vacío desplaza la hoja; con mouse, recuadro de selección.
      if (e.pointerType !== 'mouse') {
        pan = { x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop };
        return;
      }
      const m = toMm(e);
      marquee = { x0: m.x, y0: m.y, x1: m.x, y1: m.y, add };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (add) {
      // Ctrl/Mayús + clic: sumar o quitar de la selección
      if (state.pinSel.has(it.key)) state.pinSel.delete(it.key);
      else state.pinSel.add(it.key);
      syncSelection(it.designId);
      return;
    }
    if (!state.pinSel.has(it.key)) selectPins([it.key]);
    const m = toMm(e);
    drag = { keys: new Set(state.pinSel), primary: it.key, x0: m.x, y0: m.y, dx: 0, dy: 0, active: false, guides: [], target: null };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pan) {
      scroller.scrollLeft = pan.sl - (e.clientX - pan.x);
      scroller.scrollTop = pan.st - (e.clientY - pan.y);
      return;
    }
    if (marquee) {
      const m = toMm(e);
      marquee.x1 = m.x;
      marquee.y1 = m.y;
      schedule();
      return;
    }
    if (!drag) return;
    const m = toMm(e);
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    if (!drag.active && moved < 4) return;
    drag.active = true;
    loupe.hidden = true;
    const snapped = e.altKey ? { dx: m.x - drag.x0, dy: m.y - drag.y0, guides: [] } : snapDelta(m.x - drag.x0, m.y - drag.y0);
    drag.dx = snapped.dx;
    drag.dy = snapped.dy;
    drag.guides = snapped.guides;
    // ¿Sobre una zona para pasar a otra hoja?
    const sr = stage.getBoundingClientRect();
    const n = currentLayout().pages.length;
    drag.target = e.clientX < sr.left + 70 && state.sheet > 0 ? state.sheet - 1 : e.clientX > sr.right - 70 ? state.sheet + 1 : null;
    dropPrev.hidden = state.sheet <= 0;
    dropNext.hidden = false;
    dropPrev.textContent = `⬅ Soltar en la hoja ${state.sheet}`;
    dropNext.textContent = state.sheet + 1 < n ? `Soltar en la hoja ${state.sheet + 2} ➡` : '➕ Soltar en una hoja nueva';
    dropPrev.classList.toggle('hot', drag.target === state.sheet - 1);
    dropNext.classList.toggle('hot', drag.target === state.sheet + 1);
    schedule();
  });

  const endPointer = (e: PointerEvent) => {
    if (pan) {
      const tap = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6;
      pan = null;
      if (tap && (state.pinSel.size || state.selection.size)) {
        state.pinSel.clear();
        state.selection.clear();
        emit('list', 'view');
      }
      return;
    }
    if (marquee) {
      const mq = marquee;
      marquee = null;
      const small = Math.abs(mq.x1 - mq.x0) < 1.5 && Math.abs(mq.y1 - mq.y0) < 1.5;
      if (small) {
        // clic en un lugar vacío = quitar la selección
        if (!mq.add && (state.pinSel.size || state.selection.size)) {
          state.pinSel.clear();
          state.selection.clear();
          emit('list', 'view');
        } else schedule();
        return;
      }
      const page = currentLayout().pages[state.sheet];
      const [x0, x1] = [Math.min(mq.x0, mq.x1), Math.max(mq.x0, mq.x1)];
      const [y0, y1] = [Math.min(mq.y0, mq.y1), Math.max(mq.y0, mq.y1)];
      const keys = page ? page.items.filter((it) => it.x + it.r > x0 && it.x - it.r < x1 && it.y + it.r > y0 && it.y - it.r < y1).map((it) => it.key) : [];
      selectPins(keys, mq.add);
      if (keys.length) toast(`${state.pinSel.size} pin(es) seleccionados`);
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    dropPrev.hidden = dropNext.hidden = true;
    if (!d.active) {
      // Fue un toque/clic: doble toque en el celular abre el editor.
      const now = performance.now();
      if (e.pointerType !== 'mouse' && lastTap.key === d.primary && now - lastTap.t < 400) {
        lastTap = { t: 0, key: '' };
        hooks.openEditor();
      } else lastTap = { t: now, key: d.primary };
      schedule();
      return;
    }
    const keys = [...d.keys];
    if (d.target !== null) {
      moveToSheet(keys, d.target);
      toast(`${keys.length} pin(es) movidos a la hoja ${state.sheet + 1}`);
      return;
    }
    const bumped = movePins(keys, d.dx, d.dy);
    if (lastMoveSwapped) toast('No había hueco libre cerca: intercambié el lugar de los dos pines (quedan fijados 📌).', 4000);
    else if (bumped) toast(`${bumped} pin(es) caían encima de otro o fuera del margen: los ubiqué en el hueco libre más cercano.`, 4000);
    else if (state.page.algo !== 'free') toast('Pin fijado 📌 en su nuevo lugar. “Reacomodar todo” lo suelta.');
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', (e) => {
    drag = null;
    marquee = null;
    pan = null;
    dropPrev.hidden = dropNext.hidden = true;
    endPointer(e);
    schedule();
  });
  canvas.addEventListener('dblclick', (e) => {
    const it = hit(e);
    if (!it) return;
    selectPins([it.key]);
    hooks.openEditor();
  });

  /* ---------- Barra de acciones de la selección ---------- */
  const goSection = (id: string) => {
    const sec = document.querySelector<HTMLDetailsElement>(`.side-sec[data-id="${id}"]`);
    if (!sec) return;
    sec.open = true;
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelector('.sidebar')?.classList.add('expanded');
  };
  function renderActionBar() {
    const keys = actionKeys();
    actionBar.hidden = !keys.length || !!drag?.active;
    if (actionBar.hidden) return;
    const pinnedAll = keys.every(isPinned);
    const n = currentLayout().pages.length;
    const btn = (label: string, title: string, fn: () => void, disabled = false) => h('button', { type: 'button', class: 'chip', title, onclick: fn, disabled }, label);
    const parts: (HTMLElement | null)[] = [
      h('strong', { class: 'small' }, `${keys.length} pin${keys.length === 1 ? '' : 'es'}`),
      btn('⭕ Tamaño', 'Cambiar el tamaño', () => goSection('tamano')),
      btn('🎨 Fondo', 'Cambiar el fondo', () => goSection('fondo')),
      btn('🔤 Texto', 'Cambiar las letras', () => goSection('letras')),
      btn('⧉ Duplicar', 'Duplicar (Ctrl+D)', () => duplicatePins(keys)),
      btn('🗑 Eliminar', 'Eliminar (Supr)', () => {
        deletePins(keys);
        toast('Pin(es) eliminados (Ctrl+Z para deshacer)');
      }),
      btn('✎ Editar', 'Abrir el editor del pin', () => hooks.openEditor()),
      state.page.algo === 'free'
        ? null
        : btn(pinnedAll ? '📌 Soltar' : '📌 Fijar', pinnedAll ? 'Volver al acomodo automático' : 'Dejarlo fijo en su lugar', () => {
            const r = togglePin(keys);
            toast(r === 'pinned' ? 'Fijado 📌: el acomodo automático lo respeta' : 'Soltado: vuelve al acomodo automático');
          }),
      h(
        'label',
        { class: 'mini inline' },
        h('span', {}, 'Mover a'),
        (() => {
          const sel = h(
            'select',
            { 'aria-label': 'Mover a la hoja' },
            h('option', { value: '' }, 'la hoja…'),
            ...Array.from({ length: n }, (_, i) => h('option', { value: String(i), disabled: i === state.sheet }, `Hoja ${i + 1}`)),
            h('option', { value: String(n) }, '➕ Hoja nueva'),
          );
          sel.addEventListener('change', () => {
            if (sel.value === '') return;
            moveToSheet(keys, Number(sel.value));
            toast(`${keys.length} pin(es) movidos a la hoja ${state.sheet + 1}`);
          });
          return sel;
        })(),
      ),
    ];
    actionBar.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
  }

  /* ---------- Teclado: Supr, Ctrl+D, flechas ---------- */
  document.addEventListener('keydown', (e) => {
    const tgt = e.target as HTMLElement;
    if (tgt.matches('input, textarea, select, .pin-canvas') || document.querySelector('dialog[open]')) return;
    const keys = actionKeys();
    if (!keys.length) {
      if (tgt === canvas && (e.key === 'PageDown' || e.key === 'PageUp')) goSheet(state.sheet + (e.key === 'PageDown' ? 1 : -1));
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deletePins(keys);
      toast('Pin(es) eliminados (Ctrl+Z para deshacer)');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const made = duplicatePins(keys);
      toast(`${made.length} pin(es) duplicados`);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (!state.pinSel.size) state.pinSel = new Set(keys);
      const bumped = movePins(keys, dx, dy);
      if (bumped) toast('No había lugar justo ahí: lo ubiqué en el hueco libre más cercano');
    } else if (e.key === 'Escape' && !state.editorOpen) {
      state.pinSel.clear();
      state.selection.clear();
      emit('list', 'view');
    } else if (e.key === 'Enter' && tgt === canvas) hooks.openEditor();
  });

  onRelocated((keys) => {
    const names = keys.map((k) => locate(k)).filter(Boolean).length;
    toast(`⚠️ ${names || keys.length} pin(es) fijado(s) ya no cabían donde estaban: los moví al hueco libre más cercano.`, 5000);
  });

  // Ctrl + rueda = zoom de la hoja
  scroller.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    },
    { passive: false },
  );

  /** Agrega imágenes y muestra la hoja donde quedó la última. */
  async function addAndShow(files: Iterable<File>) {
    const before = state.designs.length;
    await addFiles(files);
    const last = state.designs[state.designs.length - 1];
    if (state.designs.length > before && last) {
      const L = currentLayout();
      const idx = L.pages.findIndex((p) => p.items.some((it) => it.designId === last.id));
      if (idx >= 0) state.sheet = idx;
      emit('view');
    }
  }
  // Soltar archivos en cualquier parte de la página
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      stage.classList.add('over');
    }
  });
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) stage.classList.remove('over');
  });
  document.addEventListener('drop', (e) => {
    stage.classList.remove('over');
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    void addAndShow(e.dataTransfer.files);
  });

  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  };
  subscribe(schedule);
  new ResizeObserver(schedule).observe(scroller);
  /* ---------- Lupa del pin terminado ---------- */
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !state.showFinished) return void (loupe.hidden = true);
    const it = hit(e);
    const d = it && state.designs.find((x) => x.id === it.designId);
    const s = it && sizeById(it.sizeId);
    if (!it || !d || !s) return void (loupe.hidden = true);
    const px = 220;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    loupe.width = loupe.height = px * dpr;
    loupe.style.width = loupe.style.height = `${px}px`;
    const c = loupe.getContext('2d')!;
    const k = (px * dpr) / (Math.max(s.faceW, s.faceH) * 1.08);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, loupe.width, loupe.height);
    c.setTransform(k, 0, 0, k, (px * dpr) / 2, (px * dpr) / 2);
    drawPin(c, d, s, imagesFor(d), { faceOnly: true });
    drawGloss(c, s);
    const r = stage.getBoundingClientRect();
    let x = e.clientX - r.left + 18;
    let y = e.clientY - r.top - px / 2;
    if (x + px > r.width) x = e.clientX - r.left - px - 18;
    y = Math.max(4, Math.min(r.height - px - 4, y));
    loupe.style.left = `${x}px`;
    loupe.style.top = `${y}px`;
    loupe.hidden = false;
  });
  canvas.addEventListener('pointerleave', () => (loupe.hidden = true));

  return { el, summary, paperBox, imagesBox, sizeBox, layoutBox };
}
