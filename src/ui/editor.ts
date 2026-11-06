import { cloneDesign, type Design } from '../model/design';
import { PRESETS, applyPreset, scaleDesign } from '../model/presets';
import { foldMargin, sizeOptionLabel } from '../model/sizes';
import { applyWithScope } from './applyScope';
import { copyStyleScaled } from '../model/styleCopy';
import { effectivePpi } from '../render/drawPin';
import { getImage } from '../image/store';
import { canRedo, canUndo, checkpoint, current, emit, redo, sizeById, state, subscribe, undo, type BrushMode, type DragTarget } from '../state';
import { brushTo, commitBrush, drawBrushOverlay } from './brush';
import { applyWand, clearWand, drawWandOverlay, hasSelection, onWandChanged, recompute, wand, wandClick } from './wand';
import { fmtNum, h } from './dom';
import { renderPreview, type PreviewGeometry } from './preview';
import { imagesFor } from './resources';
import { toast } from './toast';

/** Ppp mínimos para que la foto no salga borrosa. */
export const MIN_PPI = 200;

export interface EditorTab {
  id: 'image' | 'bg' | 'text' | 'sticker';
  label: string;
  content: HTMLElement[];
}

export function createEditor(tabsIn: EditorTab[] = []): { el: HTMLElement; redraw: () => void } {
  const canvas = h('canvas', { class: 'pin-canvas', role: 'img', 'aria-label': 'Vista previa del pin. Arrastra para mover, rueda o pellizca para hacer zoom.', tabindex: 0 });
  const title = h('h2', { id: 'editor-title' }, 'Editor');
  const sizeSelect = h('select', { id: 'ed-size', 'aria-label': 'Molde de este diseño' });
  const finishedChk = h('input', { type: 'checkbox', id: 'finished' });
  const note = h('p', { class: 'note small' });
  const warn = h('p', { class: 'warn small', role: 'alert', hidden: true });
  const empty = h('div', { class: 'empty' }, h('p', {}, 'Agrega una imagen o crea un diseño para empezar.'));

  // ---- Al arrastrar mueves ----
  const targets: [DragTarget, string][] = [
    ['image', 'Imagen'],
    ['bg', 'Fondo'],
    ['text', 'Letras'],
    ['sticker', 'Sticker'],
  ];
  const targetBtns = targets.map(([t, label]) =>
    h(
      'button',
      {
        type: 'button',
        class: 'seg',
        'aria-pressed': 'false',
        onclick: () => {
          state.dragTarget = t;
          state.brush.mode = 'off';
          const d = current();
          if (t === 'bg' && d && d.bg.type === 'ninguno' && !d.bg.imageId && d.pattern.type === 'ninguno') toast('Este pin aún no tiene fondo: elige un tipo de fondo, un patrón o una imagen de fondo');
          if (t === 'sticker' && d && !d.stickers.length) toast('Este pin no tiene stickers: agrégalos en “Stickers”');
          if (t === 'text' && d && !d.text.top && !d.text.bottom && !d.text.middle) toast('Este pin no tiene letras: escríbelas en “Letras”');
          emit('view');
        },
      },
      label,
    ),
  );

  // ---- Pincel ----
  // Quitar fondo: Varita · Pincel (borrar / restaurar) · Automático (fondo liso)
  const brushes: [BrushMode, string][] = [
    ['wand', 'Varita'],
    ['erase', 'Pincel'],
  ];
  const brushBtns = brushes.map(([m, label]) =>
    h(
      'button',
      {
        type: 'button',
        class: 'seg',
        'aria-pressed': 'false',
        onclick: () => {
          const d = current();
          if (!d?.image.imageId) return toast('Primero carga una foto');
          const active = m === 'erase' ? state.brush.mode === 'erase' || state.brush.mode === 'restore' : state.brush.mode === m;
          state.brush.mode = active ? 'off' : m;
          emit('view');
        },
      },
      label,
    ),
  );
  const brushSize = h('input', { type: 'range', min: 0.5, max: 20, step: 0.5, value: String(state.brush.size), 'aria-label': 'Tamaño del pincel en mm' });
  const brushOut = h('output', {});
  brushSize.addEventListener('input', () => {
    state.brush.size = parseFloat(brushSize.value);
    brushOut.textContent = `${fmtNum(state.brush.size)} mm`;
  });
  brushOut.textContent = `${fmtNum(state.brush.size)} mm`;
  const autoBtn = h(
    'button',
    {
      type: 'button',
      class: 'seg',
      'aria-pressed': 'false',
      title: 'Quita solo el fondo liso (blanco o de un color)',
      onclick: () => {
        const d = current();
        if (!d?.image.imageId) return toast('Primero carga una foto');
        checkpoint();
        d.cutout.quick = !d.cutout.quick;
        state.brush.mode = 'off';
        emit('design', 'list', 'view');
      },
    },
    'Automático',
  );
  const eraseBtn = h('button', { type: 'button', class: 'seg', 'aria-pressed': 'false', onclick: () => ((state.brush.mode = 'erase'), emit('view')) }, 'Borrar');
  const restoreBtn = h('button', { type: 'button', class: 'seg', 'aria-pressed': 'false', onclick: () => ((state.brush.mode = 'restore'), emit('view')) }, 'Restaurar');
  const brushSizeBox = h('div', { class: 'row wrap pincel-row' }, h('div', { class: 'segmented' }, eraseBtn, restoreBtn), h('label', { class: 'mini inline' }, h('span', {}, 'Tamaño'), brushSize, brushOut));
  const brushRow = h('div', { class: 'brush-row' }, h('span', { class: 'label' }, 'Quitar fondo'), h('div', { class: 'segmented three' }, ...brushBtns, autoBtn), brushSizeBox);

  // ---- Varita mágica ----
  const tol = h('input', { type: 'range', min: 1, max: 160, step: 1, value: String(wand.opts.tol), 'aria-label': 'Tolerancia de la varita' });
  const tolOut = h('output', {}, String(wand.opts.tol));
  const soft = h('input', { type: 'range', min: 0, max: 12, step: 1, value: String(wand.opts.soft), 'aria-label': 'Suavizado del borde de la selección' });
  const softOut = h('output', {}, `${wand.opts.soft} px`);
  const contiguous = h('input', { type: 'checkbox', checked: wand.opts.contiguous });
  const live = () => {
    const d = current();
    if (d) void recompute(d);
  };
  tol.addEventListener('input', () => {
    wand.opts.tol = Number(tol.value);
    tolOut.textContent = tol.value;
    live();
  });
  soft.addEventListener('input', () => {
    wand.opts.soft = Number(soft.value);
    softOut.textContent = `${soft.value} px`;
    live();
  });
  contiguous.addEventListener('change', () => {
    wand.opts.contiguous = contiguous.checked;
    live();
  });
  const opBtns = (['new', 'add', 'sub'] as const).map((op) =>
    h(
      'button',
      {
        type: 'button',
        class: 'seg',
        'aria-pressed': String(wand.op === op),
        onclick: () => {
          wand.op = op;
          opBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['new', 'add', 'sub'][i] === op)));
        },
      },
      op === 'new' ? 'Nueva' : op === 'add' ? '＋ Sumar' : '－ Restar',
    ),
  );
  const wandAction = (label: string, title: string, fn: () => void | Promise<void>) => h('button', { type: 'button', class: 'btn ghost small', title, onclick: () => void fn() }, label);
  const applySel = async (action: 'erase' | 'restore') => {
    const d = current();
    if (!d || !hasSelection()) return toast('Primero haz clic sobre la imagen con la varita');
    const id = await applyWand(d, action);
    if (!id) return;
    checkpoint();
    d.cutout.maskId = id;
    emit('design', 'list');
    toast(action === 'erase' ? 'Selección borrada (Ctrl+Z para deshacer)' : 'Selección restaurada');
  };
  const wandBox = h(
    'div',
    { class: 'wand-box', hidden: true },
    h('p', { class: 'muted small' }, 'Haz clic sobre la imagen para seleccionar la zona de color parecido. Mayús + clic suma otra zona, Alt + clic resta.'),
    h('div', { class: 'segmented', role: 'group', 'aria-label': 'Modo de la varita' }, ...opBtns),
    h('label', { class: 'mini' }, h('span', {}, 'Tolerancia ', tolOut), tol),
    h('label', { class: 'check small' }, contiguous, ' Solo zona continua (si no: todo ese color en la imagen)'),
    h('label', { class: 'mini' }, h('span', {}, 'Suavizado del borde ', softOut), soft),
    h(
      'div',
      { class: 'row wrap' },
      wandAction('Borrar selección', 'La zona elegida se vuelve transparente', () => applySel('erase')),
      wandAction('Restaurar selección', 'La zona elegida vuelve a verse', () => applySel('restore')),
      wandAction('Invertir', 'Útil para quedarse solo con la figura', () => {
        if (!wand.seeds.length) return toast('Primero selecciona una zona');
        wand.opts.invert = !wand.opts.invert;
        live();
      }),
      wandAction('Quitar selección', 'Deja de seleccionar', () => clearWand()),
    ),
  );

  // ---- Botones ----
  const undoBtn = h('button', { type: 'button', class: 'btn ghost small', title: 'Deshacer (Ctrl+Z)', onclick: () => undo() || toast('Nada que deshacer') }, '↶ Deshacer');
  const redoBtn = h('button', { type: 'button', class: 'btn ghost small', title: 'Rehacer (Ctrl+Y)', onclick: () => redo() || toast('Nada que rehacer') }, '↷ Rehacer');
  const centerBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn ghost small',
      onclick: () => {
        const d = current();
        if (!d) return;
        checkpoint();
        if (state.dragTarget === 'bg') Object.assign(d.bg, { ox: 0, oy: 0, zoom: 1, rot: 0 });
        else Object.assign(d.image, { ox: 0, oy: 0, zoom: 1, rot: 0 });
        emit('design');
      },
    },
    '⊙',
  );
  centerBtn.title = 'Centrar';
  centerBtn.setAttribute('aria-label', 'Centrar');

  // ---- Estilos rápidos y acciones ----
  const presetBtns = Object.keys(PRESETS).map((name) =>
    h(
      'button',
      {
        type: 'button',
        class: `chip preset-${name.normalize('NFD').replace(/[^\w]/g, '').toLowerCase()}`,
        onclick: () => {
          if (!current()) return;
          void applyWithScope({ title: `Estilo rápido “${name}”`, apply: (d) => applyPreset(d, name) });
        },
      },
      name,
    ),
  );
  const styleAll = h(
    'button',
    {
      type: 'button',
      class: 'btn ghost small',
      onclick: () => {
        const d = current();
        if (!d || state.designs.length < 2) return toast('Necesitas al menos dos diseños');
        const src = structuredClone(d);
        void applyWithScope({
          title: 'Copiar el estilo de este pin (fondo, imagen de fondo, borde y letras)',
          preferred: 'all',
          apply: (z) => {
            if (z.id !== src.id) copyStyleScaled(src, z);
          },
        });
      },
    },
    'Copiar estilo a…',
  );
  const allSizes = h(
    'button',
    {
      type: 'button',
      class: 'btn ghost small',
      onclick: () => {
        const d = current();
        if (!d) return;
        const from = sizeById(d.sizeId);
        // No duplicar tamaños que ya tienen este mismo diseño (misma imagen).
        const have = new Set(state.designs.filter((z) => z.image.imageId === d.image.imageId && z.text.middle === d.text.middle).map((z) => z.sizeId));
        const targetsS = state.sizes.filter((s) => !have.has(s.id));
        if (!targetsS.length) return toast('Este diseño ya está en todos los tamaños');
        checkpoint();
        for (const s of targetsS) {
          const z = cloneDesign(d);
          z.qty = 1;
          scaleDesign(z, from, s);
          state.designs.push(z);
        }
        emit('list', 'design');
        toast(`Se crearon ${targetsS.length} versiones en otros tamaños (1 de cada uno)`);
      },
    },
    'Este diseño en todos los tamaños',
  );
  const batchBtn = h('button', { type: 'button', class: 'btn ghost small', onclick: () => openBatch() }, 'Nombres en lote');

  // ---- Zoom de la vista previa ----
  let pz = 1;
  const pzOut = h('output', { class: 'small' }, '100 %');
  const setPz = (z: number) => {
    pz = Math.min(8, Math.max(1, z));
    pzOut.textContent = `${Math.round(pz * 100)} %`;
    redraw();
  };
  const zoomRow = h(
    'div',
    { class: 'row preview-zoom', role: 'group', 'aria-label': 'Zoom de la vista previa' },
    h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Alejar la vista previa', onclick: () => setPz(pz / 1.5) }, '−'),
    pzOut,
    h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Acercar la vista previa', onclick: () => setPz(pz * 1.5) }, '+'),
    h('button', { type: 'button', class: 'btn ghost small', onclick: () => setPz(1) }, 'Ver todo'),
  );
  const canvasWrap = h('div', { class: 'canvas-wrap' }, canvas, empty);

  // ---- Pestañas Imagen / Fondo / Letras / Sticker ----
  const tabBtns: HTMLButtonElement[] = [];
  const tabPanels: HTMLElement[] = [];
  const tabsBar = h('div', { class: 'ed-tabs', role: 'tablist', 'aria-label': 'Partes del pin' });
  const selectTab = (id: EditorTab['id']) => {
    tabsIn.forEach((t, i) => {
      const on = t.id === id;
      tabBtns[i].setAttribute('aria-selected', String(on));
      tabPanels[i].hidden = !on;
    });
    if (state.brush.mode !== 'off' && id !== 'image') state.brush.mode = 'off';
    state.dragTarget = id;
    emit('view');
  };
  tabsIn.forEach((t) => {
    const b = h('button', { type: 'button', role: 'tab', class: 'ed-tab', 'aria-selected': 'false', onclick: () => selectTab(t.id) }, t.label);
    tabBtns.push(b);
    tabsBar.append(b);
    const content = t.id === 'image' ? [brushRow, wandBox, ...t.content] : t.content;
    tabPanels.push(h('div', { class: 'ed-panel', role: 'tabpanel', hidden: true }, ...content));
  });
  const syncTabs = () => tabsIn.forEach((t, i) => {
    tabBtns[i].setAttribute('aria-selected', String(state.dragTarget === t.id));
    tabPanels[i].hidden = state.dragTarget !== t.id;
  });

  // Vista simple: molde y herramientas de la vista previa en una fila; lo demás en "☰ Más opciones".
  zoomRow.append(h('label', { class: 'check small', for: 'finished', title: 'Ver cómo queda prensado' }, finishedChk, ' Cara visible'), centerBtn);
  const dragRow = h('div', { class: 'row wrap drag-row' }, h('span', { class: 'label', id: 'drag-lbl' }, 'Al arrastrar mueves:'), h('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'drag-lbl' }, ...targetBtns));
  const layout = h(
    'section',
    { class: 'card preview', 'aria-labelledby': 'editor-title' },
    h('div', { class: 'row between' }, title, h('div', { class: 'row' }, undoBtn, redoBtn)),
    h('div', { class: 'row wrap ed-molde' }, h('label', { for: 'ed-size' }, 'Molde'), sizeSelect),
    ...(tabsIn.length ? [tabsBar] : []),
    zoomRow,
    canvasWrap,
    warn,
    dragRow,
    ...(tabsIn.length ? tabPanels : [brushRow, wandBox]),
    h(
      'button',
      {
        type: 'button',
        class: 'btn ghost full apply-others',
        onclick: () => {
          const d = current();
          if (!d) return;
          const src = structuredClone(d);
          void applyWithScope({
            title: 'Aplicar el estilo de este pin (fondo, borde, letras, stickers y color)',
            ask: true,
            preferred: 'sheet',
            apply: (z) => {
              if (z.id === src.id) return;
              copyStyleScaled(src, z);
              z.stickers = structuredClone(src.stickers);
              z.adjust = { ...src.adjust };
            },
          });
        },
      },
      'Aplicar a otros pines…',
    ),
    h(
      'details',
      { class: 'more' },
      h('summary', {}, 'Más opciones del pin'),
      note,
      h('div', { class: 'quick' }, h('span', { class: 'label' }, 'Estilos rápidos'), h('div', { class: 'chips' }, ...presetBtns)),
      h('div', { class: 'row wrap' }, styleAll, allSizes, batchBtn),
    ),
  );

  sizeSelect.addEventListener('change', async () => {
    const d = current();
    if (!d) return;
    const to = sizeById(sizeSelect.value);
    const n = await applyWithScope({
      title: `Cambiar el tamaño a ${to.name}`,
      preferred: 'this',
      apply: (z) => {
        if (z.sizeId !== to.id) scaleDesign(z, sizeById(z.sizeId), to);
      },
    });
    if (!n) emit('view');
  });
  finishedChk.addEventListener('change', () => {
    state.finished = finishedChk.checked;
    emit('view');
  });

  /* ---------- Dibujo ---------- */
  let geo: PreviewGeometry = { ppm: 1, cssW: 1, cssH: 1 };
  let brushing = false;
  function redraw() {
    const d = current();
    empty.hidden = !!d;
    canvas.hidden = !d;
    if (!d) {
      note.textContent = '';
      warn.hidden = true;
      return;
    }
    const s = sizeById(d.sizeId);
    geo = renderPreview(canvas, d, s, imagesFor(d), {
      finished: state.finished,
      zoom: pz,
      overlay:
        brushing || state.brush.mode !== 'off'
          ? (ctx) => {
              drawBrushOverlay(ctx, d, s);
              if (state.brush.mode === 'wand') drawWandOverlay(ctx, d, s, performance.now());
            }
          : undefined,
    });
    // El borde de la selección "late": seguir dibujando mientras haya selección.
    if (state.brush.mode === 'wand' && hasSelection()) scheduleAnim();
    note.textContent = state.finished
      ? 'Así se verá el pin terminado: solo la cara visible.'
      : `La zona sombreada (${fmtNum(foldMargin(s))} mm) se dobla detrás de la chapa y no se verá. Pon lo importante dentro de la línea punteada.`;
    // Aviso de resolución
    const rec = getImage(d.image.imageId);
    if (rec) {
      const ppi = effectivePpi(d, s, rec.w, rec.h);
      warn.hidden = ppi >= MIN_PPI;
      warn.textContent = `⚠️ La imagen tiene ${Math.round(ppi)} ppp para este tamaño (mínimo ${MIN_PPI}): la imagen saldrá borrosa. Usa una foto más grande o baja el zoom.`;
    } else warn.hidden = true;
  }

  function refreshControls() {
    const d = current();
    title.textContent = d ? `Editor · ${sizeById(d.sizeId).name}` : 'Editor';
    sizeSelect.replaceChildren(...state.sizes.map((s) => h('option', { value: s.id, selected: d?.sizeId === s.id }, sizeOptionLabel(s))));
    sizeSelect.disabled = !d;
    finishedChk.checked = state.finished;
    targetBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(state.dragTarget === targets[i][0] && state.brush.mode === 'off')));
    brushBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(brushes[i][0] === 'erase' ? state.brush.mode === 'erase' || state.brush.mode === 'restore' : state.brush.mode === brushes[i][0])));
    autoBtn.setAttribute('aria-pressed', String(!!d?.cutout.quick));
    eraseBtn.setAttribute('aria-pressed', String(state.brush.mode === 'erase'));
    restoreBtn.setAttribute('aria-pressed', String(state.brush.mode === 'restore'));
    brushRow.classList.toggle('active', state.brush.mode !== 'off');
    canvas.classList.toggle('brush', state.brush.mode !== 'off');
    wandBox.hidden = state.brush.mode !== 'wand';
    brushSizeBox.hidden = !(state.brush.mode === 'erase' || state.brush.mode === 'restore');
    syncTabs();
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
  }

  subscribe((k) => {
    if (k.has('list') || k.has('design') || k.has('view') || k.has('sizes')) refreshControls();
    redraw();
  });
  onWandChanged(() => redraw());
  let animT = 0;
  function scheduleAnim() {
    if (animT) return;
    animT = window.setTimeout(() => {
      animT = 0;
      if (state.brush.mode === 'wand' && hasSelection()) redraw();
    }, 80);
  }

  /* ---------- Arrastrar, pellizcar, rueda, pincel ---------- */
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: {
    target: DragTarget;
    stickerId?: number;
    start: { ox: number; oy: number; zoom: number; rot: number; size?: number };
    p0: { x: number; y: number };
    dist0?: number;
    ang0?: number;
    mid0?: { x: number; y: number };
  } | null = null;

  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - geo.cssW / 2) / geo.ppm, y: (e.clientY - r.top - geo.cssH / 2) / geo.ppm };
  };

  const layerOf = (d: Design, t: DragTarget, stickerId?: number) => {
    if (t === 'bg') return { get: () => ({ ox: d.bg.ox, oy: d.bg.oy, zoom: d.bg.zoom, rot: d.bg.rot }), set: (v: { ox: number; oy: number; zoom: number; rot: number }) => Object.assign(d.bg, v) };
    if (t === 'text') {
      // "zoom" = tamaño del texto del centro; los de arriba/abajo crecen en proporción.
      return {
        get: () => ({ ox: d.text.ox ?? 0, oy: d.text.oy ?? 0, zoom: d.text.middleSize, rot: 0 }),
        set: (v: { ox: number; oy: number; zoom: number; rot: number }) => {
          const k = v.zoom / (d.text.middleSize || 1);
          d.text.ox = v.ox;
          d.text.oy = v.oy;
          d.text.middleSize = v.zoom;
          d.text.size = Math.max(1, d.text.size * k);
        },
      };
    }
    if (t === 'sticker') {
      const st = d.stickers.find((s) => s.id === stickerId);
      if (!st) return null;
      return {
        get: () => ({ ox: st.x, oy: st.y, zoom: st.size, rot: st.rot }),
        set: (v: { ox: number; oy: number; zoom: number; rot: number }) => Object.assign(st, { x: v.ox, y: v.oy, size: v.zoom, rot: v.rot }),
      };
    }
    return { get: () => ({ ox: d.image.ox, oy: d.image.oy, zoom: d.image.zoom, rot: d.image.rot }), set: (v: { ox: number; oy: number; zoom: number; rot: number }) => Object.assign(d.image, v) };
  };

  const nearestSticker = (d: Design, p: { x: number; y: number }) => {
    let best: number | undefined;
    let bd = Infinity;
    for (const s of d.stickers) {
      const dd = Math.hypot(s.x - p.x, s.y - p.y);
      if (dd < Math.max(4, s.size * 0.75) && dd < bd) {
        bd = dd;
        best = s.id;
      }
    }
    return best;
  };
  let lastSticker: number | undefined;

  const clampZoom = (t: DragTarget, z: number) =>
    t === 'sticker' || t === 'text' ? Math.min(45, Math.max(2, z)) : Math.min(t === 'bg' ? 4 : 5, Math.max(0.2, z));

  function beginGesture(d: Design) {
    const pts = [...pointers.values()];
    const p = toMm(pts[0] ? { clientX: pts[0].x, clientY: pts[0].y } : { clientX: 0, clientY: 0 });
    let stickerId: number | undefined;
    if (state.dragTarget === 'sticker') {
      stickerId = nearestSticker(d, p) ?? (pts.length > 1 ? lastSticker : undefined);
      if (stickerId === undefined) {
        gesture = null;
        return;
      }
      lastSticker = stickerId;
    }
    const layer = layerOf(d, state.dragTarget, stickerId);
    if (!layer) return;
    checkpoint();
    gesture = { target: state.dragTarget, stickerId, start: layer.get(), p0: p };
    if (pts.length >= 2) {
      const a = toMm({ clientX: pts[0].x, clientY: pts[0].y });
      const b = toMm({ clientX: pts[1].x, clientY: pts[1].y });
      gesture.dist0 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      gesture.ang0 = Math.atan2(b.y - a.y, b.x - a.x);
      gesture.mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    const d = current();
    if (!d || state.finished) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (state.brush.mode === 'wand') {
      pointers.delete(e.pointerId);
      const p = toMm(e);
      wandClick(d, sizeById(d.sizeId), p.x, p.y, { shift: e.shiftKey, alt: e.altKey });
      return;
    }
    if (state.brush.mode !== 'off' && pointers.size === 1) {
      brushing = true;
      checkpoint();
      const p = toMm(e);
      brushTo(d, sizeById(d.sizeId), p.x, p.y, state.brush.mode, state.brush.size, state.brush.hardness, true);
      redraw();
      return;
    }
    brushing = false;
    beginGesture(d);
  });

  canvas.addEventListener('pointermove', (e) => {
    const d = current();
    if (!d || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (brushing && (state.brush.mode === 'erase' || state.brush.mode === 'restore')) {
      const p = toMm(e);
      brushTo(d, sizeById(d.sizeId), p.x, p.y, state.brush.mode, state.brush.size, state.brush.hardness, false);
      redraw();
      return;
    }
    if (!gesture) return;
    const layer = layerOf(d, gesture.target, gesture.stickerId);
    if (!layer) return;
    const pts = [...pointers.values()];
    const s = gesture.start;
    if (pts.length >= 2 && gesture.dist0 && gesture.mid0 && gesture.ang0 !== undefined) {
      const a = toMm({ clientX: pts[0].x, clientY: pts[0].y });
      const b = toMm({ clientX: pts[1].x, clientY: pts[1].y });
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      layer.set({
        ox: round(s.ox + mid.x - gesture.mid0.x),
        oy: round(s.oy + mid.y - gesture.mid0.y),
        zoom: clampZoom(gesture.target, s.zoom * (dist / gesture.dist0)),
        rot: normAngle(s.rot + ((ang - gesture.ang0) * 180) / Math.PI),
      });
    } else {
      const p = toMm(e);
      layer.set({ ox: round(s.ox + p.x - gesture.p0.x), oy: round(s.oy + p.y - gesture.p0.y), zoom: s.zoom, rot: s.rot });
    }
    emit('design');
  });

  const endPointer = async (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (brushing) {
      brushing = false;
      const d = current();
      const id = await commitBrush();
      if (d && id) {
        d.cutout.maskId = id;
        emit('design');
      }
      return;
    }
    const d = current();
    // Al pasar de 2 dedos a 1, reiniciar el gesto para que no salte.
    if (d && pointers.size >= 1) beginGesture(d);
    else gesture = null;
    emit('list');
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setPz(pz * (e.deltaY < 0 ? 1.25 : 1 / 1.25));
        return;
      }
      const d = current();
      if (!d || state.finished || state.brush.mode !== 'off') return;
      e.preventDefault();
      let sid: number | undefined;
      if (state.dragTarget === 'sticker') {
        sid = nearestSticker(d, toMm(e)) ?? lastSticker;
        if (sid === undefined) return;
      }
      const layer = layerOf(d, state.dragTarget, sid);
      if (!layer) return;
      checkpoint(`wheel-${state.dragTarget}`);
      const v = layer.get();
      if (e.shiftKey) v.rot = normAngle(v.rot + (e.deltaY < 0 ? 3 : -3));
      else v.zoom = clampZoom(state.dragTarget, v.zoom * (e.deltaY < 0 ? 1.05 : 1 / 1.05));
      layer.set(v);
      emit('design');
    },
    { passive: false },
  );

  // Flechas del teclado: mover 0,5 mm (con Mayús, 5 mm); + y − para zoom.
  canvas.addEventListener('keydown', (e) => {
    const d = current();
    if (!d) return;
    const layer = layerOf(d, state.dragTarget === 'sticker' ? 'image' : state.dragTarget);
    if (!layer) return;
    const step = e.shiftKey ? 5 : 0.5;
    const v = layer.get();
    const map: Record<string, () => void> = {
      ArrowLeft: () => (v.ox -= step),
      ArrowRight: () => (v.ox += step),
      ArrowUp: () => (v.oy -= step),
      ArrowDown: () => (v.oy += step),
      '+': () => (v.zoom = clampZoom(state.dragTarget, v.zoom * 1.05)),
      '-': () => (v.zoom = clampZoom(state.dragTarget, v.zoom / 1.05)),
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    checkpoint(`key-${state.dragTarget}`);
    fn();
    layer.set(v);
    emit('design');
  });

  /* ---------- Nombres en lote ---------- */
  const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'batch-title' });
  const names = h('textarea', { rows: 8, placeholder: 'Un nombre por línea\nValentina\nMateo\nSofía', 'aria-label': 'Lista de nombres' });
  const where = h(
    'select',
    { 'aria-label': 'Dónde va el nombre' },
    h('option', { value: 'middle' }, 'En el centro'),
    h('option', { value: 'top' }, 'Arriba (curvo)'),
    h('option', { value: 'bottom' }, 'Abajo (curvo)'),
  );
  const perName = h('input', { type: 'number', min: 1, max: 100, value: '1', class: 'num', 'aria-label': 'Pines por nombre' });
  dlg.append(
    h('h2', { id: 'batch-title' }, 'Nombres en lote'),
    h('p', { class: 'muted small' }, 'Pega una lista de nombres: se crea un pin por nombre con el mismo estilo, imagen y molde del diseño actual.'),
    names,
    h('div', { class: 'row wrap' }, h('label', {}, 'El nombre va', ' ', where), h('label', {}, 'Pines por nombre', ' ', perName)),
    h(
      'div',
      { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Cancelar'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onclick: () => {
            const d = current();
            const list = names.value
              .split(/\r?\n|,|;/)
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 300);
            if (!d || !list.length) return toast('Escribe al menos un nombre');
            checkpoint();
            const n = Math.max(1, Math.min(100, parseInt(perName.value) || 1));
            const key = where.value as 'middle' | 'top' | 'bottom';
            let firstId: number | null = null;
            for (const name of list) {
              const z = cloneDesign(d);
              z.qty = n;
              z.text[key] = name;
              state.designs.push(z);
              firstId ??= z.id;
            }
            state.selId = firstId;
            dlg.close();
            emit('list', 'design');
            toast(`Se crearon ${list.length} pines con nombre`);
          },
        },
        'Crear pines',
      ),
    ),
  );
  document.body.append(dlg);
  function openBatch() {
    if (!current()) return toast('Primero crea o elige un diseño');
    dlg.showModal();
    names.focus();
  }

  refreshControls();
  redraw();
  return { el: layout, redraw };
}

const round = (v: number) => Math.round(v * 100) / 100;
const normAngle = (a: number) => {
  let x = ((a + 180) % 360) - 180;
  if (x < -180) x += 360;
  return Math.round(x * 10) / 10;
};
