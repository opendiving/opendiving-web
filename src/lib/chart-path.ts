// Path geometry shared by the app's hand-rolled SVG charts
// (`gas-use-chart.tsx`, `dive-profile-chart.tsx`). `Point` and `buildAreaPath`
// moved here, unchanged, from `lib/dive-profile.ts` once a second chart needed
// them - the same move `niceDomain`/`axisTicks` made into `lib/chart-scale.ts`,
// and for the same reason: a gas chart importing a dive-profile module to draw
// a filled shape reads as an accident.

export interface Point {
  x: number;
  y: number;
}

// Coordinates are rounded before they reach a path string. Two decimals is well
// under a viewBox unit - which is itself a fraction of a pixel at any size this
// renders at - and it keeps the `d` attribute readable and assertable instead of
// being a wall of `123.45600000000002`.
function round(value: number): number {
  return Number(value.toFixed(2));
}

// The `d` of the filled area under a curve: along the points, down to the
// baseline, back along it, closed.
//
// Kept in `lib/` rather than inlined in the component so the path string is
// assertable - it is the one piece of SVG in these charts with a shape worth
// getting wrong.
export function buildAreaPath(points: Point[], baselineY: number): string {
  if (points.length === 0) return "";

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  return `${line} L${points[points.length - 1].x},${baselineY} L${points[0].x},${baselineY} Z`;
}

// The cubic segments joining `points`, without the leading `M` - the shared
// middle of `smoothPath` and `smoothBandPath`.
//
// Monotone cubic interpolation (Fritsch-Carlson), specifically, rather than the
// Catmull-Rom spline that every "smooth line chart" snippet reaches for. The
// difference is the whole reason smoothing is safe to apply to data at all:
// Catmull-Rom overshoots around a local extreme, so a dip in a trend line gets
// drawn dipping *below* its lowest value. On this chart that would render a gas
// consumption the diver never achieved, sitting under their actual best dive.
// Monotone cubic is constructed to never leave the interval between two
// neighbouring points, so the curve can only ever say what the numbers say.
//
// Assumes x is non-decreasing, which every caller satisfies (both charts plot
// against time, oldest first). Two samples at the same instant would make the
// slope infinite, so a zero-width step is treated as flat.
function curveCommands(points: Point[]): string {
  const count = points.length;

  // The secant slope of each interval, and the width it spans.
  const widths: number[] = [];
  const secants: number[] = [];
  for (let index = 0; index < count - 1; index++) {
    const width = points[index + 1].x - points[index].x;
    widths.push(width);
    secants.push(
      width > 0 ? (points[index + 1].y - points[index].y) / width : 0,
    );
  }

  // The tangent at each point: the average of the two secants meeting there,
  // flattened to zero at a local extreme (where the secants have opposite
  // signs) so the curve turns over cleanly instead of overshooting.
  const tangents: number[] = new Array(count);
  tangents[0] = secants[0];
  tangents[count - 1] = secants[count - 2];
  for (let index = 1; index < count - 1; index++) {
    tangents[index] =
      secants[index - 1] * secants[index] <= 0
        ? 0
        : (secants[index - 1] + secants[index]) / 2;
  }

  // Fritsch-Carlson's limiter: pull any tangent pair back inside the circle of
  // radius 3 that guarantees monotonicity over the interval. This is the step
  // that makes the "never overshoots" claim above true rather than approximate.
  for (let index = 0; index < count - 1; index++) {
    if (secants[index] === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }

    const start = tangents[index] / secants[index];
    const end = tangents[index + 1] / secants[index];
    const distance = start * start + end * end;
    if (distance > 9) {
      const scale = 3 / Math.sqrt(distance);
      tangents[index] = scale * start * secants[index];
      tangents[index + 1] = scale * end * secants[index];
    }
  }

  // A cubic Hermite segment expressed as the bezier SVG wants: the control
  // points sit a third of the interval along each endpoint's tangent.
  return points
    .slice(1)
    .map((point, index) => {
      const width = widths[index];
      const c1x = points[index].x + width / 3;
      const c1y = points[index].y + (tangents[index] * width) / 3;
      const c2x = point.x - width / 3;
      const c2y = point.y - (tangents[index + 1] * width) / 3;

      return `C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(point.x)},${round(point.y)}`;
    })
    .join(" ");
}

// The `d` of a smooth curve through `points`.
//
// A single point produces a bare `M`, which draws nothing - deliberately the
// same no-op a one-point `<polyline>` was, so a stretch of diving containing one
// dive still costs nothing to render.
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";

  const start = `M${round(points[0].x)},${round(points[0].y)}`;
  if (points.length === 1) return start;

  return `${start} ${curveCommands(points)}`;
}

// The `d` of a closed band between two curves sharing an x series: out along
// `upper`, back along `lower`, closed. Both edges are smoothed the same way, so
// the band hugs the line it surrounds instead of drifting away from it at the
// bends.
export function smoothBandPath(upper: Point[], lower: Point[]): string {
  if (upper.length < 2 || upper.length !== lower.length) return "";

  const back = [...lower].reverse();

  return `${smoothPath(upper)} L${round(back[0].x)},${round(back[0].y)} ${curveCommands(back)} Z`;
}

// The `d` of a bar with its top two corners rounded and its bottom two square.
//
// `<rect rx>` would be the obvious way to draw a bar, and it rounds all four
// corners - which lifts the bar off the axis it is measured from, leaving a
// visible notch either side of the baseline. Rounding only the top is what makes
// a bar read as a column standing on the axis rather than as a floating pill.
//
// The radius is clamped to what the bar can actually carry: half its width (past
// that the two arcs would cross) and its own height (a one-dive bar in a
// hundred-dive year is a few units tall, and a 4-unit radius on it would bow the
// sides). A zero-height bar draws nothing at all, which is right - "no diving
// that month" is an absence, not a sliver.
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  if (height <= 0 || width <= 0) return "";

  const r = Math.min(radius, width / 2, height);
  const right = x + width;
  const bottom = y + height;

  return [
    `M${round(x)},${round(bottom)}`,
    `L${round(x)},${round(y + r)}`,
    `Q${round(x)},${round(y)} ${round(x + r)},${round(y)}`,
    `L${round(right - r)},${round(y)}`,
    `Q${round(right)},${round(y)} ${round(right)},${round(y + r)}`,
    `L${round(right)},${round(bottom)}`,
    "Z",
  ].join(" ");
}
