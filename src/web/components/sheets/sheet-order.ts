// Applies the server-backed sheet order/visibility preference (M4.3) to a
// loaded sheets list. Pure and separate from the fetch/save hook so it can be
// tested and reused (Standard and Glance both render from the same ordered,
// filtered list) without depending on network state.

import type { SheetPreferences } from '../../../shared/domain/sheet-preferences';
import type { SheetWithTasks } from '../../hooks/use-sheets-data';

/**
 * Orders by `sheetOrder` first (in the order given), then any sheet not
 * named there in the server's own default order, then drops every id in
 * `hiddenSheetIds`. A `sheetOrder` entry for a sheet the user no longer has
 * access to (removed membership, recycled) is silently ignored rather than
 * producing a gap or an error — this list only ever reflects sheets actually
 * present in `sheets`.
 */
export function applySheetPreferences(
  sheets: SheetWithTasks[],
  prefs: SheetPreferences
): SheetWithTasks[] {
  const hidden = new Set(prefs.hiddenSheetIds);
  const visible = sheets.filter((s) => !hidden.has(s.sheet.id));

  const orderIndex = new Map(prefs.sheetOrder.map((id, index) => [id, index]));
  const ordered = [...visible];
  ordered.sort((a, b) => {
    const ai = orderIndex.get(a.sheet.id);
    const bi = orderIndex.get(b.sheet.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0; // Preserve the server's own relative order for two unordered sheets.
  });
  return ordered;
}
