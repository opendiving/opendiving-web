import { act } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveFormSection } from "./dive-form-section";
import {
  DiveFormSectionsProvider,
  useDiveFormSections,
} from "./dive-form-sections";
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

// A section inside a dive form, which is what gives its stuck heading the
// sections control.
function InForm() {
  const sections = useDiveFormSections();
  return (
    <DiveFormSectionsProvider sections={sections}>
      <DiveFormSection title="Gear" open onOpenChange={() => {}}>
        <p>Fields</p>
      </DiveFormSection>
    </DiveFormSectionsProvider>
  );
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

  it("leads its heading with the section's glyph, which says nothing", () => {
    renderSection();

    const heading = screen.getByRole("heading", { name: "Gear" });
    const glyph = heading.querySelector("svg");
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(heading).toHaveTextContent(/^Gear$/);
  });

  it("offers the form's sections from its heading once it is stuck", async () => {
    render(<InForm />);
    expect(
      screen.queryByRole("button", { name: "Sections" }),
    ).not.toBeInTheDocument();

    act(() => scrollPast());
    await userEvent.click(screen.getByRole("button", { name: "Sections" }));

    const index = screen.getByRole("navigation", { name: "Sections" });
    expect(
      within(index).getByRole("button", { name: "Gear" }),
    ).toBeInTheDocument();
  });
});
