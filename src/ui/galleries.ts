import { fontCss, newDesign, type Design, type TextLayer } from '../model/design';
import { BG_PRESETS, RING_PRESETS, WORDART, applyBgPreset, applyRingPreset, applyWordArt } from '../model/galleries';
import { DEFAULT_SIZES, type PinSize } from '../model/sizes';
import { getImage } from '../image/store';
import { drawPin } from '../render/drawPin';
import { layoutShaped, paintGlyphs } from '../render/text';
import { current, state } from '../state';
import { applyWithScope } from './applyScope';
import { h } from './dom';

/** Galerías de un clic (fondos, bordes y WordArt) que usan "¿A qué pines lo aplico?". */

const SAMPLE: PinSize = DEFAULT_SIZES.find((s) => s.id === 'r58')!;

function pinPreview(d: Design, px = 64): HTMLCanvasElement {
  const c = h('canvas', { 'aria-hidden': 'true' });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = px * dpr;
  c.style.width = c.style.height = `${px}px`;
  const ctx = c.getContext('2d')!;
  const k = (px * dpr) / (SAMPLE.faceW + 2);
  ctx.setTransform(k, 0, 0, k, (px * dpr) / 2, (px * dpr) / 2);
  drawPin(ctx, d, SAMPLE, { main: null, bg: getImage(d.bg.imageId)?.bitmap ?? null }, { faceOnly: true });
  return c;
}

const sampleDesign = () => {
  const d = newDesign(SAMPLE.id);
  d.qty = 0;
  return d;
};

/** Fondos prediseñados + "Tus fondos" (imágenes de fondo que ya cargaste). */
export function bgGallery(): { el: HTMLElement; refresh: () => void } {
  const grid = h('div', { class: 'pin-gallery' });
  for (const p of BG_PRESETS) {
    const d = sampleDesign();
    applyBgPreset(d, p);
    grid.append(
      h(
        'button',
        {
          type: 'button',
          class: 'pin-pick',
          title: `Fondo “${p.name}”`,
          onclick: () => {
            if (!current()) return;
            void applyWithScope({ title: `Fondo “${p.name}”`, preferred: 'selected', apply: (z) => applyBgPreset(z, p) });
          },
        },
        pinPreview(d),
        h('span', {}, p.name),
      ),
    );
  }
  const mine = h('div', { class: 'pin-gallery mine' });
  const mineBox = h('div', { class: 'span-all', hidden: true }, h('span', { class: 'label' }, 'Tus fondos (imágenes que ya cargaste)'), mine);
  let sig = '';
  const refresh = () => {
    const ids = [...new Set(state.designs.map((d) => d.bg.imageId).filter((x): x is string => !!x && !!getImage(x)))];
    const s = ids.join(',');
    if (s === sig) return;
    sig = s;
    mineBox.hidden = !ids.length;
    mine.replaceChildren(
      ...ids.map((id, i) => {
        const d = sampleDesign();
        d.bg.imageId = id;
        return h(
          'button',
          {
            type: 'button',
            class: 'pin-pick',
            title: `Usar tu fondo ${i + 1}`,
            onclick: () => {
              if (!current()) return;
              void applyWithScope({
                title: `Tu fondo ${i + 1}`,
                preferred: 'selected',
                apply: (z) => {
                  z.bg = { ...z.bg, imageId: id, ox: 0, oy: 0, zoom: 1, rot: 0 };
                },
              });
            },
          },
          pinPreview(d),
          h('span', {}, `Fondo ${i + 1}`),
        );
      }),
    );
  };
  return { el: h('div', { class: 'span-all gallery-box' }, h('span', { class: 'label' }, '✨ Fondos prediseñados (toca uno)'), grid, mineBox), refresh };
}

/** Modelos de círculo / borde. */
export function ringGallery(): { el: HTMLElement; refresh: () => void } {
  const grid = h('div', { class: 'pin-gallery' });
  for (const p of RING_PRESETS) {
    const d = sampleDesign();
    applyBgPreset(d, BG_PRESETS[0]);
    applyRingPreset(d, p);
    grid.append(
      h(
        'button',
        {
          type: 'button',
          class: 'pin-pick',
          title: `Borde “${p.name}”`,
          onclick: () => {
            if (!current()) return;
            void applyWithScope({ title: `Borde “${p.name}”`, preferred: 'selected', apply: (z) => applyRingPreset(z, p) });
          },
        },
        pinPreview(d),
        h('span', {}, p.name),
      ),
    );
  }
  return { el: h('div', { class: 'span-all gallery-box' }, h('span', { class: 'label' }, '💍 Modelos de círculo / borde'), grid), refresh: () => {} };
}

/** WordArt de un clic con vista previa del nombre escrito. */
export function wordArtGallery(): { el: HTMLElement; refresh: () => void } {
  const grid = h('div', { class: 'gallery-grid' });
  const items: { name: string; canvas: HTMLCanvasElement }[] = [];
  for (const name of Object.keys(WORDART)) {
    const canvas = h('canvas', { width: 300, height: 130, 'aria-hidden': 'true' });
    items.push({ name, canvas });
    grid.append(
      h(
        'button',
        {
          type: 'button',
          class: 'style-btn',
          title: `WordArt “${name}”`,
          onclick: () => {
            const d = current();
            if (!d) return;
            const word = d.text.middle || d.text.top || d.text.bottom || 'Tu nombre';
            void applyWithScope({
              title: `WordArt “${name}”`,
              preferred: 'selected',
              extra: { label: `Poner también el mismo texto “${word}” en todos`, checked: false },
              apply: (z, same) => {
                applyWordArt(z, name);
                if (same || !(z.text.middle || z.text.top || z.text.bottom)) z.text.middle = word;
              },
            });
          },
        },
        canvas,
        h('span', {}, name),
      ),
    );
  }
  let last = '';
  const refresh = () => {
    const d = current();
    const word = (d?.text.middle || d?.text.top || 'Rebeca').slice(0, 14);
    const key = `${word}|${document.fonts?.status}`;
    if (key === last) return;
    last = key;
    for (const { name, canvas } of items) {
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const t: TextLayer = { ...newDesign('x').text, ...WORDART[name] };
      const fs = 46;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = fontCss(t.font, fs);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      paintGlyphs(ctx, layoutShaped(ctx, word, 0, canvas.width - 40, fs, t.shape, t.bend), t, fs);
    }
  };
  return { el: h('div', { class: 'span-all gallery-box' }, h('span', { class: 'label' }, '🅰️ WordArt de un clic'), grid), refresh };
}
