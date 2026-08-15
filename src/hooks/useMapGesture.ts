"use client";

import { RefObject, useCallback, useEffect, useRef } from "react";

export interface GesturePoint {
  x: number;
  y: number;
}

// A pointer that moved less than this between down and up was a tap on a place,
// not a drag that happened to end where it started.
const TAP_SLOP_PX = 5;

export interface MapGestureCallbacks {
  /** A gesture has begun, or its pointer set has changed: snapshot whatever the
   * movement below will be measured against. */
  onStart: () => void;
  /** Cumulative movement of the pointers' centroid since the last `onStart`.
   * Absolute rather than incremental so a long drag accumulates no rounding -
   * which is also why the caller must apply it to the view `onStart` snapshot,
   * not to the current one. */
  onPan: (dx: number, dy: number) => void;
  /** A change in zoom *levels*, fractional, about a point in the element's own
   * coordinates. A level is a doubling, so a pinch reports the log base 2 of
   * how far the fingers spread and a wheel its pixels over a constant. */
  onZoom: (delta: number, anchor: GesturePoint) => void;
  /** A press and release that never moved, in the element's own coordinates. */
  onTap: (point: GesturePoint) => void;
  /** A one-finger drag on a touchscreen, which this map deliberately does not
   * pan with - the page scrolls instead, and the caller says so. */
  onTouchDrag: () => void;
}

const centroidOf = (points: GesturePoint[]): GesturePoint => ({
  x: points.reduce((total, point) => total + point.x, 0) / points.length,
  y: points.reduce((total, point) => total + point.y, 0) / points.length,
});

const spreadOf = (points: GesturePoint[]): number =>
  points.length < 2
    ? 0
    : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

/**
 * Pan, pinch-zoom and tap for a map surface, on Pointer Events.
 *
 * **One finger never pans.** The map lives inside a scrollable dialog and covers
 * a large share of it on a phone, so a thumb landing on it has to be able to
 * scroll past to reach Save. One finger therefore scrolls the page (the surface
 * keeps `touch-action: pan-y`) and two fingers drive the map - the same bargain
 * every embedded map makes, and the reason `onTouchDrag` exists to say so rather
 * than leaving the gesture looking broken. A mouse or pen has no second pointer
 * and no scroll of its own to give up, so a single one pans as usual.
 *
 * Multi-touch is what makes the browser's own `touch-action` insufficient here:
 * `pan-y` would let a two-finger vertical drag scroll the page out from under a
 * pinch. `useMultiTouchScrollLock` below is the other half of this hook, and
 * both are needed.
 *
 * Zoom is reported as a fraction of a level, on every event. Whole levels per
 * event were tried first and are unusable for a pinch, which fires
 * continuously: one flick crossed the entire range. It is the consumer's job to
 * render a fractional zoom - `map-picker.tsx` draws the tile grid at the nearest
 * whole level and CSS-scales the layer for the remainder.
 *
 * Listeners go on `window` and `setPointerCapture` is unused, for the reasons
 * `hooks/useDragSort.ts` documents: a gesture that leaves the element - or the
 * window - must keep tracking, and must end on a pointerup the element never
 * sees.
 */
export function useMapGesture(
  surfaceRef: RefObject<HTMLElement | null>,
  callbacks: MapGestureCallbacks,
) {
  // The listeners below are registered once per gesture and would otherwise
  // close over the callbacks as they were at pointerdown.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  // Every pointer currently down on the surface, in client coordinates.
  const pointers = useRef(new Map<number, GesturePoint>());
  const gesture = useRef<{
    // The centroid and spread the current movement is measured from. Re-based
    // whenever the pointer set changes or a zoom step lands.
    origin: GesturePoint;
    spread: number;
    pointerType: string;
    moved: boolean;
    // A tap is one pointer that never moved; a pinch that ends with one finger
    // still down must not become one on release.
    maxPointers: number;
  } | null>(null);
  const detachRef = useRef<(() => void) | null>(null);

  const toElement = useCallback(
    (point: GesturePoint): GesturePoint => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      return { x: point.x - (rect?.left ?? 0), y: point.y - (rect?.top ?? 0) };
    },
    [surfaceRef],
  );

  // Re-base the movement against where the pointers are *now*. `notify` is what
  // separates the two reasons for doing so: a changed pointer set leaves the
  // view alone, so the caller has to re-snapshot it, while a zoom step has
  // already moved the view itself and the caller re-based as part of doing it.
  const rebase = useCallback((pointerType: string, notify: boolean) => {
    const points = [...pointers.current.values()];
    if (points.length === 0) return;
    gesture.current = {
      origin: centroidOf(points),
      spread: spreadOf(points),
      pointerType,
      moved: gesture.current?.moved ?? false,
      maxPointers: Math.max(gesture.current?.maxPointers ?? 0, points.length),
    };
    if (notify) callbacksRef.current.onStart();
  }, []);

  const detach = useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
    pointers.current.clear();
    gesture.current = null;
  }, []);

  // A gesture interrupted by unmount - the dialog closing mid-drag - would
  // otherwise leave listeners on window.
  useEffect(() => detach, [detach]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // A control drawn *on* the map - the attribution's licence links - is not
      // somewhere to start a gesture. This matters beyond ignoring the drag:
      // the `preventDefault` below suppresses the compatibility mouse events, so
      // swallowing a pointerdown on an anchor means the click never fires and
      // the link is quietly dead.
      if ((event.target as Element | null)?.closest("a, button")) return;
      event.preventDefault();

      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      rebase(event.pointerType, true);
      if (detachRef.current) return;

      const handleMove = (moveEvent: PointerEvent) => {
        if (!pointers.current.has(moveEvent.pointerId)) return;
        pointers.current.set(moveEvent.pointerId, {
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        });

        const current = gesture.current;
        if (!current) return;
        const points = [...pointers.current.values()];
        const centroid = centroidOf(points);
        const dx = centroid.x - current.origin.x;
        const dy = centroid.y - current.origin.y;
        if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) {
          current.moved = true;
        }

        if (points.length === 1) {
          // The bargain above: a lone finger is the page's, not the map's.
          if (current.pointerType === "touch") {
            // `maxPointers`, not `moved`: the tail of a pinch is one finger
            // too. `rebase` carries `moved` forward across a lifted finger, so
            // gating on it alone flashes "use two fingers" at a diver who has
            // just used two fingers, for whatever movement the remaining one
            // makes before it comes up.
            if (current.moved && current.maxPointers === 1) {
              callbacksRef.current.onTouchDrag();
            }
            return;
          }
          if (current.moved) callbacksRef.current.onPan(dx, dy);
          return;
        }

        // A zoom level *is* a doubling, so the level count a spread is worth
        // is the log base 2 of how much it grew - which makes the fingers'
        // separation and the map's scale the same quantity, continuously,
        // rather than a threshold that has to be crossed.
        //
        // A two-finger gesture is a zoom *and* a pan, and both are reported for
        // the same event. Returning after the zoom instead - the obvious
        // shape - silently killed two-finger panning altogether: `pointermove`
        // fires once per pointer, so only one finger moves per event and the
        // spread changes on essentially all of them, which meant `onPan` below
        // was never reached. On touch that is the only way to pan at all, since
        // one finger is given to the page.
        const spread = spreadOf(points);
        if (current.spread > 0 && spread > 0 && spread !== current.spread) {
          current.moved = true;
          // Anchored on where the gesture started, not on the live centroid,
          // because the pan reported next is measured from there too. The two
          // then compose exactly: the point under the starting centroid holds
          // still as the fingers spread, and the whole map travels with them.
          callbacksRef.current.onZoom(
            Math.log2(spread / current.spread),
            toElement(current.origin),
          );
          // Only the spread is re-based, so successive zooms compose while the
          // pan stays an absolute delta from one fixed origin - no accumulated
          // rounding, and nothing to lose if a zoom is refused at a limit.
          current.spread = spread;
        }
        if (current.moved) callbacksRef.current.onPan(dx, dy);
      };

      const handleEnd = (endEvent: PointerEvent) => {
        const lifted = pointers.current.get(endEvent.pointerId);
        if (!lifted) return;
        pointers.current.delete(endEvent.pointerId);

        if (pointers.current.size > 0) {
          // A finger lifted out of a pinch: carry on with what is left rather
          // than ending, or the remaining finger would jump the map.
          rebase(gesture.current?.pointerType ?? endEvent.pointerType, true);
          return;
        }

        const current = gesture.current;
        const wasTap =
          !!current &&
          !current.moved &&
          current.maxPointers === 1 &&
          endEvent.type === "pointerup";
        detach();
        if (wasTap) callbacksRef.current.onTap(toElement(lifted));
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
      window.addEventListener("pointercancel", handleEnd);
      detachRef.current = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
        window.removeEventListener("pointercancel", handleEnd);
      };
    },
    [detach, rebase, toElement],
  );

  return { onPointerDown: handlePointerDown };
}

/**
 * Stops the page scrolling out from under a two-finger gesture.
 *
 * The surface keeps `touch-action: pan-y` so that *one* finger still scrolls the
 * dialog, and that permission does not distinguish one finger from two - a
 * two-finger vertical drag would scroll the page while `useMapGesture` was
 * reading it as a pinch. There is no `touch-action` value meaning "one finger
 * yes, two fingers no", so the distinction is made per event, which needs a
 * non-passive `touchmove` listener and therefore a native one: React attaches
 * `onTouchMove` passively, where `preventDefault()` is ignored.
 */
export function useMultiTouchScrollLock(
  surfaceRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length >= 2 && event.cancelable) event.preventDefault();
    };
    surface.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => surface.removeEventListener("touchmove", onTouchMove);
  }, [surfaceRef]);
}

// How much wheel movement one zoom level is worth. A mouse notch is ~100px in
// Chrome, so a notch is a level; a trackpad pinch - which arrives here as a
// stream of ctrl+wheel events carrying a few pixels each - moves a fraction of
// a level per event, which is what makes it a glide rather than a scramble
// across the whole range.
const WHEEL_PX_PER_ZOOM = 100;
// Firefox reports whole lines rather than pixels, and Safari can report pages.
// These are the conventional conversions, chosen so that one notch is about one
// zoom level there too.
const LINE_HEIGHT_PX = 40;
const PAGE_HEIGHT_PX = 400;

const wheelPixels = (event: WheelEvent) =>
  event.deltaY *
  (event.deltaMode === 1
    ? LINE_HEIGHT_PX
    : event.deltaMode === 2
      ? PAGE_HEIGHT_PX
      : 1);

/**
 * Ctrl/Cmd + wheel zooms; a plain wheel is left to scroll whatever the map sits
 * in.
 *
 * The pairing is not arbitrary: a trackpad pinch already arrives as a
 * ctrl+wheel, so this is also what gives a laptop pinch-to-zoom without a line
 * of gesture code. It is also why the zoom it reports is fractional - a pinch
 * fires wheel events continuously, and one whole level per event crossed the
 * entire range in a flick, leaving everything between the two ends
 * unreachable.
 *
 * The listener is native and non-passive because React attaches `onWheel`
 * passively, where `preventDefault()` is ignored - and without it the *browser*
 * zooms the whole page, which is what ctrl+wheel means to it.
 */
export function useWheelZoom(
  surfaceRef: RefObject<HTMLElement | null>,
  onZoom: (delta: number, anchor: GesturePoint) => void,
) {
  const onZoomRef = useRef(onZoom);
  useEffect(() => {
    onZoomRef.current = onZoom;
  });

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      const rect = surface.getBoundingClientRect();
      // A negative deltaY is away from the diver, which is zoom in. Reported as
      // a fraction of a level, with nothing banked between events: zoom is
      // continuous, so there is no threshold left to reach.
      onZoomRef.current(-wheelPixels(event) / WHEEL_PX_PER_ZOOM, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, [surfaceRef]);
}
