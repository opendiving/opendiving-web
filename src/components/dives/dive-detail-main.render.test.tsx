import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveDetailMain } from "./dive-detail-main";
import type { Dive } from "@/lib/api/dives";

// The card this covers holds three stored figures and formats one of them, so its
// arithmetic is `formatDurationHoursMinutes`'s and is tested in `lib/date-time.test.ts`.
// What a render adds is the shape: that the two cards this replaced really did become
// one, that the start time is no longer among the figures (it moved to the page
// header), and that a hand-logged dive with no depths leaves the duration standing on
// its own rather than rendering empty stat blocks beside it.

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "test",
    dive_number: 1,
    start_time: "2021-04-04T10:04:47+02:00",
    duration: 2700,
    dive_sites: [],
    mixtures: [],
    ...overrides,
  } as Dive;
}

describe("DiveDetailMain duration and depth card", () => {
  it("puts all three figures in one card", () => {
    render(
      <DiveDetailMain dive={dive({ max_depth: 30.52, avg_depth: 18.2 })} />,
    );

    expect(screen.getByText("45min")).toBeInTheDocument();
    expect(screen.getByText("30.52m")).toBeInTheDocument();
    expect(screen.getByText("18.2m")).toBeInTheDocument();
  });

  it("heads the card with nothing at all", () => {
    // The two headings the merge replaced, plus the merged card's own former
    // title - each figure carries its own label, so a heading over them only
    // restated those. A stray one would mean the removal half happened, which a
    // "does the number render" test would not notice.
    render(
      <DiveDetailMain dive={dive({ max_depth: 30.52, avg_depth: 18.2 })} />,
    );

    expect(screen.queryByText(/time & duration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/depth information/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/duration & depth/i)).not.toBeInTheDocument();
  });

  it("leaves the start time to the page header", () => {
    // It is the dive's date that the header carries, and the clock time belongs
    // with it - a second copy here is what the merge removed.
    render(<DiveDetailMain dive={dive({ max_depth: 30.52 })} />);

    expect(screen.queryByText(/start time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/10:04/)).not.toBeInTheDocument();
  });

  it("leaves the duration on its own for a dive with no depths", () => {
    // Every hand-logged dive that skipped them. An empty "Maximum Depth" block
    // beside the duration would read as something the diver failed to fill in.
    render(<DiveDetailMain dive={dive()} />);

    expect(screen.getByText("45min")).toBeInTheDocument();
    expect(screen.queryByText(/maximum depth/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/average depth/i)).not.toBeInTheDocument();
  });

  it("shows a recorded maximum without inventing an average", () => {
    // The half-filled case, which is the one the two blocks are separately
    // conditional for.
    render(<DiveDetailMain dive={dive({ max_depth: 30.52 })} />);

    expect(screen.getByText("30.52m")).toBeInTheDocument();
    expect(screen.getByText(/maximum depth/i)).toBeInTheDocument();
    expect(screen.queryByText(/average depth/i)).not.toBeInTheDocument();
  });

  it("keeps a zero-metre average, which is a reading rather than an absence", () => {
    // `!= null`, not truthiness. 0 m is not a depth any dive computer reports, but
    // the guard is the same one that has bitten `gas_number` and the mixture
    // pressures in this repo, so it is worth holding here too.
    render(<DiveDetailMain dive={dive({ max_depth: 30.52, avg_depth: 0 })} />);

    expect(screen.getByText(/average depth/i)).toBeInTheDocument();
    expect(screen.getByText("0m")).toBeInTheDocument();
  });
});
