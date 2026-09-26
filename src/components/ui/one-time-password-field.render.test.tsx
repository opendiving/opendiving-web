import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  OneTimePasswordField,
  OneTimePasswordFieldInput,
} from "./one-time-password-field";

function Field() {
  return (
    <OneTimePasswordField aria-label="Code">
      {Array.from({ length: 6 }, (_, index) => (
        <OneTimePasswordFieldInput key={index} index={index} />
      ))}
    </OneTimePasswordField>
  );
}

const boxes = () => screen.getAllByRole("textbox");

// jsdom has no `PointerEvent`; the wrapper and Radix both read only `pointerType`.
const pointerDown = (target: Element, pointerType: string) => {
  const event = new Event("pointerdown", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};

const mouseDown = (target: Element) => {
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("OneTimePasswordField", () => {
  // iOS raises the keyboard only for a box the tap itself focuses, and Radix cancels
  // `pointerdown` to focus it in code instead.
  it("leaves a tap uncancelled, and keeps Radix's handling for a mouse", () => {
    render(<Field />);

    expect(pointerDown(boxes()[0], "touch")).toBe(false);
    expect(pointerDown(boxes()[0], "mouse")).toBe(true);
  });

  // The box past the code is one Radix's roving focus will not let a `mousedown`
  // focus, and on iOS the tap's `mousedown` is what focuses it.
  it("lets a tap's mousedown through to a box past the code", () => {
    render(<Field />);

    pointerDown(boxes()[3], "touch");
    expect(mouseDown(boxes()[3])).toBe(false);

    pointerDown(boxes()[3], "mouse");
    expect(mouseDown(boxes()[3])).toBe(true);
  });

  it("moves a tap past the code typed so far to the next empty box", () => {
    render(<Field />);

    pointerDown(boxes()[3], "touch");
    boxes()[3].focus();
    boxes()[3].click();

    expect(document.activeElement).toBe(boxes()[0]);
  });
});
