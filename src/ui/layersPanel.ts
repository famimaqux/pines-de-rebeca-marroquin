import { EMOJIS, EPSON_ADJUST, FONTS, NEUTRAL_ADJUST, newSticker, type Design } from '../model/design';
import { addImageBlob } from '../image/store';
import { checkpoint, current, editTargets, emit } from '../state';
import { fmtNum, h, uniqueId } from './dom';
import { toast } from './toast';
import { applyWithScope } from './applyScope';
import { bgGallery, ringGallery, wordArtGallery } from './galleries';
import { copyAdjust, copyBackground, copyCutout, copyRing, copyStickers, copyTextStyle } from '../model/styleCopy';

/** Botón "🎯 Aplicar … a otros pines": copia esa parte del pin actual con el cuadro de alcance. */
function applyToOthers(what: string, copy: (src: Design, dst: Design, extra: boolean) => void, extra?: { label: string; checked: boolean }): CtlA {
  return {
    adv: true,
    kind: 'custom',
    build: () => {
      const el = h(
        'div',
        { class: 'apply-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn ghost small',
            onclick: () => {
              const d = current();
              if (!d) return;
              const src = structuredClone(d);
              void applyWithScope({
                title: `Aplicar ${what} de este pin`,
                preferred: 'sheet',
                extra,
                apply: (z, x) => {
                  if (z.id !== src.id) copy(src, z, x);
                },
              });
            },
          },
          `Aplicar ${what} a otros pines…`,
        ),
      );
      return { el, refresh: () => {} };
    },
  };
}

/** Controles de las capas del pin, generados a partir de una descripción. */

type Cond = (d: Design) => boolean;
type Ctl =
  | { kind: 'range'; path: string; label: string; min: number; max: number; step: number; unit?: string; pct?: boolean; show?: Cond; reset?: number }
  | { kind: 'color'; path: string; label: string; show?: Cond }
  | { kind: 'select'; path: string; label: string; options: [string, string][]; show?: Cond; font?: boolean }
  | { kind: 'check'; path: string; label: string; show?: Cond }
  | { kind: 'text'; path: string; label: string; placeholder?: string; show?: Cond; wide?: boolean }
  | { kind: 'image'; path: string; label: string; show?: Cond; onSet?: (d: Design) => void; button?: string }
  | { kind: 'custom'; build: () => { el: HTMLElement; refresh: () => void }; show?: Cond };
/** adv = va dentro de "☰ Más opciones" (para que la vista sea simple). */
type CtlA = Ctl & { adv?: boolean };

interface Section {
  id: string;
  title: string;
  open?: boolean;
  controls: CtlA[];
}

const gradient: Cond = (d) => d.bg.type === 'lineal' || d.bg.type === 'radial';
const hasColor: Cond = (d) => d.bg.type === 'solido' || gradient(d);
const hasPattern: Cond = (d) => d.pattern.type !== 'ninguno';
const hasRing: Cond = (d) => d.ring.type !== 'ninguno';
const hasImage: Cond = (d) => !!d.image.imageId;
const hasText: Cond = (d) => !!(d.text.top || d.text.bottom || d.text.middle);
const twoColors: Cond = (d) => d.text.fill === 'degradado' || d.text.fill === 'alternado';

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}
function setPath(obj: unknown, path: string, v: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const target = keys.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as Record<string, unknown>;
  target[last] = v;
}

export interface LayersPanelHooks {
  /** prefijo de los ids de las secciones (para tener dos copias del panel) */
  idPrefix?: string;
  /** Bloque extra en "Quitar fondo" (IA), lo agrega la etapa de IA. */
  aiBlock?: () => { el: HTMLElement; refresh: () => void };
}

export interface LayersPanel {
  el: HTMLElement;
  /** contenido de cada sección por id (fondo, patron, imagen, quitar, mejora, borde, texto, stickers) */
  parts: Record<string, HTMLElement>;
  refresh(): void;
}

export function createLayersPanel(hooks: LayersPanelHooks = {}): LayersPanel {
  const SECTIONS: Section[] = [
    {
      id: 'fondo',
      title: '1 · Fondo',
      open: true,
      controls: [
        { kind: 'custom', build: bgGallery },
        {
          kind: 'image',
          path: 'bg.imageId',
          label: 'Imagen de fondo propia (foto, textura, papel decorado)',
          button: 'Cargar imagen de fondo…',
          onSet: (d) => Object.assign(d.bg, { ox: 0, oy: 0, zoom: 1, rot: 0 }),
        },
        {
          kind: 'select',
          path: 'bg.type',
          label: 'Color de fondo',
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
        { kind: 'range', path: 'bg.ox', label: 'Mover ↔', min: -50, max: 50, step: 0.5, unit: 'mm', reset: 0 },
        { kind: 'range', path: 'bg.oy', label: 'Mover ↕', min: -50, max: 50, step: 0.5, unit: 'mm', reset: 0 },
        { kind: 'range', path: 'bg.zoom', label: 'Zoom', min: 0.3, max: 4, step: 0.05, unit: '×', reset: 1 },
        { kind: 'range', path: 'bg.rot', label: 'Girar', min: -180, max: 180, step: 1, unit: '°', reset: 0 },
        applyToOthers('el fondo y el patrón', (s, z) => copyBackground(s, z)),
      ],
    },
    {
      id: 'patron',
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
        { kind: 'range', path: 'pattern.alpha', label: 'Opacidad', min: 0.05, max: 1, step: 0.05, pct: true, show: hasPattern },
        { kind: 'range', path: 'pattern.scale', label: 'Escala', min: 3, max: 20, step: 0.5, unit: 'mm', show: hasPattern },
        applyToOthers('el fondo y el patrón', (s, z) => copyBackground(s, z)),
      ],
    },
    {
      id: 'imagen',
      title: '4 · Imagen principal',
      open: true,
      controls: [
        {
          kind: 'image',
          path: 'image.imageId',
          label: 'Foto o dibujo',
          onSet: (d) => {
            Object.assign(d.image, { zoom: 1, ox: 0, oy: 0, rot: 0 });
            d.cutout.maskId = null;
          },
        },
        {
          kind: 'select',
          path: 'image.fit',
          label: 'Ajuste',
          options: [
            ['cubrir', 'Cubrir todo el pin'],
            ['encajar', 'Encajar completa (deja ver el fondo)'],
          ],
          show: hasImage,
        },
        {
          kind: 'select',
          path: 'image.clip',
          label: 'Llega',
          options: [
            ['corte', 'Hasta el corte'],
            ['cara', 'Solo la cara visible'],
          ],
          show: hasImage,
        },
        { kind: 'range', path: 'image.zoom', label: 'Zoom', min: 0.2, max: 5, step: 0.02, unit: '×', show: hasImage, reset: 1 },
        { kind: 'range', path: 'image.ox', label: 'Mover ↔', min: -50, max: 50, step: 0.25, unit: 'mm', show: hasImage, reset: 0 },
        { kind: 'range', path: 'image.oy', label: 'Mover ↕', min: -50, max: 50, step: 0.25, unit: 'mm', show: hasImage, reset: 0 },
        { kind: 'range', path: 'image.rot', label: 'Girar', min: -180, max: 180, step: 1, unit: '°', show: hasImage, reset: 0 },
      ],
    },
    {
      id: 'quitar',
      title: '✂ Quitar fondo de la foto',
      controls: [
        { kind: 'check', path: 'cutout.quick', label: 'Modo rápido: quitar fondo liso (blanco o de un color)', show: hasImage },
        { kind: 'range', path: 'cutout.tol', label: 'Tolerancia', min: 5, max: 120, step: 1, show: (d) => hasImage(d) && d.cutout.quick },
        { kind: 'range', path: 'cutout.soft', label: 'Suavizado del borde', min: 0, max: 60, step: 1, show: (d) => hasImage(d) && d.cutout.quick },
        ...(hooks.aiBlock ? [{ kind: 'custom' as const, build: hooks.aiBlock, show: hasImage }] : []),
        {
          kind: 'custom',
          show: hasImage,
          build: () => {
            const el = h(
              'p',
              { class: 'muted small span-all' },
              'Para corregir a mano usa la varita o el pincel del editor de pin.',
            );
            return { el, refresh: () => {} };
          },
        },
        {
          kind: 'custom',
          show: (d) => !hasImage(d),
          build: () => ({ el: h('p', { class: 'muted small span-all' }, 'Primero carga una foto en “Imagen principal”.'), refresh: () => {} }),
        },
        { ...applyToOthers('el quitar fondo rápido', (s, z) => copyCutout(s, z)), show: (d: Design) => hasImage(d) && d.cutout.quick },
      ],
    },
    {
      id: 'mejora',
      title: '🖨 Mejora de impresión',
      controls: [
        {
          kind: 'custom',
          build: () => {
            const epson = h(
              'button',
              {
                type: 'button',
                class: 'btn small',
                onclick: () => {
                  if (!current()) return;
                  void applyWithScope({
                    title: 'Optimizar para Epson L8050 (+4 % brillo, +8 % contraste, +15 % saturación, nitidez 0,35)',
                    preferred: 'all',
                    apply: (z) => (z.adjust = { ...EPSON_ADJUST }),
                  }).then((n) => n && toast('Recuerda desactivar PhotoEnhance al imprimir.', 4000));
                },
              },
              'Optimizar para Epson L8050',
            );
            const reset = h(
              'button',
              {
                type: 'button',
                class: 'btn ghost small',
                onclick: () => {
                  if (!current()) return;
                  void applyWithScope({ title: 'Quitar la mejora de impresión', preferred: 'this', apply: (z) => (z.adjust = { ...NEUTRAL_ADJUST }) });
                },
              },
              'Restablecer',
            );
            return { el: h('div', { class: 'row wrap span-all' }, epson, reset), refresh: () => {} };
          },
        },
        {
          kind: 'custom',
          build: () => {
            const b = h(
              'button',
              {
                type: 'button',
                class: 'btn small',
                onclick: () => {
                  if (!current()) return;
                  void applyWithScope({
                    title: 'Mejorar colores: más vivos y claritos',
                    preferred: 'selected',
                    apply: (z) => (z.adjust = { ...z.adjust, auto: 1 }),
                  }).then((n) => n && toast('Colores mejorados. Ajusta la intensidad con “Mejora automática”.', 3500));
                },
              },
              'Mejorar colores',
            );
            return {
              el: h('div', { class: 'span-all' }, b, h('p', { class: 'muted small' }, 'Para fotos opacas u oscuras: estira los colores, aclara los tonos medios y aviva los colores apagados.')),
              refresh: () => {},
            };
          },
        },
        { kind: 'range', path: 'adjust.auto', label: 'Mejora automática', min: 0, max: 1, step: 0.05, pct: true, reset: 0 },
        { kind: 'range', path: 'adjust.bright', label: 'Brillo', min: 0.5, max: 1.6, step: 0.01, pct: true, reset: 1 },
        { kind: 'range', path: 'adjust.contrast', label: 'Contraste', min: 0.5, max: 1.8, step: 0.01, pct: true, reset: 1 },
        { kind: 'range', path: 'adjust.sat', label: 'Saturación', min: 0, max: 2, step: 0.01, pct: true, reset: 1 },
        { kind: 'range', path: 'adjust.sharp', label: 'Nitidez', min: 0, max: 1, step: 0.05, reset: 0 },
        applyToOthers('la mejora de impresión', (s, z) => copyAdjust(s, z)),
      ],
    },
    {
      id: 'borde',
      title: '5 · Borde / aro',
      controls: [
        { kind: 'custom', build: ringGallery },
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
        applyToOthers('el borde', (s, z) => copyRing(s, z)),
      ],
    },
    {
      id: 'texto',
      title: '6 · Texto y modelos de letra',
      controls: [
        { kind: 'text', path: 'text.middle', label: 'Nombre o texto del centro', placeholder: 'Ej.: Valentina', wide: true },
        { kind: 'text', path: 'text.top', label: 'Texto de arriba (curvo)', placeholder: 'Ej.: Feliz cumple' },
        { kind: 'text', path: 'text.bottom', label: 'Texto de abajo (curvo)', placeholder: 'Ej.: 5 añitos' },
        { kind: 'custom', build: wordArtGallery },
        {
          kind: 'select',
          path: 'text.shape',
          label: 'Forma del texto del centro (WordArt)',
          options: [
            ['recto', 'Recto'],
            ['arcoArriba', 'Arco hacia arriba ⌒'],
            ['arcoAbajo', 'Arco hacia abajo ⌣'],
            ['onda', 'Onda ∿'],
          ],
          show: (d) => !!d.text.middle,
        },
        { kind: 'range', path: 'text.bend', label: 'Curvatura', min: 0.05, max: 1, step: 0.05, pct: true, show: (d) => !!d.text.middle && d.text.shape !== 'recto' },
        { kind: 'select', path: 'text.font', label: 'Fuente', options: FONTS.map((f) => [f.family, f.family]), font: true },
        {
          kind: 'select',
          path: 'text.fill',
          label: 'Color de las letras',
          options: [
            ['solido', 'Un color'],
            ['degradado', 'Degradado'],
            ['alternado', 'Dos colores alternados'],
            ['arcoiris', 'Arcoíris (cada letra)'],
            ['porLetra', 'Mis colores por letra'],
            ['contorno', 'Solo contorno (para colorear)'],
          ],
        },
        { kind: 'color', path: 'text.color', label: 'Color 1', show: (d) => d.text.fill !== 'arcoiris' && d.text.fill !== 'porLetra' && d.text.fill !== 'contorno' },
        { kind: 'color', path: 'text.color2', label: 'Color 2', show: twoColors },
        { kind: 'custom', adv: true, build: letterColors, show: (d) => d.text.fill === 'porLetra' },
        { kind: 'check', path: 'text.outline', label: 'Contorno', show: (d) => d.text.fill !== 'contorno' },
        { kind: 'color', path: 'text.outlineColor', label: 'Color del contorno', show: (d) => d.text.outline || d.text.fill === 'contorno' },
        { kind: 'range', path: 'text.outlineWidth', label: 'Grosor del contorno', min: 0.03, max: 0.5, step: 0.01, show: (d) => d.text.outline || d.text.fill === 'contorno' },
        { kind: 'check', path: 'text.outline2', label: 'Segundo contorno (por fuera, estilo WordArt)' },
        { kind: 'color', path: 'text.outline2Color', label: 'Color del 2.º contorno', show: (d) => d.text.outline2 },
        { kind: 'range', path: 'text.outline2Width', label: 'Grosor del 2.º contorno', min: 0.03, max: 0.4, step: 0.01, show: (d) => d.text.outline2 },
        {
          kind: 'select',
          path: 'text.effect',
          label: 'Efecto',
          options: [
            ['ninguno', 'Ninguno'],
            ['sombra', 'Sombra'],
            ['3d', '3D'],
            ['neon', 'Neón (resplandor)'],
            ['brillo', 'Brillo'],
          ],
        },
        { kind: 'color', path: 'text.effectColor', label: 'Color del efecto', show: (d) => d.text.effect === '3d' || d.text.effect === 'neon' },
        { kind: 'range', path: 'text.middleSize', label: 'Tamaño del centro', min: 3, max: 30, step: 0.25, unit: 'mm', show: (d) => !!d.text.middle },
        { kind: 'range', path: 'text.middleY', label: 'Altura del centro', min: -30, max: 30, step: 0.25, unit: 'mm', show: (d) => !!d.text.middle, reset: 0 },
        { kind: 'range', path: 'text.ox', label: 'Mover letras ↔', min: -40, max: 40, step: 0.25, unit: 'mm', show: hasText, reset: 0 },
        { kind: 'range', path: 'text.oy', label: 'Mover letras ↕', min: -40, max: 40, step: 0.25, unit: 'mm', show: hasText, reset: 0 },
        {
          kind: 'custom',
          adv: true,
          show: hasText,
          build: () => ({ el: h('p', { class: 'muted small span-all' }, 'También puedes arrastrar las letras con el dedo o el mouse: en el editor del pin elige “Al arrastrar mueves: Letras”.'), refresh: () => {} }),
        },
        { kind: 'range', path: 'text.size', label: 'Tamaño arriba/abajo', min: 2, max: 14, step: 0.25, unit: 'mm', show: (d) => !!(d.text.top || d.text.bottom) },
        { kind: 'range', path: 'text.inset', label: 'Hacia el centro', min: -3, max: 12, step: 0.25, unit: 'mm', show: (d) => !!(d.text.top || d.text.bottom) },
        applyToOthers('el estilo de letras', (s, z, withText) => copyTextStyle(s, z, withText), { label: 'Aplicar también el texto (el mismo en todos)', checked: false }),
      ],
    },
  ];

  // Lo menos usado va dentro de "☰ Más opciones".
  const ADV = new Set([
    'bg.ox', 'bg.oy', 'bg.zoom', 'bg.rot', 'pattern.alpha', 'pattern.scale',
    'image.clip', 'image.ox', 'image.oy', 'image.rot', 'cutout.tol', 'cutout.soft',
    'adjust.bright', 'adjust.contrast', 'adjust.sat', 'adjust.sharp',
    'ring.finish', 'ring.color', 'ring.width',
    'text.shape', 'text.bend', 'text.font', 'text.fill', 'text.color', 'text.color2',
    'text.outline', 'text.outlineColor', 'text.outlineWidth', 'text.outline2', 'text.outline2Color', 'text.outline2Width',
    'text.effect', 'text.effectColor', 'text.middleSize', 'text.middleY', 'text.size', 'text.inset', 'text.ox', 'text.oy',
  ]);
  const isAdv = (c: CtlA) => !!c.adv || ('path' in c && ADV.has(c.path));

  const el = h('div', { class: 'layers' });
  const refreshers: (() => void)[] = [];
  const d = () => current();

  const field = (ctl: Ctl): HTMLElement => {
    const id = uniqueId('ctl');
    const wrap = h('div', { class: `field field-${ctl.kind}` });
    if (ctl.kind === 'text' && ctl.wide) wrap.classList.add('span-all');
    // Los controles cambian todos los pines seleccionados (o el pin actual si no hay selección).
    const set = (path: string, v: unknown, group?: string) => {
      const targets = editTargets();
      if (!targets.length) return;
      checkpoint(group);
      for (const t of targets) setPath(t, path, v);
      emit('design', 'list');
    };
    switch (ctl.kind) {
      case 'range': {
        const out = h('output', { for: id });
        const inp = h('input', { id, type: 'range', min: ctl.min, max: ctl.max, step: ctl.step });
        inp.addEventListener('input', () => set(ctl.path, parseFloat(inp.value), ctl.path));
        // Doble clic vuelve al valor neutro.
        if (ctl.reset !== undefined) inp.addEventListener('dblclick', () => set(ctl.path, ctl.reset));
        wrap.append(h('label', { for: id }, ctl.label, ' ', out), inp);
        refreshers.push(() => {
          const dd = d();
          if (!dd) return;
          const v = getPath(dd, ctl.path) as number;
          inp.value = String(v);
          out.textContent = ctl.pct ? `${Math.round(v * 100)} %` : `${fmtNum(v, 2)}${ctl.unit ? ' ' + ctl.unit : ''}`;
        });
        break;
      }
      case 'color': {
        const inp = h('input', { id, type: 'color' });
        inp.addEventListener('input', () => set(ctl.path, inp.value, ctl.path));
        wrap.append(h('label', { for: id }, ctl.label), inp);
        refreshers.push(() => {
          const dd = d();
          if (dd) inp.value = getPath(dd, ctl.path) as string;
        });
        break;
      }
      case 'select': {
        const sel = h('select', { id }, ...ctl.options.map(([v, l]) => h('option', { value: v, style: ctl.font ? `font-family:"${v}"` : undefined }, l)));
        sel.addEventListener('change', () => set(ctl.path, sel.value));
        wrap.append(h('label', { for: id }, ctl.label), sel);
        refreshers.push(() => {
          const dd = d();
          if (!dd) return;
          sel.value = getPath(dd, ctl.path) as string;
          if (ctl.font) sel.style.fontFamily = `"${sel.value}"`;
        });
        break;
      }
      case 'check': {
        const inp = h('input', { id, type: 'checkbox' });
        inp.addEventListener('change', () => set(ctl.path, inp.checked));
        wrap.classList.add('span-all');
        wrap.append(h('label', { for: id, class: 'check' }, inp, ' ', ctl.label));
        refreshers.push(() => {
          const dd = d();
          if (dd) inp.checked = getPath(dd, ctl.path) as boolean;
        });
        break;
      }
      case 'text': {
        const inp = h('input', { id, type: 'text', placeholder: ctl.placeholder ?? '', maxlength: 60 });
        inp.addEventListener('input', () => set(ctl.path, inp.value, ctl.path));
        wrap.append(h('label', { for: id }, ctl.label), inp);
        refreshers.push(() => {
          const dd = d();
          if (dd && document.activeElement !== inp) inp.value = getPath(dd, ctl.path) as string;
        });
        break;
      }
      case 'image': {
        const inp = h('input', { id, type: 'file', accept: 'image/*', class: 'visually-hidden' });
        const pick = h('label', { for: id, class: 'btn small', role: 'button', tabindex: 0 }, ctl.button ?? 'Elegir imagen…');
        pick.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inp.click();
          }
        });
        const clear = h('button', { type: 'button', class: 'btn ghost small', onclick: () => set(ctl.path, null) }, 'Quitar');
        inp.addEventListener('change', async () => {
          const f = inp.files?.[0];
          inp.value = '';
          const targets = editTargets();
          if (!f || !targets.length) return;
          try {
            const rec = await addImageBlob(f);
            checkpoint();
            for (const t of targets) {
              setPath(t, ctl.path, rec.id);
              ctl.onSet?.(t);
            }
            emit('design', 'list');
            if (targets.length > 1) toast(`Imagen puesta en ${targets.length} pines seleccionados`);
          } catch {
            toast(`No se pudo leer ${f.name}`);
          }
        });
        wrap.classList.add('span-all');
        wrap.append(h('span', { class: 'label' }, ctl.label), h('div', { class: 'row' }, inp, pick, clear));
        refreshers.push(() => {
          const dd = d();
          const has = !!(dd && getPath(dd, ctl.path));
          clear.hidden = !has;
          pick.textContent = has ? (ctl.button ? 'Cambiar imagen de fondo…' : 'Cambiar imagen…') : (ctl.button ?? 'Elegir imagen…');
        });
        break;
      }
      case 'custom': {
        const c = ctl.build();
        wrap.classList.add('span-all');
        wrap.append(c.el);
        refreshers.push(c.refresh);
        break;
      }
    }
    if (ctl.show) {
      const show = ctl.show;
      refreshers.push(() => {
        const dd = d();
        wrap.hidden = !dd || !show(dd);
      });
    }
    return wrap;
  };

  // Stickers: lista dinámica
  const stickerList = h('div', { class: 'stickers' });
  let stickerSig = '';
  const renderStickers = () => {
    const dd = d();
    const sig = dd ? `${dd.id}:${dd.stickers.map((s) => s.id).join(',')}` : '';
    if (sig === stickerSig) {
      // Solo actualizar valores (por si se arrastró en el editor)
      stickerList.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
        const st = dd?.stickers.find((s) => String(s.id) === inp.dataset.sid);
        if (st && document.activeElement !== inp) inp.value = String(st[inp.dataset.k as 'size']);
      });
      return;
    }
    stickerSig = sig;
    if (!dd) return stickerList.replaceChildren();
    stickerList.replaceChildren(
      ...dd.stickers.map((st, i) => {
        const emoji = h('select', { 'aria-label': `Emoji del sticker ${i + 1}` }, ...EMOJIS.map((e) => h('option', { value: e, selected: e === st.emoji }, e)));
        emoji.addEventListener('change', () => {
          checkpoint();
          st.emoji = emoji.value;
          emit('design');
        });
        const num = (k: 'size' | 'x' | 'y' | 'rot', label: string, min: number, max: number) => {
          const inp = h('input', { type: 'range', min, max, step: 0.5, value: String(st[k]), 'aria-label': `${label} del sticker ${i + 1}`, 'data-k': k, 'data-sid': String(st.id) });
          inp.addEventListener('input', () => {
            checkpoint(`st${st.id}${k}`);
            st[k] = parseFloat(inp.value);
            emit('design');
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
              checkpoint();
              dd.stickers.splice(i, 1);
              emit('design');
            },
          },
          '✕',
        );
        return h('div', { class: 'sticker-row' }, emoji, num('size', 'Tamaño', 3, 40), num('x', '↔', -45, 45), num('y', '↕', -45, 45), num('rot', 'Girar', -180, 180), del);
      }),
    );
  };
  const addSticker = h(
    'button',
    {
      type: 'button',
      class: 'btn small',
      onclick: () => {
        const dd = d();
        if (!dd) return;
        checkpoint();
        // Cada sticker nuevo aparece en un lugar distinto para que no se tapen.
        const n = dd.stickers.length;
        const a = Math.PI / 2 + n * 1.1;
        dd.stickers.push(newSticker(EMOJIS[n % EMOJIS.length], 9, Math.round(Math.cos(a) * 16), Math.round(Math.sin(a) * 16)));
        emit('design');
        toast('Sticker agregado: elige “Sticker” en “Al arrastrar mueves” para moverlo con el dedo o el mouse');
      },
    },
    '+ Agregar sticker',
  );

  const parts: Record<string, HTMLElement> = {};
  for (const sec of SECTIONS) {
    const basic = sec.controls.filter((c) => !isAdv(c));
    const adv = sec.controls.filter(isAdv);
    const body = h(
      'div',
      { class: 'fields', id: `${hooks.idPrefix ?? ''}sec-${sec.id}` },
      ...basic.map(field),
      ...(adv.length ? [h('details', { class: 'more span-all' }, h('summary', {}, 'Más opciones'), h('div', { class: 'fields' }, ...adv.map(field)))] : []),
    );
    parts[sec.id] = body;
    el.append(h('details', { open: !!sec.open }, h('summary', {}, sec.title), body));
  }
  const stickersApply = field(applyToOthers('los stickers', (s, z) => copyStickers(s, z)));
  parts.stickers = h('div', { class: 'fields', id: `${hooks.idPrefix ?? ''}sec-stickers` }, stickerList, addSticker, stickersApply);
  el.append(h('details', {}, h('summary', {}, '7 · Stickers'), parts.stickers));

  return {
    el,
    parts,
    refresh() {
      for (const r of refreshers) r();
      renderStickers();
    },
  };
}

/** Editor de colores "por letra": una paleta de muestras que se puede cambiar. */
function letterColors(): { el: HTMLElement; refresh: () => void } {
  const el = h('div', { class: 'letter-colors' });
  const render = () => {
    const d = current();
    if (!d) return;
    const list = d.text.letterColors.split(',').filter((c) => /^#[0-9a-f]{6}$/i.test(c.trim()));
    el.replaceChildren(
      h('span', { class: 'label' }, 'Colores por letra (se repiten en orden)'),
      h(
        'div',
        { class: 'row wrap' },
        ...list.map((c, i) => {
          const inp = h('input', { type: 'color', value: c.trim(), 'aria-label': `Color ${i + 1}` });
          inp.addEventListener('input', () => {
            checkpoint(`lc${i}`);
            list[i] = inp.value;
            d.text.letterColors = list.join(',');
            emit('design');
          });
          return inp;
        }),
        h(
          'button',
          {
            type: 'button',
            class: 'btn-icon',
            'aria-label': 'Agregar color',
            onclick: () => {
              checkpoint();
              list.push('#ff5fa2');
              d.text.letterColors = list.join(',');
              emit('design');
              render();
            },
          },
          '＋',
        ),
        list.length > 1
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn-icon',
                'aria-label': 'Quitar el último color',
                onclick: () => {
                  checkpoint();
                  list.pop();
                  d.text.letterColors = list.join(',');
                  emit('design');
                  render();
                },
              },
              '－',
            )
          : null,
      ),
    );
  };
  let sig = '';
  return {
    el,
    refresh: () => {
      const d = current();
      const s = d ? `${d.id}|${d.text.letterColors.split(',').length}` : '';
      if (s !== sig) {
        sig = s;
        render();
      }
    },
  };
}
