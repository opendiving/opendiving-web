import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveCard } from "./dive-card";
import type { Dive } from "@/lib/api/dives";
import { reveal } from "@/test/intersection";

// A card shows the server's picture of a dive that names one and open water for
// one without, the dive's depth outline across the foot of either, lays out its
// figures under their titles, and offers Delete only where its list can run one.

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

// The picture's bytes; what matters here is which cards ask for one, and what
// a card is called.
const { getMapPicture } = vi.hoisted(() => ({ getMapPicture: vi.fn() }));
vi.mock("@/lib/api/map-pictures", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/map-pictures")>()),
  mapPicturesAPI: { getMapPicture },
}));

// jsdom implements neither.
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:picture");
  URL.revokeObjectURL = vi.fn();
  getMapPicture.mockReset();
  getMapPicture.mockResolvedValue(new Blob(["webp"]));
});
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
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
  // Named from the dive's own sites and fixes: the picture's request carried
  // positions alone.
  it("shows the server's picture of the dive, named by its site and its fixes", async () => {
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
        map_picture: "digest-placed",
      }),
    });

    const map = await within(item).findByRole("img", {
      name: "Map of Blue Hole; Exit",
    });
    expect(map.querySelector("img")).toHaveAttribute("src", "blob:picture");
    expect(getMapPicture).toHaveBeenCalledExactlyOnceWith(
      "/dive/dive-1/map-picture?theme=light&v=digest-placed",
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

  // No renderer, or an API from before the pictures: the record names none.
  it("draws water, and asks for nothing, for a placed dive with no picture", () => {
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
        map_picture: null,
      }),
    });

    expect(within(item).queryByRole("img")).not.toBeInTheDocument();
    expect(water(item)).toBeInTheDocument();
    expect(getMapPicture).not.toHaveBeenCalled();
  });

  it("draws water where the picture cannot be had", async () => {
    getMapPicture.mockRejectedValue(
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
            longitude: 34.54,
          },
        ],
        map_picture: "digest-unavailable",
      }),
    });

    await waitFor(() => expect(getMapPicture).toHaveBeenCalledOnce());
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
