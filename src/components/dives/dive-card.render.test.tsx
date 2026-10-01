import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveCard } from "./dive-card";
import type { Dive } from "@/lib/api/dives";
import { reveal } from "@/test/intersection";

// A card draws a map for a dive with a position and open water for one without,
// the dive's depth outline across the foot of either, lays out its figures under
// their titles, and offers Delete only where its list can run one.

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/trip-1",
}));

// The map needs WebGL; what matters here is which cards get one, and of what.
vi.mock("@/components/map/locations-map-lazy", () => ({
  LocationsMap: ({ locations }: { locations: { name: string }[] }) => (
    <div data-testid="map">
      {locations.map((location) => location.name).join("; ")}
    </div>
  ),
}));

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

describe("DiveCard", () => {
  it("maps a dive by its pinned site and by its fixes", () => {
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

    expect(within(item).getByTestId("map")).toHaveTextContent(
      "Blue Hole; Exit",
    );
  });

  it("draws water and the bubbles for a dive with no position at all", () => {
    const item = card({
      dive: dive({ dive_sites: [{ uuid: "site-1", name: "Unpinned reef" }] }),
    });

    expect(within(item).queryByTestId("map")).not.toBeInTheDocument();
    expect(
      item.querySelector(".bg-\\[var\\(--map-water\\)\\] svg"),
    ).toBeInTheDocument();
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

  it("names the dive and says when and where it was", () => {
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
    ).toHaveAttribute("href", "/dives/dive-1");
    expect(item).toHaveTextContent("Apr 4, 2026, 10:04 · Dahab, Egypt");
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
