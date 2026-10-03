import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { page } from "vitest/browser";

import { resolveBasemap } from "@/lib/basemap";
import {
  FIT_PADDING,
  HERO_CANVAS_WIDTH,
  SIDE_FADE_WIDTH,
} from "@/lib/map-frame";
import { ConfigProvider } from "@/contexts/ConfigContext";
import type { DiveSite } from "@/lib/api/dive-sites";
import type { Trip } from "@/lib/api/trips";
import { DiveSiteHero } from "@/components/sites/dive-site-hero";
import { TripHero } from "@/components/trips/trip-hero";

// **Load-bearing**: every figure below is a measured box - see "jsdom answers
// no layout question, and the browser lane only answers one with the
// stylesheet loaded" in DECISIONS.md.
import "@/app/globals.css";

// A page head's map is a canvas `HERO_CANVAS_WIDTH` wide centred in the band,
// dissolving into the page over its outer quarters where the window is wider
// than it. On any window its pins stay out of those quarters, in from the
// window's edges and between the top row and the details, and its tiles cover
// as much of the canvas as the window shows.

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => ({ config: { map_tiles: true }, isLoading: false }),
}));
vi.mock("@/lib/api/map-tiles", async (original) => ({
  ...(await original<typeof import("@/lib/api/map-tiles")>()),
  mapTilesAPI: {
    getMapTile: async () => new Blob([], { type: "image/webp" }),
  },
}));

const SITE = {
  uuid: "site-1",
  name: "The Canyon",
  latitude: 28.5721,
  longitude: 34.5372,
  user_uuid: "user-1",
  created_at: "2026-04-01T00:00:00Z",
  dive_count: 12,
} as DiveSite;

const trip = (parts: Trip["parts"]): Trip => ({
  uuid: "trip-1",
  name: "Lesser Sunda Islands",
  parts,
  user_uuid: "user-1",
  created_at: "2026-04-01T00:00:00Z",
  dive_count: 12,
  dive_site_count: 7,
  species_count: 48,
  max_depth: 31.4,
});

// Wide rather than tall, so the canvas's width, not the band's height, is what
// the fit is up against.
const ISLAND_CHAIN = trip([
  { location: { name: "Bali", latitude: -8.4095, longitude: 115.1889 } },
  { location: { name: "Timor", latitude: -8.8742, longitude: 125.7275 } },
]);
const ANTIMERIDIAN = trip([
  { location: { name: "Fiji", latitude: -18.1416, longitude: 178.4419 } },
  { location: { name: "Samoa", latitude: -13.8333, longitude: -171.7667 } },
]);

const BACK = { href: "/", label: "Back" };

const contains = (box: DOMRect, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

async function expectHeroComposed({ placed = true } = {}) {
  const canvas = await waitFor(() => {
    const found = document.querySelector<HTMLElement>("[data-map-canvas]");
    expect(found).not.toBeNull();
    return found!;
  });
  const frame = canvas.parentElement!.getBoundingClientRect();
  const box = canvas.getBoundingClientRect();
  const heading = document.querySelector("h1")!.closest("[class*='z-[1]']")!;
  const details = heading.getBoundingClientRect();
  const topRow = document
    .querySelector("a[href='/']")!
    .closest(".absolute")!
    .getBoundingClientRect();

  // Centred, and as wide as the canvas is meant to be.
  expect(box.width).toBe(HERO_CANVAS_WIDTH);
  expect(box.left + box.width / 2).toBeCloseTo(frame.left + frame.width / 2, 0);

  const markers = [...canvas.querySelectorAll("[data-marker]")];
  expect(markers.length > 0).toBe(placed);
  for (const marker of markers) {
    const pin = marker.getBoundingClientRect();
    const x = pin.left + pin.width / 2;
    const y = pin.top + pin.height / 2;
    // Out of the side fades.
    expect(x).toBeGreaterThanOrEqual(box.left + SIDE_FADE_WIDTH - 1);
    expect(x).toBeLessThanOrEqual(box.right - SIDE_FADE_WIDTH + 1);
    // In from the window's edges.
    expect(x).toBeGreaterThanOrEqual(frame.left + FIT_PADDING - 1);
    expect(x).toBeLessThanOrEqual(frame.right - FIT_PADDING + 1);
    // Between the top row and the details.
    expect(y).toBeGreaterThanOrEqual(topRow.bottom + FIT_PADDING - 1);
    expect(y).toBeLessThanOrEqual(details.top - FIT_PADDING + 1);
  }

  const tiles = [
    ...canvas.querySelectorAll<HTMLElement>("img[data-map-tile]"),
  ].map((tile) => tile.getBoundingClientRect());
  const left = Math.max(frame.left, box.left);
  const right = Math.min(frame.right, box.right);
  for (let x = left + 0.5; x < right; x += 8) {
    for (let y = frame.top + 0.5; y < frame.bottom; y += 8) {
      expect(tiles.some((tile) => contains(tile, x, y))).toBe(true);
    }
  }
}

const WINDOWS = [390, 700, 1024, 1600];

beforeEach(async () => {
  await page.viewport(1024, 900);
});

describe("a page head's map", () => {
  describe.each(WINDOWS)("on a window %ipx wide", (width) => {
    beforeEach(async () => {
      await page.viewport(width, 900);
    });

    it("keeps a site's pin out of the side fades, over tiles", async () => {
      render(
        <ConfigProvider config={{ basemap: resolveBasemap() }}>
          <DiveSiteHero site={SITE} back={BACK} />
        </ConfigProvider>,
      );
      await expectHeroComposed();
    });

    it.each([
      ["an island chain", ISLAND_CHAIN],
      ["a trip across the antimeridian", ANTIMERIDIAN],
    ])(
      "keeps the pins of %s out of the side fades, over tiles",
      async (_label, record) => {
        render(
          <ConfigProvider config={{ basemap: resolveBasemap() }}>
            <TripHero trip={record} back={BACK} />
          </ConfigProvider>,
        );
        await expectHeroComposed();
      },
    );

    it("covers the canvas for a trip with no place, the whole world", async () => {
      render(
        <ConfigProvider config={{ basemap: resolveBasemap() }}>
          <TripHero trip={trip([])} back={BACK} />
        </ConfigProvider>,
      );
      await expectHeroComposed({ placed: false });
    });
  });

  // Where the window is wider than the canvas, the canvas's own sides are
  // what dissolve into the page, and nothing is drawn past them.
  it("dissolves its sides into the page on a wide window, and draws nothing past them", async () => {
    await page.viewport(1600, 900);
    render(
      <ConfigProvider config={{ basemap: resolveBasemap() }}>
        <DiveSiteHero site={SITE} back={BACK} />
      </ConfigProvider>,
    );
    await expectHeroComposed();
    const canvas = document.querySelector<HTMLElement>("[data-map-canvas]")!;
    expect(getComputedStyle(canvas).overflow).toBe("hidden");
    const fade = canvas.querySelector<HTMLElement>(
      "[data-backdrop-side-fade]",
    )!;
    expect(fade.getBoundingClientRect().width).toBe(HERO_CANVAS_WIDTH);
    expect(fade.style.background).toContain(`${SIDE_FADE_WIDTH}px`);
  });
});
