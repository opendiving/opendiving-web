// Which slice of the dive-activity chart the diver was last looking at, kept
// across visits.
//
// The third of these (after `gas-use-view.ts` and `chart-series-view.ts`) and
// deliberately its own entry rather than a field on one of them: they are
// written by different cards, and merging them would mean each card's write
// having to preserve the others' keys. Same storage and the same reasons -
// `localStorage`, because it has to survive the tab closing; not the URL,
// because it has to work from the bare `/dashboard` the nav link points at and
// people bookmark, which a query string appearing only after you touch a control
// can't do.
//
// What's stored is a view preference: a scope name and a timestamp the diver
// already had on screen. No dive data, nothing fetched.

import { CHART_SCOPES, type ChartScope } from "@/lib/chart-period";

const DIVE_ACTIVITY_VIEW_KEY = "opendiving:dive-activity-view";

export interface DiveActivityView {
  scope: ChartScope;
  // The period the diver picked, as the UTC start of a day they had dives on, or
  // null when they never moved off the default. The distinction is the same one
  // `GasUseView.anchor` draws: null means "whatever is most recent", which keeps
  // following new dives as they're logged, whereas a timestamp pins the view and
  // should stay pinned.
  //
  // A timestamp rather than the plain year this used to hold, because there are
  // now two bounded scopes and a year can't say which month of it you were on.
  // An entry in the old shape has no `anchor` at all and is rejected whole by
  // `parseDiveActivityView`, which costs a returning diver one click - the right
  // trade against carrying a migration for a remembered scroll position.
  anchor: number | null;
}

// The stored entry, raw and unparsed.
//
// Deliberately the string rather than a parsed object, for the reason spelled
// out on `readStoredGasUseView`: this is the snapshot the card hands to
// `useSyncExternalStore`, which compares with `Object.is` and loops forever if
// handed a freshly built object each call.
export function readStoredDiveActivityView(): string | null {
  try {
    return window.localStorage.getItem(DIVE_ACTIVITY_VIEW_KEY);
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
// Re-validated rather than trusted: this is a string a user (or a stale build)
// can put anything in, and a bad `scope` would light no button in the segmented
// control, while a `NaN` anchor would render a period select with no matching
// option - an empty trigger.
export function parseDiveActivityView(
  raw: string | null,
): DiveActivityView | null {
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

export function writeDiveActivityView(view: DiveActivityView): void {
  try {
    window.localStorage.setItem(DIVE_ACTIVITY_VIEW_KEY, JSON.stringify(view));
  } catch {
    // As above - and losing the remembered view costs a click, not data.
  }
}

// `resolveYear` used to live here, and `resolveAnchor` in `lib/chart-period.ts`
// replaced it: the two cards now remember the same kind of thing, and checking a
// remembered period against the data that exists today is one rule, not two.
