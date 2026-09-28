import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JoinPage } from "./join-page";

// `/join?via=<slug>` has three faces - the channel hero for a live link, and the
// plain landing page for anything else - and one rule it shares with `/`: the hero
// never paints one form and then swaps it for the other. The resolve is real here,
// down to `configAPI.getJoinChannel`; only the request under it is staged.
const {
  searchParams,
  getJoinChannel,
  useInstanceConfig,
  useRedirectIfAuthenticated,
  requestEmailLink,
} = vi.hoisted(() => ({
  searchParams: { current: "" },
  getJoinChannel: vi.fn(),
  useInstanceConfig: vi.fn(),
  useRedirectIfAuthenticated: vi.fn(),
  requestEmailLink: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParams.current),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/config", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configAPI: { getJoinChannel },
}));
vi.mock("@/hooks/useInstanceConfig", () => ({ useInstanceConfig }));
vi.mock("@/hooks/useRedirectIfAuthenticated", () => ({
  useRedirectIfAuthenticated,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ requestEmailLink }),
}));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ googleClientId: undefined }),
}));
vi.mock("@/hooks/usePasskeySignIn", () => ({
  usePasskeySignIn: () => ({
    supported: false,
    isSigningIn: false,
    signIn: vi.fn(),
  }),
}));
vi.mock("@/lib/api/invitations", () => ({
  invitationsAPI: { requestInvite: vi.fn() },
}));

const INVITE = { registration_mode: "invite", project_operated: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  searchParams.current = "";
  useRedirectIfAuthenticated.mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
  });
  useInstanceConfig.mockReturnValue({ config: INVITE, isLoading: false });
  requestEmailLink.mockResolvedValue({ message: "sent", request_id: "req-1" });
});

const channelHeading = () =>
  screen.queryByRole("heading", { name: /^Invited from/ });
const signInButton = () => screen.queryByRole("button", { name: /^sign in$/i });
const requestButton = () =>
  screen.queryByRole("button", { name: /request an invite/i });

describe("/join", () => {
  it("lands a live link on the sign-in form, and sends its slug", async () => {
    searchParams.current = "via=scubaboard";
    getJoinChannel.mockResolvedValue({
      slug: "scubaboard",
      label: "ScubaBoard",
    });
    const user = userEvent.setup();

    render(<JoinPage />);

    expect(
      await screen.findByRole("heading", { name: "Invited from ScubaBoard" }),
    ).toBeInTheDocument();
    expect(requestButton()).toBeNull();
    expect(getJoinChannel).toHaveBeenCalledTimes(1);
    expect(getJoinChannel).toHaveBeenCalledWith("scubaboard");

    await user.type(screen.getByLabelText("Email"), "diver@example.com");
    await user.click(signInButton()!);

    await waitFor(() =>
      expect(requestEmailLink).toHaveBeenCalledWith(
        "diver@example.com",
        "scubaboard",
      ),
    );
  });

  // A dead link is not an error to the visitor: the page they would have reached
  // anyway, whose request form is the next thing for them to try.
  it.each([
    ["a slug nobody configured", null],
    ["an API that could not be reached", new Error("Network Error")],
  ])("shows exactly the landing page for %s", async (_label, answer) => {
    searchParams.current = "via=nope";
    if (answer instanceof Error) getJoinChannel.mockRejectedValue(answer);
    else getJoinChannel.mockResolvedValue(answer);

    render(<JoinPage />);

    expect(
      await screen.findByRole("button", { name: /request an invite/i }),
    ).toBeInTheDocument();
    expect(channelHeading()).toBeNull();
    expect(signInButton()).toBeNull();
  });

  it("shows exactly the landing page with no link at all, and asks nothing", async () => {
    render(<JoinPage />);

    expect(requestButton()).toBeInTheDocument();
    expect(channelHeading()).toBeNull();
    expect(getJoinChannel).not.toHaveBeenCalled();
  });

  // The invariant the others cannot state: nothing is painted until both the
  // resolve and the instance config have answered, in either order.
  it("paints no form while the link is being resolved", async () => {
    searchParams.current = "via=scubaboard";
    let answer!: (channel: unknown) => void;
    getJoinChannel.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    render(<JoinPage />);

    expect(signInButton()).toBeNull();
    expect(requestButton()).toBeNull();
    expect(document.querySelector(".animate-spin")).not.toBeNull();

    await act(async () => answer({ slug: "scubaboard", label: "ScubaBoard" }));

    expect(channelHeading()).toBeInTheDocument();
    expect(requestButton()).toBeNull();
  });

  it("paints no form while the instance config is still unknown", async () => {
    searchParams.current = "via=scubaboard";
    getJoinChannel.mockResolvedValue({
      slug: "scubaboard",
      label: "ScubaBoard",
    });
    useInstanceConfig.mockReturnValue({ config: null, isLoading: true });

    render(<JoinPage />);
    await waitFor(() => expect(getJoinChannel).toHaveBeenCalled());
    await act(async () => {});

    expect(channelHeading()).toBeNull();
    expect(signInButton()).toBeNull();
    expect(requestButton()).toBeNull();
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });
});
