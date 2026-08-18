import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  UnitNumberInput,
  type UnitNumberInputProps,
} from "./unit-number-input";

// What only a render reaches: that a diver typing whole feet gets those same whole
// feet back after the box has been through metres and a `<input type="number">`.
// `lib/units.test.ts` proves the arithmetic; this proves the wiring around it - the
// draft state, the two cleared sentinels, and the converted native bounds.

// Controlled, like the react-hook-form fields this stands in for: `onChange` is
// what moves the value, so a component that fails to emit shows up as a box that
// will not type.
function Harness({
  onCommit,
  initial = null,
  ...props
}: Omit<UnitNumberInputProps, "value" | "onChange"> & {
  onCommit?: (value: number | null | "") => void;
  initial?: number | null | "";
}) {
  const [value, setValue] = useState<number | null | "">(initial);

  return (
    <UnitNumberInput
      {...props}
      aria-label="measurement"
      value={value}
      onChange={(next) => {
        setValue(next);
        onCommit?.(next);
      }}
    />
  );
}

const box = () => screen.getByLabelText("measurement") as HTMLInputElement;

describe("UnitNumberInput in imperial", () => {
  it("shows a stored metric value in whole imperial units", () => {
    render(
      <Harness dimension="depth" units="imperial" initial={30.48} />, //
    );
    expect(box().value).toBe("100");
  });

  it("commits the metres behind what was typed", async () => {
    const onCommit = vi.fn();
    render(
      <Harness dimension="depth" units="imperial" onCommit={onCommit} />, //
    );

    await userEvent.type(box(), "100");

    expect(onCommit).toHaveBeenLastCalledWith(30.48);
  });

  // The round trip that the whole entry design rests on: 98 ft is 29.8704 m, which
  // is committed as 29.87 and reads back as the 98 ft it came from.
  it("reads back what the diver typed, after a blur reformats it", async () => {
    render(<Harness dimension="depth" units="imperial" />);

    await userEvent.type(box(), "98");
    await userEvent.tab();

    expect(box().value).toBe("98");
  });

  it("commits whole metres for an integer dimension", async () => {
    const onCommit = vi.fn();
    render(
      <Harness dimension="altitude" units="imperial" onCommit={onCommit} />,
    );

    await userEvent.type(box(), "1220");
    await userEvent.tab();

    expect(onCommit).toHaveBeenLastCalledWith(372);
    expect(box().value).toBe("1220");
  });

  // The accepted loss, pinned here as well as in `units.test.ts` so it is visible
  // where a diver would meet it: an `Integer` column cannot hold the metres 50 ft
  // is, and 15 m reads back as 49 ft.
  it("loses a foot of visibility to the integer column", async () => {
    const onCommit = vi.fn();
    render(
      <Harness dimension="visibility" units="imperial" onCommit={onCommit} />,
    );

    await userEvent.type(box(), "50");
    await userEvent.tab();

    expect(onCommit).toHaveBeenLastCalledWith(15);
    expect(box().value).toBe("49");
  });

  it("steps by one and converts its bounds inward", () => {
    render(
      <Harness
        dimension="altitude"
        units="imperial"
        min={-450}
        max={6500}
        placeholderValue={372}
      />,
    );

    expect(box().step).toBe("1");
    expect(box().min).toBe("-1476");
    expect(box().max).toBe("21325");
    expect(box().placeholder).toBe("e.g. 1220");
  });

  it("accepts an altitude below sea level", async () => {
    const onCommit = vi.fn();
    render(
      <Harness
        dimension="altitude"
        units="imperial"
        min={-450}
        onCommit={onCommit}
      />,
    );

    await userEvent.type(box(), "-1411");
    await userEvent.tab();

    expect(onCommit).toHaveBeenLastCalledWith(-430);
    expect(box().value).toBe("-1411");
  });

  // Why the box keeps a draft of what is being typed. Committing on every
  // keystroke without one, the *converted* value would be written straight back
  // under the cursor: 50 ft commits 15 m, and 15 m is 49 ft, so the "0" would turn
  // into a "9" as it was typed. The correction belongs on blur, not mid-word.
  it("does not reformat under the cursor while typing", async () => {
    render(<Harness dimension="visibility" units="imperial" />);

    await userEvent.type(box(), "50");
    expect(box().value).toBe("50");

    await userEvent.tab();
    expect(box().value).toBe("49");
  });
});

describe("UnitNumberInput in metric", () => {
  // Metric is the pass-through case, and it has to stay one: a value imported at
  // three decimals is legible as the three decimals it is until the diver edits it.
  it("shows the stored value untouched", () => {
    render(<Harness dimension="depth" units="metric" initial={18.288} />);
    expect(box().value).toBe("18.288");
  });

  it("keeps the caller's step, bounds and placeholder", () => {
    render(
      <Harness
        dimension="temperature"
        units="metric"
        step="0.01"
        min={-50}
        max={50}
        placeholderValue={22.5}
      />,
    );

    expect(box().step).toBe("0.01");
    expect(box().min).toBe("-50");
    expect(box().max).toBe("50");
    expect(box().placeholder).toBe("e.g. 22.5");
  });

  // The one deliberate change on the metric side, and invisible for anything typed
  // at the step: entry now rounds to the API's own two decimals, which is what the
  // temperature box already did and its float siblings didn't.
  it("rounds entry to two decimals", async () => {
    const onCommit = vi.fn();
    render(
      <Harness
        dimension="depth"
        units="metric"
        step="0.01"
        onCommit={onCommit}
      />,
    );

    await userEvent.type(box(), "30.526");

    expect(onCommit).toHaveBeenLastCalledWith(30.53);
  });
});

describe("UnitNumberInput's cleared sentinel", () => {
  // Both spellings are real and in use, and a box that only spoke one of them would
  // silently change what the other's form submits.
  it("clears to null by default", async () => {
    const onCommit = vi.fn();
    render(
      <Harness
        dimension="depth"
        units="metric"
        initial={30}
        onCommit={onCommit}
      />,
    );

    await userEvent.clear(box());

    expect(onCommit).toHaveBeenLastCalledWith(null);
  });

  it("clears to the empty string when asked to", async () => {
    const onCommit = vi.fn();
    render(
      <Harness
        dimension="pressure"
        units="metric"
        emptyValue=""
        initial={200}
        onCommit={onCommit}
      />,
    );

    await userEvent.clear(box());

    expect(onCommit).toHaveBeenLastCalledWith("");
  });
});
