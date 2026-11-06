import { h } from './dom';

let el: HTMLElement | null = null;
let timer = 0;

/** Mensaje corto en la parte de abajo (también lo anuncia el lector de pantalla). */
export function toast(msg: string, ms = 2800): void {
  if (!el) {
    el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el?.classList.remove('show'), ms);
}
