import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import HomePage from "./page";
import type { UserDiveStats } from "@/lib/api/dive-stats";

// The Species Seen figure must render the `species_seen` it is given rather than a
// constant, and hold the hero's "—" while the request is still in flight, like its
// three siblings.

// Returned by identity rather than rebuilt per call, and for `user` that is
// load-bearing rather than tidiness: the real `AuthContext` holds it in state, so it
// keeps one identity across renders, and this page's stats effect lists `user` in its
// dependencies. A mock handing back a fresh `user` per render re-runs that effect on
// every render, and the effect's own `setStats` causes one. See "The new-dive render
// test was in a loop with itself" in DECISIONS.md, and "reads the stats once" below.
//
// Both hooks are pinned, but only the guard's `user` can start the loop - the page
// reads the context for `units` alone, and a string has no identity to churn.
// Measured: rebuilding the context's object per call leaves the fetch count at 1.
// The guard is the one that matters; the context is here so the file has one rule
// rather than two.
//
// `vi.hoisted` because a `vi.mock` factory is hoisted above every other statement in
// the file and so cannot close over an ordinary `const`.
const stable = vi.hoisted(() => ({
  guard: {
    user: { uuid: "user-1", first_name: "Sam" },
    isAuthenticated: true,
    isLoading: false,
  },
  auth: { user: { uuid: "user-1", name: "Sam Diver", units: "metric" } },
}));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => stable.guard,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("@/lib/api/dive-stats", () => ({
  diveStatsAPI: {
    getDiveStats: vi.fn(),
    getGasUseHistory: vi.fn(),
    getDiveActivity: vi.fn(),
  },
}));

// The rest of the page is other cards with their own requests and their own
// tests. Stubbed rather than mounted: none of them says anything about the stats
// row, and each would otherwise need its whole API surface mocked to render.
vi.mock("@/components/dives/recent-dives-card", () => ({
  RecentDivesCard: () => null,
}));
vi.mock("@/components/dives/recent-trips-card", () => ({
  RecentTripsCard: () => null,
}));
vi.mock("@/components/dives/dive-activity-card", () => ({
  DiveActivityCard: () => null,
}));
vi.mock("@/components/dives/gas-use-card", () => ({ GasUseCard: () => null }));
vi.mock("@/components/home/setup-checklist-card", () => ({
  SetupChecklistCard: () => null,
}));
// The map is covered where it lives; here it is only what the hero is handed.
vi.mock("@/components/map/map-backdrop", () => ({
  MapBackdrop: vi.fn(() => null),
  useMapTiles: () => true,
}));
const { MapBackdrop } = await import("@/components/map/map-backdrop");

const { diveStatsAPI } = await import("@/lib/api/dive-stats");
const getDiveStats = vi.mocked(diveStatsAPI.getDiveStats);

const stats = (overrides: Partial<UserDiveStats> = {}): UserDiveStats => ({
  user_uuid: "user-1",
  total_dives: 212,
  max_depth: 39.4,
  total_time: 561600,
  species_seen: 17,
  created_at: "2026-04-04T12:00:00+00:00",
  ...overrides,
});

const figure = (label: string) =>
  screen.queryByText(label, { selector: "dt" })?.nextElementSibling;

beforeEach(() => {
  getDiveStats.mockReset();
  vi.mocked(MapBackdrop).mockClear();
});

describe("Home heading", () => {
  it("is the diver's name alone, beside their picture", async () => {
    getDiveStats.mockResolvedValue(stats());
    render(<HomePage />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      /^Sam Diver$/,
    );
    // The initials, for an account with no picture - hidden from a screen reader,
    // which would hear the name twice.
    expect(
      screen.getByText("SD").closest("[aria-hidden='true']"),
    ).not.toBeNull();
  });
});

describe("Home hero map", () => {
  it("draws the whole world for a diver with no placed trips", async () => {
    getDiveStats.mockResolvedValue(stats());
    render(<HomePage />);
    await screen.findByText("Species seen");

    const props = vi.mocked(MapBackdrop).mock.lastCall![0];
    expect(props.locations).toEqual([]);
    expect(props.showWhenEmpty).toBe(true);
    expect(props.hero).toBe(true);
  });
});

describe("Home hero figures", () => {
  it("shows the four figures the API derived, species linking to the life list", async () => {
    getDiveStats.mockResolvedValue(stats());
    render(<HomePage />);
    await screen.findByText("Species seen");

    expect(figure("Total dives")).toHaveTextContent("212");
    expect(figure("Total time")).toHaveTextContent(/^156h$/);
    expect(figure("Max depth")).toHaveTextContent(/^39 m$/);
    expect(
      within(figure("Species seen") as HTMLElement).getByRole("link", {
        name: "17",
      }),
    ).toHaveAttribute("href", "/species");
  });

  it("rounds the time to whole hours past the first, and minutes under it", async () => {
    // 156h 31min.
    getDiveStats.mockResolvedValue(stats({ total_time: 563460 }));
    const { unmount } = render(<HomePage />);
    await screen.findByText("Total dives");
    expect(figure("Total time")).toHaveTextContent(/^157h$/);
    unmount();

    getDiveStats.mockResolvedValue(stats({ total_time: 2400 }));
    render(<HomePage />);
    await screen.findByText("Total dives");
    expect(figure("Total time")).toHaveTextContent(/^40min$/);
  });

  it("leaves Species seen out for a diver who has logged none", async () => {
    // Only once the answer is in: the loading dash below stands for it until then.
    getDiveStats.mockResolvedValue(stats({ species_seen: 0 }));
    render(<HomePage />);

    await screen.findByText("Total dives");
    expect(figure("Total dives")).toHaveTextContent("212");
    expect(screen.queryByText("Species seen")).not.toBeInTheDocument();
  });

  it("holds a dash while the stats are still loading", async () => {
    getDiveStats.mockReturnValue(new Promise(() => {}));
    render(<HomePage />);

    await screen.findByText("Species seen");
    // One per figure, and the species one is among them - "0 species" before the
    // answer is known reads as a statement about the logbook.
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("are in the hero, not a card under it", async () => {
    getDiveStats.mockResolvedValue(stats());
    render(<HomePage />);
    await screen.findByText("Species seen");

    expect(
      screen.getByText("Total dives").closest(".rounded-lg.border"),
    ).toBeNull();
  });

  it("are left out for a diver with no dives", async () => {
    getDiveStats.mockResolvedValue(stats({ total_dives: 0 }));
    render(<HomePage />);

    await waitFor(() => expect(getDiveStats).toHaveBeenCalled());
    expect(screen.queryByText("Species seen")).not.toBeInTheDocument();
  });
});

// The stats effect lists `user`, so anything that gives `user` a new identity per
// render puts the effect in a loop with its own `setStats`.
//
// `mockImplementation` rather than this file's usual `mockResolvedValue`, and that is
// the whole reason this test can fail: a single resolved value is one object handed
// back to every call, so `setStats` receives the object it already holds, React bails
// out of the re-render, and the loop stalls after two passes. Measured, the same
// mount goes from 2 fetches a second to ~430 once each call answers with its own
// object, which is what a real API client does. See "A shared mock response object
// hides a render loop" in DECISIONS.md.
describe("the stats are read once, not once per render", () => {
  it("reads the stats once", async () => {
    getDiveStats.mockImplementation(async () => stats());

    render(<HomePage />);
    await screen.findByText("17");
    // The loop turns on effects, which React runs on a task rather than a
    // microtask, so awaiting the rendered figure alone gets here before the second
    // pass. A short settle is what makes the difference visible: one fetch when the
    // effect is keyed on a stable `user`, tens of them when it is not.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getDiveStats).toHaveBeenCalledTimes(1);
  });
});
