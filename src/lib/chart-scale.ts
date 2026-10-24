// Axis scaling shared by the app's hand-rolled SVG charts (`gas-use-chart.tsx`,
// `dive-profile-chart.tsx`). Its own module because a depth axis has nothing to do
// with gas use, and importing a gas module to scale meters reads as an accident.

// The viewBox frame Home's two trend charts and the admin's daily bars share. Not
// pixels: the SVG scales to its container, so these are only ever ratios to each
// other. This is the design width; a phone draws into a narrower one (see
// `useChartWidth`). The profile chart has its own, with a second axis on the
// right.
//
// No horizontal padding: the plot runs to the viewBox's right edge, and on the
// left stops just past its y labels (`plotLeft`), so the chart fills its card out
// to the card's own padding. A dot or a label at either end overhangs into that
// padding, which is why these SVGs are `overflow-visible`.
export const CHART_WIDTH = 720;
export const CHART_HEIGHT = 240;
export const CHART_PADDING = { top: 12, bottom: 28 };
export const CHART_PLOT_HEIGHT =
  CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

// Between a y label's right end and the plot.
export const Y_LABEL_GAP = 8;

// The advance of an axis label's characters in 11-unit Inter, in viewBox units,
// measured and rounded up, so the widest label never starts outside the viewBox.
// An estimate rather than a measurement because a plot's edges have to be known
// on the server, where nothing can be measured. A unit's letters get a lowercase
// letter's average.
const LABEL_ADVANCE: Record<string, number> = {
  ".": 3.2,
  "-": 5.1,
  " ": 2.8,
  "%": 10.8,
};
const LABEL_DIGIT = 7.1;
const LABEL_LETTER = 7;

// How wide `text` draws at `fontSize`, in viewBox units - see `LABEL_ADVANCE`.
export function labelWidth(text: string, fontSize = 11): number {
  const advance = [...text].reduce(
    (sum, char) =>
      sum +
      (LABEL_ADVANCE[char] ??
        (/[0-9]/.test(char) ? LABEL_DIGIT : LABEL_LETTER)),
    0,
  );
  return (advance * fontSize) / 11;
}

// Where the plot starts for a y axis labelled `ticks`: the widest label sits flush
// with the viewBox's left edge, `Y_LABEL_GAP` short of the plot.
export function plotLeft(ticks: number[]): number {
  return (
    Math.max(0, ...ticks.map((tick) => labelWidth(String(tick)))) + Y_LABEL_GAP
  );
}

export interface Domain {
  min: number;
  max: number;
  step: number;
}

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
export function niceDomain(values: number[], targetTicks = 5): Domain {
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
  const niceStep =
    [1, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) ?? 10;
  const step = niceStep * magnitude;

  return {
    min: Math.floor(lowest / step) * step,
    max: Math.ceil(highest / step) * step,
    step,
  };
}

// A rounded domain covering `values` in exactly `steps` gaps, so its ticks land
// at the same heights as those of another axis with that many - which is what
// lets two scales share one edge, a pair of numbers per height.
//
// Walks `niceDomain`'s ladder up from the smallest step that could span the
// values until one does, floor included. For non-negative values that always
// terminates; the cap is for anything else, which gets an unrounded domain.
// Values that never change get whole units around them, as `niceDomain` gives
// them a band, rather than a ladder that starts at nothing.
export function alignedDomain(values: number[], steps: number): Domain {
  if (values.length === 0 || steps < 1) return niceDomain(values);

  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const range = highest - lowest;
  if (range === 0) {
    const min = Math.floor(lowest) - Math.floor(steps / 2);
    return { min, max: min + steps, step: 1 };
  }

  let magnitude = 10 ** Math.floor(Math.log10(range / steps));
  for (let attempt = 0; attempt < 12; attempt += 1, magnitude *= 10) {
    for (const candidate of [1, 2, 2.5, 5]) {
      const step = candidate * magnitude;
      const min = Math.floor(lowest / step) * step;
      if (min + steps * step >= highest) {
        return { min, max: min + steps * step, step };
      }
    }
  }
  return { min: lowest, max: lowest + range, step: range / steps };
}

// How many gaps a domain's ticks divide it into.
export const stepCount = ({ min, max, step }: Domain) =>
  Math.round((max - min) / step);

// The 1/2/5 progression `niceDomain` picks its step from, as whole numbers.
const COUNT_STEPS = [1, 2, 5];

// An axis for counting whole things - dives per month, on `dive-activity-chart`.
//
// Two things `niceDomain` deliberately doesn't do, both of which a bar chart
// needs. It isn't anchored at zero, which is right for RMV and wrong here: a
// bar's *height* is the quantity, so a floating baseline would draw four dives
// as twice the block of three. And its step ladder includes 2.5, which on a
// scale of dives produces gridlines at 2.5 and 7.5 - half a dive is not a thing
// that can be logged, and an axis that implies otherwise is worse than a coarser
// one.
//
// Walks the ladder upward until the axis fits in `targetTicks` gaps. That always
// terminates: by the time `magnitude` reaches the largest power of ten at or
// below `top`, `5 * magnitude` covers more than half of it.
//
// `targetTicks` is what decides how much dead space sits above the tallest bar,
// and 5 - `niceDomain`'s own default - is deliberate. At 4, a 223-dive year has
// to round up to a step of 100 and an axis of 300, leaving the busiest bar in the
// logbook at 74% of the plot with a quarter of the chart empty above it; 5 admits
// a step of 50 and an axis of 250, and the same bar fills 89%. Every other real
// shape is unchanged between the two. Going further, to 6, buys one more case (12
// dives, which stops rounding to 15) at the cost of a step of 2 and six gridlines
// on a chart that is 240 units tall - a busier axis than the data deserves.
//
// The ceiling never changes what the bars *say*: it scales all of them equally,
// so their ratios hold whatever it is. All that is being traded here is vertical
// extent against how readable the gridlines are - which is why exactly-the-
// tallest-bar is wrong, tempting as it looks. It would put this axis's labels at
// 55.75, 111.5 and 167.25, and the gridlines are the only way to read a bar the
// cursor isn't on.
export function countDomain(highest: number, targetTicks = 5): Domain {
  // An empty logbook, or a month with one dive in it, still needs an axis with
  // room to draw a bar in.
  const top = Math.max(1, Math.ceil(highest));

  for (let magnitude = 1; magnitude <= top; magnitude *= 10) {
    for (const candidate of COUNT_STEPS) {
      const step = candidate * magnitude;
      if (top / step <= targetTicks) {
        return { min: 0, max: Math.ceil(top / step) * step, step };
      }
    }
  }

  // Unreachable for any `targetTicks >= 2` - see above. A single gridline at the
  // top is the honest degenerate answer rather than a throw, since this is only
  // ever scaling a picture.
  return { min: 0, max: top, step: top };
}

// The narrowest container, in CSS pixels, a chart is drawn into at its full
// viewBox width. Its 11-unit axis type renders at 8.6px there, the smallest these
// charts draw it.
export const CHART_FULL_WIDTH_PX = 560;

// The viewBox width for a chart designed `width` units wide, in a container
// `containerPx` wide. From `CHART_FULL_WIDTH_PX` up it is the design width, so a
// desktop layout draws exactly as designed. Below it the viewBox narrows in step
// with the container, which keeps the scale - and so the type size - the chart
// has at that width: a phone gets a narrower plot, not smaller labels and not a
// scrollbar. Unmeasured (`null` or `0`, which is also what jsdom reports) gets
// the design width.
export function fittedChartWidth(
  width: number,
  containerPx: number | null,
): number {
  if (!containerPx || containerPx >= CHART_FULL_WIDTH_PX) return width;
  return (width * containerPx) / CHART_FULL_WIDTH_PX;
}

// How many labels fit along `plotWidth` viewBox units when each needs `spacing`
// of them, never fewer than one.
export function labelCapacity(plotWidth: number, spacing: number): number {
  return Math.max(1, Math.floor(plotWidth / spacing));
}

// The gridline values for a domain, inclusive of both ends. Built by counting
// steps rather than by accumulating `+= step`, which drifts on fractional steps
// (0.1 + 0.2 territory) and produces labels like "12.499999999999998".
export function axisTicks({ min, max, step }: Domain): number[] {
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, index) =>
    Number((min + index * step).toFixed(10)),
  );
}
