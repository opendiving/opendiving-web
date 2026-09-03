import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage, useStorage } from "@/test/memory-storage";
import {
  beginGoogleSignIn,
  consumeGoogleAttempt,
  googleRedirectUri,
  GOOGLE_CALLBACK_PATH,
} from "./google-oauth";

const KEY = "opendiving:google-sign-in-attempts";
const CLIENT_ID = "test-client.apps.googleusercontent.com";

// jsdom serves `http://localhost:3000` by default, which is also the origin the
// local API derives its expected `redirect_uri` from - so the assertions below
// about the redirect URI are the real string, not a stand-in.
function stateOf(url: string): string {
  return new URL(url).searchParams.get("state")!;
}

function storedAttempts(): Record<string, { expiresAt: number }> {
  return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
}

beforeEach(() => {
  useStorage(memoryStorage());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the authorization URL", () => {
  it("is Google's authorization endpoint carrying exactly the parameters the flow needs", async () => {
    const url = new URL(await beginGoogleSignIn({ clientId: CLIENT_ID }));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  // Invariant, not a detail: `access_type=offline` is what asks Google for a
  // refresh token, and `/privacy` §4.9 tells the reader this app is never handed
  // a Google credential it could store. That has to be true by construction.
  it("never asks for offline access, so Google issues no refresh token", async () => {
    const url = new URL(await beginGoogleSignIn({ clientId: CLIENT_ID }));

    expect(url.searchParams.get("access_type")).toBeNull();
  });

  // A nonce is required by Google for `response_type=id_token` and optional for
  // the code flow. This app deliberately sends none - the ID token never touches
  // the browser - and a future edit that adds one should have to say why.
  it("sends no nonce", async () => {
    const url = new URL(await beginGoogleSignIn({ clientId: CLIENT_ID }));

    expect(url.searchParams.get("nonce")).toBeNull();
  });

  it("sends the browser's own origin as the redirect URI", async () => {
    const url = new URL(await beginGoogleSignIn({ clientId: CLIENT_ID }));

    expect(url.searchParams.get("redirect_uri")).toBe(
      `${window.location.origin}${GOOGLE_CALLBACK_PATH}`,
    );
    expect(googleRedirectUri()).toBe(url.searchParams.get("redirect_uri"));
  });

  it("mints a fresh state and challenge per attempt", async () => {
    const first = new URL(await beginGoogleSignIn({ clientId: CLIENT_ID }));
    const second = new URL(await beginGoogleSignIn({ clientId: CLIENT_ID }));

    expect(first.searchParams.get("state")).not.toBe(
      second.searchParams.get("state"),
    );
    expect(first.searchParams.get("code_challenge")).not.toBe(
      second.searchParams.get("code_challenge"),
    );
  });
});

describe("the PKCE verifier", () => {
  // The API validates this field to RFC 7636 §4.1 and answers 422 to anything
  // else, so a verifier built with standard base64 - `+` and `/` are outside the
  // unreserved set - would fail at the schema rather than at Google. This is the
  // guard on that.
  it("is 43-128 characters drawn only from the unreserved set", async () => {
    const url = await beginGoogleSignIn({ clientId: CLIENT_ID });
    const attempt = consumeGoogleAttempt(stateOf(url))!;

    expect(attempt.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(attempt.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(attempt.codeVerifier.length).toBeLessThanOrEqual(128);
  });

  // Same alphabet rule, applied to the value that actually travels in the URL:
  // a challenge containing `+` or `/` would be mangled by percent-decoding on
  // Google's side and rejected as a mismatch at the exchange.
  it("is committed to as a base64url S256 challenge", async () => {
    const url = new URL(await beginGoogleSignIn({ clientId: CLIENT_ID }));

    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});

describe("consuming an attempt", () => {
  it("hands back the verifier and destination the attempt was minted with", async () => {
    const url = await beginGoogleSignIn({
      clientId: CLIENT_ID,
      redirectTo: "/dives",
    });

    const attempt = consumeGoogleAttempt(stateOf(url));

    expect(attempt?.redirectTo).toBe("/dives");
    expect(attempt?.codeVerifier).toBeTruthy();
  });

  it("is single-use: a second read of the same state finds nothing", async () => {
    const url = await beginGoogleSignIn({ clientId: CLIENT_ID });
    const state = stateOf(url);

    expect(consumeGoogleAttempt(state)).not.toBeNull();
    expect(consumeGoogleAttempt(state)).toBeNull();
  });

  it("refuses a state this browser never issued", async () => {
    await beginGoogleSignIn({ clientId: CLIENT_ID });

    expect(consumeGoogleAttempt("not-a-state-we-minted")).toBeNull();
  });

  it("refuses a missing state without touching what is stored", async () => {
    const url = await beginGoogleSignIn({ clientId: CLIENT_ID });

    expect(consumeGoogleAttempt(null)).toBeNull();
    expect(consumeGoogleAttempt(undefined)).toBeNull();
    expect(consumeGoogleAttempt("")).toBeNull();
    // The real attempt is still there to be used.
    expect(consumeGoogleAttempt(stateOf(url))).not.toBeNull();
  });

  // The whole reason the destination moved inside the per-attempt record. With a
  // single current-attempt slot, tab B's sign-in would overwrite tab A's, and tab
  // A would then either fail its state check or land on tab B's page.
  it("keeps two concurrent attempts from invalidating each other", async () => {
    const tabA = await beginGoogleSignIn({
      clientId: CLIENT_ID,
      redirectTo: "/dives",
    });
    const tabB = await beginGoogleSignIn({ clientId: CLIENT_ID });

    const b = consumeGoogleAttempt(stateOf(tabB));
    const a = consumeGoogleAttempt(stateOf(tabA));

    expect(b?.redirectTo).toBeNull();
    expect(a?.redirectTo).toBe("/dives");
    expect(a?.codeVerifier).not.toBe(b?.codeVerifier);
  });

  it("refuses an attempt that has expired", async () => {
    vi.useFakeTimers();
    const url = await beginGoogleSignIn({ clientId: CLIENT_ID });

    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(consumeGoogleAttempt(stateOf(url))).toBeNull();
  });

  it("holds an attempt across a slow but plausible sign-in", async () => {
    vi.useFakeTimers();
    const url = await beginGoogleSignIn({ clientId: CLIENT_ID });

    // An account chooser, a password, a second factor and a consent screen.
    vi.advanceTimersByTime(20 * 60 * 1000);

    expect(consumeGoogleAttempt(stateOf(url))).not.toBeNull();
  });
});

describe("what is stored", () => {
  it("removes the key entirely once the last attempt is consumed", async () => {
    const url = await beginGoogleSignIn({ clientId: CLIENT_ID });

    consumeGoogleAttempt(stateOf(url));

    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  // Every write is also a sweep, so a visitor who abandons attempt after attempt
  // never accumulates more than the last half hour's worth.
  it("drops expired attempts as new ones are written", async () => {
    vi.useFakeTimers();
    await beginGoogleSignIn({ clientId: CLIENT_ID });
    await beginGoogleSignIn({ clientId: CLIENT_ID });
    expect(Object.keys(storedAttempts())).toHaveLength(2);

    vi.advanceTimersByTime(31 * 60 * 1000);
    await beginGoogleSignIn({ clientId: CLIENT_ID });

    expect(Object.keys(storedAttempts())).toHaveLength(1);
  });

  it("sanitizes the destination on the way in", async () => {
    const url = await beginGoogleSignIn({
      clientId: CLIENT_ID,
      redirectTo: "//evil.example/steal",
    });

    expect(consumeGoogleAttempt(stateOf(url))?.redirectTo).toBeNull();
  });

  // The stored value has sat somewhere anything else at this browser could have
  // rewritten, so the open-redirect guard runs again on the way out rather than
  // trusting what was written earlier.
  it("sanitizes the destination on the way out", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        tampered: {
          codeVerifier: "x".repeat(43),
          redirectTo: "https://evil.example",
          expiresAt: Date.now() + 60_000,
        },
      }),
    );

    expect(consumeGoogleAttempt("tampered")?.redirectTo).toBeNull();
  });

  it.each([
    ["unparseable", "not json at all"],
    ["an array", "[]"],
    ["a bare string", '"nope"'],
    ["an entry missing its verifier", '{"s":{"expiresAt":99999999999}}'],
    [
      "an entry with a non-numeric expiry",
      '{"s":{"codeVerifier":"x","expiresAt":"soon"}}',
    ],
  ])("treats %s as no attempt at all", (_label, raw) => {
    window.localStorage.setItem(KEY, raw);

    expect(consumeGoogleAttempt("s")).toBeNull();
  });

  // Safari private mode, storage disabled, quota exceeded. Losing the attempt
  // means the callback asks the visitor to try again, which is the right outcome
  // for a browser that cannot remember what it started - but it must not throw
  // out of the click handler.
  it("survives a browser that hands out no storage", async () => {
    useStorage(undefined);

    const url = await beginGoogleSignIn({ clientId: CLIENT_ID });

    expect(url).toContain("code_challenge");
    expect(consumeGoogleAttempt(stateOf(url))).toBeNull();
  });
});
