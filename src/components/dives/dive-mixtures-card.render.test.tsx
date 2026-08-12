import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveMixturesCard } from "./dive-mixtures-card";
import type { Dive, DiveMixture } from "@/lib/api/dives";

// `diveModWarning` itself is unit-tested in `lib/dive-mixtures.test.ts`. What only a
// render reaches is the two rules layered on top of it here - which cylinder, if any,
// gets marked, and whether the sentence appears at all. Those are exactly what
// regressed once: the first version of this card blamed a staged deco bottle for the
// dive's maximum depth, which fires on every correctly planned decompression dive.

const AIR: DiveMixture = {
  name: "Back Gas",
  volume: 22.2,
  oxygen: 21,
  helium: 0,
};
const EAN54: DiveMixture = {
  name: "Deco Gas 1",
  volume: 11.1,
  oxygen: 54,
  helium: 0,
};

function dive(mixtures: DiveMixture[], maxDepth: number | null): Dive {
  return {
    uuid: "test",
    dive_number: 1,
    start_time: "2026-06-03T12:15:00+02:00",
    duration: 3600,
    max_depth: maxDepth,
    mixtures,
  } as Dive;
}

describe("DiveMixturesCard warnings", () => {
  it("says nothing about a staged deco bottle carried past its own MOD", () => {
    // The regression case: EAN54 tops out at 19.6 m and the dive reached 45.91 m,
    // but it was breathed on the ascent. Nothing here is a problem.
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 45.91)} />);

    expect(screen.getByText("EAN54")).toBeInTheDocument();
    expect(screen.queryByText(/past this mix/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no gas logged/i)).not.toBeInTheDocument();
  });

  it("warns about the dive, not a cylinder, when nothing on board could reach", () => {
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 80)} />);

    expect(
      screen.getByText(/no gas logged for this dive/i),
    ).toBeInTheDocument();
    // Attributed to the dive: no row is singled out.
    expect(screen.queryByText(/past this mix/i)).not.toBeInTheDocument();
  });

  it("judges a lone cylinder directly, since it was breathed throughout", () => {
    render(<DiveMixturesCard dive={dive([EAN54], 45)} />);

    expect(
      screen.getByText(/past this mix's 19.6 m limit/i),
    ).toBeInTheDocument();
  });

  it("renders nothing at all for a dive logging no cylinders", () => {
    const { container } = render(<DiveMixturesCard dive={dive([], 30)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a MOD per cylinder but no warning when the dive is within limits", () => {
    render(<DiveMixturesCard dive={dive([AIR], 30)} />);

    expect(screen.getByText("56.7 m")).toBeInTheDocument();
    expect(screen.queryByText(/past this mix/i)).not.toBeInTheDocument();
  });

  it("withholds a MOD from a mix that cannot exist", () => {
    // Same rule `gasHintParts` applies to the form hint: the oxygen fraction of an
    // impossible mix is not a gas property to derive a limit from.
    render(
      <DiveMixturesCard
        dive={dive([{ volume: 12, oxygen: 50, helium: 60 }], 30)}
      />,
    );

    expect(screen.getByText("O₂ 50% / He 60%")).toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d m$/)).not.toBeInTheDocument();
  });
});
