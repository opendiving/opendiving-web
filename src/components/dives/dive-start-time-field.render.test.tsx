import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveStartTimeField } from "./dive-start-time-field";

// The composite field owns the one conversion in the app that turns two
// controls into a single ISO `start_time`, so what it does with a half-empty
// pair is its own question rather than either control's.

function Field({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DiveStartTimeField value={value} onChange={setValue} />
      <output data-testid="committed">{value}</output>
    </>
  );
}

const box = () => screen.getByRole("textbox");
const committed = () => screen.getByTestId("committed").textContent;

describe("DiveStartTimeField", () => {
  it("keeps a typed edit and the dive's own offset together", async () => {
    render(<Field initial="2021-04-04T10:04:47+02:00" />);

    await userEvent.clear(box());
    await userEvent.type(box(), "2021-04-04 11:30:00");
    await userEvent.tab();

    expect(committed()).toBe("2021-04-04T11:30:00+02:00");
  });

  it("empties the whole value when the box is emptied", async () => {
    // Not `combineStartTime("", 120)`, which is the bare string "+02:00": it
    // has no time for the offset matcher to anchor on, so it reads back as an
    // offsetless value, `new Date()` refuses it, and the field redraws as
    // "NaN-NaN-NaN NaN:NaN:NaN" beside an offset that has gone "Not recorded".
    render(<Field initial="2021-04-04T10:04:47+02:00" />);

    await userEvent.clear(box());
    await userEvent.tab();

    expect(committed()).toBe("");
    expect(box()).toHaveValue("");
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
