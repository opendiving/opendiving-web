import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveTitle } from "./dive-title";

// One name for a dive, written the same way in the log, on the cards and in the
// page header - so what these pin down is the two dives that name is built from
// differently: one with a site, and one with none.

describe("DiveTitle", () => {
  it("names the dive by its number and its site", () => {
    const { container } = render(
      <DiveTitle diveNumber={212} sites={[{ uuid: "a", name: "Blue Hole" }]} />,
    );

    expect(container).toHaveTextContent("#212 Blue Hole");
  });

  it("counts the sites a multi-site dive crossed", () => {
    render(
      <DiveTitle
        diveNumber={212}
        sites={[
          { uuid: "a", name: "Pescador Island" },
          { uuid: "b", name: "Panagsama Wall" },
        ]}
      />,
    );

    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("falls back to 'Dive #N' when there is no site to name it by", () => {
    // A bare "#212" names nothing, and the sites are the one part of a dive
    // that is genuinely optional.
    const { container } = render(<DiveTitle diveNumber={212} sites={[]} />);

    expect(container).toHaveTextContent("Dive #212");
  });
});
