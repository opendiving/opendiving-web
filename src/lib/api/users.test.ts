import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({
  apiClient: { delete: vi.fn() },
  clearAccessToken: vi.fn(),
}));

const { apiClient, clearAccessToken } = await import("./client");
const { usersAPI } = await import("./users");
const del = vi.mocked(apiClient.delete);
const clearToken = vi.mocked(clearAccessToken);

beforeEach(() => {
  del.mockReset();
  clearToken.mockReset();
});

// The one thing this module does beyond the request: the session is over server-side
// the moment the call returns, and the in-memory token has to go with it. Both halves
// of "on success only" are worth pinning - a token kept after a successful delete is a
// client pretending to hold a session the API has blacklisted, and one dropped after a
// failed delete signs a diver out of an account they still have.
describe("deleting your own account", () => {
  it("hands back the purge date", async () => {
    del.mockResolvedValue({
      data: { message: "User deleted", purge_after: "2026-09-04T10:00:00Z" },
    });

    await expect(usersAPI.deleteAccount()).resolves.toEqual({
      message: "User deleted",
      purge_after: "2026-09-04T10:00:00Z",
    });
    expect(del).toHaveBeenCalledWith("/user");
  });

  it("drops the access token once the account is gone", async () => {
    del.mockResolvedValue({
      data: { message: "User deleted", purge_after: "2026-09-04T10:00:00Z" },
    });

    await usersAPI.deleteAccount();

    expect(clearToken).toHaveBeenCalled();
  });

  it("keeps the session when the delete fails", async () => {
    del.mockRejectedValue(new Error("429"));

    await expect(usersAPI.deleteAccount()).rejects.toThrow();

    expect(clearToken).not.toHaveBeenCalled();
  });
});
