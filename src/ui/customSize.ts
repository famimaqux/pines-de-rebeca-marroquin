import { SHAPE_LABELS, autoName, sanitizeSize, type PinSize, type Shape } from '../model/sizes';
import { h } from './dom';

/** Cuadro para crear un tamaño personalizado (cara y corte en mm). */
export function openCustomSize(): Promise<PinSize | null> {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'cs-title' });
    const shape = h('select', { 'aria-label': 'Forma' }, ...(Object.keys(SHAPE_LABELS) as Shape[]).map((k) => h('option', { value: k }, SHAPE_LABELS[k])));
    const num = (label: string, value: string) => {
      const input = h('input', { type: 'number', min: 5, max: 200, step: 0.5, value, class: 'num' });
      return { input, wrap: h('label', { class: 'mini' }, h('span', {}, label), input) };
    };
    const fw = num('Cara (diámetro) mm', '50');
    const fh = num('Cara alto mm', '50');
    const cw = num('Corte (diámetro) mm', '62');
    const ch = num('Corte alto mm', '62');
    const name = h('input', { type: 'text', placeholder: 'Nombre (opcional)', 'aria-label': 'Nombre' });
    const err = h('p', { class: 'warn small', hidden: true, role: 'alert' });
    const sync = () => {
      const circle = shape.value === 'circle';
      fh.wrap.hidden = ch.wrap.hidden = circle;
      fw.wrap.querySelector('span')!.textContent = circle ? 'Cara (diámetro) mm' : 'Cara ancho mm';
      cw.wrap.querySelector('span')!.textContent = circle ? 'Corte (diámetro) mm' : 'Corte ancho mm';
    };
    shape.addEventListener('change', sync);
    // Sugerir corte = cara + 12 mm (6 mm de doblez por lado).
    fw.input.addEventListener('input', () => (cw.input.value = String((parseFloat(fw.input.value) || 0) + 12)));
    fh.input.addEventListener('input', () => (ch.input.value = String((parseFloat(fh.input.value) || 0) + 12)));
    sync();
    const done = (v: PinSize | null) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    const ok = h(
      'button',
      {
        type: 'button',
        class: 'btn',
        onclick: () => {
          const n = (i: HTMLInputElement) => parseFloat(i.value.replace(',', '.'));
          const sh = shape.value as Shape;
          const s = sanitizeSize({
            shape: sh,
            faceW: n(fw.input),
            faceH: n(fh.input),
            cutW: n(cw.input),
            cutH: n(ch.input),
            name: name.value || autoName(sh, n(fw.input), sh === 'circle' ? n(fw.input) : n(fh.input)),
            custom: true,
          });
          if (!s) {
            err.textContent = 'Revisa las medidas: el corte debe ser mayor o igual que la cara (máximo 200 mm).';
            err.hidden = false;
            return;
          }
          done(s);
        },
      },
      'Crear tamaño',
    );
    dlg.append(
      h('h2', { id: 'cs-title' }, 'Tamaño personalizado'),
      h('p', { class: 'muted small' }, '“Cara” es lo que se ve del pin terminado; “corte” es el papel que recortas (el sobrante se dobla detrás).'),
      h('div', { class: 'row wrap' }, shape, fw.wrap, fh.wrap, cw.wrap, ch.wrap),
      name,
      err,
      h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Cancelar'), ok),
    );
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(null);
    });
    document.body.append(dlg);
    dlg.showModal();
    fw.input.focus();
  });
}
