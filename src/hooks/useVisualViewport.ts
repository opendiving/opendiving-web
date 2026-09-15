"use client";

import { useEffect } from "react";

/** The visible height of the page, in CSS pixels. */
const HEIGHT_VAR = "--visual-viewport-height";
/** How far the visible area sits below the top of the layout viewport. */
const TOP_VAR = "--visual-viewport-top";
/**
 * The same edge in *document* coordinates - the page scroll plus that offset.
 *
 * Exists for the scrim alone, which cannot use the two above. iOS clips a
 * `position: fixed` box to the layout viewport and keeps a band between that
 * viewport and the keyboard which it goes on painting page content into, so the
 * scrim is positioned absolutely and needs its anchor in the coordinate system
 * absolute positioning actually uses. See `ui/dialog.tsx`.
 */
const DOC_TOP_VAR = "--visual-viewport-doc-top";

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
  // `window.scrollY` rather than a second measurement: Radix locks the page
  // behind an open dialog, so this is fixed for as long as anything reads it.
  root.style.setProperty(
    DOC_TOP_VAR,
    `${window.scrollY + viewport.offsetTop}px`,
  );
}

/**
 * Mirrors `window.visualViewport` onto three CSS variables for as long as the
 * caller is mounted, so that a dialog can be sized and placed against the part
 * of the page a phone is actually showing.
 *
 * Two of them describe the visible area within the layout viewport, which is
 * what `DialogContent` needs; the third repeats its top edge in document
 * coordinates for the scrim, which is absolutely positioned because iOS clips a
 * fixed box to that viewport and paints page content below it.
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
      root.style.removeProperty(DOC_TOP_VAR);
    };
  }, []);
}

/** What an on-screen keyboard is ever opened for. */
const FIELD_SELECTOR = "input, textarea, select, [contenteditable]";

/**
 * How many frames the settle loop below will chase a box that is still moving
 * before giving up. Generous next to the 200ms transition it is waiting out -
 * this is a backstop against a box that never stops changing, not a timeout
 * anything is expected to reach.
 */
const SETTLE_FRAME_CAP = 40;

/**
 * How many consecutive frames of an unchanged height end the loop.
 *
 * More than one, because "same as last frame" on its own is true before the
 * transition has got going as well as after it has finished, and the two are
 * indistinguishable from inside a single frame. Measured in the browser, the
 * dialog was still at its old height for the first two frames after the event
 * and only began moving on the third - a loop that stopped at the first repeat
 * would have given up there, every time, having corrected nothing.
 */
const STABLE_FRAMES = 4;

/**
 * How many frames the loop runs before it will accept a stable height as final.
 *
 * The floor under `STABLE_FRAMES`, and it exists because that test alone is a
 * bet on the transition having *started*. `DialogContent` is on a 200ms
 * transition; sixteen frames is past the end of it at 60Hz and, at the refresh
 * rates where it is not, the box is still visibly moving, so the stability test
 * carries the rest. Every frame in here costs one `scrollIntoView` that does
 * nothing unless something is actually out of view.
 */
const MIN_SETTLE_FRAMES = 16;

/** The nearest ancestor that scrolls, which for a field in a dialog is the dialog. */
function scrollContainerOf(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/**
 * Scrolls the focused field back into view whenever the visible viewport
 * *resizes*, for as long as the caller is mounted.
 *
 * **The keyboard opening is not the end of the story it looks like.** iOS
 * reveals the focused input itself before it fires anything, so the field is on
 * screen at the moment of the tap and the bug is what happens next:
 * `useVisualViewport` mirrors the shrunken viewport onto the variables above,
 * `ui/dialog.tsx` re-centres `DialogContent` and cuts its `max-height` to
 * match, and the content's `scrollTop` survives all of it unchanged. A dialog
 * that was 780px of visible content becomes 400px anchored at the same offset,
 * so what it shows is the *top* of what it was showing. A field near the foot
 * of it - "Save as" at the end of the Fields tab, which is the report this
 * came from - drops out of the box the diver is typing into.
 *
 * **It has to wait for the dialog to finish resizing, and that is the part that
 * is easy to get wrong.** `DialogContent` carries `transition: all 200ms`, so
 * its `max-height` *animates* down to the new viewport rather than snapping:
 * measured here, it was still 770px of an eventual 388px two frames after the
 * event. Correcting then is worse than not correcting at all, because the field
 * is still comfortably inside a box that has not shrunk yet, `block: "nearest"`
 * reads that as "nothing to do", and nothing looks at it again. Hence the loop -
 * it re-reveals each frame until the container's height stops moving, which is
 * the only honest signal that the geometry is final.
 *
 * `block: "nearest"` because it is a correction and not a jump: a field still
 * in view must not move at all, and one that fell out should come back the short
 * way. That is also what makes running it every frame harmless - the call does
 * nothing on the frames where nothing is wrong.
 *
 * **`resize` only, never `scroll`.** The visual viewport also scrolls when
 * Safari pans to a focused field, and re-revealing on that would be this
 * fighting the browser for the same pixels while the diver's finger is still
 * on the screen. Only a resize invalidates the geometry that
 * `useVisualViewport` just wrote.
 *
 * No-ops where `visualViewport` is absent, like the hook above it.
 */
export function useKeepFocusedFieldVisible() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);

      let previousHeight = Number.NaN;
      let stableFrames = 0;
      let frames = 0;
      const settle = () => {
        const active = document.activeElement;
        // Re-read every frame rather than closing over it: a resize can outlast
        // the focus that started it, and a field the diver has already left is
        // not one to chase.
        if (!(active instanceof HTMLElement)) return;
        if (!active.matches(FIELD_SELECTOR)) return;

        active.scrollIntoView({ block: "nearest" });

        const container = scrollContainerOf(active);
        const height = container ? container.clientHeight : -1;
        stableFrames = height === previousHeight ? stableFrames + 1 : 0;
        previousHeight = height;
        frames += 1;
        const settled =
          frames >= MIN_SETTLE_FRAMES && stableFrames >= STABLE_FRAMES;
        if (settled || frames > SETTLE_FRAME_CAP) return;
        frame = requestAnimationFrame(settle);
      };
      frame = requestAnimationFrame(settle);
    };

    viewport.addEventListener("resize", reveal);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", reveal);
    };
  }, []);
}
