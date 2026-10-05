import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDiveRoster } from "./use-dive-roster";
import type { CourseLookupItem } from "@/lib/api/courses";
import type { TripLookupItem } from "@/lib/api/trips";

vi.mock("@/lib/api/trips", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/trips")>()),
  tripsAPI: { lookupTripsByUuid: vi.fn() },
}));
vi.mock("@/lib/api/courses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/courses")>()),
  coursesAPI: { lookupCoursesByUuid: vi.fn() },
}));

const { tripsAPI } = await import("@/lib/api/trips");
const { coursesAPI } = await import("@/lib/api/courses");

const TRIP = {
  uuid: "trip-1",
  name: "Dahab 2026",
  people: [
    { person_uuid: "person-sam", role: null },
    { person_uuid: "person-ana", role: "companion" },
  ],
} as TripLookupItem;
const COURSE = {
  uuid: "course-1",
  name: "Rescue Diver",
  contact_uuid: "contact-blue",
  people: [
    { person_uuid: "person-kim", role: "instructor" },
    { person_uuid: "person-ana", role: "student" },
  ],
} as CourseLookupItem;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tripsAPI.lookupTripsByUuid).mockImplementation(async () => [TRIP]);
  vi.mocked(coursesAPI.lookupCoursesByUuid).mockImplementation(async () => [
    COURSE,
  ]);
});

describe("useDiveRoster", () => {
  it("lists the trip's people, then the course's, each once, and the course's contact", async () => {
    const { result } = renderHook(() => useDiveRoster(TRIP.uuid, COURSE.uuid));

    await waitFor(() =>
      expect(result.current).toEqual({
        people: ["person-sam", "person-ana", "person-kim"],
        contacts: ["contact-blue"],
      }),
    );
  });

  it("drops a cleared trip's people at once, and reads a row once per uuid", async () => {
    const { result, rerender } = renderHook(
      ({ trip }: { trip: string | null }) => useDiveRoster(trip, null),
      { initialProps: { trip: TRIP.uuid as string | null } },
    );
    await waitFor(() => expect(result.current.people).toHaveLength(2));

    rerender({ trip: null });
    expect(result.current).toEqual({ people: [], contacts: [] });

    rerender({ trip: TRIP.uuid });
    expect(result.current.people).toEqual(["person-sam", "person-ana"]);
    expect(tripsAPI.lookupTripsByUuid).toHaveBeenCalledTimes(1);
  });
});
