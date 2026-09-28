import { beforeEach, describe, expect, it, vi } from "vitest";
import { authAPI } from "./auth";

// The two sign-in doors a join link can reach, and the one thing about their bodies
// that matters here: `via` goes out when the form is on a join link and the key is
// absent otherwise. Both request schemas are `extra="forbid"` on the API, and every
// sign-in not on `/join` must send exactly the body it always did.
vi.mock("./client", () => ({
  apiClient: { post: vi.fn() },
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
}));

const { apiClient } = await import("./client");
const post = vi.mocked(apiClient.post);

beforeEach(() => {
  post.mockReset();
});

describe("requestEmailLink", () => {
  beforeEach(() => {
    post.mockResolvedValue({
      data: { message: "Check your email.", request_id: "req-1" },
    });
  });

  it("sends the address alone when there is no join link", async () => {
    await authAPI.requestEmailLink("diver@example.com");

    expect(post).toHaveBeenCalledWith("/auth/email/request", {
      email: "diver@example.com",
    });
    expect(Object.keys(post.mock.calls[0][1] as object)).toEqual(["email"]);
  });

  it("sends the join link's slug beside the address", async () => {
    await expect(
      authAPI.requestEmailLink("diver@example.com", "scubaboard"),
    ).resolves.toEqual({ message: "Check your email.", request_id: "req-1" });

    expect(post).toHaveBeenCalledWith("/auth/email/request", {
      email: "diver@example.com",
      via: "scubaboard",
    });
  });
});

describe("signInWithGoogle", () => {
  const grant = {
    code: "real-code",
    codeVerifier: "v".repeat(43),
    redirectUri: "http://localhost:3000/auth/google/callback",
  };

  beforeEach(() => {
    post.mockResolvedValue({ data: { status: "onboarding" } });
  });

  it.each([
    ["absent", undefined],
    ["null", null],
  ])("sends the three fields it always did when via is %s", async (_l, via) => {
    await authAPI.signInWithGoogle({ ...grant, via });

    expect(post).toHaveBeenCalledWith("/auth/google", {
      code: "real-code",
      code_verifier: "v".repeat(43),
      redirect_uri: "http://localhost:3000/auth/google/callback",
    });
  });

  it("sends the join link's slug with the code", async () => {
    await authAPI.signInWithGoogle({ ...grant, via: "reddit" });

    expect(post).toHaveBeenCalledWith(
      "/auth/google",
      expect.objectContaining({ code: "real-code", via: "reddit" }),
    );
  });
});
