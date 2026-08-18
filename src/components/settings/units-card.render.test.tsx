import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnitsCard } from "./units-card";
import type { UnitSystem } from "@/lib/units";

// The card is one `<select>`, so what a render reaches is the wiring: that picking a
// system PATCHes only that field and then re-reads the user, and that a failed save
// says so instead of leaving the box showing a choice the server never took.

const auth = vi.hoisted(() => ({
  units: "metric" as UnitSystem,
  refreshUser: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uuid: "user-1", units: auth.units },
    refreshUser: auth.refreshUser,
  }),
}));

vi.mock("@/lib/api/auth", () => ({
  authAPI: { updateProfile: vi.fn() },
}));

const { authAPI } = await import("@/lib/api/auth");
const updateProfile = vi.mocked(authAPI.updateProfile);

beforeEach(() => {
  auth.units = "metric";
  auth.refreshUser.mockReset().mockResolvedValue(undefined);
  updateProfile.mockReset().mockResolvedValue(undefined);
});

const picker = () => screen.getByLabelText("Measurement system");

describe("UnitsCard", () => {
  it("shows the account's current system", () => {
    auth.units = "imperial";
    render(<UnitsCard />);

    expect((picker() as HTMLSelectElement).value).toBe("imperial");
  });

  it("saves on change and re-reads the user", async () => {
    render(<UnitsCard />);

    await userEvent.selectOptions(picker(), "imperial");

    // Only the field that changed - `PATCH /user` is `extra="forbid"`, and a body
    // carrying anything else would be a 422 rather than a save.
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ units: "imperial" }),
    );
    // The re-read is what makes every mounted component re-render converted,
    // which is why there is no reload step and no Save button.
    expect(auth.refreshUser).toHaveBeenCalled();
  });

  it("says so when the save fails", async () => {
    updateProfile.mockRejectedValue(new Error("nope"));
    render(<UnitsCard />);

    await userEvent.selectOptions(picker(), "imperial");

    expect(
      await screen.findByText("Failed to save. Please try again."),
    ).toBeInTheDocument();
  });

  it("names both systems by the units they mean, not just by their names", () => {
    render(<UnitsCard />);

    // A diver who thinks in psi should not have to flip the toggle to find out
    // whether this app agrees with them about what "imperial" covers.
    expect(screen.getByRole("option", { name: /m · °C · bar/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /ft · °F · psi/ })).toBeTruthy();
  });
});
