"use client";

import { useEffect } from "react";

/** The visible height of the page, in CSS pixels. */
const HEIGHT_VAR = "--visual-viewport-height";
/** How far the visible area sits below the top of the layout viewport. */
const TOP_VAR = "--visual-viewport-top";

// Refcounted, because two dialogs can be open at once - a confirm raised from
// inside a form dialog is the ordinary case here. Without it the first one to
// unmount would strip the variables while the second was still positioned by
// them, snapping it back to the `:root` fallback mid-interaction.
//
// It only counts what is *open*, which is why `ui/dialog.tsx` calls this from a
// component inside `DialogPortal` rather than from `DialogContent` itself - see
// the note there.
let subscribers = 0;

function syncViewportVars() {
  const viewport = window.visualViewport;
  if (!viewport) return;

  const root = document.documentElement;
  root.style.setProperty(HEIGHT_VAR, `${viewport.height}px`);
  root.style.setProperty(TOP_VAR, `${viewport.offsetTop}px`);
}

/**
 * Mirrors `window.visualViewport` onto two CSS variables for as long as the
 * caller is mounted, so a fixed-position overlay can be sized and placed
 * against the part of the page a phone is actually showing.
 *
 * **`100vh` is not that part, and on iOS it never was.** `vh` there measures
 * the *large* viewport - the page as it would be with Safari's toolbars
 * retracted - so a dialog capped at `90vh` is taller than the screen whenever
 * the toolbars are up, and centring it on the layout viewport then hangs its
 * head and its footer off both ends with no way to scroll to either. The
 * `svh`/`dvh` units fix that much, and the `:root` fallback in `globals.css`
 * uses `100svh` for browsers that never fire the events below.
 *
 * What no unit fixes is **the on-screen keyboard**, which is the other half of
 * this. iOS does not resize the layout viewport when the keyboard opens; it
 * scrolls the *visual* viewport up to keep the focused input in sight and
 * leaves `position: fixed` anchored where it was. A centred dialog therefore
 * ends up with its title scrolled off the top of the screen and its buttons
 * behind the keys. `visualViewport.offsetTop` is exactly that displacement and
 * `visualViewport.height` exactly the space left over, so an overlay placed in
 * terms of both lands where the diver can see it and nowhere else.
 * `ui/dialog.tsx` spends them in `DialogContent`'s own `top` and `max-height`,
 * and takes them as variables rather than as a parent box for a reason that has
 * nothing to do with the viewport - see the note there.
 *
 * No-ops where `visualViewport` is absent (jsdom, and old browsers), leaving
 * the `:root` values in place - which is why the variables have a usable
 * fallback there rather than being defined here.
 */
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Its own closure per caller, not the shared `syncViewportVars`.
    // `addEventListener` de-duplicates identical (type, listener) pairs, so two
    // dialogs registering the same function would share one registration - and
    // the first to close would take it away from the one still open.
    const sync = () => syncViewportVars();

    subscribers += 1;
    syncViewportVars();
    // Both events matter and they report different things: `resize` is the
    // keyboard opening or the toolbars sliding away, `scroll` is the visual
    // viewport being moved within an unchanged layout viewport - which is what
    // happens when Safari pans to a focused field.
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);

    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      subscribers -= 1;
      if (subscribers > 0) return;

      const root = document.documentElement;
      root.style.removeProperty(HEIGHT_VAR);
      root.style.removeProperty(TOP_VAR);
    };
  }, []);
}
