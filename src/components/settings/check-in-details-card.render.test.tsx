import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckInDetailsCard } from "./check-in-details-card";
import type { User } from "@/lib/api/auth";

// What a render reaches here is the wiring: the body that leaves on save, that
// clearing a group sends nulls rather than leaving the row as it was, and that a
// birth date in the future never becomes a request at all.

// The whole value is hoisted and returned by identity, `user` included - the real
// `AuthContext` holds it in state and keeps one identity across renders, and this card
// resets its form from `user` in an effect, so a mock rebuilding the object per render
// would reset the form under every keystroke. Varying a field means writing to
// `auth.user`. See "The new-dive render test was in a loop with itself" in DECISIONS.md.
const auth = vi.hoisted(() => ({
  user: {
    uuid: "user-1",
    name: "Sam",
    username: "sam",
    email: "sam@example.com",
    units: "metric",
    dive_form_hidden_fields: [],
  } as User,
  refreshUser: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/lib/api/auth", () => ({
  authAPI: { updateProfile: vi.fn() },
}));

vi.mock("@/components/ui/use-toast", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

const { authAPI } = await import("@/lib/api/auth");
const updateProfile = vi.mocked(authAPI.updateProfile);

const EMPTY_DETAILS = {
  date_of_birth: null,
  phone: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  emergency_contact_relationship: null,
  insurance_provider: null,
  insurance_policy_number: null,
  insurance_expires_on: null,
};

beforeEach(() => {
  Object.assign(auth.user, {
    date_of_birth: null,
    phone: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_relationship: null,
    insurance_provider: null,
    insurance_policy_number: null,
    insurance_expires_on: null,
  });
  auth.refreshUser.mockReset().mockResolvedValue(undefined);
  updateProfile.mockReset().mockResolvedValue(undefined);
});

const save = () => screen.getByRole("button", { name: /save changes/i });

describe("CheckInDetailsCard", () => {
  it("shows what the account already holds", () => {
    Object.assign(auth.user, {
      phone: "+44 7700 900000",
      emergency_contact_name: "Alex",
      insurance_provider: "DAN Europe",
    });
    render(<CheckInDetailsCard />);

    expect(screen.getByLabelText("Phone number")).toHaveValue(
      "+44 7700 900000",
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Alex");
    expect(screen.getByLabelText("Provider")).toHaveValue("DAN Europe");
  });

  it("sends its own fields and no others, then re-reads the user", async () => {
    render(<CheckInDetailsCard />);

    await userEvent.type(screen.getByLabelText("Phone number"), "0123");
    await userEvent.type(screen.getByLabelText("Name"), "Alex");
    await userEvent.type(screen.getByLabelText("Their phone number"), "0456");
    await userEvent.type(
      screen.getByLabelText("Relationship to you"),
      "Partner",
    );
    await userEvent.type(screen.getByLabelText("Provider"), "DAN Europe");
    await userEvent.type(screen.getByLabelText("Policy number"), "P-42");
    await userEvent.click(save());

    // Exactly the card's eight keys: `PATCH /user` is `extra="forbid"`, so a body
    // carrying anything else is a 422 rather than a save.
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        ...EMPTY_DETAILS,
        phone: "0123",
        emergency_contact_name: "Alex",
        emergency_contact_phone: "0456",
        emergency_contact_relationship: "Partner",
        insurance_provider: "DAN Europe",
        insurance_policy_number: "P-42",
      }),
    );
    // The re-read is what repaints the card from the row rather than from the boxes.
    expect(auth.refreshUser).toHaveBeenCalled();
  });

  it("clears a group with explicit nulls rather than leaving it behind", async () => {
    Object.assign(auth.user, {
      emergency_contact_name: "Alex",
      emergency_contact_phone: "0456",
      emergency_contact_relationship: "Partner",
    });
    render(<CheckInDetailsCard />);

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.clear(screen.getByLabelText("Their phone number"));
    await userEvent.clear(screen.getByLabelText("Relationship to you"));
    await userEvent.click(save());

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(EMPTY_DETAILS),
    );
  });

  it("refuses a birth date in the future before any request", async () => {
    render(<CheckInDetailsCard />);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = tomorrow.toISOString().slice(0, 10);

    await userEvent.type(screen.getByLabelText("Date of birth"), iso);
    await userEvent.click(save());

    expect(
      await screen.findByText("Date of birth cannot be in the future"),
    ).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("says so when the save fails", async () => {
    updateProfile.mockRejectedValue(new Error("nope"));
    render(<CheckInDetailsCard />);

    await userEvent.click(save());

    expect(
      await screen.findByText("Failed to save. Please try again."),
    ).toBeInTheDocument();
  });
});
