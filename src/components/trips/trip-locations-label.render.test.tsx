import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripLocationsLabel } from "./trip-locations-label";
import type { TripLocation } from "@/lib/api/trips";

// The joining and the "+N" are `lib/trip-locations.ts`'s and are tested there. What a
// render adds is the wiring the two surfaces share: that the hint lands on the element
// holding the compacted text, that it is computed against the same limit that produced
// the "+N" - the drift this component exists to make impossible - and that a trip with
// nothing to say falls back rather than rendering an empty label.

const at = (name: string) => ({ name }) as TripLocation;

describe("TripLocationsLabel", () => {
  it("hints every name when the label compacted some away", () => {
    render(
      <TripLocationsLabel
        locations={[at("Moalboal"), at("Panglao"), at("Malapascua")]}
      />,
    );

    const hinted = screen.getByTitle("Moalboal, Panglao, Malapascua");
    expect(hinted).toHaveTextContent("Moalboal, Panglao +1");
  });

  it("leaves a fully shown label untitled", () => {
    // A tooltip repeating the text under the cursor is worse than no tooltip.
    const { container } = render(
      <TripLocationsLabel locations={[at("Moalboal"), at("Panglao")]} />,
    );

    expect(container.querySelector("[title]")).toBeNull();
    expect(screen.getByText("Moalboal, Panglao")).toBeInTheDocument();
  });

  it("renders the fallback for a trip with no usable locations", () => {
    const { container } = render(
      <TripLocationsLabel locations={[]} fallback="-" />,
    );

    expect(screen.getByText("-")).toBeInTheDocument();
    expect(container.querySelector("[title]")).toBeNull();
  });

  it("renders nothing at all when no fallback is given", () => {
    const { container } = render(<TripLocationsLabel locations={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("carries the caller's classes on the element holding the hint", () => {
    // The dashboard's copy needs `block` and its own type scale, and losing either
    // to the hint's wrapper would be a silent layout change.
    render(
      <TripLocationsLabel
        locations={[at("Moalboal"), at("Panglao"), at("Malapascua")]}
        className="block text-sm"
      />,
    );

    expect(screen.getByTitle("Moalboal, Panglao, Malapascua")).toHaveClass(
      "block",
      "text-sm",
    );
  });
});
