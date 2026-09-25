import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "./footer";

// The footer renders below every page in the app, so its own markup cannot know what
// heading level would be correct where it lands. It used to guess `<h4>`, and on every
// page whose last heading was an `<h2>` that guess was the `heading-order` violation
// axe reports. The columns are group labels rather than sections of the document, so
// they carry no heading level at all now - which is what these tests pin.

describe("Footer", () => {
  it("contributes no headings to the page it renders under", () => {
    render(<Footer />);

    expect(screen.queryAllByRole("heading")).toHaveLength(0);
  });

  it("names each column group as a landmark instead", () => {
    render(<Footer />);

    for (const name of ["Platform", "Resources", "Support"]) {
      const group = screen.getByRole("navigation", { name });
      // The Support column also holds a link reading "Support", so match the label.
      expect(group).toContainElement(screen.getByText(name, { selector: "p" }));
    }
  });

  it("keeps every column's links reachable", () => {
    render(<Footer />);

    expect(
      screen
        .getByRole("navigation", { name: "Platform" })
        .querySelectorAll("a"),
    ).toHaveLength(4);
    expect(
      screen.getByRole("link", { name: "Terms of Service" }),
    ).toHaveAttribute("href", "/terms");
  });
});
