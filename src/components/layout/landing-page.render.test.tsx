import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LandingPage } from "./landing-page";

// Which form the hero holds, and the one thing about it that a render can catch
// and nothing else can: that it is never painted twice. The mode arrives from the
// API, so a hero that rendered before the answer would show the sign-in form to a
// stranger on a closed instance and then swap it out from under them.
const { useRedirectIfAuthenticated, useRegistrationMode } = vi.hoisted(() => ({
  useRedirectIfAuthenticated: vi.fn(),
  useRegistrationMode: vi.fn(),
}));

vi.mock("@/hooks/useRedirectIfAuthenticated", () => ({
  useRedirectIfAuthenticated,
}));
vi.mock("@/hooks/useRegistrationMode", () => ({ useRegistrationMode }));

// The two forms are rendered as themselves rather than mocked away: what this
// file is about is which of them mounts, and a stub named after the real thing
// would pass against a hero that mounted neither.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ requestEmailLink: vi.fn() }),
}));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ googleClientId: undefined }),
}));
vi.mock("@/hooks/usePasskeySignIn", () => ({
  usePasskeySignIn: vi.fn(() => ({
    supported: false,
    isSigningIn: false,
    signIn: vi.fn(),
  })),
}));
vi.mock("@/lib/api/invitations", () => ({
  invitationsAPI: { requestInvite: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useRedirectIfAuthenticated.mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
  });
});

const signInButton = () => screen.queryByRole("button", { name: /^sign in$/i });
const requestButton = () =>
  screen.queryByRole("button", { name: /request an invite/i });

describe("the landing hero", () => {
  it("holds the request form on an invite-mode instance", () => {
    useRegistrationMode.mockReturnValue({ mode: "invite", isLoading: false });

    render(<LandingPage />);

    expect(requestButton()).toBeInTheDocument();
    expect(signInButton()).toBeNull();
  });

  it("holds the sign-in form on an open-mode instance", () => {
    useRegistrationMode.mockReturnValue({ mode: "open", isLoading: false });

    render(<LandingPage />);

    expect(signInButton()).toBeInTheDocument();
    expect(requestButton()).toBeNull();
  });

  // A landing page has to work on an instance whose API is briefly down, and
  // `/signin` is the form that is right on any instance. It is also what the axe
  // scan in `code-quality.yml` sees, since that job runs the web with no API.
  it("falls back to the sign-in form when the mode cannot be read", () => {
    useRegistrationMode.mockReturnValue({ mode: null, isLoading: false });

    render(<LandingPage />);

    expect(signInButton()).toBeInTheDocument();
    expect(requestButton()).toBeNull();
  });

  // The invariant the other three cannot state. While the mode is unknown the
  // page is behind the same spinner the auth bootstrap already puts it behind,
  // so neither form is on screen to be replaced by the other.
  it("paints neither form until the mode is known", async () => {
    useRegistrationMode.mockReturnValue({ mode: null, isLoading: true });

    const { rerender } = render(<LandingPage />);

    expect(signInButton()).toBeNull();
    expect(requestButton()).toBeNull();

    useRegistrationMode.mockReturnValue({ mode: "invite", isLoading: false });
    rerender(<LandingPage />);

    await waitFor(() => expect(requestButton()).toBeInTheDocument());
    expect(signInButton()).toBeNull();
  });

  // Every other way in is untouched in both modes: the page's own button below
  // the fold goes to `/signin`, which is where the passkey ceremony, the Google
  // button and the magic-link form all still are.
  it.each(["invite", "open"] as const)(
    "still points %s-mode visitors at /signin from the page itself",
    (mode) => {
      useRegistrationMode.mockReturnValue({ mode, isLoading: false });

      render(<LandingPage />);

      expect(
        screen.getByRole("link", { name: /sign in to this instance/i }),
      ).toHaveAttribute("href", "/signin");
    },
  );
});
