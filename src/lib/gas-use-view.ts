// Which slice of the gas-consumption chart the diver was last looking at, kept
// across visits.
//
// `localStorage`, not `sessionStorage` (which is what `auth-redirect.ts` uses,
// for a deliberately opposite reason): this has to survive the tab closing, so
// that arriving at `/dashboard` tomorrow - by the nav link or by typing the URL
// - shows the period you left it on. Both routes go through the same mount
// effect in `GasUseCard`, so there is nothing route-specific here.
//
// Deliberately not the URL. A remembered view has to work from a bare
// `/dashboard`, which is what the nav link points at and what people bookmark,
// and a query string that only appears after you touch a control can't do that.
//
// What's stored is a view preference - a scope name and a timestamp the diver
// already had on screen. No dive data, nothing fetched, nothing that isn't
// reconstructible from the chart itself.

import {
  GAS_USE_SCOPES,
  type GasUseScope,
  availablePeriods,
  periodRange,
} from "@/lib/dive-gas";

const GAS_USE_VIEW_KEY = "opendiving:gas-use-view";

export interface GasUseView {
  scope: GasUseScope;
  // The period the diver actually picked, or null when they never moved off the
  // default. The distinction matters: null means "whatever is most recent",
  // which keeps following new dives as they're logged, whereas a timestamp
  // pins the view to one period and should stay pinned.
  anchor: number | null;
}

// The stored entry, raw and unparsed.
//
// Deliberately returns the string rather than a parsed object: this is the
// snapshot `GasUseCard` hands to `useSyncExternalStore`, which compares
// snapshots with `Object.is` and loops forever if handed a freshly built object
// each call. A string compares by value, so parsing happens once, downstream.
export function readStoredGasUseView(): string | null {
  try {
    return window.localStorage.getItem(GAS_USE_VIEW_KEY);
  } catch {
    // Storage can be unavailable (Safari private mode, storage disabled) - and
    // where it is missing entirely, reaching through it is a `TypeError` rather
    // than a storage error. Opening on the default view is a fine outcome, not
    // an error case.
    return null;
  }
}

// A stored entry as a view, or null when there isn't one worth restoring.
//
// Everything is re-validated rather than trusted: this is a string a user (or a
// stale build) can put anything in, and a bad `scope` would render a chart with
// no scope button lit, while a bad `anchor` would produce `NaN` coordinates and
// blank the plot.
export function parseGasUseView(raw: string | null): GasUseView | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { scope, anchor } = parsed as Record<string, unknown>;
    if (!GAS_USE_SCOPES.includes(scope as GasUseScope)) return null;
    if (anchor !== null && !Number.isFinite(anchor)) return null;

    return { scope: scope as GasUseScope, anchor: anchor as number | null };
  } catch {
    return null;
  }
}

// `subscribeToNothing` used to live here. It moved, unchanged, to
// `lib/chart-series-view.ts` once the two charts' remembered *series* selections
// wanted it too - three readers of `useSyncExternalStore`, none of which is
// about gas.

export function writeGasUseView(view: GasUseView): void {
  try {
    window.localStorage.setItem(GAS_USE_VIEW_KEY, JSON.stringify(view));
  } catch {
    // As above - and losing the remembered view costs a click, not data.
  }
}

// The remembered anchor made safe against the dives that exist *now*, or null
// to fall back to the most recent dive.
//
// It has to be checked rather than used as stored. A dive can be deleted or have
// its time edited between visits, and the chart's anchor carries an invariant
// the rest of the card leans on: it is a real dive's timestamp, inside a period
// that has dives. Restoring a timestamp that no longer satisfies that renders a
// period select with no matching option - an empty trigger, the same failure
// noted on `GasUsePeriod.start`.
//
// The period fallback is the useful half of this: edit one dive's time and you
// should still land on the month you were reading, not be thrown back to the
// most recent one.
export function resolveAnchor(
  stored: number | null,
  scope: GasUseScope,
  times: number[],
): number | null {
  if (stored === null || times.length === 0) return null;

  // The dive itself is still there and still where it was.
  if (times.includes(stored)) return stored;

  // "All" has no period to fall back to - it plots everything either way.
  if (scope === "all") return null;

  const { start } = periodRange(stored, scope);
  const period = availablePeriods(times, scope).find(
    (candidate) => candidate.start === start,
  );

  return period ? period.anchor : null;
}
