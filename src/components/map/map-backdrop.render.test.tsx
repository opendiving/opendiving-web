import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { InstanceConfig } from "@/lib/api/config";
import type { MappableLocation } from "@/lib/map-frame";
import { giveFramesASize } from "@/test/frame-size";
import { MapBackdrop } from "./map-backdrop";

// What a card's or a hero's map does over time: water until every tile of it
// has arrived, the tiles faded in together and shown at once after that, the
// last set held through a theme switch, its requests let go when it unmounts,
// nothing asked for where the instance draws no tiles, and nothing asked again
// but by mounting again. The world picture asks for nothing at all. Where the
// tiles and pins land is a layout question, and `card-frames.browser.test.tsx`
// answers it.

const theme = vi.hoisted(() => ({ resolved: "light" as string | undefined }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: theme.resolved }),
}));

const instance = vi.hoisted(() => ({
  config: null as Partial<InstanceConfig> | null,
}));
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => ({ config: instance.config, isLoading: false }),
}));

const { getMapTile } = vi.hoisted(() => ({ getMapTile: vi.fn() }));
vi.mock("@/lib/api/map-tiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/map-tiles")>()),
  mapTilesAPI: { getMapTile },
}));

// Each request answered by hand, with the signal it was handed.
let requests: {
  url: string;
  signal: AbortSignal;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
}[] = [];

// Every frame the size of a card.
const size = { width: 400, height: 236 };
let restoreSize: () => void;

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
  theme.resolved = "light";
  instance.config = { map_tiles: true };
  size.width = 400;
  requests = [];
  let created = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++created}`);
  URL.revokeObjectURL = vi.fn();
  restoreSize = giveFramesASize(size);
  getMapTile.mockReset();
  // Rejecting on an abort, as axios does: the page's four slots are freed by
  // the rejection, and a test leaving one held would starve the next.
  getMapTile.mockImplementation(
    (url: string, signal: AbortSignal) =>
      new Promise<Blob>((resolve, reject) => {
        requests.push({ url, signal, resolve, reject });
        signal.addEventListener("abort", () =>
          reject(new DOMException("canceled", "AbortError")),
        );
      }),
  );
});
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  restoreSize();
  vi.useRealTimers();
});

// The page's tiles outlive a test, so each test maps a place of its own: a
// degree of longitude apart is a tile apart, and more, at the zoom a lone
// place opens at.
const at = (longitude: number): MappableLocation[] => [
  { name: "Blue Hole", latitude: 28.5721, longitude },
];

const backdrop = (
  locations: MappableLocation[],
  extra: { showWhenEmpty?: boolean; world?: boolean } = {},
) => (
  <div className="relative">
    <MapBackdrop
      locations={locations}
      subject="the location of dive #1"
      coveredBottom={80}
      water={<div data-testid="water" />}
      {...extra}
    />
  </div>
);

const answerAll = async () => {
  await act(async () => {
    for (const request of requests) request.resolve(new Blob(["webp"]));
  });
};

const map = () => screen.queryByRole("img", { name: "Map of Blue Hole" });
const tiles = () => [
  ...document.querySelectorAll<HTMLImageElement>("img[data-map-tile]"),
];

describe("MapBackdrop", () => {
  it("shows water while its tiles are drawn, then fades them in together over it", async () => {
    render(backdrop(at(10)));

    expect(screen.getByTestId("water")).toBeInTheDocument();
    expect(map()).toBeNull();
    expect(requests.length).toBeGreaterThan(1);
    for (const { url } of requests) {
      expect(url).toMatch(/^\/map-tiles\/light\/9\/\d+\/\d+$/);
    }

    // All but one arrived: still water, never a map with a hole in it.
    await act(async () => {
      for (const request of requests.slice(1)) {
        request.resolve(new Blob(["webp"]));
      }
    });
    expect(map()).toBeNull();

    await act(async () => requests[0].resolve(new Blob(["webp"])));

    expect(tiles()).toHaveLength(requests.length);
    expect(map()).toHaveClass("fade-in");
    // Under the tiles as they fade, so they fade in from the water.
    expect(screen.getByTestId("water")).toBeInTheDocument();
  });

  it("draws the places as markers over the tiles, named for a pointer", async () => {
    render(
      backdrop([
        ...at(11),
        { name: "Exit", latitude: 28.5689, longitude: 11.0012, variant: "fix" },
      ]),
    );
    await answerAll();

    const markers = screen
      .getByRole("img", { name: "Map of Blue Hole; Exit" })
      .querySelectorAll("[data-marker]");
    expect([...markers].map((marker) => marker.getAttribute("title"))).toEqual([
      "Blue Hole",
      "Exit",
    ]);
    expect(markers[1]).toHaveAttribute("data-marker", "fix");
  });

  it("shows tiles the page already has at once, and asks for nothing", async () => {
    const { unmount } = render(backdrop(at(12)));
    await answerAll();
    const asked = getMapTile.mock.calls.length;
    unmount();

    // Before the instance has said anything, even: these were drawn here.
    instance.config = null;
    render(backdrop(at(12)));

    expect(tiles().length).toBeGreaterThan(0);
    expect(map()).not.toHaveClass("fade-in");
    expect(screen.queryByTestId("water")).not.toBeInTheDocument();
    expect(getMapTile).toHaveBeenCalledTimes(asked);
  });

  it("asks once for a tile two maps share", async () => {
    render(
      <>
        {backdrop(at(13))}
        {backdrop(at(13))}
      </>,
    );

    const urls = requests.map(({ url }) => url);
    expect(new Set(urls).size).toBe(urls.length);
    await answerAll();
    expect(tiles()).toHaveLength(2 * urls.length);
  });

  it("holds the last set through a theme switch until the other is whole", async () => {
    const { rerender } = render(backdrop(at(14)));
    await answerAll();
    const light = tiles().map((tile) => tile.src);
    const count = requests.length;

    theme.resolved = "dark";
    rerender(backdrop(at(14)));

    const dark = requests.slice(count);
    expect(dark).toHaveLength(count);
    for (const { url } of dark) expect(url).toMatch(/^\/map-tiles\/dark\//);
    expect(tiles().map((tile) => tile.src)).toEqual(light);

    await act(async () => {
      for (const request of dark) request.resolve(new Blob(["webp"]));
    });

    expect(tiles().map((tile) => tile.src)).not.toEqual(light);
    // From one set to the other, with no water to fade in from.
    expect(map()).not.toHaveClass("fade-in");
    expect(screen.queryByTestId("water")).not.toBeInTheDocument();
  });

  it("lets its requests go when it unmounts", () => {
    const { unmount } = render(backdrop(at(15)));

    unmount();

    expect(requests.length).toBeGreaterThan(0);
    // Four went out; the rest never left the queue.
    expect(requests.every(({ signal }) => signal.aborted)).toBe(true);
  });

  it("asks for nothing until the page's theme is known", () => {
    theme.resolved = undefined;
    render(backdrop(at(16)));

    expect(getMapTile).not.toHaveBeenCalled();
    expect(screen.getByTestId("water")).toBeInTheDocument();
  });

  it("asks for nothing, and shows water, where this instance draws no tiles", () => {
    instance.config = { map_tiles: false };
    render(backdrop(at(17)));

    expect(getMapTile).not.toHaveBeenCalled();
    expect(screen.getByTestId("water")).toBeInTheDocument();
    expect(screen.queryByText(/OpenStreetMap/)).not.toBeInTheDocument();
  });

  it("asks for nothing before the instance has said whether it draws tiles", () => {
    instance.config = null;
    render(backdrop(at(18)));

    expect(getMapTile).not.toHaveBeenCalled();
    expect(screen.getByTestId("water")).toBeInTheDocument();
  });

  it("shows nothing placed as water, unless it is a trip's map, which is the whole world", async () => {
    render(backdrop([]));
    expect(getMapTile).not.toHaveBeenCalled();
    expect(screen.getByTestId("water")).toBeInTheDocument();

    // Wider than the world is at zoom 0, so the one tile shows more than once.
    size.width = 1200;
    render(backdrop([], { showWhenEmpty: true }));
    expect(requests.map(({ url }) => url)).toEqual(["/map-tiles/light/0/0/0"]);
    await answerAll();
    expect(
      screen.getByRole("img", {
        name: "Map of the world, awaiting the location of dive #1",
      }),
    ).toBeInTheDocument();
    expect(tiles().length).toBeGreaterThan(1);
  });

  it("draws the world picture at once, with its pins, wherever tiles are drawn or not", () => {
    instance.config = { map_tiles: false };
    theme.resolved = "dark";
    // Wider than the picture, so it shows more than once.
    size.width = 1200;
    render(backdrop(at(20), { world: true }));

    expect(getMapTile).not.toHaveBeenCalled();
    expect(screen.queryByTestId("water")).not.toBeInTheDocument();
    expect(tiles().length).toBeGreaterThan(1);
    for (const tile of tiles()) {
      expect(tile.getAttribute("src")).toBe("/world-map/dark.webp");
    }
    expect(map()!.querySelectorAll("[data-marker]")).toHaveLength(1);
  });

  // A failure is a renderer down or busy, and every map on every open page
  // asking again on a schedule would add to it.
  it("shows water where a tile cannot be had, and asks again only on a mount", async () => {
    vi.useFakeTimers();
    const { unmount } = render(backdrop(at(19)));
    const count = requests.length;
    expect(count).toBeGreaterThan(1);

    await act(async () =>
      requests[0].reject(
        Object.assign(new Error("Service Unavailable"), {
          response: { status: 503 },
        }),
      ),
    );

    expect(screen.getByTestId("water")).toBeInTheDocument();
    expect(map()).toBeNull();
    // The rest of a set that can no longer be whole is let go.
    expect(requests.slice(1).every(({ signal }) => signal.aborted)).toBe(true);
    await act(async () => vi.advanceTimersByTime(10 * 60_000));
    expect(getMapTile).toHaveBeenCalledTimes(Math.min(count, 4));

    unmount();
    render(backdrop(at(19)));
    expect(getMapTile.mock.calls.length).toBeGreaterThan(Math.min(count, 4));
  });
});
