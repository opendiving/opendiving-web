"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// How far a finger travels sideways before a press stops being a tap and starts
// scrubbing, in CSS px.
const TAP_SLOP = 8;

// How long after a finger lifts the mouse events and `click` a browser sends in
// its wake can still arrive. Anything later belongs to something else.
const AFTER_FINGER_MS = 1000;

/** How a finger chose a readout: one tap, or a sideways drag across the plot. */
export type ReadoutGesture = "tap" | "scrub";

interface Readout<T> {
  value: T;
  // Chosen by a finger. It stays after the finger lifts, since there is no
  // pointer left hovering to hold it, until a press lands outside the chart.
  pinned: boolean;
}

/**
 * For a chart that zooms: where a finger's drag moves the view rather than the
 * readout, and how. A tap there still reads out.
 */
export interface ChartReadoutPan {
  /** Whether a finger landing as `event` drags the view. */
  from: (event: ReactPointerEvent<Element>) => boolean;
  /** Moves the view by the finger's sideways travel since its last move, in CSS px. */
  by: (dx: number, event: ReactPointerEvent<Element>) => void;
}

/** What `useChartReadout` returns: the value a chart reads out, and how it is chosen. */
export interface ChartReadout<T> {
  /** What the chart is reading out, or null for nothing. */
  value: T | null;
  /** Whether a finger chose `value`, rather than a mouse or the keyboard. */
  pinned: boolean;
  /** For a mouse or keyboard: what is under the pointer or focus, or null. */
  hover: (value: T | null) => void;
  /** Spread on the plot a finger scrubs - the chart's `<svg>`. */
  scrubProps: {
    ref: RefCallback<Element>;
    style: CSSProperties;
    onContextMenu: (event: { preventDefault: () => void }) => void;
    onPointerDown: (event: ReactPointerEvent<Element>) => void;
    onPointerMove: (event: ReactPointerEvent<Element>) => void;
    onPointerUp: (event: ReactPointerEvent<Element>) => void;
    onPointerCancel: () => void;
  };
  /**
   * For a mark that is also a link: whether the `click` arriving now is the one
   * a finger's first tap on `value` sends, which should read it out rather than
   * follow it. If so it pins `value`, since the browser aims a tap's click at
   * the nearest link under the fingertip, and that is the mark a second tap
   * will open. Answers once per tap.
   */
  takeFirstTap: (value: T) => boolean;
}

/**
 * One readout for a chart, from any pointer. A mouse or the keyboard reports
 * through `hover`; a finger taps a point to read it, or drags
 * sideways to scrub, and what it chose stays after it lifts until a press lands
 * outside the plot's parent - the chart's frame, which holds its card.
 *
 * `pick` turns a finger's position into a value - an index, an instant - or null
 * where the chart has nothing to say. It is asked on every move while scrubbing.
 *
 * `pan` is for a chart that zooms, and takes pinches from the page as well - see
 * `useChartZoom`. A drag from where it says moves the view instead of scrubbing.
 *
 * The browser follows a tap with mouse events at the same point, which reach
 * `hover` too - in whole pixels, so on a continuous axis they can name a
 * neighbour of what the tap pinned. Nothing a mouse says just after a finger
 * lifts replaces a pinned readout, and nothing it says clears one, so a chart's
 * mouse handlers need not tell a mouse from a finger.
 *
 * @example
 * const readout = useChartReadout((event) => indexAt(event.clientX));
 * <rect onMouseEnter={() => readout.hover(i)} onMouseLeave={() => readout.hover(null)} />
 * <svg {...readout.scrubProps}>...</svg>
 */
export function useChartReadout<T>(
  pick: (
    event: ReactPointerEvent<Element>,
    gesture: ReadoutGesture,
  ) => T | null,
  pan?: ChartReadoutPan,
): ChartReadout<T> {
  const [readout, setReadout] = useState<Readout<T> | null>(null);
  // Where a press keeps a pinned readout: the frame around the plot a finger
  // last chose from.
  const frame = useRef<Element | null>(null);
  // The finger currently on the plot, if any.
  const press = useRef<{
    id: number;
    x: number;
    // Past the tap slop, so a drag rather than a tap.
    moved: boolean;
    // Whether the drag moves the view rather than the readout.
    pans: boolean;
    // What was pinned when it went down, so a tap can tell a first look from a
    // second.
    before: T | null;
  } | null>(null);
  const lastTap = useRef<{ at: number; before: T | null } | null>(null);
  const lifted = useRef(-Infinity);

  // Once a finger is dragging, the page stays put however its path drifts up or
  // down. `touch-action` is settled when the finger lands, and Safari will still
  // turn a later vertical drift into a scroll that cancels the scrub. Native and
  // non-passive because React's touch listeners are passive and cannot cancel.
  const holdPage = useCallback((element: Element | null) => {
    if (!element) return;
    const hold = (event: Event) => {
      if (press.current?.moved) event.preventDefault();
    };
    element.addEventListener("touchmove", hold, { passive: false });
    return () => element.removeEventListener("touchmove", hold);
  }, []);

  const pinned = readout?.pinned ?? false;
  useEffect(() => {
    if (!pinned) return;
    const dismiss = (event: PointerEvent) => {
      if (!frame.current?.contains(event.target as Node)) setReadout(null);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [pinned]);

  const hover = (value: T | null) => {
    const afterFinger = performance.now() - lifted.current < AFTER_FINGER_MS;
    setReadout((current) => {
      if (current?.pinned && (value === null || afterFinger)) return current;
      return value === null ? null : { value, pinned: false };
    });
  };

  const pin = (event: ReactPointerEvent<Element>, gesture: ReadoutGesture) => {
    frame.current = event.currentTarget.parentElement;
    const value = pick(event, gesture);
    setReadout(value === null ? null : { value, pinned: true });
  };

  return {
    value: readout?.value ?? null,
    pinned,
    hover,
    scrubProps: {
      ref: holdPage,
      // A vertical swipe scrolls the page and a pinch zooms it - or the chart,
      // where it zooms; a sideways one is left to the chart. A long press reads out like a tap, so it must not
      // select the plot's labels or raise the system's callout either. A style
      // rather than a class, so spreading these cannot replace the plot's own
      // `className`.
      style: {
        touchAction: pan ? "pan-y" : "pan-y pinch-zoom",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      },
      // A long press on a link - a gas dot - opens a menu on Android.
      onContextMenu: (event) => {
        if (press.current) event.preventDefault();
      },
      onPointerDown: (event) => {
        lastTap.current = null;
        if (event.pointerType === "mouse" || !event.isPrimary) {
          press.current = null;
          return;
        }
        press.current = {
          id: event.pointerId,
          x: event.clientX,
          moved: false,
          pans: pan?.from(event) ?? false,
          before: readout?.pinned ? readout.value : null,
        };
      },
      onPointerMove: (event) => {
        const current = press.current;
        if (!current || event.pointerId !== current.id) return;
        if (!current.moved && Math.abs(event.clientX - current.x) < TAP_SLOP) {
          return;
        }
        current.moved = true;
        if (current.pans) {
          pan?.by(event.clientX - current.x, event);
          current.x = event.clientX;
          return;
        }
        pin(event, "scrub");
      },
      onPointerUp: (event) => {
        const current = press.current;
        if (!current || event.pointerId !== current.id) return;
        press.current = null;
        lifted.current = performance.now();
        if (current.moved) return;
        lastTap.current = { at: lifted.current, before: current.before };
        pin(event, "tap");
      },
      // The browser took the gesture over, to scroll or zoom: whatever the
      // finger had chosen stays.
      onPointerCancel: () => {
        press.current = null;
      },
    },
    takeFirstTap: (value) => {
      const tap = lastTap.current;
      lastTap.current = null;
      if (
        tap === null ||
        performance.now() - tap.at >= AFTER_FINGER_MS ||
        tap.before === value
      ) {
        return false;
      }
      setReadout({ value, pinned: true });
      return true;
    },
  };
}
