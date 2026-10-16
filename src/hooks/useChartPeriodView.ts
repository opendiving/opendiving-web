"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type ChartPeriod,
  type ChartScope,
  availablePeriods,
  resolveAnchor,
  stepPeriod,
} from "@/lib/chart-period";
import {
  parsePeriodView,
  readStoredPeriodView,
  writePeriodView,
} from "@/lib/chart-period-view";
import { subscribeToNothing } from "@/lib/chart-series-view";

/** Where a Home trend card's series comes from, and how it is windowed. */
export interface ChartPeriodSource<Point> {
  /** Fetches the whole series, once, on mount. */
  load: () => Promise<Point[]>;
  /** Logged with the error when `load` fails. */
  failure: string;
  /**
   * The chronological timestamps a period anchor may take - a dive's own time,
   * or the start of a day with diving in it. Always one of these, which is what
   * makes switching scope land somewhere useful (the month *containing* the
   * one you were looking at) instead of on an empty period.
   */
  anchors: (points: Point[]) => number[];
  /** The `chart-period-view.ts` key the view is remembered under. */
  storageKey: string;
  /** The scope a first visit opens on. */
  defaultScope: ChartScope;
}

/** A Home trend card's period state - what `ChartPeriodControls` drives. */
export interface ChartPeriodState<Point> {
  /** The series, or null while it loads. Empty when the fetch failed. */
  points: Point[] | null;
  /** `source.anchors` of `points`. */
  times: number[];
  scope: ChartScope;
  setScope: (scope: ChartScope) => void;
  /** A timestamp inside the period on screen; `0` only on an empty series. */
  anchor: number;
  setAnchor: (anchor: number | null) => void;
  /** The anchors one period with data back and forward, or null at an end. */
  previous: number | null;
  next: number | null;
  /** The periods with data at the current scope, for the period picker. */
  periods: ChartPeriod[];
}

/**
 * The scope and period a Home trend card shows: this visit's pick, over the
 * view remembered from the last, over the most recent data - and the stepping
 * and picking around it.
 *
 * `source` must be stable - a module-level constant - because the fetch runs
 * whenever its identity changes.
 */
export function useChartPeriodView<Point>(
  source: ChartPeriodSource<Point>,
): ChartPeriodState<Point> {
  const { load, failure, anchors, storageKey, defaultScope } = source;
  const [points, setPoints] = useState<Point[] | null>(null);
  // Both of these hold *this visit's* choice, and both are null until the diver
  // makes one - which is what leaves room for the remembered view underneath.
  const [chosenScope, setChosenScope] = useState<ChartScope | null>(null);
  const [chosenAnchor, setAnchor] = useState<number | null>(null);

  // The view remembered from last time.
  //
  // Through `useSyncExternalStore` rather than a `useState` + effect pair, which
  // is what this wants to be and can't: `localStorage` doesn't exist on the
  // server, so a first client render that read it would disagree with the HTML
  // Next rendered and be a hydration mismatch. The three arguments are exactly
  // that problem's shape - a server snapshot of `null` to hydrate against, a
  // client snapshot read straight from storage, and no subscription (see
  // `subscribeToNothing`). React re-renders with the client value immediately
  // after hydrating, under the skeleton the card is already showing.
  //
  // The snapshot is the raw string because `useSyncExternalStore` compares
  // snapshots by identity; parsing it here, once per distinct string, is what
  // keeps that comparison meaningful.
  const readStored = useCallback(
    () => readStoredPeriodView(storageKey),
    [storageKey],
  );
  const stored = useSyncExternalStore(
    subscribeToNothing,
    readStored,
    () => null,
  );
  const remembered = useMemo(() => parsePeriodView(stored), [stored]);

  const scope = chosenScope ?? remembered?.scope ?? defaultScope;

  useEffect(() => {
    const fetchSeries = async () => {
      try {
        setPoints(await load());
      } catch (error) {
        console.error(failure, error);
        // An empty series renders the card's own empty prompt, which is a
        // better failure than a card stuck loading forever.
        setPoints([]);
      }
    };

    fetchSeries();
  }, [load, failure]);

  const times = useMemo(() => anchors(points ?? []), [anchors, points]);

  // The remembered period, checked against the data that exists now - see
  // `resolveAnchor`. Null until the series arrives, which is why the fallback
  // below still has to be there.
  const rememberedAnchor = useMemo(
    () => resolveAnchor(remembered?.anchor ?? null, scope, times),
    [remembered, scope, times],
  );

  // Three sources, most specific first: whatever the diver clicked in this
  // visit, then whatever they were reading last visit, then the most recent
  // data - not the oldest, since the interesting question is how you're diving
  // now and the older periods are one click back.
  //
  // The `0` is unreachable except on an empty series, where the chart renders
  // its prompt instead of a plot.
  const anchor =
    chosenAnchor ?? rememberedAnchor ?? times[times.length - 1] ?? 0;

  // Remembered for next time. Held back until the series is in: `times` is what
  // `rememberedAnchor` resolves against, so writing before it arrives would
  // persist a null over the very period we're about to restore. That guard also
  // covers the failed-fetch path, which sets an empty series - a request that
  // didn't come back should not erase where you were.
  useEffect(() => {
    if (times.length === 0) return;

    // The *chosen* anchor, never `anchor`. Falling back to the most recent data
    // is a default, not a preference, and persisting it would pin the card to
    // today's newest dive forever - so a diver who never touched the period
    // control would stop following their own new dives.
    writePeriodView(storageKey, {
      scope,
      anchor: chosenAnchor ?? rememberedAnchor,
    });
  }, [storageKey, times, scope, chosenAnchor, rememberedAnchor]);

  // "All" spans the whole series, so it has no period to step through - the
  // null that switches the controls off.
  const steppable = scope === "all" ? null : scope;
  const previous = steppable ? stepPeriod(anchor, steppable, -1, times) : null;
  const next = steppable ? stepPeriod(anchor, steppable, 1, times) : null;
  const periods = useMemo(
    () => (steppable ? availablePeriods(times, steppable) : []),
    [times, steppable],
  );

  return {
    points,
    times,
    scope,
    setScope: setChosenScope,
    anchor,
    setAnchor,
    previous,
    next,
    periods,
  };
}
