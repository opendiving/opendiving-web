import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DiveGasConsumptionCard } from "./dive-gas-consumption-card";
import type { Dive, DiveMixture, DiveTankGasUse } from "@/lib/api/dives";
import type { UnitSystem } from "@/lib/units";

// These renders read the diver's units, so they need an auth context. Held in a
// mutable box rather than a fixed literal so a test can switch systems - `vi.mock`'s
// factory is hoisted above the file, and `vi.hoisted` is what lets it close over
// something the tests can still reach.
const auth = vi.hoisted(() => ({ units: "metric" as UnitSystem }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: auth.units } }),
}));

afterEach(() => {
  auth.units = "metric";
});

// The join itself is specified in `dive-gas.test.ts`. What a render adds is the part
// that only exists as markup: which of the card's three layouts appears, and whether an
// unattributed cylinder and a missing overall SAC read as deliberate rather than as
// cells that failed to fill in.

function mixture(overrides: Partial<DiveMixture> = {}): DiveMixture {
  return {
    id: 1,
    volume: 22,
    start_pressure: 200,
    end_pressure: 60,
    oxygen: 21,
    helium: 0,
    gas_number: 1,
    ...overrides,
  };
}

function tank(overrides: Partial<DiveTankGasUse> = {}): DiveTankGasUse {
  return {
    gas_number: 1,
    gas_used: 3080,
    rmv: 18.2,
    sac_bar_per_min: 0.83,
    seconds_on_gas: 2280,
    mean_depth: 32.4,
    ...overrides,
  };
}

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "d1",
    dive_number: 493,
    start_time: "2026-06-03T12:15:00+02:00",
    duration: 2700,
    avg_depth: 26.4,
    max_depth: 45.91,
    dive_sites: [],
    gear_items: [],
    notes: "",
    user_uuid: "u1",
    created_at: "2026-06-03T10:15:00Z",
    mixtures: [mixture()],
    ...overrides,
  };
}

// The shape the two-cylinder XML export in the corpus produces: a 21/0 back gas and a
// 49/0 deco bottle, breathed at wildly different depths.
function twoTankDive(overrides: Partial<Dive> = {}): Dive {
  return dive({
    mixtures: [
      mixture({ role: "bottom" }),
      mixture({
        id: 2,
        volume: 11,
        oxygen: 49,
        gas_number: 2,
        role: "deco",
      }),
    ],
    gas_use: {
      gas_used: 3620,
      rmv: 17.4,
      sac_bar_per_min: null,
      tanks: [
        tank(),
        tank({
          gas_number: 2,
          gas_used: 540,
          rmv: 12.1,
          sac_bar_per_min: 0.44,
          seconds_on_gas: 720,
          mean_depth: 6.4,
        }),
      ],
      attributed_seconds: 3000,
      duration_seconds: 3000,
    },
    ...overrides,
  });
}

// Dive #493 exactly as the API returns it: two mixtures, one transmitter, so the deco
// bottle logs no pressures and yields no figure. The commonest multi-gas shape there is -
// 19 of 19 in the corpus - and the one a `tanks.length > 1` test would get wrong.
function oneTransmitterDive(overrides: Partial<Dive> = {}): Dive {
  return dive({
    duration: 4001,
    mixtures: [
      mixture({ gas_number: 0, start_pressure: 212, end_pressure: 127 }),
      mixture({
        id: 2,
        volume: 11.1,
        oxygen: 54,
        gas_number: 1,
        start_pressure: null,
        end_pressure: null,
      }),
    ],
    gas_use: {
      gas_used: 1887,
      rmv: 12.4,
      sac_bar_per_min: null,
      tanks: [
        tank({
          gas_number: 0,
          gas_used: 1887,
          rmv: 12.4,
          sac_bar_per_min: 0.56,
          seconds_on_gas: 2075,
          mean_depth: 33.99,
        }),
      ],
      attributed_seconds: 2075,
      duration_seconds: 4300,
    },
    ...overrides,
  });
}

describe("DiveGasConsumptionCard layouts", () => {
  it("renders nothing for a dive that was never a candidate", () => {
    const { container } = render(
      <DiveGasConsumptionCard dive={dive({ mixtures: [] })} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the three headline figures for a single-tank dive", () => {
    // The pre-existing layout, unchanged. The API sends `tanks: []` here - an
    // empty array, not a null and not an absent key - and a one-row table would
    // be a worse way to say three numbers.
    render(
      <DiveGasConsumptionCard
        dive={dive({
          gas_use: {
            gas_used: 3080,
            rmv: 14.29,
            sac_bar_per_min: 1.19,
            tanks: [],
            attributed_seconds: null,
            duration_seconds: null,
          },
        })}
      />,
    );

    expect(screen.getByText("14.29 L/min")).toBeInTheDocument();
    expect(screen.getByText("1.19 bar/min")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("writes the headline figures in imperial", () => {
    // SAC gains a decimal in psi/min and RMV keeps both of its own in cuft/min -
    // a cubic foot is 28 litres, so the second decimal there is real resolution
    // rather than the noise it is in L/min.
    auth.units = "imperial";
    render(
      <DiveGasConsumptionCard
        dive={dive({
          gas_use: {
            gas_used: 3080,
            rmv: 14.29,
            sac_bar_per_min: 1.19,
            tanks: [],
            attributed_seconds: null,
            duration_seconds: null,
          },
        })}
      />,
    );

    expect(screen.getByText("0.50 cuft/min")).toBeInTheDocument();
    expect(screen.getByText("17.3 psi/min")).toBeInTheDocument();
    expect(screen.getByText("108.8 cuft")).toBeInTheDocument();
  });

  it("explains the absence instead of hiding when nothing could be derived", () => {
    render(<DiveGasConsumptionCard dive={twoTankDive({ gas_use: null })} />);

    // No profile on this fixture, so it is the hand-logged sentence - which must
    // not send the diver to a field or blame an import they never made.
    expect(screen.getByText(/multi-tank/i)).toBeInTheDocument();
    expect(screen.getByText(/doesn't have one/)).toBeInTheDocument();
  });

  it("drops the average-depth footnote when the figures aren't from it", () => {
    // The single-tank prose names `avg_depth` as the denominator. A null SAC is
    // the API's marker for the per-cylinder derivation, so both halves of this
    // layout gate on it - otherwise the card asserts the very thing this branch
    // deleted from the dashboard chart.
    render(
      <DiveGasConsumptionCard
        dive={dive({
          gas_use: {
            gas_used: 3080,
            rmv: 14.29,
            sac_bar_per_min: null,
            tanks: [],
            attributed_seconds: null,
            duration_seconds: null,
          },
        })}
      />,
    );

    expect(screen.queryByText(/from an average depth of/)).toBeNull();
  });
});

describe("DiveGasConsumptionCard per-tank table", () => {
  it("gives each cylinder a row carrying its own depth and rate", () => {
    render(<DiveGasConsumptionCard dive={twoTankDive()} />);

    const rows = screen.getAllByRole("row");
    // Header, two cylinders, total.
    expect(rows).toHaveLength(4);

    const backGas = within(rows[1]);
    expect(backGas.getByText("1")).toBeInTheDocument();
    expect(backGas.getByText("Air")).toBeInTheDocument();
    expect(backGas.getByText("32.4 m")).toBeInTheDocument();
    expect(backGas.getByText("18.2 L/min")).toBeInTheDocument();

    // The whole point of the split: the deco bottle's rate is its own, taken at
    // its own 6.4 m rather than at the dive's average depth.
    const decoGas = within(rows[2]);
    expect(decoGas.getByText("EAN49")).toBeInTheDocument();
    expect(decoGas.getByText("Deco")).toBeInTheDocument();
    expect(decoGas.getByText("6.4 m")).toBeInTheDocument();
    expect(decoGas.getByText("12.1 L/min")).toBeInTheDocument();
  });

  it("heads its first two columns as the mixtures table above does", () => {
    // The gas is a column here rather than a badge pinned to the position, which
    // is what lets the two tables be read against each other down the page.
    render(<DiveGasConsumptionCard dive={twoTankDive()} />);

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    // "#Tank" is the visible character plus the sr-only word behind it, which the
    // mixtures table heads identically.
    expect(headers.slice(0, 2)).toEqual(["#Tank", "Gas"]);
    // "Used", not "Gas Used": two headers leading with the same word, one naming
    // a mix and one a volume, is what the Gas column would otherwise create.
    expect(headers).toContain("Used");
  });

  it("dashes the gas of a tank that matches no cylinder", () => {
    // A `Gas N` row is the device's own tank, not one of the dive's mixtures, so
    // there is no mix to name in the column beside it.
    render(
      <DiveGasConsumptionCard
        dive={twoTankDive({
          mixtures: [mixture({ gas_number: 1 })],
        })}
      />,
    );

    const orphan = within(screen.getAllByRole("row")[2]);
    expect(orphan.getByText("Gas 2")).toBeInTheDocument();
    expect(orphan.getByText("-")).toBeInTheDocument();
  });

  it("totals the dive under the rows and dashes the SAC it cannot state", () => {
    render(<DiveGasConsumptionCard dive={twoTankDive()} />);

    const total = within(screen.getAllByRole("row")[3]);
    expect(total.getByText("Total")).toBeInTheDocument();
    expect(total.getByText("3620 L")).toBeInTheDocument();
    expect(total.getByText("17.4 L/min")).toBeInTheDocument();
    // Bar/min across a 22 L twinset and an 11 L stage is not a rate of anything,
    // so the API sends null and this must not invent a sum.
    expect(total.queryByText(/bar\/min/)).not.toBeInTheDocument();
  });

  it("names the missing pressures when that is why a row has no figures", () => {
    // The corpus's deco bottle with no transmitter, and the only unattributed
    // row any real dive here renders. Five blank cells would read as a
    // rendering fault; "Not attributed" would name one of the two states an
    // empty `use` covers and be contradicted by the coverage note below on the
    // other.
    render(<DiveGasConsumptionCard dive={oneTransmitterDive()} />);

    expect(screen.getByText("No pressures recorded")).toBeInTheDocument();
  });

  it("claims only 'no figures' for a cylinder whose pressures are recorded", () => {
    // Pressures present, still no row of its own: either the attribution never
    // named it or the API's per-tank arithmetic declined it, and the browser
    // cannot tell which. So it says what it knows and no more.
    render(
      <DiveGasConsumptionCard
        dive={twoTankDive({
          mixtures: [
            mixture({ role: "bottom" }),
            mixture({ id: 2, gas_number: null }),
          ],
        })}
      />,
    );

    expect(screen.getByText("No figures")).toBeInTheDocument();
  });

  it("drops the total when one cylinder would just be restated", () => {
    // Dive #493's real shape, and every multi-gas dive in the corpus: one
    // transmitter, so one attributed cylinder beside one that got nothing. A
    // total here repeats the filled row verbatim and dashes a SAC that row
    // prints two cells to the left.
    render(<DiveGasConsumptionCard dive={oneTransmitterDive()} />);

    const rows = screen.getAllByRole("row");
    // Header, back gas, deco bottle - and no total.
    expect(rows).toHaveLength(3);
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    // The one real SAC still shows; it is only the dive-wide one that doesn't
    // exist.
    expect(screen.getByText("0.56 bar/min")).toBeInTheDocument();
  });

  it("still tables a one-cylinder attribution rather than falling back", () => {
    // `tanks.length === 1` must not route to the headline layout: the second
    // cylinder's row is the whole reason this dive needs a table.
    render(<DiveGasConsumptionCard dive={oneTransmitterDive()} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("No pressures recorded")).toBeInTheDocument();
  });

  it("dashes rather than blanks a SAC the API declined to give", () => {
    // Contract-unreachable today - the API pairs a null SAC with a non-empty
    // `tanks` - but the layout switch and the nullability are independent, and
    // an unguarded null leaves a bare "bar/min" under the heading.
    render(
      <DiveGasConsumptionCard
        dive={dive({
          gas_use: {
            gas_used: 3080,
            rmv: 14.29,
            sac_bar_per_min: null,
            tanks: [],
            attributed_seconds: null,
            duration_seconds: null,
          },
        })}
      />,
    );

    expect(screen.queryByText(/bar\/min/)).not.toBeInTheDocument();
  });

  it("says <1min rather than 0min for a briefly-breathed cylinder", () => {
    // Two gas switches close together. Rounded to whole minutes this prints
    // "0min" beside real litres, which reads as broken rather than brief.
    render(
      <DiveGasConsumptionCard
        dive={twoTankDive({
          gas_use: {
            ...twoTankDive().gas_use!,
            tanks: [tank(), tank({ gas_number: 2, seconds_on_gas: 20 })],
          },
        })}
      />,
    );

    expect(screen.getByText("<1min")).toBeInTheDocument();
    expect(screen.queryByText("0min")).not.toBeInTheDocument();
  });

  it("stays silent about coverage when the split accounts for the dive", () => {
    render(<DiveGasConsumptionCard dive={twoTankDive()} />);

    expect(screen.queryByText(/couldn't be assigned/)).not.toBeInTheDocument();
  });

  it("owns up when the split leaves part of the dive unassigned", () => {
    render(
      <DiveGasConsumptionCard
        dive={twoTankDive({
          gas_use: {
            ...twoTankDive().gas_use!,
            attributed_seconds: 2280,
            duration_seconds: 2520,
          },
        })}
      />,
    );

    expect(screen.getByText(/38min of the 42min/)).toBeInTheDocument();
  });
});
