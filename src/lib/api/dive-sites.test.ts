import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const { changedMembers, diveSitesAPI } = await import("./dive-sites");
const { speciesAPI } = await import("./species");

const page = { data: [], total_count: 0, has_more: false };

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: page });
});

describe("diveSitesAPI.searchCommonsSites", () => {
  it("asks for Commons records alone, on a page of ten", async () => {
    await diveSitesAPI.searchCommonsSites("  kapal  ");

    expect(get).toHaveBeenCalledWith("/dive-sites/lookup", {
      params: {
        page: 1,
        items_per_page: 10,
        search: "kapal",
        commons_only: true,
      },
    });
  });

  it("sends a position whole", async () => {
    await diveSitesAPI.searchCommonsSites("kapal", {
      latitude: 1.5,
      longitude: 2.5,
    });

    expect(get.mock.calls[0][1]?.params).toMatchObject({
      latitude: 1.5,
      longitude: 2.5,
    });
  });

  // `commons_only` with a blank search is a 422, and the combobox searches "" the
  // moment its menu opens.
  it.each(["", " ", "k", "x".repeat(256)])(
    "answers %j without asking",
    async (query) => {
      await expect(diveSitesAPI.searchCommonsSites(query)).resolves.toEqual({
        data: [],
        has_more: false,
      });
      expect(get).not.toHaveBeenCalled();
    },
  );
});

describe("diveSitesAPI.saveDiveSite", () => {
  it("puts what the diver wrote and answers with the read", async () => {
    const read = { uuid: "site-1" };
    vi.mocked(apiClient.put).mockResolvedValue({ data: read });

    await expect(
      diveSitesAPI.saveDiveSite("site-1", { notes: "Gate", tags: ["Wreck"] }),
    ).resolves.toBe(read);

    expect(apiClient.put).toHaveBeenCalledWith("/dive-site/site-1/saved", {
      notes: "Gate",
      tags: ["Wreck"],
    });
  });
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

describe("the sites list's commons_match", () => {
  it("is sent only when asked for", async () => {
    await diveSitesAPI.getDiveSites(1, 1, { commonsMatch: true });
    await diveSitesAPI.getDiveSites(1, 1);

    expect(get.mock.calls[0][1]?.params).toMatchObject({ commons_match: true });
    expect(get.mock.calls[1][1]?.params).not.toHaveProperty("commons_match");
  });
});

describe("diveSitesAPI.replaceDiveSite", () => {
  it("names the record the site gives way to", async () => {
    post.mockResolvedValue({ data: {} });

    await diveSitesAPI.replaceDiveSite("site-1", "commons-1");

    expect(post).toHaveBeenCalledWith("/dive-site/site-1/replace", {
      commons_site_uuid: "commons-1",
    });
  });
});

describe("changedMembers", () => {
  const MEMBERS = {
    name: "Kapal Polis",
    other_names: ["Police Boat"],
    latitude: 1,
    longitude: 2,
    location_name: null,
    external_ids: [],
    depth_from: 5,
    depth_to: null,
    water_type: null,
    altitude: null,
    entry_types: [],
  };

  it("names nothing where nothing changed", () => {
    expect(changedMembers(MEMBERS, { ...MEMBERS })).toEqual({});
  });

  it("names what changed, a cleared member and a list included", () => {
    expect(
      changedMembers(MEMBERS, {
        ...MEMBERS,
        depth_from: null,
        other_names: [],
      }),
    ).toEqual({ depth_from: null, other_names: [] });
  });

  it("names the pin whole, since half of one is refused", () => {
    expect(changedMembers(MEMBERS, { ...MEMBERS, latitude: 1.5 })).toEqual({
      latitude: 1.5,
      longitude: 2,
    });
  });
});
