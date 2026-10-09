import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DiveFormSectionIndex,
  DiveFormSectionsProvider,
  useDiveFormSections,
} from "./dive-form-sections";
import { DiveFormSection } from "./dive-form-section";
import { DIVE_SECTION_ICONS } from "./dive-section-icon";
import {
  DIVE_FORM_FIELD_GROUPS,
  type DiveFormFieldGroup,
} from "@/lib/dive-form-fields";
import { scrollPast } from "@/test/intersection";

// The form, reduced to what the index reads: the hook that owns which sections
// are collapsed, and a card per section reporting itself to it. Import is the
// one with an action in place of a chevron, as the real one is.
function Harness({ groups }: { groups: readonly DiveFormFieldGroup[] }) {
  const sections = useDiveFormSections();
  return (
    <DiveFormSectionsProvider sections={sections}>
      <DiveFormSectionIndex />
      {groups.map((group) =>
        group === "Import" ? (
          <DiveFormSection
            key={group}
            title={group}
            action={<button type="button">Upload</button>}
          >
            <p>Files</p>
          </DiveFormSection>
        ) : (
          <DiveFormSection
            key={group}
            title={group}
            open={!sections.collapsedGroups.has(group)}
            onOpenChange={(open) => sections.setGroupOpen(group, open)}
          >
            <p>{group} fields</p>
          </DiveFormSection>
        ),
      )}
    </DiveFormSectionsProvider>
  );
}

function index() {
  return within(screen.getByRole("navigation", { name: "Sections" }));
}

function entries() {
  return index()
    .getAllByRole("button")
    .map((entry) => entry.textContent);
}

// The card a heading belongs to - the focusable ancestor a jump lands on.
function cardOf(heading: HTMLElement) {
  return heading.closest<HTMLElement>('[tabindex="-1"]')!;
}

describe("DiveFormSectionIndex", () => {
  it("lists the sections on the page, in form order, and follows them", () => {
    const { rerender } = render(
      <Harness groups={["Notes", "Import", "Dive info"]} />,
    );
    expect(entries()).toEqual(["Import", "Dive info", "Notes"]);

    rerender(<Harness groups={["Notes", "Import"]} />);
    expect(entries()).toEqual(["Import", "Notes"]);
  });

  it("marks the last section whose heading has stuck, else the first", () => {
    render(<Harness groups={["Import", "Dive info", "Notes"]} />);
    const current = () =>
      index().getByRole("button", { current: "location" }).textContent;
    expect(current()).toBe("Import");

    act(() =>
      scrollPast(cardOf(screen.getByRole("heading", { name: "Import" }))),
    );
    expect(current()).toBe("Import");

    act(() =>
      scrollPast(cardOf(screen.getByRole("heading", { name: "Dive info" }))),
    );
    expect(current()).toBe("Dive info");
    expect(
      index().getAllByRole("button", { current: "location" }),
    ).toHaveLength(1);
  });

  it("opens a collapsed section on a jump, scrolls to it and puts focus on it", async () => {
    render(<Harness groups={["Import", "Notes"]} />);
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    const heading = () =>
      within(screen.getByRole("heading", { name: "Notes" })).getByRole(
        "button",
      );
    await userEvent.click(heading());
    expect(heading()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(index().getByRole("button", { name: "Notes" }));

    expect(heading()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Notes fields")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    expect(heading()).toHaveFocus();
  });

  it("lands a jump to a section without a heading control on its card", async () => {
    render(<Harness groups={["Import", "Notes"]} />);

    await userEvent.click(index().getByRole("button", { name: "Import" }));

    expect(
      cardOf(screen.getByRole("heading", { name: "Import" })),
    ).toHaveFocus();
  });
});

describe("DIVE_SECTION_ICONS", () => {
  it("gives every section a glyph of its own", () => {
    const icons = DIVE_FORM_FIELD_GROUPS.map(
      (group) => DIVE_SECTION_ICONS[group],
    );
    expect(new Set(icons).size).toBe(DIVE_FORM_FIELD_GROUPS.length);
  });
});
