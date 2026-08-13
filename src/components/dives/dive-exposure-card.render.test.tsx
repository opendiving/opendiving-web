import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveExposureCard } from "./dive-exposure-card";
import type { Dive } from "@/lib/api/dives";

// Nothing here is derived - the card renders five stored numbers exactly as the device
// recorded them - so what a render actually tests is the three decisions layered on top
// of that: whether the card appears at all, how a half-recorded pair reads, and whether
// passing the CNS line reaches a diver who cannot see the colour it is drawn in.

function dive(exposure: Partial<Dive>): Dive {
  return {
    uuid: "test",
    dive_number: 1,
    start_time: "2026-06-03T12:15:00+02:00",
    duration: 3600,
    max_depth: 30,
    mixtures: [],
    ...exposure,
  } as Dive;
}

describe("DiveExposureCard visibility", () => {
  it("renders nothing when the dive carries none of the three", () => {
    // Every hand-logged dive, and every FIT or 2026 Suunto Ocean import. An empty card
    // headed "Oxygen Exposure" would read as something the diver forgot to fill in,
    // for fields no form lets them fill in at all.
    const { container } = render(<DiveExposureCard dive={dive({})} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the API spells those five out as null", () => {
    // The shape actually on the wire: `DiveTechScalars` declares all five
    // `float | None` with no `exclude_none`, so a hand-logged dive sends explicit
    // nulls rather than omitting the keys. The `!= null` guards cover both, and
    // this is here so they keep having to - a fixture built from absent keys is
    // how three mixture fields shipped a form that could not be saved.
    const { container } = render(
      <DiveExposureCard
        dive={dive({
          cns_start: null,
          cns_end: null,
          otu_start: null,
          otu_end: null,
          surface_pressure_bar: null,
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["CNS alone", { cns_end: 9 }],
    ["OTU alone", { otu_end: 23 }],
    ["surface pressure alone", { surface_pressure_bar: 1.057 }],
    // A FIT file records an end-OTU and has no start-OTU field at all, so this
    // pair arrives half-null on every one of them.
    ["a half-null pair", { otu_start: null, otu_end: 23 }],
  ])("renders on %s", (_label, exposure) => {
    render(<DiveExposureCard dive={dive(exposure)} />);

    expect(screen.getByText(/Exposure & Pressure/)).toBeInTheDocument();
  });

  it("is not titled for the two readings it may not contain", () => {
    // 42 of the 384 XML exports in the corpus record a surface pressure and neither
    // CNS nor OTU, so "Oxygen Exposure" would head a card holding one barometer
    // reading. Gating the card on CNS/OTU instead would drop that reading entirely.
    render(<DiveExposureCard dive={dive({ surface_pressure_bar: 1.057 })} />);

    expect(screen.queryByText(/Oxygen Exposure/)).not.toBeInTheDocument();
    expect(screen.getByText("1.057 bar")).toBeInTheDocument();
  });

  it("shows only the readings the dive actually has", () => {
    render(<DiveExposureCard dive={dive({ surface_pressure_bar: 1.057 })} />);

    expect(screen.getByText("1.057 bar")).toBeInTheDocument();
    expect(screen.queryByText("CNS")).not.toBeInTheDocument();
    expect(screen.queryByText("OTU")).not.toBeInTheDocument();
  });
});

describe("DiveExposureCard readings", () => {
  it("keeps the pair visible when a format records only the end", () => {
    // Every FIT file: the profile has no start-OTU field at all. Collapsing to a lone
    // "23" would claim the dive began at zero loading, which for a repetitive dive is
    // the one thing the number is there to contradict.
    render(<DiveExposureCard dive={dive({ otu_end: 23 })} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
  });

  it("renders a recorded zero as a reading, not as an absence", () => {
    // `!= null`, not truthiness: a dive that began with no oxygen loading recorded a
    // real 0, and the API keeps it apart from "didn't record it" on purpose.
    render(<DiveExposureCard dive={dive({ cns_start: 0, cns_end: 9 })} />);

    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

describe("DiveExposureCard CNS limit", () => {
  it("says nothing beyond the number below the limit", () => {
    render(<DiveExposureCard dive={dive({ cns_start: 8, cns_end: 99 })} />);

    expect(screen.queryByText(/single-dive limit/i)).not.toBeInTheDocument();
  });

  it.each([100, 105])("marks a CNS of %s in text as well as colour", (cns) => {
    // The boundary is `>=`, so exactly 100 alerts. Asserted through the accessible
    // name rather than the class: a `text-warning` that reached no screen reader is
    // the failure this covers (WCAG 2.1 SC 1.4.1), and the class alone can't show it.
    render(<DiveExposureCard dive={dive({ cns_start: 8, cns_end: cns })} />);

    expect(
      screen.getByText(/over the 100% single-dive limit/i),
    ).toBeInTheDocument();
  });

  it("marks the end value, not the start the diver arrived with", () => {
    render(<DiveExposureCard dive={dive({ cns_start: 120, cns_end: 9 })} />);

    expect(screen.queryByText(/single-dive limit/i)).not.toBeInTheDocument();
  });

  it("never marks OTU, which has no comparable single-dive line", () => {
    render(<DiveExposureCard dive={dive({ otu_start: 0, otu_end: 350 })} />);

    expect(screen.queryByText(/single-dive limit/i)).not.toBeInTheDocument();
  });
});
