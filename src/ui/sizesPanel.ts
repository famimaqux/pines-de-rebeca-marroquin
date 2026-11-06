import { DEFAULT_SIZES, SHAPE_LABELS, autoName, foldMargin, sanitizeSize, saveSizes, type PinSize, type Shape } from '../model/sizes';
import { fmtNum, h } from './dom';

export interface SizesPanelHost {
  getSizes(): PinSize[];
  setSizes(list: PinSize[]): void;
}

/** Tabla de moldes editable + formulario para agregar moldes personalizados. */
export function createSizesPanel(host: SizesPanelHost): HTMLElement {
  const root = h('section', { class: 'card', 'aria-labelledby': 'sizes-title' });
  const status = h('p', { class: 'muted small', role: 'status' });

  const commit = (list: PinSize[], msg = 'Medidas guardadas en este navegador.', rerender = true) => {
    saveSizes(list);
    host.setSizes(list);
    status.textContent = msg;
    if (rerender) render();
  };

  const numInput = (value: number, label: string, onValid: (v: number) => boolean) => {
    const inp = h('input', { type: 'number', min: 1, max: 200, step: 0.5, value: String(value), 'aria-label': label, class: 'num' });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value.replace(',', '.'));
      const ok = onValid(v);
      inp.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok) status.textContent = 'Medida no válida: el corte debe ser mayor o igual que la cara (máx. 200 mm).';
    });
    return inp;
  };

  function render() {
    const sizes = host.getSizes();
    const foldCells: HTMLElement[] = [];
    // Edición en línea: no se redibuja la tabla para no perder el foco del teclado.
    const update = (i: number, patch: Partial<PinSize>): boolean => {
      const list = host.getSizes().slice();
      const next = sanitizeSize({ ...list[i], ...patch });
      if (!next) return false;
      list[i] = next;
      foldCells[i].textContent = `${fmtNum(foldMargin(next))} mm`;
      commit(list, undefined, false);
      return true;
    };

    const rows = sizes.map((s, i) => {
      const isCircle = s.shape === 'circle';
      const pair = (w: number, hh: number, kw: 'faceW' | 'cutW', kh: 'faceH' | 'cutH', what: string) =>
        h(
          'div',
          { class: 'pair' },
          numInput(w, `${what} ancho, ${s.name}`, (v) => update(i, { [kw]: v })),
          isCircle ? null : h('span', { 'aria-hidden': 'true' }, '×'),
          isCircle ? null : numInput(hh, `${what} alto, ${s.name}`, (v) => update(i, { [kh]: v })),
        );
      const name = h('input', { type: 'text', value: s.name, 'aria-label': 'Nombre del molde', class: 'name' });
      name.addEventListener('change', () => update(i, { name: name.value }));
      return h(
        'tr',
        {},
        h('td', {}, name),
        h('td', {}, SHAPE_LABELS[s.shape]),
        h('td', {}, pair(s.faceW, s.faceH, 'faceW', 'faceH', 'Cara visible')),
        h('td', {}, pair(s.cutW, s.cutH, 'cutW', 'cutH', 'Corte')),
        (foldCells[i] = h('td', { class: 'muted' }, `${fmtNum(foldMargin(s))} mm`)),
        h(
          'td',
          {},
          s.custom
            ? h('button', { type: 'button', class: 'btn-icon', title: `Borrar ${s.name}`, 'aria-label': `Borrar ${s.name}`, onclick: () => commit(host.getSizes().filter((x) => x.id !== s.id), `Se borró “${s.name}”.`) }, '🗑')
            : null,
        ),
      );
    });

    root.replaceChildren(
      h('h2', { id: 'sizes-title' }, 'Medidas de los moldes'),
      h(
        'p',
        { class: 'muted small' },
        '“Cara visible” es lo que se ve del pin terminado. “Corte” es el papel que recortas: el sobrante se dobla detrás de la chapa. Mide tu molde real y ajusta aquí si hace falta.',
      ),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'sizes' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Molde'), h('th', {}, 'Forma'), h('th', {}, 'Cara visible (mm)'), h('th', {}, 'Corte (mm)'), h('th', {}, 'Doblez'), h('th', {}, ''))),
          h('tbody', {}, ...rows),
        ),
      ),
      addForm(),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn ghost',
            onclick: () => {
              if (confirm('¿Volver a las medidas de fábrica? Se borrarán los moldes personalizados.')) commit(DEFAULT_SIZES.map((s) => ({ ...s })), 'Medidas de fábrica restablecidas.');
            },
          },
          'Restablecer medidas de fábrica',
        ),
        status,
      ),
    );
  }

  function addForm(): HTMLElement {
    const shape = h(
      'select',
      { 'aria-label': 'Forma del molde nuevo' },
      ...(Object.keys(SHAPE_LABELS) as Shape[]).map((k) => h('option', { value: k }, SHAPE_LABELS[k])),
    );
    const mk = (label: string, value: string) => {
      const input = h('input', { type: 'number', min: 1, max: 200, step: 0.5, value, class: 'num', 'aria-label': label });
      return { input, wrap: h('label', { class: 'mini' }, h('span', {}, label), input) };
    };
    const fw = mk('Cara ancho', '50');
    const fh = mk('Cara alto', '50');
    const cw = mk('Corte ancho', '62');
    const ch = mk('Corte alto', '62');
    const name = h('input', { type: 'text', placeholder: 'Nombre (opcional)', 'aria-label': 'Nombre del molde nuevo' });
    const syncShape = () => {
      const circle = shape.value === 'circle';
      fh.wrap.hidden = circle;
      ch.wrap.hidden = circle;
      fw.wrap.querySelector('span')!.textContent = circle ? 'Cara (diámetro)' : 'Cara ancho';
      cw.wrap.querySelector('span')!.textContent = circle ? 'Corte (diámetro)' : 'Corte ancho';
    };
    shape.addEventListener('change', syncShape);
    // Sugerir el corte = cara + 12 mm (6 mm de doblez por lado) al cambiar la cara.
    fw.input.addEventListener('input', () => (cw.input.value = String((parseFloat(fw.input.value) || 0) + 12)));
    fh.input.addEventListener('input', () => (ch.input.value = String((parseFloat(fh.input.value) || 0) + 12)));
    syncShape();

    const form = h(
      'form',
      { class: 'add-size' },
      h('strong', {}, 'Agregar molde personalizado'),
      h('div', { class: 'row wrap' }, shape, fw.wrap, fh.wrap, cw.wrap, ch.wrap, name, h('button', { type: 'submit', class: 'btn' }, '+ Agregar')),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
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
        status.textContent = 'Revisa las medidas: el corte debe ser mayor o igual que la cara (máx. 200 mm).';
        return;
      }
      commit([...host.getSizes(), s], `Molde “${s.name}” agregado.`);
    });
    return form;
  }

  render();
  return root;
}
