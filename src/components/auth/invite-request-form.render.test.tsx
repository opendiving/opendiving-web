import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteRequestForm } from "./invite-request-form";

// What the hero shows on an instance that is not taking registrations, in either
// of its two voices, and the things that make it correct: one success state per
// voice whatever the API stored, the API's own message on anything else, a way
// through to `/signin` for the two people who have one, and the generic voice
// whenever nobody asked for the other.
const { requestInvite } = vi.hoisted(() => ({ requestInvite: vi.fn() }));

vi.mock("@/lib/api/invitations", () => ({
  invitationsAPI: { requestInvite },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// The copy each voice is pinned to. The strings are the deliverable here, not a
// detail of it: a self-hoster's hero must read as the generic column and the
// project's as the waitlist column, with nothing of one in the other.
const VOICES = {
  generic: {
    heading: "Request an invite",
    blurb:
      "This instance is not taking new accounts on its own. Leave your address and whoever runs it can invite you.",
    button: /request an invite/i,
    successHeading: "Request received",
    successBody: (address: string) =>
      `If an invitation comes your way it will arrive at ${address}. Whoever runs this instance decides who is invited, and when.`,
  },
  waitlist: {
    heading: "Get early access",
    blurb:
      "Join the waitlist for a chance to be among the first to try OpenDiving. We'll notify you when your spot is ready. Just that, no spam.",
    button: /join the waitlist/i,
    successHeading: "You're on the list",
    successBody: (address: string) =>
      `We'll email ${address} when your spot is ready.`,
  },
} as const;

type Voice = keyof typeof VOICES;
const BOTH: readonly Voice[] = ["generic", "waitlist"];

const emailField = () => screen.getByLabelText("Email");
const submitButton = (voice: Voice) =>
  screen.getByRole("button", { name: VOICES[voice].button });

describe("InviteRequestForm", () => {
  // The default is the voice that is true of every instance. A caller that says
  // nothing gets the copy a household self-hoster can stand behind, so the only
  // way to the project's voice is to ask for it by name.
  it("speaks in the generic voice when no variant is given", () => {
    render(<InviteRequestForm />);

    expect(
      screen.getByRole("heading", { name: VOICES.generic.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(VOICES.generic.blurb)).toBeInTheDocument();
    expect(submitButton("generic")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("waitlist");
    expect(document.body.textContent).not.toContain("We'll");
  });

  it("speaks in the project's voice as the waitlist variant", () => {
    render(<InviteRequestForm variant="waitlist" />);

    expect(
      screen.getByRole("heading", { name: VOICES.waitlist.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(VOICES.waitlist.blurb)).toBeInTheDocument();
    expect(submitButton("waitlist")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("whoever runs it");
    expect(document.body.textContent).not.toContain("Request an invite");
  });

  it.each(BOTH)(
    "posts the address and replaces the %s form with one success state",
    async (voice) => {
      requestInvite.mockResolvedValue({ message: "Thanks." });
      const user = userEvent.setup();

      render(<InviteRequestForm variant={voice} />);
      await user.type(emailField(), "stranger@example.com");
      await user.click(submitButton(voice));

      expect(
        await screen.findByRole("heading", {
          name: VOICES[voice].successHeading,
        }),
      ).toBeInTheDocument();
      expect(requestInvite).toHaveBeenCalledWith("stranger@example.com");
      // The address is set apart from the sentence around it in both voices,
      // and the sentence is the voice's own.
      const address = screen.getByText("stranger@example.com");
      expect(address.tagName).toBe("SPAN");
      expect(address.parentElement?.textContent).toBe(
        VOICES[voice].successBody("stranger@example.com"),
      );
      // The field goes with the form. Leaving it on screen under a success
      // message invites a second submission that could tell the visitor nothing
      // new.
      expect(screen.queryByLabelText("Email")).toBeNull();
    },
  );

  // The API answers 202 for a first request, a repeat, an address that already
  // has an account and an address invited last week, and never queries the user
  // table on the way. This form must not be more informative than that, so each
  // voice has one success state and it carries no fact about what was stored.
  // Pinned as "the response body is not rendered", because that is the shape a
  // future regression would take: a handler that showed `message` would show
  // whatever a differently-configured API decided to say, and the guarantee is
  // that this screen cannot vary by address at all.
  it.each(BOTH)(
    "renders the %s voice's own success copy rather than the response body",
    async (voice) => {
      requestInvite.mockResolvedValue({
        message: "Already invited, actually.",
      });
      const user = userEvent.setup();

      render(<InviteRequestForm variant={voice} />);
      await user.type(emailField(), "stranger@example.com");
      await user.click(submitButton(voice));

      await screen.findByRole("heading", {
        name: VOICES[voice].successHeading,
      });
      expect(document.body.textContent).not.toContain("Already invited");
    },
  );

  it("shows the API's message on any other status, and keeps the form", async () => {
    requestInvite.mockRejectedValue({
      response: {
        status: 429,
        data: { detail: "Too many requests. Please try again later." },
      },
    });
    const user = userEvent.setup();

    render(<InviteRequestForm />);
    await user.type(emailField(), "stranger@example.com");
    await user.click(submitButton("generic"));

    expect(
      await screen.findByText("Too many requests. Please try again later."),
    ).toBeInTheDocument();
    expect(emailField()).toBeInTheDocument();
  });

  // The sign-in form's schema, so the two fields reject the same things and say
  // the same thing about them. The address here is deliberately one the browser's
  // own `type="email"` check accepts and the schema does not - anything cruder
  // never reaches the resolver, and the test would then be pinning the browser
  // rather than this form.
  it("rejects a malformed address before it reaches the API", async () => {
    const user = userEvent.setup();

    render(<InviteRequestForm />);
    await user.type(emailField(), "stranger@localhost");
    await user.click(submitButton("generic"));

    expect(
      await screen.findByText("Please enter a valid email address"),
    ).toBeInTheDocument();
    await waitFor(() => expect(requestInvite).not.toHaveBeenCalled());
  });

  // Two audiences have a way in - a member with an account and a stranger holding
  // an invitation - and the line names both before it sends them to `/signin`,
  // in either voice: who may sign in does not depend on who runs the instance.
  // It used to name a third, the operator "setting this instance up", and no
  // longer does: that audience exists for one moment, before the first account
  // is created, and the install and troubleshooting docs already send the
  // operator to Sign In for it. A clause on every stranger's screen for a
  // one-time reader was the wrong place to say it.
  it.each(BOTH)(
    "points members and invitees at /signin in the %s voice",
    (voice) => {
      render(<InviteRequestForm variant={voice} />);

      const link = screen.getByRole("link", { name: /sign in/i });
      expect(link).toHaveAttribute("href", "/signin");
      expect(document.body.textContent).toContain(
        "Have an account or an invitation?",
      );
      expect(document.body.textContent).not.toContain(
        "setting this instance up",
      );
    },
  );

  // No passkey ceremony, no Google button, no `webauthn` autofill hint: this is
  // not the sign-in surface, and offering a passkey on a field that cannot sign
  // anyone in would be an odd thing to do. All three are on `/signin`.
  it.each(BOTH)(
    "arms nothing that signs anyone in, in the %s voice",
    (voice) => {
      render(<InviteRequestForm variant={voice} />);

      expect(emailField()).toHaveAttribute("autocomplete", "email");
      expect(screen.queryByRole("button", { name: /passkey/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
    },
  );
});
