import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DiveDetailLayout from "./layout";
import { useDiveDetail } from "@/components/dives/dive-detail-context";
import type { Dive } from "@/lib/api/dives";
import type { Trip } from "@/lib/api/trips";

// The layout resolves the dive's trip and course, and it is the one piece of this
// page that outlives a step. That is what these cover: held plainly, the resolved
// trip would survive into the *next* dive's render, and the sidebar draws it as a
// live `<Link>` - so a step across a trip boundary would offer a click through to
// the trip of the dive you just left, with nothing dimmed to say the page was
// still settling. See "The step remounted the page..." in DECISIONS.md.

const dive = vi.hoisted(() => ({
  current: null as Dive | null,
  isLoading: false,
}));

vi.mock("@/hooks/useResource", () => ({
  useResource: () => ({
    resource: dive.current,
    isLoading: dive.isLoading,
    refetch: vi.fn(),
    setResource: vi.fn(),
    id: dive.current?.uuid ?? "",
  }),
}));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: dive.current?.uuid ?? "" }),
}));

// Rendered inside the header; its own behaviour belongs to
// `dive-neighbor-nav.render.test.tsx`.
vi.mock("@/components/dives/dive-neighbor-nav", () => ({
  DiveNeighborNav: () => null,
}));

const getTrip = vi.fn();
vi.mock("@/lib/api/trips", () => ({
  tripsAPI: { getTrip: (...a: string[]) => getTrip(...a) },
}));
vi.mock("@/lib/api/courses", () => ({ coursesAPI: { getCourse: vi.fn() } }));

function makeDive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "dive-a",
    dive_number: 458,
    start_time: "2025-10-25T10:04:47+02:00",
    duration: 2700,
    created_at: "2025-10-26T08:00:00+02:00",
    user_uuid: "user-1",
    notes: "",
    dive_sites: [],
    gear_items: [],
    mixtures: [],
    ...overrides,
  };
}

function trip(uuid: string, name: string): Trip {
  return { uuid, name } as Trip;
}

// Reports what the layout is currently handing down, which is the whole contract
// between it and the page.
function Probe() {
  const { dive: shown, trip: shownTrip } = useDiveDetail();
  return (
    <div
      data-testid="probe"
      data-dive={shown.uuid}
      data-trip={shownTrip?.uuid ?? ""}
    />
  );
}

function probe() {
  return screen.getByTestId("probe");
}

describe("the dive detail layout's trip lookup", () => {
  beforeEach(() => {
    getTrip.mockReset();
    dive.isLoading = false;
  });

  it("hands the page the trip once it resolves", async () => {
    dive.current = makeDive({ trip_uuid: "trip-dahab" });
    getTrip.mockResolvedValue(trip("trip-dahab", "Dahab 2025 (October)"));

    render(
      <DiveDetailLayout>
        <Probe />
      </DiveDetailLayout>,
    );

    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-trip", "trip-dahab"),
    );
  });

  it("drops the previous dive's trip the instant the next dive lands", async () => {
    // The step that crosses a trip boundary. The new dive is on screen a whole
    // round trip before its own trip is known, and for that window the honest
    // answer is "no trip yet" - not the last one, which is a link somewhere the
    // diver is no longer looking.
    dive.current = makeDive({ uuid: "dive-a", trip_uuid: "trip-dahab" });
    getTrip.mockResolvedValue(trip("trip-dahab", "Dahab 2025 (October)"));

    const { rerender } = render(
      <DiveDetailLayout>
        <Probe />
      </DiveDetailLayout>,
    );
    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-trip", "trip-dahab"),
    );

    // The next dive lands, in a different trip, whose name is not known yet.
    let resolveSecond: (value: Trip) => void = () => {};
    getTrip.mockReturnValue(
      new Promise<Trip>((resolve) => {
        resolveSecond = resolve;
      }),
    );
    dive.current = makeDive({
      uuid: "dive-b",
      dive_number: 460,
      trip_uuid: "trip-red-sea",
    });
    rerender(
      <DiveDetailLayout>
        <Probe />
      </DiveDetailLayout>,
    );

    expect(probe()).toHaveAttribute("data-dive", "dive-b");
    expect(probe()).toHaveAttribute("data-trip", "");

    resolveSecond(trip("trip-red-sea", "Red Sea 2025, MV Legend"));
    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-trip", "trip-red-sea"),
    );
  });

  it("keeps the trip across a step that stays inside it", async () => {
    // The common case - a diver reading one trip front to back. The trip the
    // outgoing dive named is the one the incoming dive names, so the row it
    // already has is still correct: no blank, and no second lookup for an
    // answer that has not changed.
    dive.current = makeDive({ uuid: "dive-a", trip_uuid: "trip-dahab" });
    getTrip.mockResolvedValue(trip("trip-dahab", "Dahab 2026"));

    const { rerender } = render(
      <DiveDetailLayout>
        <Probe />
      </DiveDetailLayout>,
    );
    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-trip", "trip-dahab"),
    );
    expect(getTrip).toHaveBeenCalledTimes(1);

    dive.current = makeDive({
      uuid: "dive-b",
      dive_number: 492,
      trip_uuid: "trip-dahab",
    });
    rerender(
      <DiveDetailLayout>
        <Probe />
      </DiveDetailLayout>,
    );

    expect(probe()).toHaveAttribute("data-dive", "dive-b");
    expect(probe()).toHaveAttribute("data-trip", "trip-dahab");
    expect(getTrip).toHaveBeenCalledTimes(1);
  });

  it("drops the trip when the next dive has none at all", async () => {
    dive.current = makeDive({ uuid: "dive-a", trip_uuid: "trip-dahab" });
    getTrip.mockResolvedValue(trip("trip-dahab", "Dahab 2026"));

    const { rerender } = render(
      <DiveDetailLayout>
        <Probe />
      </DiveDetailLayout>,
    );
    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-trip", "trip-dahab"),
    );

    dive.current = makeDive({ uuid: "dive-b", dive_number: 12 });
    rerender(
      <DiveDetailLayout>
        <Probe />
      </DiveDetailLayout>,
    );

    expect(probe()).toHaveAttribute("data-trip", "");
  });
});
