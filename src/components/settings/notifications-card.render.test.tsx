import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationsCard } from "./notifications-card";
import type { User } from "@/lib/api/auth";

// One switch per scheduled email. What a render reaches is the wiring: each switch
// PATCHes its own key and nothing else, and a field the API did not send reads as on.

// Hoisted and returned by identity, as in `units-card.render.test.tsx` - see "The
// new-dive render test was in a loop with itself" in DECISIONS.md.
const auth = vi.hoisted(() => ({
  user: {} as Partial<User>,
  refreshUser: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/lib/api/auth", () => ({
  authAPI: { updateProfile: vi.fn() },
}));

const { authAPI } = await import("@/lib/api/auth");
const updateProfile = vi.mocked(authAPI.updateProfile);

const SWITCHES = [
  ["gear_service_emails", /gear is due for service/i],
  ["renewal_reminder_emails", /certification or my insurance is expiring/i],
  ["year_in_review_emails", /year in review/i],
] as const;

beforeEach(() => {
  for (const key of Object.keys(auth.user)) {
    delete auth.user[key as keyof User];
  }
  auth.user.uuid = "user-1";
  auth.refreshUser.mockReset().mockResolvedValue(undefined);
  updateProfile.mockReset().mockResolvedValue(undefined);
});

describe("NotificationsCard", () => {
  it("has one switch per scheduled email", () => {
    render(<NotificationsCard />);

    expect(screen.getAllByRole("switch")).toHaveLength(SWITCHES.length);
  });

  it.each(SWITCHES)(
    "reads %s as on when the API did not send it",
    (_key, label) => {
      render(<NotificationsCard />);

      expect(screen.getByRole("switch", { name: label })).toBeChecked();
    },
  );

  it.each(SWITCHES)(
    "shows %s off when the account turned it off",
    (key, label) => {
      auth.user[key] = false;
      render(<NotificationsCard />);

      expect(screen.getByRole("switch", { name: label })).not.toBeChecked();
    },
  );

  it.each(SWITCHES)(
    "saves %s alone on change and re-reads the user",
    async (key, label) => {
      render(<NotificationsCard />);

      await userEvent.click(screen.getByRole("switch", { name: label }));

      // Only the field that changed - `PATCH /user` is `extra="forbid"`, and a body
      // carrying anything else would be a 422 rather than a save.
      await waitFor(() =>
        expect(updateProfile).toHaveBeenCalledWith({ [key]: false }),
      );
      expect(auth.refreshUser).toHaveBeenCalled();
    },
  );

  it("says so when the save fails", async () => {
    updateProfile.mockRejectedValue(new Error("nope"));
    render(<NotificationsCard />);

    await userEvent.click(screen.getByRole("switch", { name: SWITCHES[1][1] }));

    expect(
      await screen.findByText("Failed to save. Please try again."),
    ).toBeInTheDocument();
  });
});
