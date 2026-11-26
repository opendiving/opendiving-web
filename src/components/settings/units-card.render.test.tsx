import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnitsCard } from "./units-card";
import type { UnitSystem, UnitPreferenceOverrides } from "@/lib/units";

const auth = vi.hoisted(() => ({
  user: {
    uuid: "user-1",
    units: "metric" as UnitSystem,
    unit_preferences: {} as UnitPreferenceOverrides,
  },
  refreshUser: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api/auth", () => ({ authAPI: { updateProfile: vi.fn() } }));
const { authAPI } = await import("@/lib/api/auth");
const updateProfile = vi.mocked(authAPI.updateProfile);

beforeEach(() => {
  auth.user.units = "metric";
  auth.user.unit_preferences = {};
  auth.refreshUser.mockReset().mockResolvedValue(undefined);
  updateProfile.mockReset().mockResolvedValue({ message: "ok" });
});

const familyButton = (family: string, label: string) =>
  within(screen.getByRole("group", { name: family })).getByRole("button", {
    name: label,
  });

describe("UnitsCard", () => {
  it("shows the account preset and all five families", () => {
    auth.user.units = "imperial";
    render(<UnitsCard />);
    expect(screen.getByRole("button", { name: /Imperial/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const [family, label] of [
      ["Depth and distance", "Feet"],
      ["Pressure", "PSI"],
      ["Gas volume", "Cu ft"],
      ["Weight", "Pounds"],
      ["Temperature", "°F"],
    ]) {
      expect(familyButton(family, label)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  it("saves a preset and clears custom overrides", async () => {
    auth.user.unit_preferences = { pressure: "imperial" };
    render(<UnitsCard />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Imperial/ }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        units: "imperial",
        unit_preferences: {},
      }),
    );
    expect(auth.refreshUser).toHaveBeenCalled();
  });

  it("changes pressure while preserving other families", async () => {
    auth.user.unit_preferences = { depth: "imperial", temperature: "metric" };
    render(<UnitsCard />);
    await userEvent.click(familyButton("Pressure", "PSI"));
    expect(updateProfile).toHaveBeenCalledWith({
      unit_preferences: {
        depth: "imperial",
        pressure: "imperial",
        volume: "metric",
        weight: "metric",
        temperature: "metric",
      },
    });
    await waitFor(() => expect(auth.refreshUser).toHaveBeenCalled());
  });

  it("shows a failed save and keeps the previous selection", async () => {
    updateProfile.mockRejectedValue(new Error("nope"));
    render(<UnitsCard />);
    await userEvent.click(familyButton("Pressure", "PSI"));
    expect(
      await screen.findByText("Failed to save. Please try again."),
    ).toBeInTheDocument();
    expect(familyButton("Pressure", "Bar")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(auth.refreshUser).not.toHaveBeenCalled();
  });

  it("disables all controls until the save and account refresh finish", async () => {
    let finish: (() => void) | undefined;
    updateProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ message: "ok" });
        }),
    );
    render(<UnitsCard />);
    await userEvent.click(familyButton("Pressure", "PSI"));
    expect(familyButton("Temperature", "°F")).toBeDisabled();
    finish?.();
    await waitFor(() =>
      expect(familyButton("Temperature", "°F")).toBeEnabled(),
    );
  });
});
