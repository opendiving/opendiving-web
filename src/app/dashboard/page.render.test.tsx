import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "./page";
import type { UserDiveStats } from "@/lib/api/dive-stats";

// The Species Seen tile was deleted once, because `species_seen` was hardcoded to
// zero on the API and the tile read "0" for every diver forever (see "The
// dashboard shows only what the app actually tracks" in DECISIONS.md). It is back
// because the field is derived now, so what is worth pinning is that the tile
// renders the number it is given rather than a constant - and that it holds the
// stats row's "—" while the request is still in flight, like its three siblings.

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({
    user: { uuid: "user-1", first_name: "Sam" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
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
vi.mock("@/components/gear/service-due-card", () => ({
  ServiceDueCard: () => null,
}));
vi.mock("@/components/certifications/certification-expiry-card", () => ({
  CertificationExpiryCard: () => null,
}));
vi.mock("@/components/dashboard/setup-checklist-card", () => ({
  SetupChecklistCard: () => null,
}));

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

beforeEach(() => {
  getDiveStats.mockReset();
});

describe("dashboard Species Seen tile", () => {
  it("shows the distinct count the API derived", async () => {
    getDiveStats.mockResolvedValue(stats());
    render(<DashboardPage />);

    expect(await screen.findByText("Species Seen")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("Distinct species spotted")).toBeInTheDocument();
  });

  it("shows a real zero for a diver who has logged none", async () => {
    // Distinct from the loading dash below: the diver has dives and has spotted
    // nothing, which is a fact about their logbook rather than a missing answer.
    getDiveStats.mockResolvedValue(stats({ species_seen: 0 }));
    render(<DashboardPage />);

    await screen.findByText("Species Seen");
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("holds a dash while the stats are still loading", async () => {
    getDiveStats.mockReturnValue(new Promise(() => {}));
    render(<DashboardPage />);

    await screen.findByText("Species Seen");
    // One per tile, and the species one is among them - "0 species" before the
    // answer is known reads as a statement about the logbook.
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("holds all four figures in one card, not four", async () => {
    // They are read together as "what my logbook amounts to", so they share a
    // card the way the dive page's duration and depths do. Asserted structurally
    // because every text-based check in this file passes either way - the merge
    // is invisible to them, and splitting the card back up would go unnoticed.
    getDiveStats.mockResolvedValue(stats());
    const { container } = render(<DashboardPage />);
    await screen.findByText("Species Seen");

    // By label rather than by value, so the assertion says nothing about how
    // depths or durations happen to be formatted.
    const cards = [
      "Total Dives",
      "Max Depth",
      "Total Time",
      "Species Seen",
    ].map((label) => screen.getByText(label).closest(".rounded-lg.border"));

    expect(cards[0]).not.toBeNull();
    expect(new Set(cards).size).toBe(1);
    // And no leftover per-figure card headings from the shape this replaced.
    expect(container.querySelectorAll("h3")).toHaveLength(0);
  });

  it("renders no stats row at all for a diver with no dives", async () => {
    getDiveStats.mockResolvedValue(stats({ total_dives: 0 }));
    render(<DashboardPage />);

    await waitFor(() => expect(getDiveStats).toHaveBeenCalled());
    expect(screen.queryByText("Species Seen")).not.toBeInTheDocument();
  });
});
