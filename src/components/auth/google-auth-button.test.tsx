import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigProvider } from "@/contexts/ConfigContext";
import { resolveBasemap } from "@/lib/basemap";
import { memoryStorage, useStorage } from "@/test/memory-storage";
import { GoogleAuthButton } from "./google-auth-button";

// The page load this button ends in. `window.location` is unforgeable, so the
// app routes every real page load through `lib/navigation.ts` - which is what
// makes the destination assertable at all (see that file).
const { hardNavigate } = vi.hoisted(() => ({ hardNavigate: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardNavigate }));

const CLIENT_ID = "test-client.apps.googleusercontent.com";

beforeEach(() => {
  vi.clearAllMocks();
  useStorage(memoryStorage());
});

function renderButton({
  clientId,
  redirectTo,
}: { clientId?: string; redirectTo?: string } = {}) {
  const onError = vi.fn();
  const user = userEvent.setup();
  render(
    <ConfigProvider
      config={{
        basemap: resolveBasemap(),
        googleClientId: clientId,
      }}
    >
      <GoogleAuthButton onError={onError} redirectTo={redirectTo} />
    </ConfigProvider>,
  );
  return { user, onError };
}

const control = () =>
  screen.getByRole("button", { name: /continue with google/i });

async function navigatedTo(): Promise<URL> {
  await vi.waitFor(() => expect(hardNavigate).toHaveBeenCalledTimes(1));
  return new URL(hardNavigate.mock.calls[0]![0] as string);
}

describe("before the button is pressed", () => {
  // The invariant the whole redirect design exists for. A live check in a real
  // browser is what proves "zero requests to any Google origin"; what jsdom can
  // hold is the mechanism that used to make those requests - a script element
  // injected at mount - and its absence is what this asserts.
  it("loads nothing of Google's into the document", () => {
    renderButton({ clientId: CLIENT_ID });

    const sources = [...document.querySelectorAll("script, link, iframe")].map(
      (element) => element.getAttribute("src") ?? element.getAttribute("href"),
    );

    expect(sources.some((src) => src?.includes("google"))).toBe(false);
    expect(sources.some((src) => src?.includes("gstatic"))).toBe(false);
  });

  it("stores nothing until the visitor acts", () => {
    renderButton({ clientId: CLIENT_ID, redirectTo: "/dives" });

    expect(window.localStorage.length).toBe(0);
  });

  // Unchanged from the old design: an instance that has not configured Google
  // shows no button rather than one that can never succeed.
  it("renders nothing at all without a client ID", () => {
    renderButton();

    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("the control itself", () => {
  // It used to be a decorative `aria-hidden` visual with Google's own rendered
  // button stacked on top at `opacity: 0`, which is where the split accessible
  // name came from. With nothing to hide behind it is one ordinary button, and
  // "exactly one" is the half worth pinning.
  it("is exactly one element carrying the name, and one tab stop", async () => {
    const { user } = renderButton({ clientId: CLIENT_ID });

    expect(
      screen.getAllByRole("button", { name: /continue with google/i }),
    ).toHaveLength(1);
    await user.tab();
    expect(control()).toHaveFocus();
  });

  // A native `<button>` gets both for free; the point of asserting it is that the
  // arrangement this replaced did not, and a future one that reaches for a `div`
  // would not either.
  it.each([["{Enter}"], [" "]])("is operable by %s", async (key) => {
    const { user } = renderButton({ clientId: CLIENT_ID });

    control().focus();
    await user.keyboard(key);

    await vi.waitFor(() => expect(hardNavigate).toHaveBeenCalledTimes(1));
  });
});

describe("pressing it", () => {
  it("navigates to Google's authorization endpoint", async () => {
    const { user } = renderButton({ clientId: CLIENT_ID });

    await user.click(control());

    const url = await navigatedTo();
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  // The destination has to survive a trip through Google, so it goes into the
  // attempt record rather than staying a prop.
  it("carries the destination into the attempt it stores", async () => {
    const { user } = renderButton({
      clientId: CLIENT_ID,
      redirectTo: "/dives",
    });

    await user.click(control());

    const url = await navigatedTo();
    const { consumeGoogleAttempt } = await import("@/lib/google-oauth");
    expect(
      consumeGoogleAttempt(url.searchParams.get("state"))?.redirectTo,
    ).toBe("/dives");
  });

  it("mints one attempt per press, not one per render", async () => {
    const { user } = renderButton({ clientId: CLIENT_ID });

    await user.click(control());

    await navigatedTo();
    expect(window.localStorage.length).toBe(1);
  });
});
