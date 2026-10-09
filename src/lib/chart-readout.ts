// Which mark of a chart a finger means. Pure arithmetic in viewBox units, so the
// charts can hand it whatever they drew.

/** A mark on the plot, at its own viewBox position. */
export interface PlotMark<T> {
  value: T;
  x: number;
  y: number;
}

/**
 * A client point on an `<svg>` drawn `viewWidth` units wide, in its viewBox
 * units. The charts scale their SVG uniformly into a box of exactly its size, so
 * one factor serves both axes - `scale`, viewBox units per CSS px.
 */
export function viewBoxPoint(
  box: { left: number; top: number; width: number },
  viewWidth: number,
  clientX: number,
  clientY: number,
): { x: number; y: number; scale: number } {
  const scale = viewWidth / box.width;
  return {
    x: (clientX - box.left) * scale,
    y: (clientY - box.top) * scale,
    scale,
  };
}

/**
 * The mark nearest a scrubbing finger's x, the way a crosshair reads: a finger
 * dragged sideways walks the marks in order wherever they sit up the plot.
 * Marks level with each other in x go to whichever is nearer in y.
 */
export function nearestByX<T>(
  marks: readonly PlotMark<T>[],
  at: { x: number; y: number },
): PlotMark<T> | null {
  let best: PlotMark<T> | null = null;
  for (const mark of marks) {
    if (
      !best ||
      Math.abs(mark.x - at.x) < Math.abs(best.x - at.x) ||
      (mark.x === best.x && Math.abs(mark.y - at.y) < Math.abs(best.y - at.y))
    ) {
      best = mark;
    }
  }
  return best;
}

/**
 * The mark nearest a tap, if one is within `reach` of it - a tap on empty plot
 * means nothing in particular rather than the nearest dive months away.
 */
export function nearestWithin<T>(
  marks: readonly PlotMark<T>[],
  at: { x: number; y: number },
  reach: number,
): PlotMark<T> | null {
  let best: PlotMark<T> | null = null;
  let bestDistance = reach;
  for (const mark of marks) {
    const distance = Math.hypot(mark.x - at.x, mark.y - at.y);
    if (distance <= bestDistance) {
      best = mark;
      bestDistance = distance;
    }
  }
  return best;
}
