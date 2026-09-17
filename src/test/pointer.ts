// The pointer a test says the app is being driven with.
//
// `vitest.setup.ts`'s `matchMedia` answers `false` to everything, which is the
// right default - it is there so Radix and the app's responsive hooks can mount
// at all, not to describe a device - but it leaves `useCoarsePointer` with no
// way to say "a phone". This swaps in a `MediaQueryList` that answers
// `(hover: none) and (pointer: coarse)` and goes on answering it live, so a
// hook subscribing to the query sees the change rather than only the snapshot.
//
// A helper each test file installs itself, as `memory-storage.ts` is, and for
// the same reason: the pointer is part of the scenario a test is describing, so
// it belongs in that test's `beforeEach` rather than in a global default no
// reader of the test can see.

import { afterEach } from "vitest";

const COARSE_POINTER = "(hover: none) and (pointer: coarse)";

export type Pointer = "coarse" | "fine";

let pointer: Pointer = "fine";

// Every list handed out, so flipping the pointer mid-test reaches the ones a
// mounted component is still listening to. Cleared with the DOM they belong to.
const lists = new Set<StubMediaQueryList>();

// `EventTarget` rather than a hand-rolled listener registry: it is what jsdom
// gives a real `MediaQueryList`, so `addEventListener`/`removeEventListener`
// behave the way the hook under test expects, down to de-duplicating a repeated
// registration.
class StubMediaQueryList extends EventTarget {
  onchange = null;

  constructor(readonly media: string) {
    super();
  }

  // A getter, so the answer is read at the moment it is asked for - which is
  // what lets `useSyncExternalStore` see a flip in the same render it is told
  // about it.
  get matches() {
    return this.media === COARSE_POINTER && pointer === "coarse";
  }

  // The deprecated pair, kept because `MediaQueryList` still declares them.
  addListener() {}
  removeListener() {}
}

/**
 * Drive the app with a finger (`"coarse"`) or a mouse (`"fine"`) from here on.
 *
 * Call it again within a test to flip the answer - a tablet picking up a mouse -
 * which fires `change` at every live query; wrap that call in `act()`.
 */
export function usePointer(next: Pointer) {
  pointer = next;
  window.matchMedia = (query: string) => {
    const list = new StubMediaQueryList(query);
    lists.add(list);
    return list;
  };
  for (const list of lists) list.dispatchEvent(new Event("change"));
}

// The lists go before the reset rather than after it, so the `change` events a
// reset would otherwise fire land on nothing: the components holding them have
// already been unmounted by the `cleanup` in `vitest.setup.ts`, and an update
// scheduled from one reads as an `act()` warning in whatever test runs next.
afterEach(() => {
  lists.clear();
  usePointer("fine");
});
