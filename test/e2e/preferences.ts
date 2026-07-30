// Pre-seeds the device-local display-preferences document (mode/theme/zoom/
// density/showClock/etc — M3.3) before the app's first script runs, so a
// capture spec can go straight to Glance/dark/zoomed without driving the
// Settings UI for every viewport. Never sent to the server (M0-D9); this
// writes to the same `localStorage` key the real app owns
// (`src/web/state/use-preferences.ts`), nothing more.

import type { Page } from '@playwright/test';

import type { Preferences } from '../../src/web/state/preferences-schema';

const PREFERENCES_STORAGE_KEY = 'dash2.preferences.v1';

/** Must be called before `page.goto()` — it installs an init script, it does not write storage immediately. */
export async function seedPreferences(page: Page, overrides: Partial<Preferences>) {
  await page.addInitScript(
    ({ key, value }: { key: string; value: Partial<Preferences> }) => {
      const existing = window.localStorage.getItem(key);
      const base = existing ? (JSON.parse(existing) as Record<string, unknown>) : {};
      window.localStorage.setItem(key, JSON.stringify({ ...base, ...value }));
    },
    { key: PREFERENCES_STORAGE_KEY, value: overrides }
  );
}
