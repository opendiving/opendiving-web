import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { page } from "vitest/browser";

import { Input } from "./input";
import { NativeSelect } from "./native-select";
import { Textarea } from "./textarea";

// **Load-bearing, and it looks like a stray import** - the same one the other
// browser tests here carry. Without the stylesheet none of the Tailwind classes
// below compute to anything and every assertion reads 16px from the UA default,
// passing whatever the class string says.
import "@/app/globals.css";

// The invariant is a number a browser has to measure, not a class string: iOS
// Safari zooms the page in when it focuses a field computing to *under* 16px,
// and it never zooms back out, so every fixed overlay afterwards is laid out
// wider than the screen. jsdom answers no layout question and would only be
// re-stating the `className` this file is here to justify, which is why this is
// in the browser lane and why it resizes the viewport rather than asserting
// whatever width the runner happens to give it.
//
// 768px is Tailwind's `md`. The narrow case is the one that matters; the wide
// one is here so that "fix" the mobile regression by dropping the breakpoint
// and making every desktop input 16px fails too, rather than quietly changing
// the density this app is drawn at.
const NARROW = 393;
const WIDE = 1024;

function fontSizeOf(element: Element) {
  return parseFloat(getComputedStyle(element).fontSize);
}

describe("focusable fields against iOS's focus zoom", () => {
  it("renders a text input at 16px on a phone, and 14px from md up", async () => {
    const { getByRole } = render(<Input aria-label="Name" />);
    const input = getByRole("textbox");

    await page.viewport(NARROW, 700);
    expect(fontSizeOf(input)).toBeGreaterThanOrEqual(16);

    await page.viewport(WIDE, 700);
    expect(fontSizeOf(input)).toBe(14);
  });

  it("does the same for a textarea", async () => {
    const { getByRole } = render(<Textarea aria-label="Notes" />);
    const textarea = getByRole("textbox");

    await page.viewport(NARROW, 700);
    expect(fontSizeOf(textarea)).toBeGreaterThanOrEqual(16);

    await page.viewport(WIDE, 700);
    expect(fontSizeOf(textarea)).toBe(14);
  });

  it("does the same for a `NativeSelect`", async () => {
    // The dive form's ppO₂ limit, Role, Usage and water type are plain
    // `<select>`s rather than the Radix one, because they need an empty option -
    // and a `<select>` is a field iOS zooms for exactly like a text box. They
    // borrow their box from `inputClassName` through `NativeSelect`, so this is
    // where that reaches them.
    const { getByRole } = render(
      <NativeSelect aria-label="Role">
        <option value="">Not recorded</option>
      </NativeSelect>,
    );
    const select = getByRole("combobox");

    await page.viewport(NARROW, 700);
    expect(fontSizeOf(select)).toBeGreaterThanOrEqual(16);

    await page.viewport(WIDE, 700);
    expect(fontSizeOf(select)).toBe(14);
  });
});
