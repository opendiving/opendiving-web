import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "@/lib/api-base";
import {
  checkinLinkAPI,
  checkinLinkUrl,
  fetchSharedCheckIn,
  sharedCardFrontUrl,
  sharedPortraitUrl,
} from "./checkin-links";

vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const remove = vi.mocked(apiClient.delete);

const fetchMock = vi.fn();

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  remove.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the diver's own link", () => {
  it("mints with the figures as the body and hands the token back", async () => {
    post.mockResolvedValue({
      data: { token: "tok", expires_at: "2026-09-27T10:00:00Z" },
    });
    const figures = { total_dives: 310, max_depth: 40, last_dive_on: null };

    await expect(checkinLinkAPI.mint(figures)).resolves.toEqual({
      token: "tok",
      expires_at: "2026-09-27T10:00:00Z",
    });
    expect(post).toHaveBeenCalledWith("/user/checkin-link", figures);
  });

  it("reads no live link out of a 404, and lets anything else through", async () => {
    get.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(checkinLinkAPI.live()).resolves.toBeNull();

    get.mockRejectedValueOnce({ response: { status: 500 } });
    await expect(checkinLinkAPI.live()).rejects.toMatchObject({
      response: { status: 500 },
    });

    get.mockResolvedValueOnce({ data: { expires_at: "2026-09-27T10:00:00Z" } });
    await expect(checkinLinkAPI.live()).resolves.toEqual({
      expires_at: "2026-09-27T10:00:00Z",
    });
  });

  it("revokes on the collection route", async () => {
    remove.mockResolvedValue({ data: { message: "Check-in link revoked" } });

    await checkinLinkAPI.revoke();
    expect(remove).toHaveBeenCalledWith("/user/checkin-link");
  });
});

describe("the page a link opens", () => {
  // The whole of the public page's contract with the API: no client, so no bearer
  // token, and credentials omitted, so no cookie either. The token in the path is the
  // only credential.
  it("reads the summary with fetch, carrying no credential but the token", async () => {
    const summary = { expires_at: "2026-09-27T10:00:00Z" };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(summary), { status: 200 }),
    );

    await expect(fetchSharedCheckIn("a/b")).resolves.toEqual(summary);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/checkin/a%2Fb`);
    expect(init.credentials).toBe("omit");
    expect(init.headers).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it("reads every dead link as null, and anything else as a failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Not found" }), { status: 404 }),
    );
    await expect(fetchSharedCheckIn("gone")).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(new Response("", { status: 502 }));
    await expect(fetchSharedCheckIn("tok")).rejects.toThrow(/502/);
  });

  it("points the pictures at the token's own routes on the API", () => {
    expect(sharedPortraitUrl("tok")).toBe(
      `${API_BASE_URL}/checkin/tok/portrait`,
    );
    expect(sharedCardFrontUrl("tok", "cert-1")).toBe(
      `${API_BASE_URL}/checkin/tok/certification/cert-1/front`,
    );
  });

  it("gives the desk this app's page, not the API's route", () => {
    expect(checkinLinkUrl("https://dive.example", "tok")).toBe(
      "https://dive.example/checkin/tok",
    );
  });
});
