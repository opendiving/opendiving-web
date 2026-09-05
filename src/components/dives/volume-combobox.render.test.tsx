import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VolumeCombobox } from "./volume-combobox";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

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
    await user.click(screen.getByRole("option", { name: /11\.1 L \(S80\)/ }));

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
});
