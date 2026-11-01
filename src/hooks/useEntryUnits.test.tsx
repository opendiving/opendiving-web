import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEntryUnits } from "./useEntryUnits";
import { ENTRY_UNITS_KEY } from "@/lib/entry-units";
import type { UnitSystem, UnitPreferenceOverrides } from "@/lib/units";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// The account preference this hook falls back to, in a box the tests can move -
// `vi.mock`'s factory is hoisted above the file and cannot see an ordinary `let`.
const auth = vi.hoisted(() => ({
  units: "metric" as UnitSystem,
  unit_preferences: {} as UnitPreferenceOverrides,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      uuid: "user-1",
      units: auth.units,
      unit_preferences: auth.unit_preferences,
    },
  }),
}));

// Installed per test - under this runner `window.localStorage` reads back as
// `undefined`, and the module's try/catch would turn that into "no override" for
// every assertion here.
let storage: Storage;

beforeEach(() => {
  auth.units = "metric";
  auth.unit_preferences = {};
  storage = memoryStorage();
  useStorage(storage);
});

function stored() {
  const raw = storage.getItem(ENTRY_UNITS_KEY);
  return raw === null ? null : JSON.parse(raw);
}

describe("useEntryUnits", () => {
  it("follows the account preference with nothing stored", () => {
    const { result } = renderHook(() => useEntryUnits());

    expect(result.current.entryUnits("pressure")).toBe("metric");
    expect(result.current.entryUnitLabel("pressure")).toBe("bar");
    expect(result.current.entryUnits("depth")).toBe("metric");
  });

  it("follows an imperial account with nothing stored", () => {
    auth.units = "imperial";
    const { result } = renderHook(() => useEntryUnits());

    expect(result.current.entryUnits("pressure")).toBe("imperial");
  });

  it("flips one dimension and leaves the others on the account", () => {
    const { result } = renderHook(() => useEntryUnits());

    act(() => result.current.toggleEntryUnits("pressure"));

    expect(result.current.entryUnits("pressure")).toBe("imperial");
    expect(result.current.entryUnits("depth")).toBe("metric");
  });

  it("remembers the flip on this device", () => {
    const { result } = renderHook(() => useEntryUnits());

    act(() => result.current.toggleEntryUnits("pressure"));

    expect(stored()).toEqual({ pressure: "imperial" });
    expect(result.current.entryUnitLabel("pressure")).toBe("psi");
  });

  it("reads a stored override back on a fresh mount", () => {
    storage.setItem(ENTRY_UNITS_KEY, JSON.stringify({ pressure: "imperial" }));
    useStorage(storage);

    const { result } = renderHook(() => useEntryUnits());

    expect(result.current.entryUnits("pressure")).toBe("imperial");
  });

  it("drops the dimension when flipped back to the account system", () => {
    const { result } = renderHook(() => useEntryUnits());

    act(() => result.current.toggleEntryUnits("pressure"));
    act(() => result.current.toggleEntryUnits("pressure"));

    expect(stored()).toBeNull();
    expect(result.current.entryUnits("pressure")).toBe("metric");
  });

  // The regression a `useState`-plus-write-through-effect copy would have
  // introduced: the effect fires once on mount with the empty initial record and
  // erases whatever the diver stored on a previous visit. Writes happen only when
  // a toggle is pressed, so mounting and leaving touches nothing.
  it("never writes on mount or unmount", () => {
    storage.setItem(ENTRY_UNITS_KEY, JSON.stringify({ weight: "imperial" }));
    useStorage(storage);
    const setItem = vi.spyOn(storage, "setItem");
    const removeItem = vi.spyOn(storage, "removeItem");

    const { result, unmount } = renderHook(() => useEntryUnits());
    expect(result.current.entryUnits("weight")).toBe("imperial");
    unmount();

    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(stored()).toEqual({ weight: "imperial" });
  });

  // The reason this store subscribes for real rather than reading
  // `subscribeToNothing` like the chart keys: the gear-set dialog opens from
  // inside the dive form and both render a weight box, so two live consumers
  // share a dimension and must not disagree about it.
  it("keeps a second consumer in step", () => {
    const form = renderHook(() => useEntryUnits());
    const dialog = renderHook(() => useEntryUnits());

    act(() => dialog.result.current.toggleEntryUnits("weight"));

    expect(dialog.result.current.entryUnits("weight")).toBe("imperial");
    expect(form.result.current.entryUnits("weight")).toBe("imperial");
  });

  // Derived from a fresh store read inside the handler, not from the render's own
  // parse: computing from the latter would have both flips in one batch start
  // from the same pre-click record, and the second would silently undo the first.
  it("lands both flips when two are pressed in one batch", () => {
    const { result } = renderHook(() => useEntryUnits());

    act(() => {
      result.current.toggleEntryUnits("depth");
      result.current.toggleEntryUnits("pressure");
    });

    expect(result.current.entryUnits("depth")).toBe("imperial");
    expect(result.current.entryUnits("pressure")).toBe("imperial");
    expect(stored()).toEqual({ depth: "imperial", pressure: "imperial" });
  });

  // An override records the absolute system, so re-theming the account leaves it
  // saying what it always said - here that makes it merely redundant, not
  // inverted, and the unoverridden dimensions follow the account across.
  it("carries unoverridden dimensions with an account-level change", () => {
    const { result, rerender } = renderHook(() => useEntryUnits());
    act(() => result.current.toggleEntryUnits("pressure"));

    auth.units = "imperial";
    rerender();

    expect(result.current.entryUnits("depth")).toBe("imperial");
    expect(result.current.entryUnits("pressure")).toBe("imperial");
    expect(stored()).toEqual({ pressure: "imperial" });
  });
});

it("follows mixed account preferences and keeps entry overrides independent", () => {
  auth.unit_preferences = {
    depth: "imperial",
    temperature: "metric",
    pressure: "imperial",
  };
  const { result, rerender } = renderHook(() => useEntryUnits());
  expect(result.current.entryUnits("depth")).toBe("imperial");
  expect(result.current.entryUnits("visibility")).toBe("imperial");
  expect(result.current.entryUnits("temperature")).toBe("metric");
  act(() => result.current.toggleEntryUnits("pressure"));
  expect(result.current.entryUnits("pressure")).toBe("metric");
  expect(stored()).toEqual({ pressure: "metric" });
  auth.unit_preferences = { ...auth.unit_preferences, depth: "metric" };
  rerender();
  expect(result.current.entryUnits("depth")).toBe("metric");
  expect(result.current.entryUnits("pressure")).toBe("metric");
  act(() => result.current.toggleEntryUnits("pressure"));
  expect(stored()).toBeNull();
});
