import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnitPreferenceOverrides, UnitSystem } from "@/lib/units";
import { useUnits } from "./useUnits";

const auth = vi.hoisted(() => {
  const state: {
    user:
      | { units: UnitSystem; unit_preferences?: UnitPreferenceOverrides }
      | undefined;
  } = { user: undefined };
  return state;
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

beforeEach(() => {
  auth.user = undefined;
});

describe("useUnits", () => {
  it("formats in metric before an account is available", () => {
    const { result } = renderHook(() => useUnits());

    expect(result.current.formatDepth(30)).toBe("30 m");
    expect(result.current.unitLabel("pressure")).toBe("bar");
    expect(result.current.toDisplayUnits(6, "weight")).toBe(6);
  });

  it("applies a legacy account's preset to every dimension", () => {
    auth.user = { units: "imperial" };
    const { result } = renderHook(() => useUnits());

    expect(result.current.formatDepth(30.48)).toBe("100 ft");
    expect(result.current.formatTemperature(0)).toBe("32°F");
    expect(result.current.unitLabel("rmv")).toBe("cuft/min");
    expect(result.current.toMetricUnits(100, "depth")).toBeCloseTo(30.48);
  });

  it("uses each family's preference for derived measurements too", () => {
    auth.user = {
      units: "metric",
      unit_preferences: { depth: "imperial", pressure: "imperial" },
    };
    const { result } = renderHook(() => useUnits());

    expect(result.current.formatDepth(30.48)).toBe("100 ft");
    expect(result.current.formatPressure(200)).toBe("2901 psi");
    expect(result.current.formatWeight(6)).toBe("6 kg");
    expect(result.current.formatTemperature(0)).toBe("0°C");
    expect(result.current.unitLabel("sac")).toBe("psi/min");
    expect(result.current.unitLabel("rmv")).toBe("L/min");
    expect(result.current.formatVisibility(30.48)).toBe("100 ft");
    expect(result.current.unitSystemFor("speed")).toBe("imperial");
    expect(result.current.formatRmv(18, { decimals: 0 })).toBe("18 L/min");
  });

  it("updates bound formatters when account preferences change", () => {
    auth.user = { units: "metric" };
    const { result, rerender } = renderHook(() => useUnits());
    expect(result.current.formatDepth(30.48)).toBe("30.48 m");

    auth.user = { units: "metric", unit_preferences: { depth: "imperial" } };
    rerender();
    expect(result.current.formatDepth(30.48)).toBe("100 ft");
    expect(result.current.unitLabel("depth")).toBe("ft");
    expect(result.current.displayNumber(30.48, "depth")).toBe("100");

    auth.user = undefined;
    rerender();
    expect(result.current.unitLabel("depth")).toBe("m");
  });
});
