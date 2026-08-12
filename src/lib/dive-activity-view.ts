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
// What's stored is a view preference: a scope name and a year the diver already
// had on screen. No dive data, nothing fetched.

import {
  DIVE_ACTIVITY_SCOPES,
  type DiveActivityScope,
} from "@/lib/dive-activity";

const DIVE_ACTIVITY_VIEW_KEY = "opendiving:dive-activity-view";

export interface DiveActivityView {
  scope: DiveActivityScope;
  // The year the diver picked, or null when they never moved off the default.
  // The distinction is the same one `GasUseView.anchor` draws: null means
  // "whatever is most recent", which keeps following new dives as they're
  // logged, whereas a year pins the view and should stay pinned.
  year: number | null;
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
// control, while a `NaN` year would render a period select with no matching
// option - an empty trigger.
export function parseDiveActivityView(
  raw: string | null,
): DiveActivityView | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { scope, year } = parsed as Record<string, unknown>;
    if (!DIVE_ACTIVITY_SCOPES.includes(scope as DiveActivityScope)) return null;
    // A year is a whole number here, and `Number.isInteger` rejects the `NaN`,
    // the infinities and the 2026.5 that `Number.isFinite` alone would let into
    // a `<Select>` value.
    if (year !== null && !Number.isInteger(year)) return null;

    return { scope: scope as DiveActivityScope, year: year as number | null };
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

// The remembered year made safe against the logbook as it exists *now*, or null
// to fall back to the most recent year with diving.
//
// It has to be checked rather than used as stored: a year can empty out between
// visits (its dives deleted, or their dates corrected into another year), and
// restoring it would select a year the dropdown no longer offers - which renders
// an empty trigger, the same failure noted on `GasUsePeriod.start`.
//
// Simpler than `resolveAnchor`, which has a period to fall back to when the dive
// it remembered has moved. A year *is* the period here, so there is no nearer
// thing to land on: either it still has diving in it or it doesn't.
export function resolveYear(
  stored: number | null,
  years: number[],
): number | null {
  if (stored === null) return null;
  return years.includes(stored) ? stored : null;
}
