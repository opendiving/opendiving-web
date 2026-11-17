import { describe, expect, it } from "vitest";
import type { AdminExternalRequests } from "@/lib/api/admin";
import {
  describeLimit,
  formatDuration,
  summariseServices,
} from "./external-requests";

const answer: AdminExternalRequests = {
  from: "2026-11-01",
  to: "2026-11-03",
  providers: [
    { provider: "google", kinds: ["avatar"], limit: null },
    {
      provider: "open-meteo",
      kinds: ["forecast", "sea"],
      limit: { requests: 400, window_seconds: 3600, per_day: 9600 },
    },
  ],
  days: [
    {
      day: "2026-11-01",
      requests: [
        {
          provider: "open-meteo",
          kind: "sea",
          outcome: "ok",
          count: 3,
          duration_ms_total: 900,
          duration_ms_max: 500,
        },
        {
          provider: "open-meteo",
          kind: "sea",
          outcome: "cache_hit",
          count: 7,
          duration_ms_total: 0,
          duration_ms_max: 0,
        },
      ],
    },
    {
      day: "2026-11-02",
      requests: [
        {
          provider: "open-meteo",
          kind: "tides",
          outcome: "throttled_upstream",
          count: 1,
          duration_ms_total: 2100,
          duration_ms_max: 2100,
        },
        {
          provider: "open-meteo",
          kind: "forecast",
          outcome: "skipped",
          count: 2,
          duration_ms_total: 0,
          duration_ms_max: 0,
        },
        {
          provider: "zeta",
          kind: "lookup",
          outcome: "ok",
          count: 1,
          duration_ms_total: 10,
          duration_ms_max: 10,
        },
      ],
    },
    { day: "2026-11-03", requests: [] },
  ],
};

describe("summariseServices", () => {
  const [google, meteo, zeta] = summariseServices(answer);

  it("keeps every listed service, then one the API did not list, by slug", () => {
    expect([google.provider, meteo.provider, zeta.provider]).toEqual([
      "google",
      "open-meteo",
      "zeta",
    ]);
    expect(google.all).toEqual({
      sent: 0,
      failed: 0,
      outcomes: {},
      averageMs: null,
      slowestMs: null,
    });
    expect(google.busiest).toBeNull();
    expect(zeta.limit).toBeNull();
  });

  it("counts what was sent apart from what was not, an unknown outcome as a failure", () => {
    expect(meteo.all.sent).toBe(4);
    expect(meteo.all.failed).toBe(1);
    expect(meteo.all.outcomes).toEqual({
      ok: 3,
      cache_hit: 7,
      throttled_upstream: 1,
      skipped: 2,
    });
    // Over the four sent; the cache hits' zeros do not dilute it.
    expect(meteo.all.averageMs).toBe(750);
    expect(meteo.all.slowestMs).toBe(2100);
    expect(meteo.sentOutcomes[meteo.sentOutcomes.length - 1]).toBe(
      "throttled_upstream",
    );
  });

  it("splits by every declared kind, then one it was counted under besides", () => {
    expect(meteo.kinds.map(({ kind }) => kind)).toEqual([
      "forecast",
      "sea",
      "tides",
    ]);
    const forecast = meteo.kinds[0].tally;
    expect(forecast.sent).toBe(0);
    expect(forecast.outcomes.skipped).toBe(2);
    expect(forecast.averageMs).toBeNull();
  });

  it("counts each day's sent and failed requests, and finds the busiest", () => {
    expect(meteo.sentPerDay).toEqual([3, 1, 0]);
    expect(meteo.failedPerDay).toEqual([0, 1, 0]);
    expect(meteo.busiest).toEqual({ day: "2026-11-01", sent: 3 });
  });
});

describe("the figures in words", () => {
  it("reads a window as a unit where it is one", () => {
    expect(
      describeLimit({ requests: 400, window_seconds: 3600, per_day: 9600 }),
    ).toBe("400 requests an hour");
    expect(
      describeLimit({ requests: 1, window_seconds: 90, per_day: 960 }),
    ).toBe("1 request every 90 seconds");
  });

  it("writes a duration in milliseconds under a second", () => {
    expect(formatDuration(340)).toBe("340 ms");
    expect(formatDuration(2400)).toBe("2.4 s");
  });
});
