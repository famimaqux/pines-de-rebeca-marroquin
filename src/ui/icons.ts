/** Íconos de línea (SVG propio, trazo 1.8) para la interfaz. */
const P: Record<string, string> = {
  papel: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  imagenes: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
  tamano: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/>',
  fondo: '<path d="M12 3.5c3.5 4.2 6 7.3 6 10.3a6 6 0 0 1-12 0c0-3 2.5-6.1 6-10.3z"/>',
  borde: '<circle cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="5.3" stroke-dasharray="2 2.2"/>',
  letras: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  stickers: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z"/>',
  color: '<circle cx="12" cy="12" r="8.3"/><path d="M12 3.7v16.6a8.3 8.3 0 0 0 0-16.6z" fill="currentColor" stroke="none"/>',
  acomodo: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  imprimir: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  heart: '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10C19.5 15.6 12 20 12 20z" fill="currentColor" stroke="none"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  up: '<path d="m6 14.5 6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/>',
  redo: '<path d="m15 7 4.5 4.5L15 16"/><path d="M19 11.5h-9a5 5 0 0 0 0 10h2"/>',
  eye: '<path d="M2.8 12S6.2 5.5 12 5.5 21.2 12 21.2 12 17.8 18.5 12 18.5 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  sort: '<path d="M4 7h11M4 12h8M4 17h5"/><path d="M18 5v14M15.5 16.5 18 19l2.5-2.5"/>',
  fill: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><circle cx="9" cy="9" r="2"/><circle cx="15" cy="9" r="2"/><circle cx="9" cy="15" r="2"/><circle cx="15" cy="15" r="2"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  wand: '<path d="m4 20 11-11"/><path d="m14 4 .8 1.8L16.6 6.6l-1.8.8L14 9.2l-.8-1.8L11.4 6.6l1.8-.8z"/><path d="M19 11l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z"/>',
  brush: '<path d="M14.5 4.5 19.5 9.5 11 18l-5-5z"/><path d="M6 13 3.5 20.5 11 18"/>',
  sparkle: '<path d="M12 3.5 13.8 10.2 20.5 12 13.8 13.8 12 20.5 10.2 13.8 3.5 12 10.2 10.2z"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4"/><circle cx="12" cy="16.8" r=".6" fill="currentColor"/>',
  disenos: '<rect x="3.5" y="3.5" width="7" height="7" rx="3.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="3.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="3.5"/><path d="M17 14v6M14 17h6"/>',
};

export function icon(name: keyof typeof P | string, size = 20): string {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}

/** Crea un <span> con el ícono (para usarlo dentro de h()). */
export function iconEl(name: string, size = 20): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'ico-wrap';
  s.innerHTML = icon(name, size);
  return s;
}
