import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { page } from "vitest/browser";

import { adminAPI, type AdminExternalRequests } from "@/lib/api/admin";
import { ExternalRequestsScreen } from "./external-requests-screen";

// The claim is the stylesheet's: at a phone's width the page itself never
// scrolls sideways, and only a table may, inside its own wrapper. See "jsdom
// answers no layout question" in DECISIONS.md.
import "@/app/globals.css";

vi.mock("@/lib/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/admin")>();
  return { ...actual, adminAPI: { getExternalRequests: vi.fn() } };
});

const WIDTH = 375;

const KINDS = [
  "by-name",
  "by-vernacular",
  "name-part",
  "record",
  "synonyms",
  "vernaculars",
];

// The widest month the page draws: a service of six kinds, every outcome, a
// limit, and four-digit counts.
const month = (from: string, to: string): AdminExternalRequests => ({
  from,
  to,
  providers: [
    { provider: "google", kinds: ["avatar"], limit: null },
    {
      provider: "worms",
      kinds: KINDS,
      limit: { requests: 1000, window_seconds: 60, per_day: 1440000 },
    },
  ],
  days: [
    {
      day: from,
      requests: KINDS.flatMap((kind) =>
        [
          "ok",
          "rate_limited",
          "status",
          "too_large",
          "deadline",
          "transport",
          "cancelled",
          "skipped",
          "cache_hit",
        ].map((outcome) => ({
          provider: "worms",
          kind,
          outcome,
          count: 4321,
          duration_ms_total: outcome === "skipped" ? 0 : 43210000,
          duration_ms_max: outcome === "skipped" ? 0 : 12345,
        })),
      ),
    },
  ],
});

beforeEach(async () => {
  await page.viewport(WIDTH, 900);
  vi.mocked(adminAPI.getExternalRequests).mockImplementation(async (from, to) =>
    month(from, to),
  );
});

describe("the External Requests screen at a phone's width", () => {
  it("scrolls nothing sideways but a table's own wrapper", async () => {
    const { container } = render(<ExternalRequestsScreen />);
    await screen.findByRole("heading", { name: "worms" });

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(WIDTH);
    // An `sr-only` list clips what it holds rather than scrolling it.
    const scrollers = [...container.querySelectorAll("*")].filter(
      (element) =>
        ["auto", "scroll"].includes(getComputedStyle(element).overflowX) &&
        element.scrollWidth > element.clientWidth,
    );
    expect(scrollers.length).toBeGreaterThan(0);
    for (const scroller of scrollers) {
      expect(scroller.firstElementChild?.tagName).toBe("TABLE");
    }
    for (const card of container.querySelectorAll(".rounded-lg")) {
      expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(WIDTH);
    }
  });
});
