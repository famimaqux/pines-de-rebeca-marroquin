import { cloneDesign, newDesign } from '../model/design';
import { applyPreset } from '../model/presets';
import { MAX_QTY } from '../layout/sheets';
import { addImageBlob } from '../image/store';
import { addDesign, checkpoint, current, emit, selectOnly, sizeById, state, subscribe } from '../state';
import { h } from './dom';
import { renderThumb } from './preview';
import { imagesFor } from './resources';
import { toast } from './toast';

/** Agrega imágenes: cada una se convierte en un pin del tamaño por defecto. */
export async function addFiles(files: Iterable<File>): Promise<void> {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  const added: number[] = [];
  checkpoint();
  for (const f of list) {
    try {
      const rec = await addImageBlob(f);
      added.push(addDesign(newDesign(state.defSizeId, rec.id)).id);
    } catch {
      toast(`No se pudo leer ${f.name}`);
    }
  }
  // Los pines nuevos quedan seleccionados: lo que cambies en la barra se les aplica.
  if (added.length) {
    selectOnly(added);
    toast(`${added.length} imagen(es) agregada(s) como pines de ${sizeById(state.defSizeId).name} (quedan seleccionadas)`);
  }
}

export interface StripHooks {
  openEditor: () => void;
}

/** Tira de miniaturas: seleccionar, cantidad, editar, duplicar y borrar. */
export function createDesignsStrip(hooks: StripHooks): HTMLElement {
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
        selectOnly([d.id]);
        hooks.openEditor();
      },
    },
    '+ Pin sin imagen',
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

  const list = h('ul', { class: 'strip', 'aria-label': 'Tus diseños' });
  const count = h('span', { class: 'muted small' });
  const thumbs = new Map<number, HTMLCanvasElement>();

  function renderList() {
    thumbs.clear();
    const total = state.designs.reduce((a, d) => a + Math.max(0, d.qty), 0);
    count.textContent = state.designs.length ? `${state.designs.length} diseño(s) · ${total} pin(es)` : 'Todavía no hay diseños';
    list.replaceChildren(
      ...state.designs.map((d, i) => {
        const s = sizeById(d.sizeId);
        const c = h('canvas', { 'aria-hidden': 'true' });
        thumbs.set(d.id, c);
        const label = d.text.middle || d.text.top || d.text.bottom || `Diseño ${i + 1}`;
        const qty = h('input', { type: 'number', min: 0, max: MAX_QTY, value: String(d.qty), class: 'num', 'aria-label': `Cantidad de ${label}` });
        qty.addEventListener('change', () => {
          checkpoint();
          d.qty = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(qty.value) || 0)));
          qty.value = String(d.qty);
          emit('list');
        });
        const pick = h(
          'button',
          {
            type: 'button',
            class: 'pick',
            title: `${label} · ${s.name} (doble clic para editar)`,
            'aria-pressed': String(state.selection.has(d.id)),
            onclick: (e: Event) => {
              const me = e as MouseEvent;
              if (me.ctrlKey || me.metaKey || me.shiftKey) {
                // Ctrl/Mayús + clic: sumar o quitar de la selección
                if (state.selection.has(d.id)) state.selection.delete(d.id);
                else state.selection.add(d.id);
                state.selId = d.id;
                emit('list', 'design', 'view');
              } else selectOnly([d.id]);
            },
            ondblclick: () => hooks.openEditor(),
          },
          c,
          h('span', { class: 'meta' }, h('strong', {}, `Diseño ${i + 1}`), h('span', { class: 'qty-tag' }, ` · ×${d.qty}`), h('span', { class: 'muted small size-tag' }, s.shape === 'circle' ? `${s.faceW} mm` : s.name)),
        );
        const edit = h(
          'button',
          {
            type: 'button',
            class: 'btn-icon',
            title: 'Editar',
            'aria-label': `Editar ${label}`,
            onclick: () => {
              selectOnly([d.id]);
              hooks.openEditor();
            },
          },
          '✎',
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
        return h(
          'li',
          { class: state.selection.has(d.id) ? 'item on' : 'item' },
          pick,
          h('div', { class: 'item-actions' }, h('label', { class: 'mini inline' }, h('span', {}, '×'), qty), edit, dup, del),
        );
      }),
    );
    for (const d of state.designs) {
      const c = thumbs.get(d.id);
      if (c) renderThumb(c, d, sizeById(d.sizeId), imagesFor(d), 40);
    }
  }

  subscribe((k) => {
    if (k.has('list') || k.has('sizes')) renderList();
    else if (k.has('design')) {
      const d = current();
      const c = d && thumbs.get(d.id);
      if (d && c) renderThumb(c, d, sizeById(d.sizeId), imagesFor(d), 40);
    }
  });

  renderList();
  return h('section', { class: 'strip-card', 'aria-label': 'Tus diseños' }, h('div', { class: 'strip-head' }, h('strong', {}, 'Tus diseños'), count, h('span', { class: 'spacer' }), blank, clearBtn), list);
}
