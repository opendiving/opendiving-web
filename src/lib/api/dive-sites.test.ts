import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  apiClient: { get: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);
const { diveSitesAPI } = await import("./dive-sites");
const { speciesAPI } = await import("./species");

const page = { data: [], total_count: 0, has_more: false };

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: page });
});

describe("diveSitesAPI.getDiveSites", () => {
  it("asks for a page alone when nothing narrows or orders it", async () => {
    await diveSitesAPI.getDiveSites(2, 25);

    expect(get).toHaveBeenCalledWith("/dive-sites", {
      params: { page: 2, items_per_page: 25 },
    });
  });

  it("sends the search, the tag and an order other than the default", async () => {
    await diveSitesAPI.getDiveSites(1, 10, {
      search: "sunabe",
      tagUuid: "tag-1",
      sort: "last_dived_on",
    });

    expect(get).toHaveBeenCalledWith("/dive-sites", {
      params: {
        page: 1,
        items_per_page: 10,
        search: "sunabe",
        tag_uuid: "tag-1",
        sort: "last_dived_on",
      },
    });
  });

  // The default order is the API's own, and an empty tag is no filter.
  it("leaves the default order off the request", async () => {
    await diveSitesAPI.getDiveSites(1, 10, { sort: "name", tagUuid: "" });

    expect(get.mock.calls[0][1]).toEqual({
      params: { page: 1, items_per_page: 10 },
    });
  });
});

describe("speciesAPI.getLifeList", () => {
  it("narrows the life list to the dives naming a site", async () => {
    await speciesAPI.getLifeList(1, 100, { diveSiteUuid: "site-1" });

    expect(get).toHaveBeenCalledWith("/user/species", {
      params: { page: 1, items_per_page: 100, dive_site_uuid: "site-1" },
    });
  });
});
