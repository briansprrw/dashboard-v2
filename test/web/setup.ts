import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import '@testing-library/jest-dom/vitest';

// This project does not use Vitest's `globals: true`, so
// `@testing-library/react`'s auto-cleanup (which relies on globals) does not
// register itself. Without this, each render leaks into the next test's DOM
// and `screen` queries across tests collide.
afterEach(() => {
  cleanup();
});

// Node 25+ exposes its own global `localStorage`. Vitest's jsdom
// environment only forwards a `window` key to jsdom's real implementation
// when that key is *not* already present on the Node global — since
// `localStorage`/`sessionStorage` now are, `window.localStorage` resolves
// to Node's version instead of jsdom's, and in this sandboxed environment
// that version is an inert stub (present but missing every Storage method).
// Replacing it here with a small conformant in-memory Storage keeps
// `use-preferences.ts` (which only calls `getItem`/`setItem`) working
// without depending on this Node/jsdom interaction being fixed upstream.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

Object.defineProperty(window, 'localStorage', {
  value: createMemoryStorage(),
  configurable: true,
});
