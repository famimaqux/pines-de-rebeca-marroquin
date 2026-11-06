import type { Design } from '../model/design';
import { SCOPE_LABELS, availableScopes, targetIds, type Scope, type ScopeContext } from '../model/scope';
import { currentLayout } from '../layout/current';
import { checkpointFrom, current, emit, sizeById, state } from '../state';
import { h } from './dom';
import { renderThumb } from './preview';
import { imagesFor } from './resources';
import { toast } from './toast';

/**
 * ApplyScopeDialog: el MISMO cuadro "¿A qué pines lo aplico?" para todos los
 * cambios (tamaño, fondo, borde, estilos, letras, stickers, color).
 *
 * - Muestra el cambio en la hoja mientras se elige (vista previa).
 * - Al confirmar, todo el cambio se deshace con un solo Ctrl+Z.
 * - Recuerda la última opción y permite "No volver a preguntar en esta sesión".
 */

export interface ApplyRequest {
  /** p. ej. "Cambiar el tamaño a 58 mm" */
  title: string;
  /** Aplica el cambio a un diseño (se llama una vez por cada pin elegido). */
  apply: (d: Design, extra: boolean) => void;
  /** Casilla opcional, p. ej. "Aplicar también el texto (el mismo en todos)". */
  extra?: { label: string; checked: boolean };
  /** Opción preferida si no se recuerda otra (p. ej. 'this' desde el editor). */
  preferred?: Scope;
  /** Aplicar directo a la selección si la hay (sin preguntar). */
  selectionFirst?: boolean;
}

const PREF_KEY = 'pines-rebeca.scope';
let lastScope: Scope | null = null;
let dontAsk = false;
const listeners = new Set<() => void>();
export const onScopePrefsChanged = (fn: () => void) => listeners.add(fn);

try {
  lastScope = (sessionStorage.getItem(PREF_KEY) as Scope | null) ?? null;
  dontAsk = sessionStorage.getItem(PREF_KEY + '.dontAsk') === '1';
} catch {
  /* sin almacenamiento */
}

function savePrefs() {
  try {
    if (lastScope) sessionStorage.setItem(PREF_KEY, lastScope);
    sessionStorage.setItem(PREF_KEY + '.dontAsk', dontAsk ? '1' : '0');
  } catch {
    /* sin almacenamiento */
  }
  listeners.forEach((l) => l());
}

export const scopePrefs = () => ({ lastScope, dontAsk });
/** Botón "volver a preguntar". */
export function askAgain(): void {
  dontAsk = false;
  savePrefs();
  toast('Se volverá a preguntar a qué pines aplicar cada cambio');
}

function context(customIds: ReadonlySet<number>): ScopeContext {
  const page = currentLayout().pages[state.sheet];
  return {
    all: state.designs.map((d) => d.id),
    currentId: current()?.id ?? null,
    selection: state.selection,
    sheetIds: new Set(page ? page.items.map((i) => i.designId) : []),
    customIds,
  };
}

function runOn(ids: number[], req: ApplyRequest, extra: boolean) {
  const set = new Set(ids);
  for (const d of state.designs) if (set.has(d.id)) req.apply(d, extra);
}

const pinsOf = (ids: number[]) => state.designs.filter((d) => ids.includes(d.id)).reduce((a, d) => a + d.qty, 0);

/** Aplica sin preguntar (selección o "no volver a preguntar"). Devuelve cuántos diseños cambiaron. */
function applyDirect(req: ApplyRequest, scope: Scope): number {
  const ids = targetIds(scope, context(new Set()));
  if (!ids.length) return 0;
  const before = JSON.stringify(state.designs);
  runOn(ids, req, req.extra?.checked ?? false);
  checkpointFrom(before, state.selId);
  emit('list', 'design');
  toast(`${req.title}: aplicado a ${SCOPE_LABELS[scope].toLowerCase()} (${pinsOf(ids)} pin(es)). Ctrl+Z para deshacer.`);
  return ids.length;
}

/** Abre el cuadro (o aplica directo si corresponde). Resuelve con la cantidad de diseños cambiados (0 = cancelado). */
export function applyWithScope(req: ApplyRequest): Promise<number> {
  if (!state.designs.length) return Promise.resolve(0);
  if (req.selectionFirst && state.selection.size > 0) return Promise.resolve(applyDirect(req, 'selected'));
  const ctx0 = context(new Set());
  const avail = availableScopes(ctx0);
  if (dontAsk && lastScope && avail.includes(lastScope) && lastScope !== 'custom') return Promise.resolve(applyDirect(req, lastScope));

  return new Promise<number>((resolve) => {
    const snapshot = JSON.stringify(state.designs);
    // La hoja y la selección se toman al abrir: la vista previa puede reacomodar los pines.
    const frozen = ctx0;
    const ctxNow = (custom: ReadonlySet<number>): ScopeContext => ({ ...frozen, customIds: custom });
    const selBefore = state.selId;
    let scope: Scope = (req.preferred && avail.includes(req.preferred) ? req.preferred : null) ?? (lastScope && avail.includes(lastScope) ? lastScope : avail.includes('sheet') ? 'sheet' : avail[0]);
    const customIds = new Set<number>(state.selection.size ? state.selection : current() ? [current()!.id] : []);

    const dlg = h('dialog', { class: 'dialog scope-dialog', 'aria-labelledby': 'scope-title' });
    const radios = new Map<Scope, HTMLInputElement>();
    const counts = new Map<Scope, HTMLElement>();
    const list = h('div', { class: 'scope-options', role: 'radiogroup', 'aria-label': '¿A qué pines lo aplico?' });
    for (const s of ['this', 'selected', 'sheet', 'all', 'custom'] as Scope[]) {
      const r = h('input', { type: 'radio', name: 'scope', value: s, disabled: !avail.includes(s) });
      r.addEventListener('change', () => {
        scope = s;
        update();
      });
      radios.set(s, r);
      const c = h('span', { class: 'muted small' });
      counts.set(s, c);
      list.append(h('label', { class: `scope-opt${avail.includes(s) ? '' : ' off'}` }, r, h('span', {}, SCOPE_LABELS[s]), c));
    }

    // ---- Personalizado: miniaturas con casillas ----
    const filter = h('select', { 'aria-label': 'Filtrar por tamaño' }, h('option', { value: '' }, 'Todos los tamaños'), ...[...new Set(state.designs.map((d) => d.sizeId))].map((id) => h('option', { value: id }, sizeById(id).name)));
    const grid = h('div', { class: 'scope-grid' });
    const visible = () => state.designs.filter((d) => !filter.value || d.sizeId === filter.value);
    const renderGrid = () => {
      grid.replaceChildren(
        ...visible().map((d, i) => {
          const c = h('canvas', { 'aria-hidden': 'true' });
          renderThumb(c, d, sizeById(d.sizeId), imagesFor(d), 54);
          const cb = h('input', { type: 'checkbox', checked: customIds.has(d.id), 'aria-label': `Elegir ${d.text.middle || d.text.top || `diseño ${i + 1}`}` });
          cb.addEventListener('change', () => {
            if (cb.checked) customIds.add(d.id);
            else customIds.delete(d.id);
            update();
          });
          const n = state.designs.indexOf(d) + 1;
          const sz = sizeById(d.sizeId);
          return h(
            'label',
            { class: 'scope-thumb', title: `${d.text.middle || d.text.top || `Diseño ${n}`} · ${sz.name}` },
            cb,
            c,
            h('span', { class: 'small' }, d.text.middle || d.text.top || `Diseño ${n}`),
            h('span', { class: 'muted small' }, sz.shape === 'circle' ? `${sz.faceW} mm` : sz.name),
          );
        }),
      );
    };
    filter.addEventListener('change', renderGrid);
    const allBtn = h('button', { type: 'button', class: 'btn ghost small', onclick: () => (visible().forEach((d) => customIds.add(d.id)), renderGrid(), update()) }, 'Seleccionar todos');
    const noneBtn = h('button', { type: 'button', class: 'btn ghost small', onclick: () => (visible().forEach((d) => customIds.delete(d.id)), renderGrid(), update()) }, 'Ninguno');
    const customBox = h('div', { class: 'scope-custom' }, h('div', { class: 'row wrap' }, allBtn, noneBtn, filter), grid);

    const extraChk = req.extra ? h('input', { type: 'checkbox', checked: req.extra.checked }) : null;
    extraChk?.addEventListener('change', update);
    const dontAskChk = h('input', { type: 'checkbox', checked: false });
    const info = h('p', { class: 'muted small', 'aria-live': 'polite' });
    const ok = h('button', { type: 'button', class: 'btn' }, 'Aplicar');
    const cancel = h('button', { type: 'button', class: 'btn ghost' }, 'Cancelar');

    dlg.append(
      h('h2', { id: 'scope-title' }, '¿A qué pines lo aplico?'),
      h('p', { class: 'scope-what' }, req.title),
      list,
      customBox,
      ...(extraChk ? [h('label', { class: 'check' }, extraChk, ' ', req.extra!.label)] : []),
      info,
      h('label', { class: 'check small' }, dontAskChk, ' No volver a preguntar en esta sesión (usar siempre esta opción)'),
      h('div', { class: 'row end' }, cancel, ok),
    );

    function update() {
      const ctx = ctxNow(customIds);
      for (const s of radios.keys()) {
        radios.get(s)!.checked = s === scope;
        const ids = avail.includes(s) ? targetIds(s, ctx) : [];
        counts.get(s)!.textContent = avail.includes(s) ? `(${pinsOf(ids)} pin${pinsOf(ids) === 1 ? '' : 'es'})` : s === 'selected' ? '(no hay selección)' : '';
      }
      customBox.hidden = scope !== 'custom';
      dontAskChk.disabled = scope === 'custom';
      const ids = targetIds(scope, ctx);
      ok.disabled = !ids.length;
      info.textContent = ids.length ? `Vista previa en la hoja: cambia ${ids.length} diseño(s), ${pinsOf(ids)} pin(es). Los pines repetidos de un mismo diseño cambian juntos.` : 'Elige al menos un pin.';
      // Vista previa: volver al original y aplicar a los elegidos.
      state.designs = JSON.parse(snapshot) as Design[];
      runOn(ids, req, extraChk?.checked ?? false);
      emit('list', 'design');
    }

    const close = (applied: boolean) => {
      if (applied) {
        const ids = targetIds(scope, ctxNow(customIds));
        checkpointFrom(snapshot, selBefore);
        lastScope = scope;
        if (dontAskChk.checked && scope !== 'custom') dontAsk = true;
        savePrefs();
        toast(`${req.title}: ${pinsOf(ids)} pin(es) cambiados. Ctrl+Z deshace todo el cambio.`);
        resolve(ids.length);
      } else {
        state.designs = JSON.parse(snapshot) as Design[];
        emit('list', 'design');
        resolve(0);
      }
      dlg.close();
      dlg.remove();
    };
    ok.addEventListener('click', () => close(true));
    cancel.addEventListener('click', () => close(false));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(false);
    });

    document.body.append(dlg);
    renderGrid();
    update();
    dlg.showModal();
    radios.get(scope)?.focus();
  });
}
