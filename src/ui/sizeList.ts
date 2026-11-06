import { scaleDesign } from '../model/presets';
import type { PinSize } from '../model/sizes';
import { shortName } from '../layout/sheets';
import { current, emit, setSizes, sizeById, state, subscribe } from '../state';
import { applyWithScope } from './applyScope';
import { openCustomSize } from './customSize';
import { h } from './dom';
import { toast } from './toast';

const cm = (mm: number) => (mm / 10).toLocaleString('es', { maximumFractionDigits: 2 });

/** Elige un tamaño: queda para los pines nuevos y se aplica según "Aplicar a". */
export async function chooseSize(to: PinSize): Promise<void> {
  state.defSizeId = to.id;
  emit('view');
  if (!state.designs.length) return void toast(`Los pines nuevos serán de ${shortName(to)}`);
  await applyWithScope({
    title: `Cambiar el tamaño a ${shortName(to)}`,
    apply: (d) => {
      if (d.sizeId !== to.id) scaleDesign(d, sizeById(d.sizeId), to);
    },
  });
}

/** Lista de tamaños en tarjetas (círculo de muestra, mm y cm, corte). */
export function createSizeList(onPick?: () => void): HTMLElement {
  const list = h('div', { class: 'size-list', role: 'listbox', 'aria-label': 'Tamaño de pin' });
  const render = () => {
    const sel = current()?.sizeId ?? state.defSizeId;
    const maxCut = Math.max(...state.sizes.map((s) => Math.max(s.cutW, s.cutH)));
    list.replaceChildren(
      ...state.sizes.map((s) => {
        const ring = h('span', { class: `size-ring${s.shape === 'heart' ? ' heart' : ''}`, 'aria-hidden': 'true' });
        const d = 12 + (Math.max(s.faceW, s.faceH) / maxCut) * 22;
        ring.style.width = ring.style.height = `${d}px`;
        const title = s.shape === 'circle' ? `${s.faceW} mm · ${cm(s.faceW)} cm` : `${s.name.split(' ')[0]} ${cm(s.faceW)} × ${cm(s.faceH)} cm`;
        const sub = `corte ${s.shape === 'circle' ? cm(s.cutW) : `${cm(s.cutW)} × ${cm(s.cutH)}`} cm${s.id === 'r75' ? ' · otro molde' : ''}${s.custom ? ' · personalizado' : ''}`;
        return h(
          'button',
          {
            type: 'button',
            role: 'option',
            class: 'size-card',
            'aria-selected': String(s.id === sel),
            onclick: async () => {
              await chooseSize(s);
              onPick?.();
            },
          },
          h('span', { class: 'size-ring-box' }, ring),
          h('span', { class: 'size-txt' }, h('strong', {}, title), h('small', {}, sub)),
          s.id === 'r58' ? h('span', { class: 'size-badge' }, 'COMÚN') : null,
        );
      }),
      h(
        'button',
        {
          type: 'button',
          class: 'size-card add',
          onclick: async () => {
            const made = await openCustomSize();
            if (!made) return;
            setSizes([...state.sizes, made]);
            await chooseSize(made);
            onPick?.();
          },
        },
        h('span', { class: 'size-txt' }, h('strong', {}, '+ Tamaño personalizado'), h('small', {}, 'escribo cara y corte en mm')),
      ),
    );
  };
  subscribe((k) => {
    if (k.has('sizes') || k.has('list') || k.has('design') || k.has('view')) render();
  });
  render();
  return list;
}
