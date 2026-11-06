import { cloneDesign, newDesign, type Design } from '../model/design';
import { applyPreset } from '../model/presets';
import { MAX_QTY } from '../layout/sheets';
import { addImageBlob } from '../image/store';
import { addDesign, checkpoint, current, emit, sizeById, state, subscribe } from '../state';
import { h } from './dom';
import { renderThumb } from './preview';
import { imagesFor } from './resources';
import { toast } from './toast';

export interface DesignsListHooks {
  /** Botones extra por diseño (Llenar 1 hoja, etc.), los agrega la etapa del acomodo. */
  qtyActions?: (d: Design) => HTMLElement | null;
}

export async function addFiles(files: Iterable<File>): Promise<void> {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  let ok = 0;
  checkpoint();
  for (const f of list) {
    try {
      const rec = await addImageBlob(f);
      addDesign(newDesign(state.defSizeId, rec.id));
      ok++;
    } catch {
      toast(`No se pudo leer ${f.name}`);
    }
  }
  if (ok) toast(`${ok} imagen(es) agregada(s) en ${sizeById(state.defSizeId).name}`);
}

export function createDesignsList(hooks: DesignsListHooks = {}): HTMLElement {
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', id: 'add-files' });
  file.addEventListener('change', () => {
    if (file.files) void addFiles(file.files);
    file.value = '';
  });
  const drop = h(
    'label',
    { class: 'drop', for: 'add-files', tabindex: 0, role: 'button' },
    h('strong', {}, '📷 Agregar imágenes'),
    h('span', { class: 'muted small' }, 'Toca para elegir o arrastra aquí tus fotos (puedes elegir varias)'),
  );
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      file.click();
    }
  });
  // Arrastrar y soltar archivos en toda la página.
  let depth = 0;
  document.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    depth++;
    drop.classList.add('over');
  });
  document.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      drop.classList.remove('over');
    }
  });
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    depth = 0;
    drop.classList.remove('over');
    void addFiles(e.dataTransfer.files);
  });

  const defSize = h('select', { id: 'def-size' });
  defSize.addEventListener('change', () => (state.defSizeId = defSize.value));

  const blank = h(
    'button',
    {
      type: 'button',
      class: 'btn ghost small',
      onclick: () => {
        checkpoint();
        const d = newDesign(state.defSizeId);
        applyPreset(d, 'Kawaii');
        d.text.middle = 'Tu nombre';
        addDesign(d);
      },
    },
    '＋ Diseño sin imagen',
  );
  const clearBtn = h('button', { type: 'button', class: 'btn ghost small danger' }, 'Vaciar todo');
  clearBtn.addEventListener('click', () => {
    if (!state.designs.length) return;
    if (!confirm(`¿Borrar los ${state.designs.length} diseños? Puedes deshacerlo con Ctrl+Z.`)) return;
    checkpoint();
    state.designs = [];
    state.selId = null;
    emit('list', 'design');
  });

  const list = h('ul', { class: 'designs', 'aria-label': 'Tus diseños' });
  const count = h('p', { class: 'muted small' });

  const thumbs = new Map<number, HTMLCanvasElement>();

  function renderList() {
    defSize.replaceChildren(...state.sizes.map((s) => h('option', { value: s.id, selected: s.id === state.defSizeId }, s.name)));
    thumbs.clear();
    const total = state.designs.reduce((a, d) => a + Math.max(0, d.qty), 0);
    count.textContent = state.designs.length ? `${state.designs.length} diseño(s) · ${total} pin(es) en total` : 'Todavía no hay diseños.';
    list.replaceChildren(
      ...state.designs.map((d, i) => {
        const s = sizeById(d.sizeId);
        const c = h('canvas', { 'aria-hidden': 'true' });
        thumbs.set(d.id, c);
        const qty = h('input', { type: 'number', min: 0, max: MAX_QTY, value: String(d.qty), class: 'num', 'aria-label': `Cantidad del diseño ${i + 1}` });
        qty.addEventListener('change', () => {
          checkpoint();
          d.qty = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(qty.value) || 0)));
          qty.value = String(d.qty);
          emit('list');
        });
        qty.addEventListener('click', (e) => e.stopPropagation());
        const label = d.text.middle || d.text.top || d.text.bottom || `Diseño ${i + 1}`;
        const sel = h(
          'button',
          { type: 'button', class: 'pick', 'aria-pressed': String(d.id === state.selId), onclick: () => ((state.selId = d.id), emit('list', 'design', 'view')) },
          c,
          h('span', { class: 'meta' }, h('strong', {}, label), h('span', { class: 'muted small' }, s.name)),
        );
        const dup = h(
          'button',
          {
            type: 'button',
            class: 'btn-icon',
            title: 'Duplicar',
            'aria-label': `Duplicar ${label}`,
            onclick: () => {
              checkpoint();
              const z = cloneDesign(d);
              state.designs.splice(i + 1, 0, z);
              state.selId = z.id;
              emit('list', 'design');
            },
          },
          '⧉',
        );
        const del = h(
          'button',
          {
            type: 'button',
            class: 'btn-icon',
            title: 'Borrar',
            'aria-label': `Borrar ${label}`,
            onclick: () => {
              checkpoint();
              state.designs.splice(i, 1);
              if (state.selId === d.id) state.selId = state.designs[Math.min(i, state.designs.length - 1)]?.id ?? null;
              emit('list', 'design');
              toast('Diseño borrado (Ctrl+Z para deshacer)');
            },
          },
          '🗑',
        );
        const extra = hooks.qtyActions?.(d) ?? null;
        return h(
          'li',
          { class: d.id === state.selId ? 'item on' : 'item' },
          sel,
          h('div', { class: 'item-actions' }, h('label', { class: 'mini inline' }, h('span', {}, '×'), qty), dup, del),
          extra,
        );
      }),
    );
    updateThumbs();
  }

  function updateThumbs() {
    for (const d of state.designs) {
      const c = thumbs.get(d.id);
      if (c) renderThumb(c, d, sizeById(d.sizeId), imagesFor(d));
    }
  }

  subscribe((k) => {
    if (k.has('list') || k.has('sizes')) renderList();
    else if (k.has('design')) {
      const d = current();
      const c = d && thumbs.get(d.id);
      if (d && c) renderThumb(c, d, sizeById(d.sizeId), imagesFor(d));
    }
  });

  renderList();
  return h(
    'section',
    { class: 'card designs-card', 'aria-labelledby': 'designs-title' },
    h('h2', { id: 'designs-title' }, 'Tus diseños'),
    file,
    drop,
    h('div', { class: 'row wrap' }, h('label', { for: 'def-size' }, 'Tamaño para imágenes nuevas'), defSize),
    h('div', { class: 'row wrap' }, blank, clearBtn),
    count,
    list,
  );
}

export function refreshThumbs(): void {
  emit('list');
}
