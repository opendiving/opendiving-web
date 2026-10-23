import { act } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveFormSection } from "./dive-form-section";
import { useDiveFormSections } from "./dive-form-sections";
import { SectionIndexProvider } from "@/components/ui/section-index";
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

// Sections inside a dive form, which is what gives a stuck heading the sections
// control - an index of more than one.
function InForm() {
  const sections = useDiveFormSections();
  return (
    <SectionIndexProvider index={sections.index}>
      <DiveFormSection title="Gear" open onOpenChange={() => {}}>
        <p>Fields</p>
      </DiveFormSection>
      <DiveFormSection title="Notes" open onOpenChange={() => {}}>
        <p>Notes fields</p>
      </DiveFormSection>
    </SectionIndexProvider>
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

    act(() =>
      scrollPast(
        screen
          .getByRole("heading", { name: "Gear" })
          .closest<HTMLElement>('[tabindex="-1"]')!,
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Sections" }));

    const index = screen.getByRole("navigation", { name: "Sections" });
    expect(
      within(index)
        .getAllByRole("button")
        .map((entry) => entry.textContent),
    ).toEqual(["Gear", "Notes"]);
  });

  it("offers no sections control where the form has only the one", () => {
    function Alone() {
      const sections = useDiveFormSections();
      return (
        <SectionIndexProvider index={sections.index}>
          <DiveFormSection title="Gear" open onOpenChange={() => {}}>
            <p>Fields</p>
          </DiveFormSection>
        </SectionIndexProvider>
      );
    }
    render(<Alone />);

    act(() => scrollPast());

    expect(
      screen.queryByRole("button", { name: "Sections" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gear" })).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Gear" })
        .querySelector("svg.lucide-chevron-down"),
    ).not.toHaveClass("max-lg:hidden");
  });
});
