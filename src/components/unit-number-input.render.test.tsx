import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  UnitNumberInput,
  type UnitNumberInputProps,
} from "./unit-number-input";
import type { UnitSystem } from "@/lib/units";

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

  it("keeps the caller's bounds and placeholder", () => {
    render(
      <Harness
        dimension="temperature"
        units="metric"
        min={-50}
        max={50}
        placeholderValue={22.5}
      />,
    );

    expect(box().min).toBe("-50");
    expect(box().max).toBe("50");
    expect(box().placeholder).toBe("e.g. 22.5");
  });

  // `step` is not among them, and that is the point: it is a native *constraint*,
  // so anything finer than the column behind it makes a stored value unsavable
  // with no message anywhere. A `Float` column has no such precision to declare.
  it("leaves a float dimension unconstrained", () => {
    render(<Harness dimension="depth" units="metric" initial={2.70000029} />);

    expect(box().step).toBe("any");
    expect(box().validity.stepMismatch).toBe(false);
  });

  // The two `Integer` columns, where whole numbers *are* the contract - the same
  // answer `isIntegerDimension` gives the parsing and the commit just beside it.
  it("steps an integer dimension by one", () => {
    render(<Harness dimension="visibility" units="metric" initial={15} />);

    expect(box().step).toBe("1");
  });

  // The one deliberate change on the metric side, and invisible for anything typed
  // at the step: entry now rounds to the API's own two decimals, which is what the
  // temperature box already did and its float siblings didn't.
  it("rounds entry to two decimals", async () => {
    const onCommit = vi.fn();
    render(<Harness dimension="depth" units="metric" onCommit={onCommit} />);

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

describe("UnitNumberInput when the entry units change under it", () => {
  // The tempting free lunch - "clicking the toggle blurs the box, and blur already
  // resets the draft" - is false on macOS Safari and Firefox, where clicking a
  // `<button>` moves no focus. jsdom's `userEvent.click` *does* focus, so a test
  // that clicked a toggle would pass with the guard deleted. Hence a test that
  // moves the prop directly and never blurs.
  function UnitSwitchingHarness({
    onCommit,
  }: {
    onCommit?: (value: number | null | "") => void;
  }) {
    const [units, setUnits] = useState<UnitSystem>("imperial");
    const [value, setValue] = useState<number | null | "">(null);

    return (
      <>
        <UnitNumberInput
          dimension="pressure"
          units={units}
          aria-label="measurement"
          emptyValue=""
          value={value}
          onChange={(next) => {
            setValue(next);
            onCommit?.(next);
          }}
        />
        {/* Deliberately not focusable in the way a click would be: this moves the
            prop and nothing else, which is the case the guard exists for. */}
        <button type="button" onClick={() => setUnits("metric")}>
          to metric
        </button>
      </>
    );
  }

  it("re-displays the committed value in the new system", async () => {
    render(<UnitSwitchingHarness />);

    await userEvent.type(box(), "3000");
    expect(box().value).toBe("3000");

    // The draft is still live - the box has never been blurred.
    fireEvent.click(screen.getByText("to metric"));

    expect(box()).toHaveFocus();
    expect(box().value).toBe("206.84");
  });

  it("parses the next keystroke in the new system", async () => {
    const onCommit = vi.fn();
    render(<UnitSwitchingHarness onCommit={onCommit} />);

    await userEvent.type(box(), "3000");
    fireEvent.click(screen.getByText("to metric"));

    // Typed straight on, without clearing first, so what it lands on says which
    // string the box was holding: "206.84" re-displayed in bar, or the stale
    // "3000" draft that would make this 30000.
    await userEvent.type(box(), "0");

    // What it committed is the assertion, not what the box reads: a number input
    // sanitizes the trailing zero back off "206.840" on its own.
    expect(onCommit).toHaveBeenLastCalledWith(206.84);
  });

  it("leaves the draft alone when the units have not moved", async () => {
    render(
      <Harness dimension="depth" units="metric" />, //
    );

    await userEvent.type(box(), "30.526");

    // Still mid-word: the reformat to 30.53 belongs on blur, and a guard that
    // fired on every render would take it here instead.
    expect(box().value).toBe("30.526");
  });
});
