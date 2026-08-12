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

import { CHART_SCOPES, type ChartScope } from "@/lib/chart-period";

const GAS_USE_VIEW_KEY = "opendiving:gas-use-view";

export interface GasUseView {
  scope: ChartScope;
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
    if (!CHART_SCOPES.includes(scope as ChartScope)) return null;
    if (anchor !== null && !Number.isFinite(anchor)) return null;

    return { scope: scope as ChartScope, anchor: anchor as number | null };
  } catch {
    return null;
  }
}

// `subscribeToNothing` used to live here. It moved, unchanged, to
// `lib/chart-series-view.ts` once the two charts' remembered *series* selections
// wanted it too - three readers of `useSyncExternalStore`, none of which is
// about gas. `resolveAnchor` made the same move later, to
// `lib/chart-period.ts`, once the activity card remembered an anchor too - what
// it does is check a timestamp against the periods that still have data, which
// is period arithmetic rather than anything about this storage key.

export function writeGasUseView(view: GasUseView): void {
  try {
    window.localStorage.setItem(GAS_USE_VIEW_KEY, JSON.stringify(view));
  } catch {
    // As above - and losing the remembered view costs a click, not data.
  }
}
