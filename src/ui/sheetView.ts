import type { Design } from '../model/design';
import { PAPERS, cm, fitsPrinter, paperShortName, paperSize, type PaperId } from '../model/paper';
import { MAX_QTY, pageLabel, shortName } from '../layout/sheets';
import { capacityFor, currentLayout, sheetCopies } from '../layout/current';
import type { Placed } from '../layout/pack';
import { drawSheet, type SheetContext } from '../render/sheet';
import { traceSized } from '../render/drawPin';
import { checkpoint, emit, setPaper, sizeById, state, subscribe } from '../state';
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

export function createSheetView(hooks: SheetViewHooks): { el: HTMLElement; summary: HTMLElement } {
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
  const defSize = h('select', { id: 'def-size', 'aria-label': 'Tamaño de los pines nuevos' });
  defSize.addEventListener('change', () => (state.defSizeId = defSize.value));

  /* ---------- Acomodo ---------- */
  const algo = h(
    'select',
    { id: 'pg-algo', 'aria-label': 'Modo de acomodo' },
    h('option', { value: 'auto' }, 'Automático (menos hojas)'),
    h('option', { value: 'grid' }, 'Cuadrícula ordenada'),
  );
  algo.addEventListener('change', () => {
    state.page.algo = algo.value as 'auto' | 'grid';
    emit('page');
  });
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
    'details',
    { class: 'popover' },
    h('summary', {}, '⚙ Márgenes'),
    h(
      'div',
      { class: 'popover-body' },
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
    h('button', { type: 'button', class: 'btn ghost small', onclick: () => ((state.zoom = 0), emit('view')) }, 'Ajustar a pantalla'),
    h('label', { class: 'check', for: 'ruler-chk' }, rulerChk, ' Regla en cm'),
  );

  const toolbar = h(
    'div',
    { class: 'toolbar card' },
    h('div', { class: 'tool-group' }, h('label', { for: 'paper' }, 'Papel'), paperSel, customBox, h('div', { class: 'segmented', role: 'group', 'aria-label': 'Orientación' }, ...orientBtns)),
    h('div', { class: 'tool-group' }, file, addBtn, h('label', { for: 'def-size' }, 'Tamaño'), defSize),
    h('div', { class: 'tool-group' }, h('label', { for: 'pg-algo' }, 'Acomodo'), algo, pageOpts),
    h('div', { class: 'tool-group' }, zoomBox),
  );

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
  const nav = h('div', { class: 'sheet-nav' }, prev, pageInfo, next, pageTag, h('label', { class: 'mini inline' }, h('span', {}, 'Repetir esta hoja ×'), rep));

  /* ---------- Hoja ---------- */
  const canvas = h('canvas', { class: 'sheet-canvas', role: 'img', tabindex: 0 });
  const scroller = h('div', { class: 'sheet-scroller' }, canvas);
  const emptyMsg = h(
    'div',
    { class: 'sheet-empty' },
    h('p', { class: 'big' }, 'Tu hoja está vacía'),
    h('p', { class: 'muted' }, 'Toca “📷 Agregar imágenes” o arrastra tus fotos aquí: cada imagen aparece como un pin y se acomoda sola.'),
  );
  const stage = h('div', { class: 'sheet-stage' }, scroller, emptyMsg);

  const summary = h('div', { class: 'summary-bar', role: 'status', 'aria-live': 'polite' });
  const summaryText$ = h('span', {});
  const editBtn = h('button', { type: 'button', class: 'btn small', onclick: () => hooks.openEditor() }, '✎ Editar pin');
  summary.append(summaryText$, editBtn);

  const el = h('section', { class: 'sheet-view', 'aria-label': 'Hoja de pines' }, toolbar, printerWarn, nav, stage);

  /* ---------- Dibujo ---------- */
  let geo = { ppm: 1, ox: 0, oy: 0 };

  function currentPpm(): number {
    const { w, h: hh } = paperSize(state.paper);
    if (state.zoom > 0) return state.zoom;
    const pad = state.showRuler ? RULER_PX + 12 : 12;
    const availW = Math.max(200, scroller.clientWidth - pad);
    // Alto disponible bajo la hoja; como mínimo el 62 % de la ventana (si no, se ve muy chica).
    const top = scroller.getBoundingClientRect().top + window.scrollY;
    const availH = Math.max(window.innerHeight * 0.62, window.innerHeight - top - 70);
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
    defSize.replaceChildren(...state.sizes.map((s) => h('option', { value: s.id, selected: s.id === state.defSizeId }, s.name)));
    algo.value = state.page.algo === 'hex' ? 'auto' : state.page.algo;
    margin.value = String(state.page.margin);
    marginOut.textContent = `${fmtNum(state.page.margin)} mm`;
    gap.value = String(state.page.gap);
    gapOut.textContent = `${fmtNum(state.page.gap)} mm`;
    rulerChk.checked = state.showRuler;

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
    ctx.shadowColor = 'rgba(80,20,50,.18)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W * ppm, H * ppm);
    ctx.restore();
    ctx.save();
    ctx.translate(geo.ox, geo.oy);
    ctx.scale(ppm, ppm);
    const sc = sheetContext();
    if (page) drawSheet(ctx, page, sc, { guides: true, marginBox: true, pageNumber: state.sheet + 1, pageCount: n });
    else drawSheet(ctx, { items: [], shelves: [], fail: Infinity }, sc, { guides: false, marginBox: true });
    // Resaltar los pines del diseño seleccionado
    if (page && state.selId !== null) {
      ctx.lineWidth = 2.2 / ppm;
      ctx.strokeStyle = '#e85d9a';
      ctx.setLineDash([6 / ppm, 4 / ppm]);
      for (const it of page.items) {
        if (it.designId !== state.selId) continue;
        const s = sc.sizes.get(it.sizeId);
        if (!s) continue;
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.beginPath();
        traceSized(ctx, s, s.cutW + 2.5, s.cutH + 2.5);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();

    summaryText$.textContent = summaryText();
    editBtn.disabled = state.selId === null;
  }

  /** Reglas en cm arriba y a la izquierda del papel. */
  function drawCmRulers(ctx: CanvasRenderingContext2D, W: number, H: number, ppm: number, ox: number, oy: number) {
    ctx.save();
    ctx.fillStyle = '#fff6fa';
    ctx.fillRect(ox, 0, W * ppm, RULER_PX);
    ctx.fillRect(0, oy, RULER_PX, H * ppm);
    ctx.strokeStyle = '#b07a95';
    ctx.fillStyle = '#7d5a6b';
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

  /* ---------- Selección y doble clic ---------- */
  const hit = (e: { clientX: number; clientY: number }): Placed | null => {
    const page = currentLayout().pages[state.sheet];
    if (!page) return null;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left - geo.ox) / geo.ppm;
    const y = (e.clientY - r.top - geo.oy) / geo.ppm;
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
  let lastTap = { t: 0, id: -1 };
  canvas.addEventListener('pointerup', (e) => {
    const it = hit(e);
    const now = performance.now();
    if (!it) {
      if (state.selId !== null) {
        state.selId = null;
        emit('list', 'view');
      }
      return;
    }
    // Doble toque en el celular = abrir el editor
    if (e.pointerType !== 'mouse' && lastTap.id === it.designId && now - lastTap.t < 400) {
      lastTap = { t: 0, id: -1 };
      hooks.openEditor();
      return;
    }
    lastTap = { t: now, id: it.designId };
    if (state.selId !== it.designId) {
      state.selId = it.designId;
      emit('list', 'design', 'view');
    }
  });
  canvas.addEventListener('dblclick', (e) => {
    const it = hit(e);
    if (!it) return;
    state.selId = it.designId;
    emit('list', 'design', 'view');
    hooks.openEditor();
  });
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state.selId !== null) hooks.openEditor();
    if (e.key === 'PageDown' || e.key === 'ArrowRight') goSheet(state.sheet + 1);
    if (e.key === 'PageUp' || e.key === 'ArrowLeft') goSheet(state.sheet - 1);
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
  return { el, summary };
}
