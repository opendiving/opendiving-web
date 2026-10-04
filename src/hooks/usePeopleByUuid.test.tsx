import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePeopleByUuid } from "./usePeopleByUuid";
import type { Person } from "@/lib/api/people";

vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: { getPerson: vi.fn() },
}));

const { peopleAPI } = await import("@/lib/api/people");
const getPerson = vi.mocked(peopleAPI.getPerson);

const person = (uuid: string, name: string): Person => ({
  uuid,
  name,
  notes: "",
  username: null,
  dive_count: 0,
  created_at: "2026-01-01T00:00:00Z",
});

const ALEX = person("person-alex", "Alex");
const SAM = person("person-sam", "Sam");

beforeEach(() => {
  vi.clearAllMocks();
  getPerson.mockImplementation(async (uuid) => {
    const found = [ALEX, SAM].find((one) => one.uuid === uuid);
    if (!found) throw new Error("404");
    return found;
  });
});

describe("usePeopleByUuid", () => {
  it("reads each person once, and only the ones asked for", async () => {
    const { result, rerender } = renderHook(
      ({ uuids }: { uuids: (string | null)[] }) => usePeopleByUuid(uuids),
      { initialProps: { uuids: [ALEX.uuid, ALEX.uuid, null] } },
    );

    await waitFor(() => expect(result.current[ALEX.uuid]).toEqual(ALEX));
    rerender({ uuids: [ALEX.uuid, SAM.uuid] });
    await waitFor(() => expect(result.current[SAM.uuid]).toEqual(SAM));

    expect(getPerson.mock.calls).toEqual([[ALEX.uuid], [SAM.uuid]]);
    expect(result.current[ALEX.uuid]).toEqual(ALEX);
  });

  it("asks once for a person it could not read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, rerender } = renderHook(
      ({ uuids }) => usePeopleByUuid(uuids),
      { initialProps: { uuids: ["person-gone"] } },
    );

    await waitFor(() => expect(getPerson).toHaveBeenCalledTimes(1));
    rerender({ uuids: ["person-gone", ALEX.uuid] });
    await waitFor(() => expect(result.current[ALEX.uuid]).toEqual(ALEX));

    expect(getPerson).toHaveBeenCalledTimes(2);
    expect(result.current["person-gone"]).toBeUndefined();
  });
});
