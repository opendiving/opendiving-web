// A `Storage` stub for the modules that persist something in `localStorage`.
//
// Every one of them needs this, because under this runner `window.localStorage`
// doesn't work: Node's own experimental `localStorage` global (gated behind
// `--localstorage-file`, and an accessor that simply returns `undefined` without
// it) shadows the one jsdom built, so `window.localStorage` reads back as
// `undefined` while `sessionStorage` is fine.
//
// This is a helper each test file installs itself, not a stub auto-installed in
// `vitest.setup.ts`. A global one would hand all 43 test files a single `Map`
// that nothing resets, so the first component test to render a card that
// remembers its view would start leaking that view into its neighbours. Calling
// `useStorage(memoryStorage())` from a `beforeEach` keeps a fresh store per
// test, which is the property that matters; only the duplication is shared away.

import { afterEach } from "vitest";

// Registered on import, so a suite that swaps in a throwing or absent storage
// mid-file can't leave it behind for whatever is added after it. Every suite
// here installs a fresh store in its own `beforeEach` anyway; this only covers
// the tests that sit outside one.
afterEach(() => useStorage(memoryStorage()));

export function memoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, value),
  };
}

// `undefined` stands in for a browser that doesn't hand out storage at all,
// which is the state these tests would otherwise be running in by accident.
export function useStorage(storage: Storage | undefined) {
  Object.defineProperty(window, "localStorage", {
    value: storage,
    configurable: true,
  });
}
