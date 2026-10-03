import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveCard } from "./dive-card";
import type { Dive } from "@/lib/api/dives";
import { giveFramesASize } from "@/test/frame-size";
import { reveal } from "@/test/intersection";

// A card shows a map of a placed dive and open water for one without, the
// dive's depth outline across the foot of either, lays out its figures under
// their titles, and offers Delete only where its list can run one.

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

const at = vi.hoisted(() => ({ pathname: "/trips/trip-1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => at.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => {
  at.pathname = "/trips/trip-1";
});

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const instance = vi.hoisted(() => ({ mapTiles: true }));
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => ({
    config: { map_tiles: instance.mapTiles },
    isLoading: false,
  }),
}));

// The tiles' bytes; what matters here is which cards ask for them, and what a
// card is called.
const { getMapTile } = vi.hoisted(() => ({ getMapTile: vi.fn() }));
vi.mock("@/lib/api/map-tiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/map-tiles")>()),
  mapTilesAPI: { getMapTile },
}));

// jsdom implements neither, and lays nothing out: each card's map is given a
// card's frame.
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let restoreSize: () => void;
beforeEach(() => {
  instance.mapTiles = true;
  URL.createObjectURL = vi.fn(() => "blob:tile");
  URL.revokeObjectURL = vi.fn();
  restoreSize = giveFramesASize({ width: 400, height: 236 });
  getMapTile.mockReset();
  getMapTile.mockResolvedValue(new Blob(["webp"]));
});
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  restoreSize();
});

vi.mock("@/components/dives/dive-profile-silhouette", () => ({
  DiveProfileSilhouette: ({ depths }: { depths: number[] }) => (
    <div data-testid="outline">{depths.join(" ")}</div>
  ),
}));

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "dive-1",
    dive_number: 212,
    start_time: "2026-04-04T10:04:47+02:00",
    duration: 2700,
    max_depth: 30.52,
    avg_depth: 18.2,
    bottom_temperature: 24.4,
    dive_sites: [],
    mixtures: [],
    ...overrides,
  } as Dive;
}

const card = (props: Partial<Parameters<typeof DiveCard>[0]> = {}) => {
  render(
    <ul>
      <DiveCard dive={dive()} {...props} />
    </ul>,
  );
  act(() => reveal());
  return screen.getByRole("listitem");
};

const water = (item: HTMLElement) =>
  item.querySelector(".bg-\\[var\\(--map-water\\)\\] svg");

describe("DiveCard", () => {
  // Named from the dive's own sites and fixes: its tiles carry nothing of it.
  it("shows a map of the dive, named by its site and its fixes", async () => {
    const item = card({
      dive: dive({
        dive_sites: [
          {
            uuid: "site-1",
            name: "Blue Hole",
            latitude: 28.57,
            longitude: 34.54,
          },
        ],
        exit_latitude: 28.58,
        exit_longitude: 34.55,
      }),
    });

    const map = await within(item).findByRole("img", {
      name: "Map of Blue Hole; Exit",
    });
    expect(map.querySelector("img")).toHaveAttribute("src", "blob:tile");
    expect(map.querySelectorAll("[data-marker]")).toHaveLength(2);
    // In the page's theme, at the zoom a dive this small opens at.
    expect(getMapTile).toHaveBeenCalledWith(
      expect.stringMatching(/^\/map-tiles\/light\/9\/\d+\/\d+$/),
      expect.any(AbortSignal),
    );
  });

  it("draws water and the bubbles for a dive with no position at all", () => {
    const item = card({
      dive: dive({ dive_sites: [{ uuid: "site-1", name: "Unpinned reef" }] }),
    });

    expect(within(item).queryByRole("img")).not.toBeInTheDocument();
    expect(water(item)).toBeInTheDocument();
  });

  it("draws water, and asks for nothing, where this instance draws no map", () => {
    instance.mapTiles = false;
    const item = card({
      dive: dive({
        dive_sites: [
          {
            uuid: "site-1",
            name: "Blue Hole",
            latitude: 28.57,
            longitude: 34.54,
          },
        ],
      }),
    });

    expect(within(item).queryByRole("img")).not.toBeInTheDocument();
    expect(water(item)).toBeInTheDocument();
    expect(getMapTile).not.toHaveBeenCalled();
  });

  it("draws water where a tile cannot be had", async () => {
    getMapTile.mockRejectedValue(
      Object.assign(new Error("Service Unavailable"), {
        response: { status: 503 },
      }),
    );
    const item = card({
      dive: dive({
        dive_sites: [
          {
            uuid: "site-1",
            name: "Blue Hole",
            latitude: 28.57,
            // Somewhere this page holds no tile of: the tests share it.
            longitude: 100.54,
          },
        ],
      }),
    });

    await waitFor(() => expect(getMapTile).toHaveBeenCalled());
    await act(async () => {});
    expect(within(item).queryByRole("img")).not.toBeInTheDocument();
    expect(water(item)).toBeInTheDocument();
  });

  it("draws the dive's depth outline over its backdrop", () => {
    const item = card({
      dive: dive({
        depth_outline: { span: 2_700_000, values: [300, 3052, 500] },
      }),
    });

    expect(within(item).getByTestId("outline")).toHaveTextContent(
      "300 3052 500",
    );
  });

  it("draws no outline for a dive without one", () => {
    const item = card({ dive: dive({ depth_outline: null }) });

    expect(within(item).queryByTestId("outline")).not.toBeInTheDocument();
  });

  const figuresOf = (item: HTMLElement) =>
    Array.from(item.querySelectorAll("dt"), (term) => [
      term.textContent,
      term.nextElementSibling?.textContent,
    ]);

  it("titles its figures", () => {
    expect(figuresOf(card())).toEqual([
      ["Duration", "45min"],
      ["Max depth", "31 m"],
      ["Water temp", "24°C"],
    ]);
  });

  it("shows the average depth in place of a temperature it has not got", () => {
    const item = card({ dive: dive({ bottom_temperature: undefined }) });

    expect(figuresOf(item)).toEqual([
      ["Duration", "45min"],
      ["Max depth", "31 m"],
      ["Avg depth", "18 m"],
    ]);
  });

  it("leaves out a temperature it has not got when it has no average depth either", () => {
    const item = card({
      dive: dive({
        max_depth: undefined,
        avg_depth: undefined,
        bottom_temperature: undefined,
      }),
    });

    expect(figuresOf(item)).toEqual([
      ["Duration", "45min"],
      ["Max depth", "-"],
    ]);
  });

  it("shows a water temperature of zero rather than leaving it out", () => {
    const item = card({ dive: dive({ bottom_temperature: 0 }) });

    expect(figuresOf(item)[2]).toEqual(["Water temp", "0°C"]);
  });

  it("names the dive, says when and where it was, and leads back to the page it is on", () => {
    const item = card({
      dive: dive({
        dive_sites: [
          {
            uuid: "site-1",
            name: "Blue Hole",
            location: { name: "Dahab, Egypt" },
          },
        ],
      }),
    });

    expect(
      within(item).getByRole("link", { name: "#212 Blue Hole" }),
    ).toHaveAttribute("href", "/dives/dive-1?from=%2Ftrips%2Ftrip-1");
    expect(item).toHaveTextContent("Apr 4, 2026, 10:04 · Dahab, Egypt");
  });

  // The hero's title and line, so a dive reads the same on its page as here.
  it("marks a training dive, tags its water and kind, and carries the hero's line", () => {
    const item = card({
      dive: dive({
        course_uuid: "course-1",
        water_type: "fresh",
        boat_name: "Legend",
        type: "closed_circuit",
      }),
    });

    expect(item).toHaveTextContent(
      "FreshFresh waterCCRClosed circuitDive #212 (training dive)Apr 4, 2026, 10:04 · Boat Legend",
    );
    expect(within(item).getByText("CCR")).toHaveAttribute("aria-hidden");
  });

  it("opens the dive plainly from the dive list, where its back link goes anyway", () => {
    at.pathname = "/dives";
    expect(
      within(card()).getByRole("link", { name: "Dive #212" }),
    ).toHaveAttribute("href", "/dives/dive-1");
  });

  it("edits back to the list it was opened from, and deletes only when asked to", async () => {
    const onDelete = vi.fn();
    const item = card({ onDelete });

    await userEvent.click(
      within(item).getByRole("button", { name: "Actions for dive #212" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Edit" }),
    ).toHaveAttribute("href", "/dives/dive-1/edit?from=%2Ftrips%2Ftrip-1");
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("offers Edit alone where the list has no delete", async () => {
    const item = card();

    await userEvent.click(
      within(item).getByRole("button", { name: "Actions for dive #212" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Edit" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });
});
