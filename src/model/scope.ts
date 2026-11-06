/**
 * "¿A qué pines lo aplico?": a qué diseños afecta un cambio.
 * Un diseño puede tener varios pines iguales (cantidad > 1): cambian juntos.
 */

export type Scope = 'this' | 'selected' | 'sheet' | 'all' | 'custom';

export const SCOPE_LABELS: Record<Scope, string> = {
  this: 'Solo este pin',
  selected: 'Pines seleccionados',
  sheet: 'Toda la hoja',
  all: 'Todas las hojas',
  custom: 'Personalizado',
};

export interface ScopeContext {
  /** ids de todos los diseños, en orden */
  all: number[];
  /** diseño actual (el que se edita) */
  currentId: number | null;
  selection: ReadonlySet<number>;
  /** ids de diseños con algún pin en la hoja actual */
  sheetIds: ReadonlySet<number>;
  /** elegidos a mano en "Personalizado" */
  customIds: ReadonlySet<number>;
}

export function targetIds(scope: Scope, c: ScopeContext): number[] {
  switch (scope) {
    case 'this':
      return c.currentId !== null && c.all.includes(c.currentId) ? [c.currentId] : [];
    case 'selected':
      return c.all.filter((id) => c.selection.has(id));
    case 'sheet':
      return c.all.filter((id) => c.sheetIds.has(id));
    case 'all':
      return c.all.slice();
    case 'custom':
      return c.all.filter((id) => c.customIds.has(id));
  }
}

/** Opciones que tienen sentido en este momento. */
export function availableScopes(c: ScopeContext): Scope[] {
  const out: Scope[] = [];
  if (c.currentId !== null) out.push('this');
  if (c.selection.size > 0) out.push('selected');
  if (c.sheetIds.size > 0) out.push('sheet');
  out.push('all', 'custom');
  return out;
}
