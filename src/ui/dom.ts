type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | null | undefined | false;

/** Crea un elemento: h('button', { class: 'x', onclick: fn }, 'Texto'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let uid = 0;
export const uniqueId = (prefix = 'f') => `${prefix}-${++uid}`;

/** Formatea un número para mostrar (coma decimal, sin ceros de más). */
export function fmtNum(n: number, decimals = 1): string {
  return Number(n.toFixed(decimals)).toLocaleString('es', { maximumFractionDigits: decimals });
}

export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`No se pudo leer ${file.name}`));
    };
    img.src = url;
  });
}
