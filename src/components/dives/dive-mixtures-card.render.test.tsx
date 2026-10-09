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

// Each card's MOD as the diver reads it: the label with the limit it was computed
// at, and the depth.
function mods(): [string | null, string | null][] {
  return screen.getAllByRole("listitem").map((card) => {
    const label = within(card)
      .getAllByRole("term")
      .find((term) => term.textContent?.startsWith("MOD"))!;
    return [label.textContent, label.nextElementSibling!.textContent];
  });
}

describe("DiveMixturesCard warnings", () => {
  it("says nothing about a staged deco bottle carried past its own MOD", () => {
    // The regression case: EAN54 tops out at 19.62 m and the dive reached 45.91 m,
    // but it was breathed on the ascent. Nothing here is a problem.
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 45.91)} />);

    expect(
      screen.getByRole("heading", { name: "#2 EAN54" }),
    ).toBeInTheDocument();
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
      screen.getByText(/past this mix's 19.62 m limit/i),
    ).toBeInTheDocument();
  });

  it("renders nothing at all for a dive logging no cylinders", () => {
    const { container } = render(<DiveMixturesCard dive={dive([], 30)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a MOD per cylinder but no warning when the dive is within limits", () => {
    render(<DiveMixturesCard dive={dive([AIR], 30)} />);

    expect(screen.getByText("56.66 m")).toBeInTheDocument();
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

    expect(
      screen.getByRole("heading", { name: "#1 O₂ 50% / He 60%" }),
    ).toBeInTheDocument();
    expect(mods()).toEqual([["MOD", "-"]]);
  });
});

// A cylinder has no name of its own, so its card is named by position - the same
// 1-based position the consumption card below numbers its rows with, which is the only
// thing letting the two be read against each other - and by its gas.
describe("DiveMixturesCard tank names", () => {
  it("names each card by its position and its gas, in the dive's order", () => {
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["#1 Air", "#2 EAN54"]);
  });
});

// Helium is the one fraction a dive can have nothing to say about: air and nitrox
// record a flat 0, which is most dives and a zero on every card of them.
describe("DiveMixturesCard helium", () => {
  it("is absent when no cylinder carries any", () => {
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    const [air] = screen.getAllByRole("listitem");
    expect(air).toHaveTextContent("O₂ 21%");
    expect(air).not.toHaveTextContent("He");
  });

  it("returns on every card once one cylinder has helium", () => {
    // Including the air cylinder's own 0, which is a real contrast on a dive that
    // carries both rather than the noise it is on a dive that carries neither.
    const trimix: DiveMixture = { volume: 24, oxygen: 21, helium: 35 };
    render(<DiveMixturesCard dive={dive([AIR, trimix], 30)} />);

    const [air, tx] = screen.getAllByRole("listitem");
    expect(tx).toHaveTextContent("He 35%");
    expect(air).toHaveTextContent("He 0%");
  });

  it("stays away for a dive whose cylinders record no helium either way", () => {
    // Unrecorded is not zero, and it is not helium either.
    const unanalysed: DiveMixture = { volume: 12, oxygen: null, helium: null };
    render(<DiveMixturesCard dive={dive([unanalysed], 30)} />);

    expect(screen.getByRole("listitem")).not.toHaveTextContent("He");
  });
});

// A cylinder may record a mix with no vessel, or a vessel with no analysis, so every
// figure on a row is one the dive might not have. The card's job is that a diver can
// tell a recorded number from an absent one - which is a claim about each cell, not
// only about the two pressures that happened to be nullable first.
describe("DiveMixturesCard absent figures", () => {
  const MIX_ONLY: DiveMixture = {
    volume: null,
    oxygen: 32,
    helium: 0,
    start_pressure: 200,
    end_pressure: 90,
  };

  it("leaves the size out of a cylinder that records a mix and no size", () => {
    // The UDDF `<tankdata>` with a gas link and no `<tankvolume>`.
    render(<DiveMixturesCard dive={dive([MIX_ONLY], 30)} />);

    const card = screen.getByRole("listitem");
    expect(card).not.toHaveTextContent(/\d L/);
    // The figures it *does* record are untouched.
    expect(
      screen.getByRole("heading", { name: "#1 EAN32" }),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent("O₂ 32%");
  });

  it("dashes an unrecorded pressure, muted rather than at full contrast", () => {
    // An absence at full contrast reads as a value - the same rule the consumption
    // card below applies to its own dashes.
    render(
      <DiveMixturesCard
        dive={dive([{ ...MIX_ONLY, end_pressure: null }], 30)}
      />,
    );

    const dash = screen.getByText("-");
    expect(dash.previousElementSibling).toHaveTextContent("End");
    expect(dash).toHaveClass("text-muted-foreground");
  });

  it("names no gas for a cylinder whose mix was never recorded", () => {
    // Not "EAN0" and not "Air": a size with no analysis behind it says nothing about
    // what was breathed, so the name, the MOD and the O₂ fraction all decline.
    const sizeOnly: DiveMixture = { volume: 12, oxygen: null, helium: null };
    render(<DiveMixturesCard dive={dive([sizeOnly], 30)} />);

    expect(
      screen.getByRole("heading", { name: "#1 Gas not recorded" }),
    ).toBeInTheDocument();
    const card = screen.getByRole("listitem");
    expect(card).toHaveTextContent("12 L");
    expect(card).not.toHaveTextContent("O₂");
    expect(mods()).toEqual([["MOD", "-"]]);
  });
});

// Every MOD states the limit it was computed at. What only a render reaches is that
// the two halves are wired to the same limit - a depth printed beside a ppO₂ it wasn't
// derived from is worse than no MOD at all, and neither half can show it alone.
describe("DiveMixturesCard ppO₂ qualifier", () => {
  const at = (po2_limit: number, oxygen: number): DiveMixture => ({
    volume: 11.1,
    helium: 0,
    oxygen,
    po2_limit,
  });

  it("qualifies every card, including the dive where all cylinders agree", () => {
    // Neither records a limit, so both fall back to the same working default - and
    // both say so.
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    // 15.92 m, not the 19.62 m the warning above quotes for the same gas: that one is
    // the 1.6 deco ceiling. Two different numbers for one cylinder is exactly why
    // every MOD says which limit produced it.
    expect(mods()).toEqual([
      ["MOD @ 1.4", "56.66 m"],
      ["MOD @ 1.4", "15.92 m"],
    ]);
  });

  it("carries each cylinder's own limit when the dive mixes them", () => {
    // The real shape: a Suunto records 1.4 on the back gas and 1.6 on the deco bottle
    // of the same dive.
    render(<DiveMixturesCard dive={dive([at(1.4, 21), at(1.6, 50)], 30)} />);

    expect(mods()).toEqual([
      ["MOD @ 1.4", "56.66 m"],
      ["MOD @ 1.6", "22 m"],
    ]);
  });

  it("computes each card at its own recorded limit, not the default", () => {
    // EAN50 at ppO₂ 1.6 is 22 m; at the 1.4 default it would be 18 m. A label
    // saying 1.4 beside this number would be naming a limit it didn't use.
    render(<DiveMixturesCard dive={dive([at(1.6, 50)], 20)} />);

    expect(mods()).toEqual([["MOD @ 1.6", "22 m"]]);
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
    expect(
      screen.getByRole("heading", { name: "#1 EAN54" }),
    ).toBeInTheDocument();
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

// The usage flag is on each card's line, beside the figures it qualifies.
describe("DiveMixturesCard usage", () => {
  it("states each cylinder's own flag on a mixed set", () => {
    // The set the per-cylinder control exists to keep expressible: a parallel
    // pair plus a staged deco bottle.
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

    const [first, second, third] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("O₂ 21% · Parallel");
    expect(second).toHaveTextContent("O₂ 21% · Parallel");
    expect(third).toHaveTextContent("O₂ 54% · Staged");
    expect(within(third).getByText("Deco")).toBeInTheDocument();
  });

  it("says nothing when no cylinder is flagged, which is every import", () => {
    render(<DiveMixturesCard dive={dive([AIR, EAN54], 30)} />);

    expect(screen.queryByText(/Parallel|Staged/)).not.toBeInTheDocument();
  });

  it("falls back to the wire value for a usage the label map hasn't caught up with", () => {
    // `TANK_USAGE_LABELS` mirrors the API's `TankUsage` by hand, same as the role
    // map above. Without the fallback a flag the diver recorded would be visible
    // nowhere outside the edit form.
    const unknown = { ...EAN54, usage: "manifolded" as TankUsage };
    render(<DiveMixturesCard dive={dive([AIR, unknown], 20)} />);

    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent(
      "O₂ 54% · manifolded",
    );
  });
});

describe("DiveMixturesCard icon", () => {
  it("draws a twin set for a twin-set preset's litres and a single otherwise", () => {
    render(
      <DiveMixturesCard
        dive={dive(
          [
            { ...AIR, volume: 22.2 },
            { ...EAN54, volume: 11.1 },
          ],
          30,
        )}
      />,
    );

    const [twin, single] = screen
      .getAllByRole("listitem")
      .map((card) => card.querySelector("svg")!.getAttribute("class"));
    expect(twin).toMatch(/lucide-twin-tank\b/);
    expect(single).toMatch(/lucide-tank-nitrox\b/);
  });

  it("draws the first parallel cylinder as the left of the pair", () => {
    render(
      <DiveMixturesCard
        dive={dive(
          [
            { ...EAN54, role: "deco", usage: "staged" },
            { ...AIR, volume: 11.1, usage: "parallel" },
            { ...AIR, volume: 11.1, usage: "parallel" },
          ],
          30,
        )}
      />,
    );

    expect(
      screen
        .getAllByRole("listitem")
        .map((card) => card.querySelector("svg")!.getAttribute("class")),
    ).toEqual([
      expect.stringMatching(/lucide-tank-nitrox\b/),
      expect.stringMatching(/lucide-left-tank\b/),
      expect.stringMatching(/lucide-tank\b/),
    ]);
  });
});
