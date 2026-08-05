"use client";

import { setNonce } from "get-nonce";

interface NonceProviderProps {
  nonce?: string;
  children: React.ReactNode;
}

// Radix components that lock body scroll (Dialog, Popover, DropdownMenu,
// etc.) go through `react-remove-scroll` -> `react-style-singleton`, which
// injects a `<style>` tag directly into `document.head` via the DOM API -
// bypassing React/Next's own nonce propagation entirely. That library reads
// its nonce via `get-nonce`'s `getNonce()`, which only returns a value if
// something has previously called `setNonce()` (or set the webpack-specific
// `__webpack_nonce__` global) in the *browser*. Calling it here, during this
// client component's render (not in a `useEffect`), guarantees it runs
// before any descendant's mount-time effects - such as the scroll-lock style
// injection - since React finishes invoking every component function in the
// tree before committing and running any effects.
export function NonceProvider({ nonce, children }: NonceProviderProps) {
  if (nonce) {
    setNonce(nonce);
  }
  return <>{children}</>;
}
