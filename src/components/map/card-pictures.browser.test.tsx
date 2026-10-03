import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { page } from "vitest/browser";

import { resolveBasemap } from "@/lib/basemap";
import { ConfigProvider } from "@/contexts/ConfigContext";
import type { Dive } from "@/lib/api/dives";
import { DiveCard } from "@/components/dives/dive-card";
import { MAX_PICTURE_REQUESTS } from "./card-pictures";

// Loaded for the cards' real heights, which decide which of them are near the
// screen - see "jsdom answers no layout question" in DECISIONS.md.
import "@/app/globals.css";

// A picture the API has not drawn yet holds its request open for the draw, and
// over HTTP/1.1 a browser opens six connections to a host across every tab. So
// a page keeps at most two picture requests out, the rest queued in the order
// the cards asked, and a card that leaves the screen lets its request go. This
// scrolls a real list past the cards whose pictures are still being drawn.

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

// Every request held until the test answers it, as a draw holds it, and
// rejected on an abort, as axios rejects one.
const requests: {
  url: string;
  signal: AbortSignal;
  resolve: (blob: Blob) => void;
}[] = [];
let open = 0;
let mostOpen = 0;
const { getMapPicture } = vi.hoisted(() => ({ getMapPicture: vi.fn() }));
vi.mock("@/lib/api/map-pictures", async (original) => ({
  ...(await original<typeof import("@/lib/api/map-pictures")>()),
  mapPicturesAPI: { getMapPicture },
}));

beforeEach(() => {
  getMapPicture.mockImplementation(
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
        latitude: 28.5 + index / 100,
        longitude: 34.5,
      },
    ],
    map_picture: `digest-${index}`,
  }) as unknown as Dive;

const urlOf = (index: number) =>
  `/dive/dive-${index}/map-picture?theme=light&v=digest-${index}`;

const DIVES = Array.from({ length: 12 }, (_, index) => dive(index));

describe("a page's picture requests", () => {
  it("keeps two out at a time, in the order asked, and lets a card's go as it leaves", async () => {
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

    await waitFor(() => expect(requests).toHaveLength(MAX_PICTURE_REQUESTS));
    // Held there while both are out, though more cards are near.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(requests.map(({ url }) => url)).toEqual([urlOf(0), urlOf(1)]);

    // One answered: the next card down is asked for, not any other.
    requests[0].resolve(new Blob([], { type: "image/webp" }));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].url).toBe(urlOf(2));

    // Scrolled to the foot: the cards whose pictures are still out leave the
    // screen and let them go, and the one queued behind them is never sent.
    window.scrollTo(0, document.documentElement.scrollHeight);
    await waitFor(() => {
      expect(requests[1].signal.aborted).toBe(true);
      expect(requests[2].signal.aborted).toBe(true);
    });
    // The cards now near the foot are asked for top down, two at a time.
    await waitFor(() => expect(requests).toHaveLength(5));
    expect(requests.slice(3).map(({ url }) => url)).toEqual([
      urlOf(9),
      urlOf(10),
    ]);
    requests[3].resolve(new Blob([], { type: "image/webp" }));
    await waitFor(() => expect(requests).toHaveLength(6));
    expect(requests[5].url).toBe(urlOf(11));

    expect(requests.map(({ url }) => url)).not.toContain(urlOf(3));
    expect(mostOpen).toBe(MAX_PICTURE_REQUESTS);
  });
});
