import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Waves } from "lucide-react";

import { NativeSelect } from "./native-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

// Load-bearing: the browser project renders no `app/layout.tsx`, so without this
// none of the Tailwind below computes and every box measures 0.
import "@/app/globals.css";

// Where an arrow lands is a browser's question - jsdom zeroes every rect, so the
// jsdom lane would pass against the UA arrow this file exists to reject.
function chevronOf(field: Element) {
  const chevron = field.querySelector("svg");
  if (!chevron) throw new Error("no chevron drawn");
  return chevron.getBoundingClientRect();
}

describe("a native picker's chevron against the Radix one", () => {
  it("insets it from the field's right edge exactly as `SelectTrigger` does", () => {
    const { getByRole, getByLabelText } = render(
      <div className="w-96">
        <NativeSelect aria-label="Water type">
          <option value="">Not recorded</option>
        </NativeSelect>
        <Select>
          <SelectTrigger aria-label="UTC offset">
            <SelectValue placeholder="UTC offset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">UTC+00:00</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    );

    const native = getByRole("combobox", { name: "Water type" });
    const radix = getByLabelText("UTC offset");

    const nativeBox = native.getBoundingClientRect();
    const radixBox = radix.getBoundingClientRect();

    // The measurement is the gap between the arrow and the border beside it,
    // which is what reads as misaligned on a form row carrying one of each.
    // The UA's own arrow sits at a different gap and draws a different glyph,
    // so this fails the moment a picker loses its own chevron.
    const nativeInset =
      nativeBox.right - chevronOf(native.parentElement!).right;
    const radixInset = radixBox.right - chevronOf(radix).right;

    expect(nativeInset).toBeCloseTo(radixInset, 1);
    expect(nativeInset).toBeGreaterThan(0);

    // Centred on the box, the other half of sitting where the Radix one sits.
    const centerY = (box: DOMRect) => box.top + box.height / 2;
    expect(centerY(chevronOf(native.parentElement!))).toBeCloseTo(
      centerY(nativeBox),
      1,
    );
  });

  it("leaves a leading adornment on top of the box, not under it", () => {
    const { getByRole } = render(
      // The dive form's Water type field: an icon absolutely positioned against
      // a wrapper the picker is only part of. A `relative` wrapper inside
      // `NativeSelect` would paint after that icon and hide it behind the box.
      <div className="relative w-96">
        <Waves
          data-testid="adornment"
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
        />
        <NativeSelect aria-label="Water type" className="pl-9">
          <option value="">Not recorded</option>
        </NativeSelect>
      </div>,
    );

    const icon = document.querySelector('[data-testid="adornment"]')!;
    const box = icon.getBoundingClientRect();
    const onTop = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );

    expect(icon.contains(onTop) || icon === onTop).toBe(true);
    expect(getByRole("combobox", { name: "Water type" })).toBeTruthy();
  });
});
