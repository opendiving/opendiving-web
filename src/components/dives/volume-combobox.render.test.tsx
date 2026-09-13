import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VolumeCombobox } from "./volume-combobox";
import type { UnitSystem } from "@/lib/units";

// `vi.hoisted` because a `vi.mock` factory is lifted above every other statement
// in the file, so it cannot close over a plain `let` declared here. The box is
// what lets a test set the diver's system before rendering.
const account = vi.hoisted(() => ({ units: "metric" as UnitSystem }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: account.units } }),
}));

beforeEach(() => {
  account.units = "metric";
});

// The field is a text input wearing `role="combobox"`, and it used to be a number
// input wearing the same role - which ARIA does not allow on a `spinbutton`. The
// swap is safe only because a draft string now sits between the keystrokes and the
// `number` the form holds, so that is what these pin: a decimal has to survive
// being typed, and the committed value has to win once typing stops.

function Harness({ initial }: { initial?: number | "" }) {
  // `number | ""`, which is what the mixture form field holds: `""` is the cleared
  // state a cylinder with no recorded size sits in, and `undefined` is the one
  // spelling that cannot be used - react-hook-form re-displays a field's default the
  // moment its value resolves to it.
  const [value, setValue] = useState<number | "" | undefined>(initial);
  return (
    <>
      <VolumeCombobox value={value} onChange={setValue} />
      <button type="button">elsewhere</button>
      <output data-testid="committed">
        {typeof value === "number" ? value : "-"}
      </output>
      <output data-testid="cleared-as">
        {value === "" ? "empty string" : ""}
      </output>
    </>
  );
}

const field = () => screen.getByRole("combobox");
const committed = () => screen.getByTestId("committed").textContent;
const optionNames = () =>
  screen.getAllByRole("option").map((option) => option.textContent);

describe("VolumeCombobox", () => {
  it("carries the combobox role on a type ARIA allows it on", () => {
    // `input[type=number]` is a spinbutton, and `role="combobox"` on one is the
    // `aria-allowed-role` failure this replaced.
    render(<Harness />);

    expect(field()).toHaveAttribute("type", "text");
    expect(field()).toHaveAttribute("inputmode", "decimal");
  });

  it("lets a decimal be typed all the way through", async () => {
    // The regression this guards: parsing "11." to 11 and rendering it back used
    // to delete the "." as soon as it was pressed, so 11.1 could not be entered
    // at all.
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.keyboard("11.1");

    expect(field()).toHaveValue("11.1");
    expect(committed()).toBe("11.1");
  });

  it("holds the half-typed number on screen while it is incomplete", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.keyboard("11.");

    // Shown as typed, committed as the number it parses to so far.
    expect(field()).toHaveValue("11.");
    expect(committed()).toBe("11");
  });

  it("settles back to the committed value when the field is left", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.keyboard("11.");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(field()).toHaveValue("11");
  });

  it("shows a picked preset rather than the query that opened the menu", async () => {
    // The draft has to be dropped on select, or the input keeps rendering what
    // was typed and the preset only lands in the form state.
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.keyboard("9");
    await user.click(screen.getByRole("option", { name: /11\.1 L \(AL80\)/ }));

    expect(field()).toHaveValue("11.1");
    expect(committed()).toBe("11.1");
  });

  it("empties the committed value when the text stops being a number", async () => {
    const user = userEvent.setup();
    render(<Harness initial={12} />);

    await user.clear(field());

    expect(committed()).toBe("-");
    // And spells it `""`, not `undefined`. A cylinder may record a mix with no
    // vessel, so clearing this box is a value the form has to submit rather than a
    // field it never filled - and `undefined` is the one spelling react-hook-form
    // reads as "show the default", which would fill the box straight back in.
    expect(screen.getByTestId("cleared-as")).toHaveTextContent("empty string");
  });

  it("shows an empty box for a cylinder whose size was never recorded", async () => {
    render(<Harness initial="" />);

    expect(field()).toHaveValue("");
  });

  // The two lists below are the whole of what `volumeOptionsFor` decides, and they
  // are written out rather than derived from `VOLUME_OPTIONS` so that a preset
  // added to the wrong system's list fails here instead of agreeing with itself.
  // Order matters too: both are ascending by litres, which is the quantity stored.
  it("offers the European sizes in metric, plus the two US ones met on a rental boat", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());

    expect(optionNames()).toEqual([
      "3 L",
      "5 L",
      "5.7 L (AL40)",
      "7 L",
      "10 L",
      "11.1 L (AL80)",
      "12 L",
      "14 L (2x7 L)",
      "15 L",
      "18 L",
      "20 L",
      "24 L (2x12 L)",
      "30 L (2x15 L)",
    ]);
  });

  it("offers the AL/HP/LP sizes in imperial, each led by its name", async () => {
    // Including the two 15 L steels, which is the case a value-keyed list could
    // not render: the HP117 and the LP95 differ by working pressure, which the
    // mixture does not record, so they share a litre figure and nothing else.
    account.units = "imperial";
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());

    expect(optionNames()).toEqual([
      "AL40 (5.7 L)",
      "AL50 (7.1 L)",
      "AL63 (9 L)",
      "AL72 (10 L)",
      "HP80 (10.2 L)",
      "AL80 (11.1 L)",
      "HP100 (12.9 L)",
      "LP85 (13 L)",
      "AL100 (13.2 L)",
      "HP117 (15 L)",
      "LP95 (15 L)",
      "HP120 (15.3 L)",
      "HP130 (16 L)",
      "LP108 (17 L)",
      "LP121 (19 L)",
      "2x AL80 (22.2 L)",
    ]);
  });

  it("commits the litres of an imperial preset picked by its cu-ft name", async () => {
    // The name leads the row and the litres are what lands in the form: there is
    // no cu-ft value anywhere in this field, only a cu-ft *label*.
    account.units = "imperial";
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.click(screen.getByRole("option", { name: "HP80 (10.2 L)" }));

    expect(field()).toHaveValue("10.2");
    expect(committed()).toBe("10.2");
  });
});
