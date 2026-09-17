/**
 * The route fallback's reveal delay, counted from the click rather than from
 * the moment a placeholder is inserted.
 *
 * Longer than the in-place 150ms on purpose, and separate from it: a card that
 * refetches where it stands starts its delay when it starts waiting, but a
 * route fallback is inserted the instant a link is clicked and has a round trip
 * to cover before the page it stands in for can draw anything. At 150ms it
 * would show grey on navigations that finish in 230ms and show none today.
 *
 * 330ms is the middle of the window the two round trips leave. Behind no
 * boundary the destination's data lands around 225-229ms on a 100ms link, so a
 * reveal after 330ms adds no grey that a diver does not already see; the form
 * pages, whose "data" is the RSC response itself, arrive by ~313ms on a 300ms
 * link, which is the floor this sits above; and on that same link a list's data
 * is still 550ms away, so the skeleton is revealed and continuous well before
 * it.
 *
 * Behind a boundary the data arrives later than any of those figures, and this
 * constant is not what moves it - see "A Suspense fallback committed at the
 * click costs ~300ms to the data behind it" in DECISIONS.md.
 */
export const ROUTE_FALLBACK_HOLD_MS = 330;

interface RouteHold {
  /** `performance.now()` at the fallback's first render, which is the click. */
  startedAt: number;
  /** Set when the fallback unmounts: the navigation it belongs to is over. */
  expired: boolean;
}

let hold: RouteHold | null = null;

const isBrowser = () => typeof window !== "undefined";

/**
 * Starts the hold. Called while the route fallback renders for the first time,
 * so `startedAt` is the click and not a later frame.
 */
export function beginRouteHold(): void {
  if (!isBrowser()) return;
  hold = { startedAt: performance.now(), expired: false };
}

/**
 * Re-opens a hold its own fallback expired. Only React's development remount
 * reaches this: the effect that arms the expiry runs, is torn down and runs
 * again on a fallback that never left the screen.
 */
export function resumeRouteHold(): void {
  if (hold) hold.expired = false;
}

/**
 * Ends the hold. Called from the fallback's unmount, which happens in the same
 * commit that mounts the page - after the page has rendered and read the
 * remaining delay, and before anything that mounts later can.
 */
export function expireRouteHold(): void {
  if (hold) hold.expired = true;
}

/**
 * What is left of the hold, in milliseconds, or `null` when no navigation is
 * holding one - which is every in-place load, every hard load and the server.
 *
 * Goes negative once the hold has elapsed, and that is the continuity: a
 * placeholder mounting after the fallback's bars were already visible picks the
 * fade up where they left it instead of starting again at nothing.
 */
export function routeHoldDelayMs(): number | null {
  if (!isBrowser() || !hold || hold.expired) return null;
  return ROUTE_FALLBACK_HOLD_MS - (performance.now() - hold.startedAt);
}

/** Test seam: forget any hold in flight. */
export function clearRouteHold(): void {
  hold = null;
}
