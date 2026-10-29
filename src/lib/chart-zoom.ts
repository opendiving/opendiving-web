// The window of a chart's x axis that is on screen, for a chart that zooms. Kept
// apart from any one chart so the arithmetic can be swept in a unit test rather
// than pinched at in a browser.

/** The part of an axis from 0 to some extent that is on screen. */
export interface ChartView {
  start: number;
  end: number;
}

/** A view of the whole axis. */
export const fullView = (extent: number): ChartView => ({
  start: 0,
  end: extent,
});

/** Whether `view` shows less than the whole of an axis `extent` long. */
export const isZoomed = (view: ChartView, extent: number) =>
  view.end - view.start < extent;

// How near the whole axis a span is the whole axis, as a fraction of it. A wheel
// zooms one step on the last, so a zoom in and back out by the same steps ends a
// few rounding errors short, which would read as still zoomed.
const WHOLE_AXIS_TOLERANCE = 0.001;

// Slid back inside the axis wherever it overhangs an end, keeping its span, in
// whole units.
function within(start: number, span: number, extent: number): ChartView {
  span = Math.min(extent, Math.round(span));
  const clamped = Math.min(Math.max(0, Math.round(start)), extent - span);
  return { start: clamped, end: clamped + span };
}

/**
 * `view` magnified by `factor` - below 1 zooms out - holding the instant that
 * was `from` of the way across it at `to` of the way across the result. A
 * pinch whose fingers also slide passes the two midpoints; a wheel holds one.
 *
 * The span stays between `minSpan` and the whole axis, and the view inside it.
 */
export function scaleView(
  view: ChartView,
  factor: number,
  from: number,
  to: number,
  extent: number,
  minSpan: number,
): ChartView {
  const span = view.end - view.start;
  const anchor = view.start + from * span;
  const fitted = Math.max(Math.min(minSpan, extent), span / factor);
  const next = fitted >= extent * (1 - WHOLE_AXIS_TOLERANCE) ? extent : fitted;
  return within(anchor - to * next, next, extent);
}

/** `view` moved along the axis by `delta`, and no further than either end. */
export function panView(
  view: ChartView,
  delta: number,
  extent: number,
): ChartView {
  return within(view.start + delta, view.end - view.start, extent);
}
