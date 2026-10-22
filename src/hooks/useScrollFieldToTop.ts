"use client";

import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { scrollContainerOf } from "@/hooks/useVisualViewport";

/**
 * Scrolls `field` to the top of what its scroll container shows: the dialog it
 * sits in, or the page, under `html`'s `scroll-padding-top` for the header.
 *
 * Only the nearest container moves. A field in a dialog scrolls the dialog and
 * never the page locked behind it, which the scrim is anchored to.
 */
export function scrollFieldToTop(field: HTMLElement) {
  const container = scrollContainerOf(field);
  const scroller = container ?? document.documentElement;
  const padding = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
  // The page's visible top is the visual viewport's, which Safari pans below
  // the layout viewport's while a keyboard is already up.
  const visibleTop = container
    ? container.getBoundingClientRect().top + container.clientTop
    : (window.visualViewport?.offsetTop ?? 0);
  const top = field.getBoundingClientRect().top - visibleTop - padding;
  (container ?? window).scrollBy({ top, behavior: "instant" });
}

/**
 * Returns a focus handler that scrolls a dropdown picker's input to the top of
 * the screen where a finger is driving, and does nothing for a mouse.
 *
 * On a phone the keyboard takes the bottom half of the screen, and a field
 * left where it was tapped has its menu squeezed into what is left below it or
 * hidden behind the keys. At the top, the whole space above the keyboard is the
 * menu's. Instant rather than smooth: Safari starves the page of frames while
 * the keyboard rises, and the field already at the top is what keeps it from
 * panning to the field on its own.
 *
 * @example
 * const scrollToTop = useScrollFieldToTop();
 * <input onFocus={(e) => scrollToTop(e.currentTarget)} />
 */
export function useScrollFieldToTop(): (field: HTMLElement) => void {
  const coarsePointer = useCoarsePointer();
  return (field) => {
    if (coarsePointer) scrollFieldToTop(field);
  };
}
