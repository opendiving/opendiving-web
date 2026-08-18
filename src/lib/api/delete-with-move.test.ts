import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({
  apiClient: { delete: vi.fn(), get: vi.fn() },
}));

const { apiClient } = await import("./client");
const { tripsAPI } = await import("./trips");
const { diveSitesAPI } = await import("./dive-sites");
const { divesAPI } = await import("./dives");
const del = vi.mocked(apiClient.delete);
const get = vi.mocked(apiClient.get);

beforeEach(() => {
  del.mockReset();
  get.mockReset();
  del.mockResolvedValue({ data: { message: "Deleted", moved_dives: 0 } });
});

// `move_dives_to` does the reassignment and the delete in one transaction, which
// is the whole reason the browser no longer walks the dives itself. What is left
// on this side is the query parameter and the count that comes back, and both are
// easy to get subtly wrong: an empty-string parameter would 422, and a `0` count
// read as falsy would drop the toast's whole point.
describe("deleting a trip", () => {
  it("sends no move_dives_to when nothing is being moved", async () => {
    await tripsAPI.deleteTrip("trip-1");

    expect(del).toHaveBeenCalledWith("/trip/trip-1", { params: undefined });
  });

  it("names the replacement when there is one", async () => {
    await tripsAPI.deleteTrip("trip-1", "trip-2");

    expect(del).toHaveBeenCalledWith("/trip/trip-1", {
      params: { move_dives_to: "trip-2" },
    });
  });

  it("returns the count of what moved", async () => {
    del.mockResolvedValue({
      data: { message: "Trip deleted", moved_dives: 12 },
    });

    expect((await tripsAPI.deleteTrip("trip-1", "trip-2")).moved_dives).toBe(
      12,
    );
  });
});

describe("deleting a dive site", () => {
  it("sends no move_dives_to when nothing is being moved", async () => {
    await diveSitesAPI.deleteDiveSite("site-1");

    expect(del).toHaveBeenCalledWith("/dive-site/site-1", {
      params: undefined,
    });
  });

  it("names the replacement when there is one", async () => {
    await diveSitesAPI.deleteDiveSite("site-1", "site-2");

    expect(del).toHaveBeenCalledWith("/dive-site/site-1", {
      params: { move_dives_to: "site-2" },
    });
  });
});

describe("counting the dives a delete would strand", () => {
  const page = (total: number) => ({
    data: [],
    total_count: total,
    has_more: total > 0,
    page: 1,
    items_per_page: 1,
  });

  it("asks for one item and reads the total off it", async () => {
    get.mockResolvedValue({ data: page(40) });

    expect(await divesAPI.countDives("u1", { tripUuid: "trip-1" })).toBe(40);
    // One item, not one page of ten: the body is thrown away and only the
    // envelope's count is read.
    expect(get).toHaveBeenCalledWith("/dives", {
      params: {
        user_uuid: "u1",
        page: 1,
        items_per_page: 1,
        trip_uuid: "trip-1",
      },
    });
  });

  it("filters on the dive site when that is what is being deleted", async () => {
    get.mockResolvedValue({ data: page(3) });

    await divesAPI.countDives("u1", { diveSiteUuid: "site-1" });

    expect(get).toHaveBeenCalledWith("/dives", {
      params: {
        user_uuid: "u1",
        page: 1,
        items_per_page: 1,
        dive_site_uuid: "site-1",
      },
    });
  });
});
