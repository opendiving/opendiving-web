import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { page } from "vitest/browser";

import { resolveBasemap } from "@/lib/basemap";
import { ConfigProvider } from "@/contexts/ConfigContext";
import type { Dive } from "@/lib/api/dives";
import { DiveCard } from "@/components/dives/dive-card";
import { MAX_TILE_REQUESTS } from "./tile-requests";

// Loaded for the cards' real heights, which decide which of them are near the
// screen - see "jsdom answers no layout question" in DECISIONS.md.
import "@/app/globals.css";

// A tile the API has not drawn yet holds its request open for the draw, and
// over HTTP/1.1 a browser opens six connections to a host across every tab. So
// a page keeps at most four tile requests out, the rest queued in the order
// the maps asked, and a card that leaves the screen lets its requests go. This
// scrolls a real list past the cards whose tiles are still being drawn.

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dives",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => ({ config: { map_tiles: true }, isLoading: false }),
}));

// Every request held until the test answers it, as a draw holds it, and
// rejected on an abort, as axios rejects one.
const requests: {
  url: string;
  signal: AbortSignal;
  resolve: (blob: Blob) => void;
}[] = [];
let open = 0;
let mostOpen = 0;
const { getMapTile } = vi.hoisted(() => ({ getMapTile: vi.fn() }));
vi.mock("@/lib/api/map-tiles", async (original) => ({
  ...(await original<typeof import("@/lib/api/map-tiles")>()),
  mapTilesAPI: { getMapTile },
}));

beforeEach(() => {
  getMapTile.mockImplementation(
    (url: string, signal: AbortSignal) =>
      new Promise<Blob>((resolve, reject) => {
        open += 1;
        mostOpen = Math.max(mostOpen, open);
        const settle = () => {
          open -= 1;
        };
        requests.push({
          url,
          signal,
          resolve: (blob) => {
            settle();
            resolve(blob);
          },
        });
        signal.addEventListener("abort", () => {
          settle();
          reject(new DOMException("canceled", "AbortError"));
        });
      }),
  );
});

// Each dive ten degrees of longitude from the last, so no two cards share a
// tile and every request can be told by whose it is.
const dive = (index: number): Dive =>
  ({
    uuid: `dive-${index}`,
    dive_number: index,
    start_time: "2026-04-18T09:30:00+02:00",
    duration: 3120,
    max_depth: 31.4,
    mixtures: [],
    dive_sites: [
      {
        uuid: `site-${index}`,
        name: `Site ${index}`,
        latitude: 28.5,
        longitude: -100 + 10 * index,
      },
    ],
  }) as unknown as Dive;

// Whose tile a request is, from its column at the zoom a lone site opens at.
const cardOf = (url: string) => {
  const [, , , , x] = url.split("/");
  const longitude = (Number(x) / 512) * 360 - 180;
  return Math.max(0, Math.round((longitude + 100) / 10));
};
const cardsOf = (from: number, to?: number) =>
  requests.slice(from, to).map(({ url }) => cardOf(url));

const DIVES = Array.from({ length: 12 }, (_, index) => dive(index));

describe("a page's tile requests", () => {
  it("keeps four out at a time, in the order asked, and lets a card's go as it leaves", async () => {
    // Four cards near a short window, its 100px margin included.
    await page.viewport(400, 700);
    render(
      <ConfigProvider config={{ basemap: resolveBasemap() }}>
        <ul className="space-y-4 p-4">
          {DIVES.map((each) => (
            <DiveCard key={each.uuid} dive={each} />
          ))}
        </ul>
      </ConfigProvider>,
    );

    await waitFor(() => expect(requests).toHaveLength(MAX_TILE_REQUESTS));
    // Held there while four are out, though the cards near want more.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(requests).toHaveLength(MAX_TILE_REQUESTS);
    // Top down: no card's tiles before those of a card above it.
    const first = cardsOf(0);
    expect(first).toEqual([...first].sort((a, b) => a - b));
    expect(first[0]).toBe(0);

    // One answered: the next one asked for, not any other.
    requests[0].resolve(new Blob([], { type: "image/webp" }));
    await waitFor(() => expect(requests).toHaveLength(MAX_TILE_REQUESTS + 1));
    expect(cardOf(requests[MAX_TILE_REQUESTS].url)).toBeGreaterThanOrEqual(
      first[first.length - 1],
    );

    // Scrolled to the foot: the cards whose tiles are still out leave the
    // screen and let them go, and those queued behind them are never sent.
    const out = requests.slice(1);
    window.scrollTo(0, document.documentElement.scrollHeight);
    await waitFor(() => {
      for (const { signal } of out) expect(signal.aborted).toBe(true);
    });
    // The cards now near the foot are asked for, four at a time.
    await waitFor(() =>
      expect(requests.length).toBe(MAX_TILE_REQUESTS + 1 + MAX_TILE_REQUESTS),
    );
    for (const card of cardsOf(MAX_TILE_REQUESTS + 1)) {
      expect(card).toBeGreaterThanOrEqual(8);
    }

    // Nothing for the cards the list scrolled past without stopping.
    expect(cardsOf(0)).not.toContain(5);
    expect(mostOpen).toBe(MAX_TILE_REQUESTS);
  });
});
