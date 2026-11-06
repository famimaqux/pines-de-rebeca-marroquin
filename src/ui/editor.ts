import { cloneDesign, type Design } from '../model/design';
import { PRESETS, applyPreset, scaleDesign } from '../model/presets';
import { foldMargin, sizeOptionLabel } from '../model/sizes';
import { applyWithScope } from './applyScope';
import { copyStyleScaled } from '../model/styleCopy';
import { effectivePpi } from '../render/drawPin';
import { getImage } from '../image/store';
import { canRedo, canUndo, checkpoint, current, emit, redo, sizeById, state, subscribe, undo, type BrushMode, type DragTarget } from '../state';
import { brushTo, commitBrush, drawBrushOverlay } from './brush';
import { fmtNum, h } from './dom';
import { renderPreview, type PreviewGeometry } from './preview';
import { imagesFor } from './resources';
import { toast } from './toast';

/** Ppp mínimos para que la foto no salga borrosa. */
export const MIN_PPI = 200;

export function createEditor(): { el: HTMLElement; redraw: () => void } {
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
  const brushes: [BrushMode, string][] = [
    ['off', 'Apagado'],
    ['erase', '🧽 Borrar'],
    ['restore', '🖌 Restaurar'],
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
          if (m !== 'off' && !d?.image.imageId) return toast('Primero carga una foto');
          state.brush.mode = m;
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
  const brushRow = h('div', { class: 'row wrap brush-row' }, h('span', { class: 'label' }, 'Pincel:'), h('div', { class: 'segmented' }, ...brushBtns), h('label', { class: 'mini inline' }, h('span', {}, 'Tamaño'), brushSize, brushOut));

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
    '⊙ Centrar',
  );

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
    '📋 Copiar estilo a…',
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
    '📐 Este diseño en todos los tamaños',
  );
  const batchBtn = h('button', { type: 'button', class: 'btn ghost small', onclick: () => openBatch() }, '🏷 Nombres en lote');

  const layout = h(
    'section',
    { class: 'card preview', 'aria-labelledby': 'editor-title' },
    h('div', { class: 'row between' }, title, h('div', { class: 'row' }, undoBtn, redoBtn)),
    h('div', { class: 'row wrap' }, h('label', { for: 'ed-size' }, 'Molde'), sizeSelect, h('label', { class: 'check', for: 'finished' }, finishedChk, ' Ver pin terminado')),
    h('div', { class: 'row wrap' }, h('span', { class: 'label', id: 'drag-lbl' }, 'Al arrastrar mueves:'), h('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'drag-lbl' }, ...targetBtns), centerBtn),
    h('div', { class: 'canvas-wrap' }, canvas, empty),
    note,
    warn,
    brushRow,
    h('div', { class: 'quick' }, h('span', { class: 'label' }, 'Estilos rápidos'), h('div', { class: 'chips' }, ...presetBtns)),
    h('div', { class: 'row wrap' }, styleAll, allSizes, batchBtn),
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
      overlay: brushing || state.brush.mode !== 'off' ? (ctx) => drawBrushOverlay(ctx, d, s) : undefined,
    });
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
    brushBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(state.brush.mode === brushes[i][0])));
    brushRow.classList.toggle('active', state.brush.mode !== 'off');
    canvas.classList.toggle('brush', state.brush.mode !== 'off');
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
  }

  subscribe((k) => {
    if (k.has('list') || k.has('design') || k.has('view') || k.has('sizes')) refreshControls();
    redraw();
  });

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
    if (brushing && state.brush.mode !== 'off') {
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
    h('h2', { id: 'batch-title' }, '🏷 Nombres en lote'),
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
