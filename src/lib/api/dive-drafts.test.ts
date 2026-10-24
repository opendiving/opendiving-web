import { beforeEach, describe, expect, it, vi } from "vitest";
import { diveDraftsAPI } from "./dive-drafts";

// Which route each call hits and with what body: the API's shapes are fixed, and a
// body that wrapped or unwrapped `values` the wrong way would be a 422 on every save.
vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/lib/service-due", () => ({ announceServiceDueChanged: vi.fn() }));

const { apiClient } = await import("./client");
const { announceServiceDueChanged } = await import("@/lib/service-due");

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ["get", "post", "patch", "delete"] as const) {
    vi.mocked(apiClient[method]).mockResolvedValue({ data: { ok: true } });
  }
});

describe("diveDraftsAPI", () => {
  it("lists a page of drafts", async () => {
    await diveDraftsAPI.getDrafts(1, 100);
    expect(apiClient.get).toHaveBeenCalledWith("/dive-drafts", {
      params: { page: 1, items_per_page: 100 },
    });
  });

  it("creates a draft from the form's values, sending no gear set", async () => {
    await diveDraftsAPI.createDraft({ max_depth: 18 });
    expect(apiClient.post).toHaveBeenCalledWith("/dive-draft", {
      values: { max_depth: 18 },
    });
  });

  it("replaces a draft's values and leaves its gear set", async () => {
    await diveDraftsAPI.updateDraft("draft-1", { notes: "drift" });
    expect(apiClient.patch).toHaveBeenCalledWith("/dive-draft/draft-1", {
      values: { notes: "drift" },
    });
  });

  it("discards a draft", async () => {
    await diveDraftsAPI.deleteDraft("draft-1");
    expect(apiClient.delete).toHaveBeenCalledWith("/dive-draft/draft-1");
  });

  // A logged dive can bring gear due for a service, as any created dive does.
  it("logs a draft through its own route", async () => {
    const dive = {
      dive_number: 1,
      start_time: "2026-07-01T09:30:00+02:00",
      submerged_time: 2700,
    };
    await diveDraftsAPI.logDraft("draft-1", dive);
    expect(apiClient.post).toHaveBeenCalledWith(
      "/dive-draft/draft-1/dive",
      dive,
    );
    expect(announceServiceDueChanged).toHaveBeenCalled();
  });
});
