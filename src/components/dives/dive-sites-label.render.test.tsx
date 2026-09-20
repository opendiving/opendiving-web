import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveSitesLabel } from "./dive-sites-label";

// The label compacts a dive's sites to "Pescador Island +2", so what a render has
// to pin down is the other half of that bargain: the hidden names are one hover
// away, and a dive that hides nothing gets no tooltip repeating what it already
// shows.

const sites = [
  { uuid: "a", name: "Pescador Island", location: "Moalboal, Philippines" },
  { uuid: "b", name: "Panagsama Wall" },
  { uuid: "c", name: "Tongo Point" },
];

describe("DiveSitesLabel", () => {
  it("hints every name, not just the ones the +N stands for", () => {
    render(<DiveSitesLabel sites={sites} />);

    expect(
      screen.getByTitle("Pescador Island, Panagsama Wall, Tongo Point"),
    ).toBeInTheDocument();
  });

  it("hangs the hint where the whole label is, so the name hovers too", () => {
    // Not on the "+2" alone, which is a two-character hover target.
    render(<DiveSitesLabel sites={sites} />);

    const hinted = screen.getByTitle(
      "Pescador Island, Panagsama Wall, Tongo Point",
    );
    expect(hinted).toHaveTextContent("Pescador Island");
    expect(hinted).toHaveTextContent("+2");
  });

  it("leaves a single site untitled", () => {
    // A tooltip identical to the text under the cursor is worse than none.
    const { container } = render(<DiveSitesLabel sites={[sites[0]]} />);

    expect(container.querySelector("[title]")).toBeNull();
    expect(screen.getByText("Pescador Island")).toBeInTheDocument();
  });

  it("still counts the sites it hides", () => {
    render(<DiveSitesLabel sites={sites} />);

    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders a placeholder for a dive with no sites", () => {
    render(<DiveSitesLabel sites={[]} />);

    expect(screen.getByText("-")).toBeInTheDocument();
  });
});
