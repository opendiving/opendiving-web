"use client";

import {
  type RefCallback,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type ChartView,
  fullView,
  isZoomed,
  panView,
  scaleView,
} from "@/lib/chart-zoom";

// How fast a trackpad pinch, which arrives as a wheel with `ctrlKey`, zooms per
// pixel of its `deltaY`. A mouse wheel held with Ctrl sends a hundred at a time,
// so one notch is capped at `WHEEL_STEP_CAP` pixels' worth.
const WHEEL_ZOOM_RATE = 0.01;
const WHEEL_STEP_CAP = 50;
// A `deltaMode` of lines, which Firefox sends for a mouse wheel, in pixels.
const LINE_PX = 16;

// Safari's own pinch event, which `lib.dom` does not declare.
interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
}

/** What `useChartZoom` returns. */
export interface ChartZoom {
  /** The part of the axis on screen. */
  view: ChartView;
  /** Whether that is less than the whole axis. */
  zoomed: boolean;
  /** Back to the whole axis. */
  reset: () => void;
  /** Moves the view along the axis by `delta`, in the axis's own units. */
  panBy: (delta: number) => void;
  /** On the plot that is pinched - the chart's `<svg>`. */
  ref: RefCallback<Element>;
}

/**
 * A horizontal zoom for a chart whose x axis runs from 0 to `extent`: two
 * fingers pinch it, a trackpad pinches it (a wheel with `ctrlKey`, or Safari's
 * gesture events), and a sideways trackpad swipe pans it once zoomed. One
 * finger is the readout's - see `useChartReadout`'s `pan`, which is how a drag
 * moves the view.
 *
 * `plotBox` is the box the axis is drawn across, in client pixels, found from
 * the element the ref is on: the plot can be drawn twice, inline and in full
 * screen, and each must measure its own.
 *
 * The view resets when `extent` changes, since it is a window onto that axis.
 *
 * @example
 * const zoom = useChartZoom(duration, 60_000, (svg) => svg.querySelector("[data-hit]")?.getBoundingClientRect() ?? null);
 * const x = (t: number) => left + ((t - zoom.view.start) / (zoom.view.end - zoom.view.start)) * plotWidth;
 * <svg ref={zoom.ref}>...</svg>
 */
export function useChartZoom(
  extent: number,
  minSpan: number,
  plotBox: (element: Element) => DOMRect | null,
): ChartZoom {
  // Held with the extent it is a window onto, so a new axis starts whole
  // without an effect to notice it.
  const [stored, setStored] = useState<{
    extent: number;
    view: ChartView;
  } | null>(null);
  const view =
    stored && stored.extent === extent ? stored.view : fullView(extent);
  const zoomed = isZoomed(view, extent);

  const update = useCallback(
    (next: (view: ChartView, extent: number) => ChartView, extent: number) =>
      setStored((current) => ({
        extent,
        view: next(
          current && current.extent === extent
            ? current.view
            : fullView(extent),
          extent,
        ),
      })),
    [],
  );

  // What the native listeners below read, which are attached once per element.
  const latest = useRef({ extent, minSpan, plotBox, view, zoomed });
  useLayoutEffect(() => {
    latest.current = { extent, minSpan, plotBox, view, zoomed };
  });

  const ref = useCallback(
    (element: Element | null) => {
      if (!element) return;

      const fractionAt = (clientX: number) => {
        const box = latest.current.plotBox(element);
        if (!box || box.width === 0 || !Number.isFinite(clientX)) return 0.5;
        return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
      };
      const scale = (
        from: ChartView,
        factor: number,
        anchor: number,
        to: number,
      ) => {
        const { extent, minSpan } = latest.current;
        update(
          () => scaleView(from, factor, anchor, to, extent, minSpan),
          extent,
        );
      };

      // Two fingers on the plot. Their own map rather than the readout's
      // press, which follows one finger and lets go when a second lands.
      const fingers = new Map<number, { x: number; y: number }>();
      let pinch: { view: ChartView; distance: number; anchor: number } | null =
        null;
      const spread = () => {
        const [a, b] = [...fingers.values()];
        return {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          middle: (a.x + b.x) / 2,
        };
      };
      const down = (event: Event) => {
        const pointer = event as PointerEvent;
        if (pointer.pointerType !== "touch") return;
        fingers.set(pointer.pointerId, {
          x: pointer.clientX,
          y: pointer.clientY,
        });
        if (fingers.size !== 2) return;
        const { distance, middle } = spread();
        pinch = {
          view: latest.current.view,
          distance,
          anchor: fractionAt(middle),
        };
      };
      const move = (event: Event) => {
        const pointer = event as PointerEvent;
        if (!fingers.has(pointer.pointerId)) return;
        fingers.set(pointer.pointerId, {
          x: pointer.clientX,
          y: pointer.clientY,
        });
        if (!pinch || fingers.size !== 2) return;
        const { distance, middle } = spread();
        if (pinch.distance === 0) return;
        scale(
          pinch.view,
          distance / pinch.distance,
          pinch.anchor,
          fractionAt(middle),
        );
      };
      const up = (event: Event) => {
        fingers.delete((event as PointerEvent).pointerId);
        if (fingers.size < 2) pinch = null;
      };
      // The page would zoom under the fingers as well. `touch-action` says
      // so to most browsers; iOS needs telling with the touches themselves.
      const holdPage = (event: Event) => {
        if ((event as TouchEvent).touches.length > 1) event.preventDefault();
      };

      // A trackpad pinch in Chromium and Firefox, and Ctrl with a wheel.
      // Safari sends its own gesture events instead, and while one is under
      // way a wheel with `ctrlKey` is the same pinch told twice.
      let gesture: { view: ChartView; anchor: number } | null = null;
      const wheel = (event: Event) => {
        const wheelEvent = event as WheelEvent;
        const { extent, plotBox, zoomed } = latest.current;
        if (wheelEvent.ctrlKey) {
          event.preventDefault();
          if (gesture) return;
          const pixels =
            wheelEvent.deltaY *
            (wheelEvent.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_PX : 1);
          const step = Math.max(
            -WHEEL_STEP_CAP,
            Math.min(WHEEL_STEP_CAP, pixels),
          );
          const anchor = fractionAt(wheelEvent.clientX);
          const { minSpan } = latest.current;
          update(
            (current) =>
              scaleView(
                current,
                Math.exp(-step * WHEEL_ZOOM_RATE),
                anchor,
                anchor,
                extent,
                minSpan,
              ),
            extent,
          );
          return;
        }
        // A sideways swipe pans a zoomed plot, and is kept from the browser,
        // which would take it at an end of the view for "back".
        if (
          zoomed &&
          Math.abs(wheelEvent.deltaX) > Math.abs(wheelEvent.deltaY)
        ) {
          event.preventDefault();
          const box = plotBox(element);
          if (!box || box.width === 0) return;
          const fraction = wheelEvent.deltaX / box.width;
          update(
            (current, extent) =>
              panView(
                current,
                fraction * (current.end - current.start),
                extent,
              ),
            extent,
          );
        }
      };
      // Safari's pinch, on a trackpad and under fingers alike. Fingers are
      // already pinching through their pointers above, so there it is only
      // kept from zooming the page.
      const gestureStart = (event: Event) => {
        event.preventDefault();
        if (fingers.size > 0) return;
        gesture = {
          view: latest.current.view,
          anchor: fractionAt((event as GestureEvent).clientX),
        };
      };
      const gestureChange = (event: Event) => {
        event.preventDefault();
        if (!gesture) return;
        scale(
          gesture.view,
          (event as GestureEvent).scale,
          gesture.anchor,
          gesture.anchor,
        );
      };
      const gestureEnd = (event: Event) => {
        event.preventDefault();
        gesture = null;
      };

      const listeners: [string, (event: Event) => void][] = [
        ["pointerdown", down],
        ["pointermove", move],
        ["pointerup", up],
        ["pointercancel", up],
        ["touchmove", holdPage],
        ["wheel", wheel],
        ["gesturestart", gestureStart],
        ["gesturechange", gestureChange],
        ["gestureend", gestureEnd],
      ];
      for (const [type, listener] of listeners) {
        element.addEventListener(type, listener, { passive: false });
      }
      return () => {
        for (const [type, listener] of listeners) {
          element.removeEventListener(type, listener);
        }
      };
    },
    [update],
  );

  return {
    view,
    zoomed,
    reset: () => setStored(null),
    panBy: (delta) =>
      update((current, extent) => panView(current, delta, extent), extent),
    ref,
  };
}
