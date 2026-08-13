import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveMixturesCard } from "./dive-mixtures-card";
import type { Dive, DiveMixture, GasRole } from "@/lib/api/dives";

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

// `sharedPpO2Limit` is unit-tested in `lib/dive-mixtures.test.ts`. What only a render
// reaches is whether its answer and the column under it were wired to the same limit -
// a header naming one number above cells computed from another is the exact failure the
// helper exists to prevent, and neither half can show it alone.
describe("DiveMixturesCard ppO₂ column header", () => {
  const at = (po2_limit: number, oxygen: number): DiveMixture => ({
    volume: 11.1,
    helium: 0,
    oxygen,
    po2_limit,
  });

  it("names the limit in the header when every cylinder shares one", () => {
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    // Neither records a limit, so both fall back to the same working default.
    expect(screen.getByText("MOD @ ppO₂ 1.4")).toBeInTheDocument();
    expect(screen.queryByText(/@ 1\.4$/)).not.toBeInTheDocument();
  });

  it("moves the qualifier into the rows when the cylinders disagree", () => {
    // The real shape: a Suunto records 1.4 on the back gas and 1.6 on the deco bottle
    // of the same dive.
    render(<DiveMixturesCard dive={dive([at(1.4, 21), at(1.6, 50)], 30)} />);

    expect(screen.getByText("MOD")).toBeInTheDocument();
    expect(screen.queryByText(/MOD @ ppO₂/)).not.toBeInTheDocument();
    // Both rows carry their own, not just the one that differs from the default:
    // an unqualified cell beside a qualified one reads as "no limit", not "1.4".
    expect(screen.getByText(/56\.7 m @ 1\.4/)).toBeInTheDocument();
    expect(screen.getByText(/22\.0 m @ 1\.6/)).toBeInTheDocument();
  });

  it("computes each row at its own recorded limit, not the default", () => {
    // EAN50 at ppO₂ 1.6 is 22.0 m; at the 1.4 default it would be 18.0 m. A header
    // that said 1.4 over this cell would be naming a limit the number didn't use.
    render(<DiveMixturesCard dive={dive([at(1.6, 50)], 20)} />);

    expect(screen.getByText("MOD @ ppO₂ 1.6")).toBeInTheDocument();
    expect(screen.getByText("22.0 m")).toBeInTheDocument();
  });
});

describe("DiveMixturesCard role badge", () => {
  it("labels a cylinder the import recorded a role for", () => {
    render(
      <DiveMixturesCard dive={dive([{ ...EAN54, role: "deco" }, AIR], 30)} />,
    );

    expect(screen.getByText("Deco")).toBeInTheDocument();
    // Beside the gas name rather than replacing it - the two answer one question
    // together, "EAN54, the deco bottle".
    expect(screen.getByText("EAN54")).toBeInTheDocument();
  });

  it("shows no badge for the cylinders that have no role, which is most of them", () => {
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    expect(screen.queryByText("Deco")).not.toBeInTheDocument();
    expect(screen.queryByText("Bottom")).not.toBeInTheDocument();
  });

  it("falls back to the wire value for a role the label map hasn't caught up with", () => {
    // `GAS_ROLE_LABELS` is kept in step with the API's `GasRole` by hand, so the
    // cast stands in for the window after a role is added there. Without the
    // fallback this renders a bordered badge containing nothing at all.
    const unknown = { ...EAN54, role: "bailout" as GasRole };
    render(<DiveMixturesCard dive={dive([unknown], 30)} />);

    expect(screen.getByText("bailout")).toBeInTheDocument();
  });
});
