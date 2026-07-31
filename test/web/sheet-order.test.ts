import { describe, expect, it } from 'vitest';

import { applySheetPreferences } from '../../src/web/components/sheets/sheet-order';
import { makeSheet } from './fixtures';

function withTasks(sheet: ReturnType<typeof makeSheet>) {
  return { sheet, tasks: [] };
}

describe('applySheetPreferences (M4.3)', () => {
  it('preserves the server order when no preference is set', () => {
    const a = withTasks(makeSheet({ id: 'a' }));
    const b = withTasks(makeSheet({ id: 'b' }));
    const result = applySheetPreferences([a, b], { sheetOrder: [], hiddenSheetIds: [] });
    expect(result.map((r) => r.sheet.id)).toEqual(['a', 'b']);
  });

  it('reorders sheets named in sheetOrder', () => {
    const a = withTasks(makeSheet({ id: 'a' }));
    const b = withTasks(makeSheet({ id: 'b' }));
    const result = applySheetPreferences([a, b], { sheetOrder: ['b', 'a'], hiddenSheetIds: [] });
    expect(result.map((r) => r.sheet.id)).toEqual(['b', 'a']);
  });

  it('places sheets not named in sheetOrder after the ones that are, in server order', () => {
    const a = withTasks(makeSheet({ id: 'a' }));
    const b = withTasks(makeSheet({ id: 'b' }));
    const c = withTasks(makeSheet({ id: 'c' }));
    const result = applySheetPreferences([a, b, c], { sheetOrder: ['c'], hiddenSheetIds: [] });
    expect(result.map((r) => r.sheet.id)).toEqual(['c', 'a', 'b']);
  });

  it('drops hidden sheets entirely', () => {
    const a = withTasks(makeSheet({ id: 'a' }));
    const b = withTasks(makeSheet({ id: 'b' }));
    const result = applySheetPreferences([a, b], { sheetOrder: [], hiddenSheetIds: ['a'] });
    expect(result.map((r) => r.sheet.id)).toEqual(['b']);
  });

  it('ignores a sheetOrder entry for a sheet no longer present', () => {
    const a = withTasks(makeSheet({ id: 'a' }));
    const result = applySheetPreferences([a], {
      sheetOrder: ['gone', 'a'],
      hiddenSheetIds: [],
    });
    expect(result.map((r) => r.sheet.id)).toEqual(['a']);
  });

  it('combines ordering and hiding', () => {
    const a = withTasks(makeSheet({ id: 'a' }));
    const b = withTasks(makeSheet({ id: 'b' }));
    const c = withTasks(makeSheet({ id: 'c' }));
    const result = applySheetPreferences([a, b, c], {
      sheetOrder: ['c', 'a', 'b'],
      hiddenSheetIds: ['a'],
    });
    expect(result.map((r) => r.sheet.id)).toEqual(['c', 'b']);
  });
});
