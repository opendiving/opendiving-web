import { describe, it, expect, vi, beforeEach } from "vitest";
import { invitationsAPI } from "./invitations";

// The calls at the level this module works at: which path each one hits and
// what it hands back. The behaviour on top of them is in
// `components/settings/invitations-card.render.test.tsx` and
// `components/auth/invite-request-form.render.test.tsx`.
vi.mock("./client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const remove = vi.mocked(apiClient.delete);

const PENDING = {
  uuid: "inv-1",
  email: "buddy@example.com",
  created_at: "2026-09-01T09:00:00Z",
  accepted_at: null,
  revoked_at: null,
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  remove.mockReset();
});

describe("requestInvite", () => {
  it("posts the address to the anonymous route", async () => {
    post.mockResolvedValue({ data: { message: "Thanks." } });

    await expect(
      invitationsAPI.requestInvite("stranger@example.com"),
    ).resolves.toEqual({ message: "Thanks." });
    expect(post).toHaveBeenCalledWith("/invite-requests", {
      email: "stranger@example.com",
    });
  });

  // The address goes up as typed. Lowercasing is the API's job on this path, and
  // doing it here as well would put a second copy of a normalisation rule in the
  // one place that must not be able to disagree with the gate.
  it("sends the address unaltered", async () => {
    post.mockResolvedValue({ data: { message: "Thanks." } });

    await invitationsAPI.requestInvite("Stranger@Example.com");

    expect(post).toHaveBeenCalledWith("/invite-requests", {
      email: "Stranger@Example.com",
    });
  });
});

describe("listInvitations", () => {
  it("reads the first page with the card's page size by default", async () => {
    get.mockResolvedValue({
      data: {
        data: [PENDING],
        total_count: 1,
        has_more: false,
        page: 1,
        items_per_page: 20,
      },
    });

    const listed = await invitationsAPI.listInvitations();

    expect(listed.data).toEqual([PENDING]);
    expect(get).toHaveBeenCalledWith("/user/invitations", {
      params: { page: 1, items_per_page: 20 },
    });
  });

  it("passes a later page through", async () => {
    get.mockResolvedValue({
      data: {
        data: [],
        total_count: 40,
        has_more: false,
        page: 2,
        items_per_page: 20,
      },
    });

    await invitationsAPI.listInvitations(2);

    expect(get).toHaveBeenCalledWith("/user/invitations", {
      params: { page: 2, items_per_page: 20 },
    });
  });

  // The 404 an `open`-mode instance answers with. It has to arrive as a throw
  // carrying the status, because that is what the card reads to remove itself.
  it("lets the open-mode 404 reach the caller", async () => {
    get.mockRejectedValue({ response: { status: 404 } });

    await expect(invitationsAPI.listInvitations()).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe("sendInvitation", () => {
  it("returns the created row rather than only a status", async () => {
    post.mockResolvedValue({ data: PENDING });

    await expect(
      invitationsAPI.sendInvitation("buddy@example.com"),
    ).resolves.toEqual(PENDING);
    expect(post).toHaveBeenCalledWith("/user/invitations", {
      email: "buddy@example.com",
    });
  });

  it.each([
    [409, "That address already has an account on this instance."],
    [409, "You have already invited that address."],
    [429, "You can send 5 invitations per day."],
  ])("lets a %s reach the caller with its detail", async (status, detail) => {
    post.mockRejectedValue({ response: { status, data: { detail } } });

    await expect(
      invitationsAPI.sendInvitation("buddy@example.com"),
    ).rejects.toMatchObject({ response: { status, data: { detail } } });
  });
});

describe("revokeInvitation", () => {
  it("addresses the row by uuid", async () => {
    remove.mockResolvedValue({ data: { message: "Invitation revoked" } });

    await expect(invitationsAPI.revokeInvitation("inv-1")).resolves.toEqual({
      message: "Invitation revoked",
    });
    expect(remove).toHaveBeenCalledWith("/user/invitation/inv-1");
  });

  it("lets the already-accepted 409 reach the caller", async () => {
    remove.mockRejectedValue({ response: { status: 409 } });

    await expect(
      invitationsAPI.revokeInvitation("inv-1"),
    ).rejects.toMatchObject({ response: { status: 409 } });
  });
});

describe("the invite link", () => {
  const LINK = {
    token: "0123456789abcdef0123456789abcdef",
    created_at: "2026-10-14T09:00:00Z",
  };

  it("reads the caller's link", async () => {
    get.mockResolvedValue({ data: LINK });

    await expect(invitationsAPI.inviteLink()).resolves.toEqual(LINK);
    expect(get).toHaveBeenCalledWith("/user/invite-link");
  });

  // The card asks only once its list has loaded, so a 404 here can only mean the
  // caller has made no link.
  it("answers null for a caller with no link", async () => {
    get.mockRejectedValue({ response: { status: 404 } });

    await expect(invitationsAPI.inviteLink()).resolves.toBeNull();
  });

  it("lets any other failure reach the caller", async () => {
    get.mockRejectedValue({ response: { status: 500 } });

    await expect(invitationsAPI.inviteLink()).rejects.toMatchObject({
      response: { status: 500 },
    });
  });

  it("makes or resets it with one bodiless post", async () => {
    post.mockResolvedValue({ data: LINK });

    await expect(invitationsAPI.createInviteLink()).resolves.toEqual(LINK);
    expect(post).toHaveBeenCalledWith("/user/invite-link");
  });

  it("removes it", async () => {
    remove.mockResolvedValue({ data: { message: "Invite link removed" } });

    await expect(invitationsAPI.removeInviteLink()).resolves.toEqual({
      message: "Invite link removed",
    });
    expect(remove).toHaveBeenCalledWith("/user/invite-link");
  });
});
