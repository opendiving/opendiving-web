import { describe, it, expect, vi, beforeEach } from "vitest";
import { sessionsAPI } from "./sessions";

// The three calls, at the level this module actually works at: which path each
// one hits, and what it hands back. The card's behaviour on top of them is in
// `components/settings/sessions-card.render.test.tsx`.
vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), delete: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);
const remove = vi.mocked(apiClient.delete);

const SESSION = {
  uuid: "sess-1",
  created_at: "2026-08-20T09:00:00Z",
  last_used_at: "2026-08-29T14:12:00Z",
  ip: "203.0.113.7",
  user_agent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  current: true,
};

beforeEach(() => {
  get.mockReset();
  remove.mockReset();
});

describe("listSessions", () => {
  it("reads the unpaginated list off the collection route", async () => {
    get.mockResolvedValue({ data: [SESSION] });

    await expect(sessionsAPI.listSessions()).resolves.toEqual([SESSION]);
    expect(get).toHaveBeenCalledWith("/user/sessions");
  });

  // A row is only ever handed straight through - no reshaping, no label derived
  // here. `user_agent` stays the raw header because the card is what turns it
  // into a device name, using the same tables the passkey ceremony does.
  it("passes the raw user agent through rather than labelling it", async () => {
    get.mockResolvedValue({ data: [{ ...SESSION, user_agent: "curl/8.7.1" }] });

    const [session] = await sessionsAPI.listSessions();

    expect(session.user_agent).toBe("curl/8.7.1");
  });

  // A failure is an axios throw, which is what the card reads a 404 out of to
  // hide itself on an instance whose API predates this feature.
  it("lets a failure reach the caller", async () => {
    get.mockRejectedValue({ response: { status: 404 } });

    await expect(sessionsAPI.listSessions()).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe("revokeSession", () => {
  it("keys the singular route on the session uuid", async () => {
    remove.mockResolvedValue({ data: { message: "Session revoked" } });

    await sessionsAPI.revokeSession("sess-2");

    expect(remove).toHaveBeenCalledWith("/user/session/sess-2");
  });

  // The 409 the API answers for the caller's own session. The card offers no
  // control that can reach it, so this only pins that the status is not
  // swallowed on the way back to whoever does.
  it("lets the current-session refusal through", async () => {
    remove.mockRejectedValue({
      response: {
        status: 409,
        data: {
          detail:
            "This is the session you are signed in with. Sign out instead.",
        },
      },
    });

    await expect(sessionsAPI.revokeSession("sess-1")).rejects.toMatchObject({
      response: { status: 409 },
    });
  });
});

describe("revokeOtherSessions", () => {
  // The count is the reason this one returns a body at all: the card confirms
  // before it sends, so the number of devices signed out can only come from the
  // response.
  it("returns the count the API reports", async () => {
    remove.mockResolvedValue({
      data: { message: "Other sessions revoked", revoked: 2 },
    });

    await expect(sessionsAPI.revokeOtherSessions()).resolves.toEqual({
      message: "Other sessions revoked",
      revoked: 2,
    });
    expect(remove).toHaveBeenCalledWith("/user/sessions");
  });
});
