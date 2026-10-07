import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminAPI, type AdminInviteRequest } from "./admin";

vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const put = vi.mocked(apiClient.put);
const del = vi.mocked(apiClient.delete);

const request = (
  overrides: Partial<AdminInviteRequest> = {},
): AdminInviteRequest => ({
  email: "diver@example.com",
  created_at: "2026-09-01T10:00:00+00:00",
  has_account: false,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("adminAPI.listInviteRequests", () => {
  it("asks for the page it was given, in the API's own parameter names", async () => {
    get.mockResolvedValue({
      data: {
        data: [request()],
        total_count: 1,
        has_more: false,
        page: 2,
        items_per_page: 25,
      },
    });

    const response = await adminAPI.listInviteRequests(2, 25);

    expect(get).toHaveBeenCalledWith("/admin/invite-requests", {
      params: { page: 2, items_per_page: 25 },
    });
    expect(response.data).toEqual([request()]);
  });

  it("returns the envelope rather than just its rows", async () => {
    // The page's footer pages off `total_count` and `has_more`; a client that
    // unwrapped to the array would leave it with nothing to page on.
    get.mockResolvedValue({
      data: {
        data: [],
        total_count: 42,
        has_more: true,
        page: 1,
        items_per_page: 10,
      },
    });

    const response = await adminAPI.listInviteRequests();

    expect(response.total_count).toBe(42);
    expect(response.has_more).toBe(true);
  });
});

describe("adminAPI.sendInvitations", () => {
  it("posts the addresses and hands back the per-address outcomes", async () => {
    post.mockResolvedValue({
      data: {
        results: [
          { email: "a@example.com", outcome: "invited" },
          { email: "b@example.com", outcome: "already_registered" },
        ],
      },
    });

    const response = await adminAPI.sendInvitations([
      "a@example.com",
      "b@example.com",
    ]);

    expect(post).toHaveBeenCalledWith("/admin/invitations", {
      emails: ["a@example.com", "b@example.com"],
    });
    expect(response.results.map((result) => result.outcome)).toEqual([
      "invited",
      "already_registered",
    ]);
  });
});

describe("adminAPI.removeInviteRequests", () => {
  it("sends the addresses in the body, which on DELETE means `data`", async () => {
    // Axios drops a second positional argument's `emails` unless it is nested
    // under `data`, so this call would otherwise reach the API as an empty body
    // and 422 - a mistake no type checks.
    del.mockResolvedValue({ data: { removed: 2 } });

    const response = await adminAPI.removeInviteRequests([
      "a@example.com",
      "b@example.com",
    ]);

    expect(del).toHaveBeenCalledWith("/admin/invite-requests", {
      data: { emails: ["a@example.com", "b@example.com"] },
    });
    expect(response.removed).toBe(2);
  });
});

describe("the species catalog routes", () => {
  const UUID = "01a073b4-2235-7b48-8ee7-68d0d99b9808";
  const row = { uuid: UUID, photo_curation: "pinned" };

  it("lists a page with neither search nor filter when none is given", async () => {
    get.mockResolvedValue({ data: { data: [], total_count: 0 } });

    await adminAPI.listSpecies(1, 24);

    expect(get).toHaveBeenCalledWith("/admin/species", {
      params: { page: 1, items_per_page: 24 },
    });
  });

  it("sends the search and the chip in the API's own names", async () => {
    get.mockResolvedValue({ data: { data: [], total_count: 0 } });

    await adminAPI.listSpecies(2, 24, { search: "queen", filter: "narrow" });

    expect(get).toHaveBeenCalledWith("/admin/species", {
      params: {
        page: 2,
        items_per_page: 24,
        search: "queen",
        filter: "narrow",
      },
    });
  });

  it("reads one species' candidates", async () => {
    get.mockResolvedValue({ data: { category: null, candidates: [] } });

    const response = await adminAPI.speciesPhotoCandidates(UUID);

    expect(get).toHaveBeenCalledWith(`/admin/species/${UUID}/photo-candidates`);
    expect(response).toEqual({ category: null, candidates: [] });
  });

  it("pins a file with a PUT carrying it as `file`", async () => {
    put.mockResolvedValue({ data: row });

    const response = await adminAPI.pinSpeciesPhoto(
      UUID,
      "Seriphus politus.jpg",
    );

    expect(put).toHaveBeenCalledWith(`/admin/species/${UUID}/photo`, {
      file: "Seriphus politus.jpg",
    });
    expect(response).toEqual(row);
  });

  it("hides with a DELETE on the photo", async () => {
    del.mockResolvedValue({ data: row });

    await adminAPI.hideSpeciesPhoto(UUID);

    expect(del).toHaveBeenCalledWith(`/admin/species/${UUID}/photo`);
  });

  it("re-fetches with a bodiless POST", async () => {
    post.mockResolvedValue({ data: row });

    await adminAPI.refetchSpeciesPhoto(UUID);

    expect(post).toHaveBeenCalledWith(`/admin/species/${UUID}/photo/refetch`);
  });
});
