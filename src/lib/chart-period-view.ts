// Which slice of a Home trend chart the diver was last looking at, kept across
// visits.
//
// Generic over the storage key, as `chart-series-view.ts` is, because both cards
// remember the same shape and only where they keep it differs. One entry per
// card rather than one shared entry: each card's write would otherwise have to
// preserve the other's period.
//
// `localStorage`, not `sessionStorage`: this has to survive the tab closing, so
// that arriving at `/home` tomorrow - by the nav link or by typing the URL -
// shows the period you left it on. (`auth-redirect.ts` reaches for the same
// storage for a related reason: it needs a value to outlive the tab that wrote
// it.)
//
// Deliberately not the URL. A remembered view has to work from a bare `/home`,
// which is what the nav link points at and what people bookmark, and a query
// string that only appears after you touch a control can't do that.
//
// What's stored is a view preference - a scope name and a timestamp the diver
// already had on screen. No dive data, nothing fetched, nothing that isn't
// reconstructible from the chart itself.

import { CHART_SCOPES, type ChartScope } from "@/lib/chart-period";

export const DIVE_ACTIVITY_VIEW_KEY = "opendiving:dive-activity-view";
export const GAS_USE_VIEW_KEY = "opendiving:gas-use-view";

export interface ChartPeriodView {
  scope: ChartScope;
  // The period the diver actually picked, or null when they never moved off the
  // default. The distinction matters: null means "whatever is most recent",
  // which keeps following new dives as they're logged, whereas a timestamp
  // pins the view to one period and should stay pinned.
  //
  // An entry with no `anchor` at all - the `{ scope, year }` shape an older
  // activity card wrote - is rejected whole by `parsePeriodView`, which costs a
  // returning diver one click.
  anchor: number | null;
}

// The stored entry, raw and unparsed.
//
// Deliberately returns the string rather than a parsed object: this is the
// snapshot `useChartPeriodView` hands to `useSyncExternalStore`, which compares
// snapshots with `Object.is` and loops forever if handed a freshly built object
// each call. A string compares by value, so parsing happens once, downstream.
export function readStoredPeriodView(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
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
// stale build) can put anything in, and a bad `scope` would light no button in
// the segmented control, while a `NaN` anchor would render a period select with
// no matching option and blank the plot.
export function parsePeriodView(raw: string | null): ChartPeriodView | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { scope, anchor } = parsed as Record<string, unknown>;
    if (!CHART_SCOPES.includes(scope as ChartScope)) return null;
    if (anchor !== null && !Number.isFinite(anchor)) return null;

    return { scope: scope as ChartScope, anchor: anchor as number | null };
  } catch {
    return null;
  }
}

export function writePeriodView(
  storageKey: string,
  view: ChartPeriodView,
): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(view));
  } catch {
    // As above - and losing the remembered view costs a click, not data.
  }
}
