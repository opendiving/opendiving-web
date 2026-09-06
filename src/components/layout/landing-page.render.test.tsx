import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LandingPage } from "./landing-page";

// Which form the hero holds and which voice it speaks in, and the one thing about
// them that a render can catch and nothing else can: that neither is painted
// twice. The config arrives from the API, so a hero that rendered before the
// answer would show the sign-in form to a stranger on a closed instance - or the
// project's waitlist copy on a self-hoster's - and then swap it out from under
// them.
const { useRedirectIfAuthenticated, useInstanceConfig } = vi.hoisted(() => ({
  useRedirectIfAuthenticated: vi.fn(),
  useInstanceConfig: vi.fn(),
}));

vi.mock("@/hooks/useRedirectIfAuthenticated", () => ({
  useRedirectIfAuthenticated,
}));
vi.mock("@/hooks/useInstanceConfig", () => ({ useInstanceConfig }));

// The two forms are rendered as themselves rather than mocked away: what this
// file is about is which of them mounts and what it says, and a stub named after
// the real thing would pass against a hero that mounted neither.
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

const known = (config: Record<string, unknown>) =>
  useInstanceConfig.mockReturnValue({ config, isLoading: false });

const signInButton = () => screen.queryByRole("button", { name: /^sign in$/i });
const requestButton = () =>
  screen.queryByRole("button", { name: /request an invite/i });
const waitlistButton = () =>
  screen.queryByRole("button", { name: /join the waitlist/i });

describe("the landing hero", () => {
  it("holds the request form on an invite-mode instance", () => {
    known({ registration_mode: "invite", project_operated: false });

    render(<LandingPage />);

    expect(requestButton()).toBeInTheDocument();
    expect(signInButton()).toBeNull();
  });

  it("holds the sign-in form on an open-mode instance", () => {
    known({ registration_mode: "open", project_operated: false });

    render(<LandingPage />);

    expect(signInButton()).toBeInTheDocument();
    expect(requestButton()).toBeNull();
  });

  // A landing page has to work on an instance whose API is briefly down, and
  // `/signin` is the form that is right on any instance. It is also what the axe
  // scan in `code-quality.yml` sees, since that job runs the web with no API.
  it("falls back to the sign-in form when the config cannot be read", () => {
    useInstanceConfig.mockReturnValue({ config: null, isLoading: false });

    render(<LandingPage />);

    expect(signInButton()).toBeInTheDocument();
    expect(requestButton()).toBeNull();
    expect(waitlistButton()).toBeNull();
  });

  // The invariant the others cannot state. While the config is unknown the page
  // is behind the same spinner the auth bootstrap already puts it behind, so
  // neither form is on screen to be replaced by the other.
  it("paints neither form until the config is known", async () => {
    useInstanceConfig.mockReturnValue({ config: null, isLoading: true });

    const { rerender } = render(<LandingPage />);

    expect(signInButton()).toBeNull();
    expect(requestButton()).toBeNull();

    known({ registration_mode: "invite", project_operated: false });
    rerender(<LandingPage />);

    await waitFor(() => expect(requestButton()).toBeInTheDocument());
    expect(signInButton()).toBeNull();
  });

  // The only copy in the app that knows who runs the instance, and it is chosen
  // here rather than inside the form so that this page is the one place the
  // decision is made. `true` from `/config` is the project saying it operates
  // this copy, and only then does the hero speak in the project's voice.
  it("speaks as the project only when /config says the project operates this instance", () => {
    known({ registration_mode: "invite", project_operated: true });

    render(<LandingPage />);

    expect(waitlistButton()).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Get early access" }),
    ).toBeInTheDocument();
    expect(requestButton()).toBeNull();
    expect(signInButton()).toBeNull();
  });

  // Anything short of the API answering `true` is a self-hoster's instance as
  // far as this page is concerned: an explicit `false`, and a `/config` from an
  // API that predates the field and so carries no such key at all. Neither may
  // put "we'll notify you" on a page the project does not serve.
  it.each([
    ["false", { registration_mode: "invite", project_operated: false }],
    ["absent", { registration_mode: "invite" }],
  ])("keeps the generic copy when project_operated is %s", (_label, config) => {
    known(config);

    render(<LandingPage />);

    expect(requestButton()).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Request an invite" }),
    ).toBeInTheDocument();
    expect(waitlistButton()).toBeNull();
    expect(document.body.textContent).not.toContain("waitlist");
  });

  // The field picks copy and only copy. On an open-mode instance the project
  // runs, there is no request form for it to reword, and the sign-in form is
  // untouched.
  it("never lets project_operated choose the form", () => {
    known({ registration_mode: "open", project_operated: true });

    render(<LandingPage />);

    expect(signInButton()).toBeInTheDocument();
    expect(requestButton()).toBeNull();
    expect(waitlistButton()).toBeNull();
  });

  // Every other way in is untouched in both modes: the page's own button below
  // the fold goes to `/signin`, which is where the passkey ceremony, the Google
  // button and the magic-link form all still are.
  it.each(["invite", "open"] as const)(
    "still points %s-mode visitors at /signin from the page itself",
    (mode) => {
      known({ registration_mode: mode, project_operated: false });

      render(<LandingPage />);

      expect(
        screen.getByRole("link", { name: /sign in to this instance/i }),
      ).toHaveAttribute("href", "/signin");
    },
  );
});
