import { EMOJIS, FONTS, newSticker, type Bitmap, type Design } from '../model/design';
import { fmtNum, h, loadImageFile, uniqueId } from './dom';

/** Controles de las capas del pin, generados a partir de una descripción. */

type Ctl =
  | { kind: 'range'; path: string; label: string; min: number; max: number; step: number; unit?: string; show?: Cond }
  | { kind: 'color'; path: string; label: string; show?: Cond }
  | { kind: 'select'; path: string; label: string; options: [string, string][]; show?: Cond }
  | { kind: 'check'; path: string; label: string; show?: Cond }
  | { kind: 'text'; path: string; label: string; placeholder?: string; show?: Cond }
  | { kind: 'image'; path: string; label: string; show?: Cond };
type Cond = (d: Design) => boolean;

interface Section {
  title: string;
  open?: boolean;
  controls: Ctl[];
}

const gradient: Cond = (d) => d.bg.type === 'lineal' || d.bg.type === 'radial';
const hasColor: Cond = (d) => d.bg.type === 'solido' || gradient(d);
const hasPattern: Cond = (d) => d.pattern.type !== 'ninguno';
const hasRing: Cond = (d) => d.ring.type !== 'ninguno';

const SECTIONS: Section[] = [
  {
    title: '1 · Fondo',
    open: true,
    controls: [
      {
        kind: 'select',
        path: 'bg.type',
        label: 'Tipo',
        options: [
          ['ninguno', 'Ninguno (blanco)'],
          ['solido', 'Color sólido'],
          ['lineal', 'Degradado lineal'],
          ['radial', 'Degradado radial'],
          ['arcoiris', 'Arcoíris lineal'],
          ['arcoiris_r', 'Arcoíris circular'],
        ],
      },
      { kind: 'color', path: 'bg.c1', label: 'Color 1', show: hasColor },
      { kind: 'color', path: 'bg.c2', label: 'Color 2', show: gradient },
      { kind: 'image', path: 'bg.image', label: '2 · Imagen de fondo (foto, textura, papel)' },
      { kind: 'range', path: 'bg.ox', label: 'Mover ↔', min: -40, max: 40, step: 0.5, unit: 'mm' },
      { kind: 'range', path: 'bg.oy', label: 'Mover ↕', min: -40, max: 40, step: 0.5, unit: 'mm' },
      { kind: 'range', path: 'bg.zoom', label: 'Zoom', min: 0.3, max: 4, step: 0.05, unit: '×' },
      { kind: 'range', path: 'bg.rot', label: 'Girar', min: -180, max: 180, step: 1, unit: '°' },
    ],
  },
  {
    title: '3 · Patrón',
    controls: [
      {
        kind: 'select',
        path: 'pattern.type',
        label: 'Patrón',
        options: [
          ['ninguno', 'Ninguno'],
          ['puntos', 'Lunares'],
          ['rayas', 'Rayas'],
          ['cuadros', 'Cuadros'],
          ['estrellas', 'Estrellas'],
          ['corazones', 'Corazones'],
          ['rayos', 'Rayos de sol'],
        ],
      },
      { kind: 'color', path: 'pattern.color', label: 'Color', show: hasPattern },
      { kind: 'range', path: 'pattern.alpha', label: 'Opacidad', min: 0.05, max: 1, step: 0.05, show: hasPattern },
      { kind: 'range', path: 'pattern.scale', label: 'Escala', min: 3, max: 20, step: 0.5, unit: 'mm', show: hasPattern },
    ],
  },
  {
    title: '4 · Imagen principal',
    open: true,
    controls: [
      { kind: 'image', path: 'image.src', label: 'Foto o dibujo' },
      {
        kind: 'select',
        path: 'image.fit',
        label: 'Ajuste',
        options: [
          ['cubrir', 'Cubrir todo el pin'],
          ['encajar', 'Encajar completa (se ve el fondo)'],
        ],
      },
      {
        kind: 'select',
        path: 'image.clip',
        label: 'Llega',
        options: [
          ['corte', 'Hasta el corte'],
          ['cara', 'Solo la cara visible'],
        ],
      },
      { kind: 'range', path: 'image.zoom', label: 'Zoom', min: 0.2, max: 5, step: 0.02, unit: '×' },
      { kind: 'range', path: 'image.ox', label: 'Mover ↔', min: -40, max: 40, step: 0.25, unit: 'mm' },
      { kind: 'range', path: 'image.oy', label: 'Mover ↕', min: -40, max: 40, step: 0.25, unit: 'mm' },
      { kind: 'range', path: 'image.rot', label: 'Girar', min: -180, max: 180, step: 1, unit: '°' },
    ],
  },
  {
    title: '5 · Borde / aro',
    controls: [
      {
        kind: 'select',
        path: 'ring.type',
        label: 'Estilo',
        options: [
          ['ninguno', 'Ninguno'],
          ['linea', 'Línea'],
          ['doble', 'Doble línea'],
          ['punteado', 'Puntitos'],
          ['banda', 'Banda ancha'],
        ],
      },
      {
        kind: 'select',
        path: 'ring.finish',
        label: 'Acabado',
        options: [
          ['plano', 'Plano (color)'],
          ['oro', 'Dorado'],
          ['plata', 'Plateado'],
          ['rosa', 'Oro rosa'],
        ],
        show: hasRing,
      },
      { kind: 'color', path: 'ring.color', label: 'Color', show: (d) => hasRing(d) && d.ring.finish === 'plano' },
      { kind: 'range', path: 'ring.width', label: 'Grosor', min: 0.3, max: 10, step: 0.1, unit: 'mm', show: hasRing },
    ],
  },
  {
    title: '6 · Texto',
    controls: [
      { kind: 'text', path: 'text.top', label: 'Texto de arriba', placeholder: 'Ej.: Feliz cumple' },
      { kind: 'text', path: 'text.bottom', label: 'Texto de abajo', placeholder: 'Ej.: Rebeca' },
      { kind: 'select', path: 'text.font', label: 'Fuente', options: FONTS.map((f) => [f.family, f.family]) },
      { kind: 'range', path: 'text.size', label: 'Tamaño', min: 2, max: 14, step: 0.25, unit: 'mm' },
      { kind: 'color', path: 'text.color', label: 'Color' },
      { kind: 'check', path: 'text.outline', label: 'Contorno blanco' },
      { kind: 'range', path: 'text.inset', label: 'Hacia el centro', min: -3, max: 12, step: 0.25, unit: 'mm' },
    ],
  },
];

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}
function setPath(obj: unknown, path: string, v: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const target = keys.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as Record<string, unknown>;
  target[last] = v;
}

export interface LayersPanelHost {
  getDesign(): Design;
  /** Se llama tras cada cambio para redibujar. */
  changed(): void;
}

export function createLayersPanel(host: LayersPanelHost): { el: HTMLElement; refresh(): void } {
  const el = h('div', { class: 'layers' });
  const refreshers: (() => void)[] = [];

  const field = (ctl: Ctl): HTMLElement => {
    const id = uniqueId('ctl');
    const wrap = h('div', { class: `field field-${ctl.kind}` });
    const d = () => host.getDesign();
    const set = (v: unknown) => {
      setPath(d(), ctl.path, v);
      host.changed();
      refreshAll();
    };
    switch (ctl.kind) {
      case 'range': {
        const out = h('output', { for: id });
        const inp = h('input', { id, type: 'range', min: ctl.min, max: ctl.max, step: ctl.step });
        inp.addEventListener('input', () => set(parseFloat(inp.value)));
        // Doble clic vuelve al valor neutro.
        inp.addEventListener('dblclick', () => set(ctl.path.endsWith('zoom') ? 1 : ctl.min <= 0 && ctl.max >= 0 ? 0 : ctl.min));
        wrap.append(h('label', { for: id }, ctl.label, ' ', out), inp);
        refreshers.push(() => {
          const v = getPath(d(), ctl.path) as number;
          inp.value = String(v);
          out.textContent = `${fmtNum(v, 2)}${ctl.unit ? ' ' + ctl.unit : ''}`;
        });
        break;
      }
      case 'color': {
        const inp = h('input', { id, type: 'color' });
        inp.addEventListener('input', () => set(inp.value));
        wrap.append(h('label', { for: id }, ctl.label), inp);
        refreshers.push(() => (inp.value = getPath(d(), ctl.path) as string));
        break;
      }
      case 'select': {
        const sel = h('select', { id }, ...ctl.options.map(([v, l]) => h('option', { value: v }, l)));
        sel.addEventListener('change', () => set(sel.value));
        wrap.append(h('label', { for: id }, ctl.label), sel);
        refreshers.push(() => (sel.value = getPath(d(), ctl.path) as string));
        break;
      }
      case 'check': {
        const inp = h('input', { id, type: 'checkbox' });
        inp.addEventListener('change', () => set(inp.checked));
        wrap.append(h('label', { for: id, class: 'check' }, inp, ' ', ctl.label));
        refreshers.push(() => (inp.checked = getPath(d(), ctl.path) as boolean));
        break;
      }
      case 'text': {
        const inp = h('input', { id, type: 'text', placeholder: ctl.placeholder ?? '', maxlength: 60 });
        inp.addEventListener('input', () => {
          setPath(d(), ctl.path, inp.value);
          host.changed();
        });
        wrap.append(h('label', { for: id }, ctl.label), inp);
        refreshers.push(() => {
          if (document.activeElement !== inp) inp.value = getPath(d(), ctl.path) as string;
        });
        break;
      }
      case 'image': {
        const inp = h('input', { id, type: 'file', accept: 'image/*', class: 'visually-hidden' });
        const pick = h('label', { for: id, class: 'btn small' }, 'Elegir imagen…');
        const clear = h('button', { type: 'button', class: 'btn ghost small', onclick: () => set(null) }, 'Quitar');
        const info = h('span', { class: 'muted small' });
        inp.addEventListener('change', async () => {
          const f = inp.files?.[0];
          inp.value = '';
          if (!f) return;
          try {
            set((await loadImageFile(f)) as Bitmap);
          } catch (e) {
            info.textContent = (e as Error).message;
          }
        });
        wrap.append(h('span', { class: 'label' }, ctl.label), h('div', { class: 'row' }, inp, pick, clear, info));
        refreshers.push(() => {
          const has = !!getPath(d(), ctl.path);
          clear.hidden = !has;
          info.textContent = has ? 'imagen cargada' : '';
        });
        break;
      }
    }
    if (ctl.show) refreshers.push(() => (wrap.hidden = !ctl.show!(d())));
    return wrap;
  };

  // Stickers: lista dinámica
  const stickerList = h('div', { class: 'stickers' });
  const renderStickers = () => {
    const d = host.getDesign();
    stickerList.replaceChildren(
      ...d.stickers.map((st, i) => {
        const emoji = h('select', { 'aria-label': `Emoji del sticker ${i + 1}` }, ...EMOJIS.map((e) => h('option', { value: e, selected: e === st.emoji }, e)));
        emoji.addEventListener('change', () => {
          st.emoji = emoji.value;
          host.changed();
        });
        const num = (k: 'size' | 'x' | 'y' | 'rot', label: string, min: number, max: number) => {
          const inp = h('input', { type: 'range', min, max, step: 0.5, value: String(st[k]), 'aria-label': `${label} del sticker ${i + 1}` });
          inp.addEventListener('input', () => {
            st[k] = parseFloat(inp.value);
            host.changed();
          });
          return h('label', { class: 'mini' }, h('span', {}, label), inp);
        };
        const del = h(
          'button',
          {
            type: 'button',
            class: 'btn-icon',
            'aria-label': `Quitar sticker ${i + 1}`,
            onclick: () => {
              d.stickers.splice(i, 1);
              host.changed();
              renderStickers();
            },
          },
          '✕',
        );
        return h('div', { class: 'sticker-row' }, emoji, num('size', 'Tamaño', 3, 40), num('x', '↔', -40, 40), num('y', '↕', -40, 40), num('rot', 'Girar', -180, 180), del);
      }),
    );
  };
  const addSticker = h(
    'button',
    {
      type: 'button',
      class: 'btn small',
      onclick: () => {
        const d = host.getDesign();
        // Cada sticker nuevo aparece en un lugar distinto para que no se tapen.
        const n = d.stickers.length;
        const a = Math.PI / 2 + n * 1.1;
        d.stickers.push(newSticker(EMOJIS[n % EMOJIS.length], 9, Math.round(Math.cos(a) * 16), Math.round(Math.sin(a) * 16)));
        host.changed();
        renderStickers();
      },
    },
    '+ Agregar sticker',
  );

  for (const sec of SECTIONS) {
    el.append(h('details', { open: !!sec.open }, h('summary', {}, sec.title), h('div', { class: 'fields' }, ...sec.controls.map(field))));
  }
  el.append(h('details', {}, h('summary', {}, '7 · Stickers'), h('div', { class: 'fields' }, stickerList, addSticker)));

  function refreshAll() {
    for (const r of refreshers) r();
  }
  return {
    el,
    refresh() {
      refreshAll();
      renderStickers();
    },
  };
}
