import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import { downloadTicketsAPI, ticketedDownloadUrl } from "./download-tickets";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadTicketsAPI.create", () => {
  it("posts the bare path and hands back the ticket", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { ticket: "tkt", expires_in: 300 } });

    await expect(downloadTicketsAPI.create("/export/archive")).resolves.toEqual(
      { ticket: "tkt", expires_in: 300 },
    );
    expect(post).toHaveBeenCalledWith("/user/download-ticket", {
      path: "/export/archive",
    });
  });
});

// The URL is navigated to, never requested through axios, so it has to land on the
// same base the client would have used - in both topologies.
describe("ticketedDownloadUrl", () => {
  function withBase(base: string, check: () => void) {
    const original = apiClient.defaults.baseURL;
    apiClient.defaults.baseURL = base;
    try {
      check();
    } finally {
      apiClient.defaults.baseURL = original;
    }
  }

  it("builds on the same-origin proxy route", () => {
    withBase("/api/v1", () =>
      expect(ticketedDownloadUrl("/export/archive", "a.b-c_d")).toBe(
        "/api/v1/export/archive?ticket=a.b-c_d",
      ),
    );
  });

  it("builds on a split-origin API base", () => {
    withBase("http://localhost:8000/api/v1", () =>
      expect(ticketedDownloadUrl("/certification/c1/file/front", "tkt")).toBe(
        "http://localhost:8000/api/v1/certification/c1/file/front?ticket=tkt",
      ),
    );
  });

  it("encodes a ticket that would otherwise break the query string", () => {
    withBase("/api/v1", () =>
      expect(ticketedDownloadUrl("/export/csv", "a&b=c#d")).toBe(
        "/api/v1/export/csv?ticket=a%26b%3Dc%23d",
      ),
    );
  });
});
