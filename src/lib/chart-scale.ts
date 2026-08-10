// Axis scaling shared by the app's hand-rolled SVG charts (`gas-use-chart.tsx`,
// `dive-profile-chart.tsx`). Moved out of `lib/dive-gas.ts`, unchanged, once a
// second chart needed it - a depth axis has nothing to do with gas use, and
// importing a gas module to scale meters reads as an accident.

// A rounded axis domain covering `values`, as `{ min, max, step }`.
//
// Deliberately not zero-based: RMV clusters in a narrow band (most divers live
// between 10 and 25 L/min), and anchoring the axis at 0 squashes a career's
// worth of real variation into the top third of the chart. The axis is labeled,
// so there's no misreading it.
//
// That is also right for depth, which does need to be anchored at the surface:
// feeding it the surface's own `0` makes `Math.floor(0 / step) * step` equal 0,
// so the axis lands on 0 by arithmetic rather than by a special case. Nobody
// needs to add a `zeroBased` flag here that would do nothing.
export function niceDomain(
  values: number[],
  targetTicks = 5,
): { min: number; max: number; step: number } {
  if (values.length === 0) return { min: 0, max: 1, step: 1 };

  const lowest = Math.min(...values);
  const highest = Math.max(...values);

  // One dive, or a freakishly consistent diver: a zero-height range would make
  // every scaled coordinate NaN, so give it an arbitrary band to sit in.
  if (highest === lowest) {
    return { min: lowest - 1, max: lowest + 1, step: 1 };
  }

  const rawStep = (highest - lowest) / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  // 2.5 is in here (it isn't in the textbook 1/2/5/10 progression) because
  // without it a 5-to-26 L/min spread - an entirely typical one - falls through
  // to a step of 10 and gets three gridlines for the whole chart.
  const niceStep = [1, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) ?? 10;
  const step = niceStep * magnitude;

  return {
    min: Math.floor(lowest / step) * step,
    max: Math.ceil(highest / step) * step,
    step,
  };
}

// The gridline values for a domain, inclusive of both ends. Built by counting
// steps rather than by accumulating `+= step`, which drifts on fractional steps
// (0.1 + 0.2 territory) and produces labels like "12.499999999999998".
export function axisTicks({
  min,
  max,
  step,
}: {
  min: number;
  max: number;
  step: number;
}): number[] {
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, index) =>
    Number((min + index * step).toFixed(10)),
  );
}
