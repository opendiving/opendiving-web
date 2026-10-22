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
 * Scrolls a dropdown picker's input to the top of the screen as a finger
 * focuses it, and does nothing for a mouse.
 *
 * On a phone the keyboard takes the bottom half of the screen, and a field
 * left where it was tapped has its menu squeezed into what is left below it or
 * hidden behind the keys. At the top, the whole space above the keyboard is the
 * menu's.
 *
 * **On the page, the scroll has to land before the field has focus.** From
 * focus on, iOS holds the layout viewport where it was and moves only the
 * visual one, so a scroll then - in the focus handler, or once the keyboard is
 * up - slides the sticky header off the top with everything else. So the tap is
 * taken over by `useFocusTappedFieldInPlace`, which scrolls and then focuses
 * with `preventScroll`, which also keeps Safari from panning to the field. Only
 * where the scroll reaches, though: a field too near the end of the page to
 * come up is left to that pan, which is all that keeps it out from behind the
 * keyboard. A field in a dialog is scrolled on focus instead, since only the
 * dialog's own box moves and the dialog's handler has the tap first.
 *
 * Instant rather than smooth: Safari starves the page of frames while the
 * keyboard rises.
 */
export function useScrollFieldToTop(field: RefObject<HTMLInputElement | null>) {
  const coarsePointer = useCoarsePointer();

  useFocusTappedFieldInPlace({
    within: field,
    takeOver: (tapped) => coarsePointer && scrollToTopPlan(tapped).reachable,
    beforeFocus: scrollFieldToTop,
  });

  useEffect(() => {
    const input = field.current;
    if (!coarsePointer || !input) return;
    const onFocus = () => {
      if (!input.readOnly && scrollContainerOf(input)) scrollFieldToTop(input);
    };
    input.addEventListener("focus", onFocus);
    return () => input.removeEventListener("focus", onFocus);
  }, [coarsePointer, field]);
}
