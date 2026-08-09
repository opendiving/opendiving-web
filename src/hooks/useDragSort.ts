"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Returns a copy of `items` with the entry at `from` moved to `to`.
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// The vertical extent of one row, as much of a `DOMRect` as the maths needs.
export interface RowBounds {
  top: number;
  bottom: number;
}

const centerOf = (row: RowBounds) => (row.top + row.bottom) / 2;

// Which neighbour, if any, the dragged row should swap with.
//
// Compares the dragged row's *own* centre against its immediate neighbours'
// centres, rather than asking "which row is the pointer inside?". That
// distinction is what makes the drag feel right: the swap happens the moment the
// lifted row visually overlaps its neighbour past halfway, so the list rearranges
// under a row that is already moving - instead of waiting for the pointer to
// arrive somewhere specific, and instead of doing nothing at all while the
// pointer sits in the gap between two rows.
//
// Walks past as many neighbours as the row has actually cleared, rather than one
// per event: a quick flick produces only a handful of pointermove events, and
// single-stepping would leave the list crawling along behind the pointer. The
// neighbours' measurements are all from the pre-swap layout, which is exactly
// what's wanted - they are the positions the row is being dragged past.
export function resolveSwapTarget(
  rows: (RowBounds | null)[],
  index: number,
  draggedCenter: number,
): number {
  let target = index;

  while (target > 0) {
    const previous = rows[target - 1];
    if (!previous || draggedCenter >= centerOf(previous)) break;
    target -= 1;
  }

  while (target < rows.length - 1) {
    const next = rows[target + 1];
    if (!next || draggedCenter <= centerOf(next)) break;
    target += 1;
  }

  return target;
}

export interface UseDragSortOptions {
  itemCount: number;
  // Called when the dragged row passes a neighbour, so the list reorders live
  // rather than only on drop.
  onReorder: (from: number, to: number) => void;
  disabled?: boolean;
}

// Drag-to-reorder for a vertical list.
//
// Built on Pointer Events rather than the HTML5 drag-and-drop API, which emits
// no events for touch - a phone couldn't reorder at all. Pointer events cover
// mouse, touch and pen through one code path.
//
// **Move listeners go on `window`, not on the handle, and `setPointerCapture` is
// deliberately not used.** Capture looks like the right tool, but the capturing
// element is inside the row being reordered: as soon as the list rearranges,
// React moves that row in the DOM, the browser releases the capture and fires
// `lostpointercapture` - killing the drag mid-gesture. It bit hardest when
// dragging past either end of the list, where the clamp forces a reorder
// immediately. Window listeners are unaffected by the DOM moving underneath
// them, so a drag now ends only when the pointer is actually released.
//
// `dragOffset` translates the dragged row so it tracks the pointer from the
// first pixel of movement. Without it the row stayed put until it happened to
// reach its destination, which read as the drag not having started.
//
// Deliberately no library: this is one short vertical list, and @dnd-kit et al.
// would be a dependency (and a bundle) for a single screen.
//
// The handle is a real <button>, so the gesture has a keyboard equivalent -
// focus it and press Up/Down. Without that, reordering would be impossible for
// anyone not using a pointer, which a drag-only implementation quietly assumes.
export function useDragSort({
  itemCount,
  onReorder,
  disabled = false,
}: UseDragSortOptions) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  // Pixels to translate the dragged row by, so it sits under the pointer.
  const [dragOffset, setDragOffset] = useState(0);

  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  // Live gesture state. Kept in a ref because the window listeners below run
  // between renders and would otherwise close over stale values.
  const dragRef = useRef<{
    index: number;
    pointerId: number;
    // Where within the row the pointer grabbed it, so the row doesn't jump to
    // centre itself under the cursor on the first move.
    grabOffset: number;
  } | null>(null);

  // `onReorder` is rebuilt every render (it closes over the current list), but
  // the window listeners are registered once per gesture - so they have to read
  // the latest one rather than the one that existed at pointerdown, or the
  // second swap of a drag would be computed from a stale list.
  const onReorderRef = useRef(onReorder);
  const itemCountRef = useRef(itemCount);
  useEffect(() => {
    onReorderRef.current = onReorder;
    itemCountRef.current = itemCount;
  });

  const setItemRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    },
    [],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDraggingIndex(null);
    setDragOffset(0);
  }, []);

  const startDrag = useCallback(
    (index: number, event: React.PointerEvent<HTMLElement>) => {
      // A second pointer going down mid-drag (a stray finger on a touchscreen)
      // would otherwise start a second gesture with its own window listeners,
      // and the two would fight over the same row - each applying its own
      // movement to the shared offset.
      if (dragRef.current) return;

      const row = itemRefs.current[index];
      if (!row) return;

      const { top } = row.getBoundingClientRect();
      dragRef.current = {
        index,
        pointerId: event.pointerId,
        grabOffset: event.clientY - top,
      };
      setDraggingIndex(index);
      setDragOffset(0);

      const handleMove = (moveEvent: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || moveEvent.pointerId !== drag.pointerId) return;

        const dragged = itemRefs.current[drag.index];
        if (!dragged) return;

        const rows = itemRefs.current
          .slice(0, itemCountRef.current)
          .map((el) => el?.getBoundingClientRect() ?? null);
        // Where the row should sit for the pointer to stay on the spot the user
        // grabbed. Clamping isn't needed: dragging beyond either end simply
        // leaves the row parked there, since there is no further neighbour to
        // swap with.
        const desiredTop = moveEvent.clientY - drag.grabOffset;
        const draggedRect = dragged.getBoundingClientRect();
        const target = resolveSwapTarget(
          rows,
          drag.index,
          desiredTop + draggedRect.height / 2,
        );

        if (target !== drag.index) {
          const targetRect = rows[target];
          onReorderRef.current(drag.index, target);
          drag.index = target;
          setDraggingIndex(target);
          // The row is about to be re-laid-out where its neighbour was, so
          // re-base the translation against that new position - otherwise it
          // would visibly jump by one row height at the moment of the swap.
          if (targetRect) setDragOffset(desiredTop - targetRect.top);
          return;
        }

        // Self-correcting: measure where the row actually is (transform
        // included) and nudge by the difference. This stays accurate across
        // reorders and reflows without tracking layout positions by hand.
        setDragOffset((offset) => offset + (desiredTop - draggedRect.top));
      };

      const handleEnd = (endEvent: PointerEvent) => {
        if (
          dragRef.current &&
          endEvent.pointerId !== dragRef.current.pointerId
        ) {
          return;
        }
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
        window.removeEventListener("pointercancel", handleEnd);
        endDrag();
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
      window.addEventListener("pointercancel", handleEnd);
    },
    [endDrag],
  );

  // A drag interrupted by unmount (the dive form navigating away, the dialog
  // closing) would otherwise leave listeners attached to window.
  useEffect(() => endDrag, [endDrag]);

  const handleProps = useCallback(
    (index: number) => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        // Ignore secondary mouse buttons; touch/pen report button 0 too.
        if (disabled || (event.pointerType === "mouse" && event.button !== 0)) {
          return;
        }
        event.preventDefault();
        // preventDefault suppresses the browser's own focus handling, and the
        // handle needs focus for its Up/Down keys to work straight after a drag.
        event.currentTarget.focus();
        startDrag(index, event);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (disabled) return;
        const delta =
          event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (delta === 0) return;
        const to = index + delta;
        if (to < 0 || to >= itemCount) return;
        event.preventDefault();
        onReorder(index, to);
      },
      // Without this the browser scrolls the page instead of letting the drag
      // through on touch.
      style: { touchAction: "none" as const },
    }),
    [disabled, itemCount, onReorder, startDrag],
  );

  return { draggingIndex, dragOffset, setItemRef, handleProps };
}
