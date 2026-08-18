import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({
  apiClient: { delete: vi.fn() },
}));

const { apiClient } = await import("./client");
const { tripsAPI } = await import("./trips");
const { diveSitesAPI } = await import("./dive-sites");
const del = vi.mocked(apiClient.delete);

beforeEach(() => {
  del.mockReset();
  del.mockResolvedValue({ data: { message: "Deleted" } });
});

// `move_dives_to` does the reassignment and the delete in one transaction, which
// is the whole reason the browser no longer walks the dives itself. What is left
// on this side is the query parameter, which is easy to get subtly wrong: an
// empty-string one would 422 rather than reading as "move nothing".
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
