import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DiveMixturesCard } from "./dive-mixtures-card";
import type { Dive, DiveMixture, GasRole, TankUsage } from "@/lib/api/dives";

// This render reads the diver's units, so it needs an auth context. Metric, which
// is every existing account's default.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

// `diveModWarning` itself is unit-tested in `lib/dive-mixtures.test.ts`. What only a
// render reaches is the two rules layered on top of it here - which cylinder, if any,
// gets marked, and whether the sentence appears at all. Those are exactly what
// regressed once: the first version of this card blamed a staged deco bottle for the
// dive's maximum depth, which fires on every correctly planned decompression dive.

const AIR: DiveMixture = {
  volume: 22.2,
  oxygen: 21,
  helium: 0,
};
const EAN54: DiveMixture = {
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

// A cylinder has no name of its own, so its row is identified by position - and by the
// same 1-based position the consumption card below numbers its own rows with, which is
// the only thing letting the two tables be read against each other.
describe("DiveMixturesCard identity column", () => {
  it("numbers the rows by position, under a header that says so", () => {
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    // Named "Tank" rather than "#", which a screen reader reads as punctuation
    // or not at all - the visible header is still the character.
    expect(
      screen.getByRole("columnheader", { name: "Tank" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
  });

  it("gives the gas a column of its own, beside the position rather than in it", () => {
    // The consumption card below heads its own second column the same way, which
    // is what puts the two tables' badges in one line down the page.
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    expect(
      screen.getByRole("columnheader", { name: "Gas" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Air" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "EAN54" })).toBeInTheDocument();
  });
});

// Helium is the one fraction a dive can have nothing to say about: air and nitrox
// record a flat 0, which is most dives and a column of zeroes on every one of them.
describe("DiveMixturesCard helium column", () => {
  it("is absent when no cylinder carries any", () => {
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    expect(
      screen.queryByRole("columnheader", { name: "He" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "O₂" }),
    ).toBeInTheDocument();
  });

  it("returns for every row once one cylinder has helium", () => {
    // Including the air cylinder's own 0, which is a real contrast on a dive that
    // carries both rather than the noise it is on a dive that carries neither.
    const trimix: DiveMixture = { volume: 24, oxygen: 21, helium: 35 };
    render(<DiveMixturesCard dive={dive([AIR, trimix], 30)} />);

    expect(
      screen.getByRole("columnheader", { name: "He" }),
    ).toBeInTheDocument();
    expect(screen.getByText("35%")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});

// The MOD column states the limit its number was computed at on every row, and the
// header stays bare. What only a render reaches is that the two halves of a cell are
// wired to the same limit - a depth printed beside a ppO₂ it wasn't derived from is
// worse than no MOD at all, and neither half can show it alone.
describe("DiveMixturesCard ppO₂ qualifier", () => {
  const at = (po2_limit: number, oxygen: number): DiveMixture => ({
    volume: 11.1,
    helium: 0,
    oxygen,
    po2_limit,
  });

  // The MOD is the last cell of every body row. Asserted on `textContent` rather than
  // by accessible name: the depth and its limit are two elements so the muted one can
  // be muted, and `dom-accessibility-api` trims each node before joining them, which
  // turns the rendered "56.7 m @ 1.4" into the name "56.7 m@ 1.4". The space is really
  // in the DOM - this reads what the diver sees rather than pinning that quirk.
  function modCells(): (string | null)[] {
    return screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => {
        const cells = within(row).getAllByRole("cell");
        return cells[cells.length - 1].textContent;
      });
  }

  it("qualifies every row, including the dive where all cylinders agree", () => {
    // Neither records a limit, so both fall back to the same working default - and
    // both say so, rather than the header saying it once for them.
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    expect(
      screen.getByRole("columnheader", { name: "MOD" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/MOD @ ppO₂/)).not.toBeInTheDocument();
    // 15.9 m, not the 19.6 m the warning above quotes for the same gas: that one is
    // the 1.6 deco ceiling. Two different numbers for one cylinder is exactly why
    // every MOD says which limit produced it.
    expect(modCells()).toEqual(["56.7 m @ 1.4", "15.9 m @ 1.4"]);
  });

  it("carries each cylinder's own limit when the dive mixes them", () => {
    // The real shape: a Suunto records 1.4 on the back gas and 1.6 on the deco bottle
    // of the same dive.
    render(<DiveMixturesCard dive={dive([at(1.4, 21), at(1.6, 50)], 30)} />);

    expect(modCells()).toEqual(["56.7 m @ 1.4", "22.0 m @ 1.6"]);
  });

  it("computes each row at its own recorded limit, not the default", () => {
    // EAN50 at ppO₂ 1.6 is 22.0 m; at the 1.4 default it would be 18.0 m. A cell
    // saying 1.4 beside this number would be naming a limit it didn't use.
    render(<DiveMixturesCard dive={dive([at(1.6, 50)], 20)} />);

    expect(modCells()).toEqual(["22.0 m @ 1.6"]);
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

// The usage flag is stated under the table, not badged in it - a third badge in the
// Gas cell pushed MOD off screen at the pinch width. `tankUsageSentences` is unit-
// tested in `lib/dive-mixtures.test.ts`; what only a render reaches is that the card
// prints those sentences, against the same `#` numbers its own first column shows,
// and prints nothing when there is nothing to say.
describe("DiveMixturesCard usage sentence", () => {
  it("names both cylinders of a pair the diver flagged parallel", () => {
    render(
      <DiveMixturesCard
        dive={dive(
          [
            { ...AIR, usage: "parallel" },
            { ...AIR, usage: "parallel" },
          ],
          30,
        )}
      />,
    );

    expect(
      screen.getByText(/Cylinders 1 and 2 are flagged Parallel/),
    ).toBeInTheDocument();
    // The meaning travels with the flag: nothing else on this page says what
    // "Parallel" claims about the dive.
    expect(
      screen.getByText(/breathed alternately at the same depth/),
    ).toBeInTheDocument();
  });

  it("names each group against its own row number on a mixed set", () => {
    // The set the per-row control exists to keep expressible, and the case a
    // whole-dive sentence could not state at all.
    render(
      <DiveMixturesCard
        dive={dive(
          [
            { ...AIR, usage: "parallel" },
            { ...AIR, usage: "parallel" },
            { ...EAN54, role: "deco", usage: "staged" },
          ],
          30,
        )}
      />,
    );

    expect(
      screen.getByText(
        /Cylinders 1 and 2 are flagged Parallel.*Cylinder 3 is flagged Staged/,
      ),
    ).toBeInTheDocument();
    // The role badge is untouched by any of this - it stayed in the table.
    expect(screen.getByText("Deco")).toBeInTheDocument();
  });

  it("says nothing at all when no cylinder is flagged, which is every import", () => {
    // No format this app parses carries the distinction, so an unflagged row is
    // the default state rather than an omission - and a sentence about the
    // absence would be on every imported dive in the corpus.
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    expect(screen.queryByText(/is flagged/)).not.toBeInTheDocument();
    expect(screen.queryByText(/are flagged/)).not.toBeInTheDocument();
  });

  it("falls back to the wire value for a usage the label map hasn't caught up with", () => {
    // `TANK_USAGE_LABELS` mirrors the API's `TankUsage` by hand, same as the role
    // map above. Without the fallback a flag the diver recorded would be visible
    // nowhere outside the edit form.
    const unknown = { ...EAN54, usage: "manifolded" as TankUsage };
    render(<DiveMixturesCard dive={dive([AIR, unknown], 20)} />);

    expect(
      screen.getByText("Cylinder 2 is flagged manifolded."),
    ).toBeInTheDocument();
  });
});
