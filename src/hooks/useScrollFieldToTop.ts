"use client";

import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { scrollContainerOf } from "@/hooks/useVisualViewport";

/**
 * How far below the scrollport's top the sticky rows above `field` reach once
 * they are stuck - the site header, and a dive-form section's heading under it.
 *
 * A sticky row before the field in any ancestor sticks while the field is
 * scrolled past it, since its containing block holds the field too.
 */
function stuckRowsBottom(field: HTMLElement, scroller: HTMLElement): number {
  let bottom = 0;
  for (
    let node: Element | null = field;
    node && node !== scroller;
    node = node.parentElement
  ) {
    for (
      let row = node.previousElementSibling;
      row;
      row = row.previousElementSibling
    ) {
      const style = getComputedStyle(row);
      if (style.position !== "sticky") continue;
      // `auto` for a row stuck to the bottom, like the dive form's Save.
      const top = parseFloat(style.top);
      if (Number.isNaN(top)) continue;
      bottom = Math.max(bottom, top + row.getBoundingClientRect().height);
    }
  }
  return bottom;
}

/**
 * Clearance above what scrolls up: a field's focus ring is drawn 4px outside
 * its box (`ring-2 ring-offset-2`), where a row stuck flush against the box
 * covers it.
 */
const TOP_GAP_REM = 0.5;

/** The top of `field`'s label where one sits above it, else of the field. */
function labelledTop(field: HTMLElement): number {
  const top = field.getBoundingClientRect().top;
  const label = field instanceof HTMLInputElement ? field.labels?.[0] : null;
  return Math.min(top, label?.getBoundingClientRect().top ?? top);
}

/**
 * Scrolls `field`, with its label, to the top of what its scroll container
 * shows - the dialog it sits in, or the page - below its `scroll-padding-top`
 * and below every sticky row that would cover it there.
 *
 * Only the nearest container moves. A field in a dialog scrolls the dialog and
 * never the page locked behind it, which the scrim is anchored to.
 */
export function scrollFieldToTop(field: HTMLElement) {
  const container = scrollContainerOf(field);
  const scroller = container ?? document.documentElement;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const padding =
    Math.max(
      parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0,
      stuckRowsBottom(field, scroller),
    ) +
    TOP_GAP_REM * rem;
  // The page's visible top is the visual viewport's, which Safari pans below
  // the layout viewport's while a keyboard is already up.
  const visibleTop = container
    ? container.getBoundingClientRect().top + container.clientTop
    : (window.visualViewport?.offsetTop ?? 0);
  const top = labelledTop(field) - visibleTop - padding;
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
