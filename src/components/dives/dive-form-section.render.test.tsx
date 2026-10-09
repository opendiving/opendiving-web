import { act } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveFormSection } from "./dive-form-section";
import { scrollPast } from "@/test/intersection";

// Whether a heading is stuck is the observer's answer, so `scrollPast` stands in
// for the reader having scrolled the section's top under the site header.

function renderSection() {
  const onOpenChange = vi.fn();
  render(
    <DiveFormSection title="Gear" open onOpenChange={onOpenChange}>
      <p>Fields</p>
    </DiveFormSection>,
  );
  return onOpenChange;
}

describe("DiveFormSection", () => {
  it("collapses on a click while its heading sits in place", async () => {
    const onOpenChange = renderSection();

    await userEvent.click(screen.getByRole("button", { name: "Gear" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("scrolls back to its top on a click while its heading is stuck", async () => {
    const onOpenChange = renderSection();
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    act(() => scrollPast());

    await userEvent.click(screen.getByRole("button", { name: "Gear" }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
  });
});
