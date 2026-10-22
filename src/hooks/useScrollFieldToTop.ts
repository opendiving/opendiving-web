"use client";

import { useEffect, type RefObject } from "react";

import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import {
  scrollContainerOf,
  useFocusTappedFieldInPlace,
} from "@/hooks/useVisualViewport";

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

/**
 * The most space between a label and its field for the label to count as
 * directly above it: `FormItem`'s 0.5rem, with room. Anything rendered between
 * them - the chosen sites or gear items over their picker - is a row of at
 * least 44px on touch, and then the label stays where it is.
 */
const LABEL_GAP_REM = 1;

/** The top of `field`'s label where it sits directly above, else of the field. */
function labelledTop(field: HTMLElement, rem: number): number {
  const top = field.getBoundingClientRect().top;
  const label = field instanceof HTMLInputElement ? field.labels?.[0] : null;
  if (!label) return top;
  const box = label.getBoundingClientRect();
  const gap = top - box.bottom;
  return gap >= 0 && gap <= LABEL_GAP_REM * rem ? box.top : top;
}

/** What `scrollFieldToTop` would scroll, and by how much. */
function scrollToTopPlan(field: HTMLElement) {
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
  const top = labelledTop(field, rem) - visibleTop - padding;
  const room =
    scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
  return { target: container ?? window, top, reachable: top <= room + 1 };
}

/**
 * Scrolls `field`, with a label directly above it, to the top of what its
 * scroll container shows - the dialog it sits in, or the page - below its
 * `scroll-padding-top` and below every sticky row that would cover it there.
 * A field too near the end goes as far up as the container scrolls.
 *
 * Only the nearest container moves. A field in a dialog scrolls the dialog and
 * never the page locked behind it, which the scrim is anchored to.
 */
export function scrollFieldToTop(field: HTMLElement) {
  const { target, top } = scrollToTopPlan(field);
  target.scrollBy({ top, behavior: "instant" });
}

/**
 * Scrolls a dropdown picker's input to the top of the screen as it takes focus
 * where a finger is driving, and does nothing for a mouse.
 *
 * On a phone the keyboard takes the bottom half of the screen, and a field
 * left where it was tapped has its menu squeezed into what is left below it or
 * hidden behind the keys. At the top, the whole space above the keyboard is the
 * menu's.
 *
 * **A tap is focused with `preventScroll`, or Safari undoes the scroll.** As
 * the keyboard rises it pans the visual viewport to centre the field above it,
 * whether or not the field is already in view, and the pan takes the sticky
 * header up off the screen with it. `useFocusTappedFieldInPlace` stops the pan
 * as it does in a dialog. Only where the scroll reaches, though: a field too
 * near the end of the page to come up is left to the pan, which is then all
 * that keeps it out from behind the keyboard. Instant rather than smooth, since
 * Safari starves the page of frames while the keyboard rises.
 */
export function useScrollFieldToTop(field: RefObject<HTMLInputElement | null>) {
  const coarsePointer = useCoarsePointer();

  useFocusTappedFieldInPlace({
    within: field,
    takeOver: (tapped) => coarsePointer && scrollToTopPlan(tapped).reachable,
  });

  useEffect(() => {
    const input = field.current;
    if (!coarsePointer || !input) return;
    const onFocus = () => {
      if (!input.readOnly) scrollFieldToTop(input);
    };
    input.addEventListener("focus", onFocus);
    return () => input.removeEventListener("focus", onFocus);
  }, [coarsePointer, field]);
}
