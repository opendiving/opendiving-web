import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DecimalInput } from "./decimal-input";
import { usePointer } from "@/test/pointer";

function Harness({ onCommit }: { onCommit?: (value: number | "") => void }) {
  const [value, setValue] = useState<number | "">("");
  return (
    <DecimalInput
      aria-label="oxygen"
      min={0}
      max={100}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onCommit?.(next);
      }}
    />
  );
}

const box = () => screen.getByLabelText("oxygen") as HTMLInputElement;

describe("DecimalInput under a finger", () => {
  it("is text on a decimal keypad", () => {
    usePointer("coarse");
    render(<Harness />);

    expect(box()).toHaveAttribute("type", "text");
    expect(box()).toHaveAttribute("inputmode", "decimal");
  });

  it("reads a comma as the decimal point, and keeps it while typing", async () => {
    usePointer("coarse");
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);

    await userEvent.type(box(), "32,");
    expect(box().value).toBe("32,");

    await userEvent.type(box(), "5");
    expect(onCommit).toHaveBeenLastCalledWith(32.5);
  });

  it("shows the number it holds once the diver moves on", async () => {
    usePointer("coarse");
    render(<Harness />);

    await userEvent.type(box(), "32,5");
    await userEvent.tab();

    expect(box().value).toBe("32.5");
  });

  it("refuses a value past its bounds, as a number input would", async () => {
    usePointer("coarse");
    render(<Harness />);

    await userEvent.type(box(), "101");

    expect(box().validationMessage).toBe("Enter 100 or less.");
  });

  it("is emptied rather than guessed when the text is not a number", async () => {
    usePointer("coarse");
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);

    await userEvent.type(box(), "1,2,3");

    expect(onCommit).toHaveBeenLastCalledWith("");
    expect(box().validationMessage).toBe("Enter a number.");
  });
});

describe("DecimalInput for a mouse", () => {
  it("is a number input with no step of its own", () => {
    render(<Harness />);

    expect(box()).toHaveAttribute("type", "number");
    expect(box()).toHaveAttribute("step", "any");
  });
});
