import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteRequestForm } from "./invite-request-form";

// What the hero shows on an instance that is not taking registrations, and the
// three things that make it correct: one success state whatever the API stored,
// the API's own message on anything else, and a way through to `/signin` for the
// two people who have one.
const { requestInvite } = vi.hoisted(() => ({ requestInvite: vi.fn() }));

vi.mock("@/lib/api/invitations", () => ({
  invitationsAPI: { requestInvite },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const emailField = () => screen.getByLabelText("Email");
const submitButton = () =>
  screen.getByRole("button", { name: /request an invite/i });

describe("InviteRequestForm", () => {
  it("posts the address and replaces the form with one success state", async () => {
    requestInvite.mockResolvedValue({ message: "Thanks." });
    const user = userEvent.setup();

    render(<InviteRequestForm />);
    await user.type(emailField(), "stranger@example.com");
    await user.click(submitButton());

    expect(await screen.findByText(/request received/i)).toBeInTheDocument();
    expect(requestInvite).toHaveBeenCalledWith("stranger@example.com");
    // The field goes with the form. Leaving it on screen under a success message
    // invites a second submission that could tell the visitor nothing new.
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  // The API answers 202 for a first request, a repeat, an address that already
  // has an account and an address invited last week, and never queries the user
  // table on the way. This form must not be more informative than that, so the
  // success state is one state and carries no fact about what was stored.
  // Pinned as "the response body is not rendered", because that is the shape a
  // future regression would take: a handler that showed `message` would show
  // whatever a differently-configured API decided to say, and the guarantee is
  // that this screen cannot vary by address at all.
  it("renders its own success copy rather than the response body", async () => {
    requestInvite.mockResolvedValue({
      message: "Already invited, actually.",
    });
    const user = userEvent.setup();

    render(<InviteRequestForm />);
    await user.type(emailField(), "stranger@example.com");
    await user.click(submitButton());

    await screen.findByText(/request received/i);
    expect(document.body.textContent).not.toContain("Already invited");
    expect(document.body.textContent).toContain(
      "decides who is invited, and when",
    );
  });

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
    await user.click(submitButton());

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
    await user.click(submitButton());

    expect(
      await screen.findByText("Please enter a valid email address"),
    ).toBeInTheDocument();
    await waitFor(() => expect(requestInvite).not.toHaveBeenCalled());
  });

  // Two audiences have a way in - a member with an account and a stranger holding
  // an invitation - and the line names both before it sends them to `/signin`.
  // It used to name a third, the operator "setting this instance up", and no
  // longer does: that audience exists for one moment, before the first account
  // is created, and the install and troubleshooting docs already send the
  // operator to Sign In for it. A clause on every stranger's screen for a
  // one-time reader was the wrong place to say it.
  it("points members and invitees at /signin", () => {
    render(<InviteRequestForm />);

    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/signin");
    expect(document.body.textContent).toContain(
      "Have an account or an invitation?",
    );
    expect(document.body.textContent).not.toContain("setting this instance up");
  });

  // No passkey ceremony, no Google button, no `webauthn` autofill hint: this is
  // not the sign-in surface, and offering a passkey on a field that cannot sign
  // anyone in would be an odd thing to do. All three are on `/signin`.
  it("arms nothing that signs anyone in", () => {
    render(<InviteRequestForm />);

    expect(emailField()).toHaveAttribute("autocomplete", "email");
    expect(screen.queryByRole("button", { name: /passkey/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
  });
});
