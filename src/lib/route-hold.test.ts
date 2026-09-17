import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROUTE_FALLBACK_HOLD_MS,
  beginRouteHold,
  clearRouteHold,
  expireRouteHold,
  resumeRouteHold,
  routeHoldDelayMs,
} from "./route-hold";

afterEach(() => {
  clearRouteHold();
  vi.restoreAllMocks();
});

const at = (ms: number) => vi.spyOn(performance, "now").mockReturnValue(ms);

describe("routeHoldDelayMs", () => {
  it("is nothing at all until a fallback opens one", () => {
    expect(routeHoldDelayMs()).toBeNull();
  });

  it("counts down from the click rather than from the read", () => {
    at(1000);
    beginRouteHold();

    at(1000);
    expect(routeHoldDelayMs()).toBe(ROUTE_FALLBACK_HOLD_MS);
    at(1120);
    expect(routeHoldDelayMs()).toBe(ROUTE_FALLBACK_HOLD_MS - 120);
  });

  it("goes negative once the hold has elapsed, which is what keeps it continuous", () => {
    // A placeholder mounting after the fallback's bars were already visible has to pick
    // the fade up where they left it. A delay of zero would start it again at nothing,
    // which is the blink this exists to prevent.
    at(1000);
    beginRouteHold();
    at(1000 + ROUTE_FALLBACK_HOLD_MS + 400);

    expect(routeHoldDelayMs()).toBe(-400);
  });

  it("is over once the fallback that opened it is gone", () => {
    at(1000);
    beginRouteHold();
    expireRouteHold();

    at(1050);
    expect(routeHoldDelayMs()).toBeNull();
  });

  it("survives a remount of the same fallback, keeping its original start", () => {
    at(1000);
    beginRouteHold();
    expireRouteHold();
    resumeRouteHold();

    at(1100);
    expect(routeHoldDelayMs()).toBe(ROUTE_FALLBACK_HOLD_MS - 100);
  });

  it("restarts for the next navigation", () => {
    at(1000);
    beginRouteHold();
    at(5000);
    beginRouteHold();

    at(5000);
    expect(routeHoldDelayMs()).toBe(ROUTE_FALLBACK_HOLD_MS);
  });
});
