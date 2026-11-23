import { describe, it, expect, vi, beforeEach } from "vitest";
import { invitationsAPI } from "./invitations";

// The call at the level this module works at; the form on top of it is in
// `components/auth/invite-request-form.render.test.tsx`.
vi.mock("./client", () => ({
  apiClient: { post: vi.fn() },
}));

const { apiClient } = await import("./client");
const post = vi.mocked(apiClient.post);

beforeEach(() => {
  post.mockReset();
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
