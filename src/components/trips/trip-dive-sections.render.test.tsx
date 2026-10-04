import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Dive } from "@/lib/api/dives";
import type { TripPart } from "@/lib/api/trips";
import userEvent from "@testing-library/user-event";
import { TripDiveSections } from "./trip-dive-sections";

// Which part a dive lands in is `tripDiveSections`', tested beside it. What a
// render adds is the cards: each part's place over its dates, the dives between
// them outside any card, and the one card a trip falls back to.

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/trip-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/dives/dive-card", () => ({
  DiveCard: ({ dive }: { dive: Dive }) => <li>{dive.uuid}</li>,
}));

const dive = (uuid: string, start_time: string) =>
  ({ uuid, start_time }) as Dive;

const PARTS: TripPart[] = [
  {
    location: { name: "Dahab" },
    start_date: "2026-04-03",
    end_date: "2026-04-08",
  },
  { start_date: "2026-04-10", end_date: "2026-04-12" },
];

const renderSections = (dives: Dive[] | null, parts = PARTS) =>
  render(
    <TripDiveSections
      dives={dives}
      loadFailed={false}
      parts={parts}
      newDiveHref="/dives/new?trip_uuid=trip-1"
    />,
  );

describe("TripDiveSections", () => {
  it("heads each part's card with its place over its dates, and its dates alone where it has no place", () => {
    renderSections([
      dive("transit", "2026-04-11T09:00:00Z"),
      dive("gap", "2026-04-09T09:00:00Z"),
      dive("dahab", "2026-04-04T09:00:00Z"),
    ]);
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Apr 10 - Apr 12, 2026",
      "Dahab",
    ]);
    expect(screen.getByText("Apr 3 - Apr 8, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Dives in This Trip")).not.toBeInTheDocument();
  });

  it("puts the dives no part covers between the cards, outside them", () => {
    renderSections([
      dive("transit", "2026-04-11T09:00:00Z"),
      dive("gap", "2026-04-09T09:00:00Z"),
      dive("dahab", "2026-04-04T09:00:00Z"),
    ]);
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "transit",
      "gap",
      "dahab",
    ]);
    // A list inside a card sits in its content, beside no heading; the loose
    // one sits beside the cards themselves.
    const gapList = screen.getByText("gap").closest("ul")!;
    expect(within(gapList.parentElement!).getAllByRole("heading")).toHaveLength(
      2,
    );
    const dahabList = screen.getByText("dahab").closest("ul")!;
    expect(
      within(dahabList.parentElement!).queryAllByRole("heading"),
    ).toHaveLength(0);
  });

  it("says so in the card of a part holding no dive", () => {
    renderSections([dive("dahab", "2026-04-04T09:00:00Z")]);
    expect(
      screen.getByRole("heading", { level: 2, name: "Apr 10 - Apr 12, 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No dives logged for this part yet"),
    ).toBeInTheDocument();
  });

  it("folds a part's card to its header from its title, and opens it again", async () => {
    const user = userEvent.setup();
    renderSections([dive("dahab", "2026-04-04T09:00:00Z")]);
    const toggle = screen.getByRole("button", { name: "Dahab" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("dahab")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("dahab")).not.toBeInTheDocument();
    // The dates under the title stay, and so does the other part.
    expect(screen.getByText("Apr 3 - Apr 8, 2026")).toBeInTheDocument();
    expect(
      screen.getByText("No dives logged for this part yet"),
    ).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText("dahab")).toBeInTheDocument();
  });

  it("keeps the one card of every dive on a trip with no parts", () => {
    renderSections([dive("gap", "2026-04-09T09:00:00Z")], []);
    expect(
      screen.getByRole("heading", { level: 2, name: "Dives in This Trip" }),
    ).toBeInTheDocument();
    expect(screen.getByText("gap")).toBeInTheDocument();
  });

  it("offers to log a dive on a trip with neither dives nor parts", () => {
    renderSections([], []);
    expect(
      screen.getByRole("link", { name: "Log a dive for this trip" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/dives/new?trip_uuid=trip-1"),
    );
  });
});
