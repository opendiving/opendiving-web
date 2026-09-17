"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `effect` when `deps` differ from the values it last ran for, rather than
 * every time the effect is created.
 *
 * A route the diver has left is kept mounted under `<Activity mode="hidden">`,
 * and a hidden tree has its effects destroyed on hide and re-created on show.
 * State survives that, so a plain `useEffect` runs again against inputs that did
 * not change and overwrites whatever the diver did in between: a list scrolled
 * six pages deep, a half-typed form, a dialog's unsaved fields.
 *
 * Comparison is `Object.is` per position, the same rule React applies to a
 * dependency array, so a caller that already had the right deps keeps them.
 *
 * For an effect whose work can be interrupted - one that starts a request and
 * abandons it in its cleanup - this is the wrong guard: the hide cancels the
 * work and the show skips it, and nothing ever loads. Record the deps when the
 * work *settles* instead, as `useResource` does.
 */
export function useEffectOnChange(
  effect: () => void | (() => void),
  deps: readonly unknown[],
): void {
  const ranFor = useRef<readonly unknown[] | null>(null);

  useEffect(() => {
    const previous = ranFor.current;
    if (previous && sameDeps(previous, deps)) return;
    ranFor.current = deps;
    return effect();
    // The dependency array is the caller's, passed straight through. This hook
    // changes *when* React's comparison leads to work, not what it compares, so
    // there is nothing here the rule can check statically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}
