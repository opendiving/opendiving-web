import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripDetailPageContent } from "./trip-detail-page-content";
import type { Trip } from "@/lib/api/trips";

// The trip dialog edits the notes, so the page is where they are read back.

const stable = vi.hoisted(() => ({
  guard: { user: { uuid: "user-1" }, isAuthenticated: true, isLoading: false },
  trip: null as Trip | null,
  infinite: {
    items: [],
    isLoading: false,
    isLoadingMore: false,
    totalCount: 0,
    itemsPerPage: 10,
    hasMore: false,
    loadFailed: false,
    loadMore: () => {},
    reload: async () => {},
    revalidate: async () => {},
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/trips/trip-1",
}));
vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => stable.guard,
}));
vi.mock("@/hooks/useResource", () => ({
  useResource: () => ({
    resource: stable.trip,
    setResource: vi.fn(),
    isLoading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useInfiniteResource", () => ({
  useInfiniteResource: () => stable.infinite,
}));
vi.mock("@/hooks/useContactsByUuid", () => ({
  useContactsByUuid: () => ({}),
}));
vi.mock("@/hooks/usePeopleByUuid", () => ({
  usePeopleByUuid: () => ({}),
}));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Each covered where it lives, and each would make requests of its own here.
vi.mock("@/components/trips/trip-hero", () => ({ TripHero: () => null }));
vi.mock("@/components/trips/trip-dialog", () => ({ TripDialog: () => null }));
vi.mock("@/components/trips/trip-dive-sections", () => ({
  TripDiveSections: () => null,
}));
vi.mock("@/components/dives/delete-with-reassign-dialog", () => ({
  DeleteWithReassignDialog: () => null,
}));

const trip = (notes: string): Trip => ({
  uuid: "trip-1",
  name: "Dahab 2026",
  parts: [],
  people: [],
  notes,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  dive_count: 0,
  dive_site_count: 0,
  species_count: 0,
  max_depth: null,
  candidate_count: 0,
  contact_uuids: [],
});

describe("TripDetailPageContent", () => {
  it("shows the trip's notes, and draws the card for them alone", () => {
    stable.trip = trip("Boat left at 7.\nBring a 5 mm.");
    render(<TripDetailPageContent />);

    expect(
      screen.getByRole("heading", { name: "Trip Information" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText(/Boat left at 7\.\s+Bring a 5 mm\./)).toHaveClass(
      "whitespace-pre-wrap",
    );
  });

  it("draws no card for a trip with nothing to say", () => {
    stable.trip = trip("");
    render(<TripDetailPageContent />);

    expect(
      screen.queryByRole("heading", { name: "Trip Information" }),
    ).not.toBeInTheDocument();
  });
});
