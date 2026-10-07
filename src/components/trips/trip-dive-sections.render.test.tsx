import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { Dive } from "@/lib/api/dives";
import type { TripPart } from "@/lib/api/trips";
import userEvent from "@testing-library/user-event";
import { TripDiveSections } from "./trip-dive-sections";

// Which part a dive lands in is `tripDiveSections`', tested beside it. What a
// render adds is the cards: each part's place over its dates, the dives between
// them outside any card, and the one card a trip falls back to - and on a
// candidate, the Add control with the items its counts allow.

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/trip-1",
  useSearchParams: () => new URLSearchParams(),
}));
// The card's link and, as the real card has, either the control it is handed
// or its menu in the corner.
vi.mock("@/components/dives/dive-card", () => ({
  DiveCard: ({ dive, addToTrip }: { dive: Dive; addToTrip?: ReactNode }) => (
    <li data-candidate={addToTrip ? "" : undefined}>
      <a href={`/dives/${dive.uuid}`}>{dive.uuid}</a>
      {addToTrip ?? (
        <button type="button" aria-haspopup="menu">
          Actions for {dive.uuid}
        </button>
      )}
    </li>
  ),
}));

const dive = (
  uuid: string,
  start_time: string,
  trip_uuid: string | null = "trip-1",
) => ({ uuid, start_time, trip_uuid, dive_number: 400 }) as Dive;

const PARTS: TripPart[] = [
  {
    location: { name: "Dahab" },
    start_date: "2026-04-03",
    end_date: "2026-04-08",
  },
  { start_date: "2026-04-10", end_date: "2026-04-12" },
];

const renderSections = (
  dives: Dive[] | null,
  parts = PARTS,
  {
    hasMore = false,
    candidateCount = 0,
    onAdd = vi.fn(async () => true),
  }: {
    hasMore?: boolean;
    candidateCount?: number;
    onAdd?: (...args: unknown[]) => Promise<boolean>;
  } = {},
) =>
  render(
    <TripDiveSections
      dives={dives}
      hasMore={hasMore}
      loadFailed={false}
      parts={parts}
      candidateCount={candidateCount}
      newDiveHref="/dives/new?trip_uuid=trip-1"
      onAdd={onAdd}
    />,
  );

// The cards' text, which is the link's: a card's dive uuid.
const cardTexts = () =>
  screen.getAllByRole("link").map((link) => link.textContent);

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
    expect(cardTexts()).toEqual(["transit", "gap", "dahab"]);
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

  describe("with candidates", () => {
    // Dahab holds four candidates and the trip nine, the rest on parts not
    // loaded here.
    const counted: TripPart[] = [
      { ...PARTS[0], candidate_count: 4 },
      { ...PARTS[1], candidate_count: 1 },
    ];
    const listed = [
      dive("transit", "2026-04-11T09:00:00Z", null),
      dive("own", "2026-04-05T09:00:00Z"),
      dive("dahab", "2026-04-04T09:00:00Z", null),
    ];

    it("marks the candidates, in date order among the trip's dives, and no dive of the trip", () => {
      renderSections(listed, counted, { candidateCount: 9 });
      const candidates = screen
        .getAllByRole("listitem")
        .filter((item) => item.hasAttribute("data-candidate"))
        .map((item) => within(item).getByRole("link").textContent);
      expect(candidates).toEqual(["transit", "dahab"]);
      expect(cardTexts()).toEqual(["transit", "own", "dahab"]);
      expect(
        screen.getByRole("button", { name: "Actions for own" }),
      ).toBeInTheDocument();
    });

    const menuItems = async (name: string) => {
      await userEvent.click(screen.getByRole("button", { name }));
      return screen.getAllByRole("menuitem").map((item) => item.textContent);
    };

    it("offers this dive, its part's and the trip's, each with its count", async () => {
      renderSections([listed[2]], counted, { candidateCount: 9 });
      expect(await menuItems("Add to trip: dive #400")).toEqual([
        "Add this dive",
        "Add all 4 dives from this part",
        "Add all 9 unassigned dives",
      ]);
    });

    it("offers the trip's but no part item on the only candidate in its part", async () => {
      renderSections([listed[0]], counted, { candidateCount: 3 });
      expect(await menuItems("Add to trip: dive #400")).toEqual([
        "Add this dive",
        "Add all 3 unassigned dives",
      ]);
    });

    it("offers no trip item where the part holds every candidate", async () => {
      renderSections([listed[2]], counted, { candidateCount: 4 });
      expect(await menuItems("Add to trip: dive #400")).toEqual([
        "Add this dive",
        "Add all 4 dives from this part",
      ]);
    });

    it("adds the trip's only candidate at once, with no menu", async () => {
      const onAdd = vi.fn(async () => true);
      renderSections([listed[0]], counted, { candidateCount: 1, onAdd });
      await userEvent.click(
        screen.getByRole("button", { name: "Add to trip: dive #400" }),
      );
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(onAdd).toHaveBeenCalledWith({ dive_uuids: ["transit"] }, 1);
    });

    it("hands each item's scope to the add: the dive, the part by its dates, or every candidate", async () => {
      const onAdd = vi.fn(async () => false);
      renderSections([listed[2]], counted, { candidateCount: 9, onAdd });
      const pick = async (item: string) => {
        await userEvent.click(
          screen.getByRole("button", { name: "Add to trip: dive #400" }),
        );
        await userEvent.click(screen.getByRole("menuitem", { name: item }));
        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: "Add to trip: dive #400" }),
          ).toBeEnabled(),
        );
      };

      await pick("Add this dive");
      expect(onAdd).toHaveBeenLastCalledWith({ dive_uuids: ["dahab"] }, 1);
      await pick("Add all 4 dives from this part");
      expect(onAdd).toHaveBeenLastCalledWith(
        { part: { start_date: "2026-04-03", end_date: "2026-04-08" } },
        4,
      );
      await pick("Add all 9 unassigned dives");
      expect(onAdd).toHaveBeenLastCalledWith({}, 9);
    });

    it("disables the control while an add is in flight", async () => {
      let finish: (added: boolean) => void = () => {};
      const onAdd = vi.fn(
        () => new Promise<boolean>((resolve) => (finish = resolve)),
      );
      renderSections([listed[0]], counted, { candidateCount: 1, onAdd });
      const button = screen.getByRole("button", {
        name: "Add to trip: dive #400",
      });
      await userEvent.click(button);
      expect(button).toBeDisabled();
      finish(false);
      await waitFor(() => expect(button).toBeEnabled());
    });

    it("moves focus to the card's menu once the dive it added turns ordinary", async () => {
      // The page resolves the add once its re-read has landed, with the dive
      // on the trip.
      let landed: () => void = () => {};
      const onAdd = vi.fn(async () => {
        landed();
        return true;
      });
      const { rerender } = renderSections([listed[0]], counted, {
        candidateCount: 1,
        onAdd,
      });
      landed = () =>
        rerender(
          <TripDiveSections
            dives={[dive("transit", "2026-04-11T09:00:00Z")]}
            hasMore={false}
            loadFailed={false}
            parts={counted}
            candidateCount={0}
            newDiveHref="/dives/new?trip_uuid=trip-1"
            onAdd={onAdd}
          />,
        );
      screen.getByRole("button", { name: "Add to trip: dive #400" }).focus();
      await userEvent.keyboard("{Enter}");

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Actions for transit" }),
        ).toHaveFocus(),
      );
    });

    it("moves focus to the part's heading after adding more than one dive", async () => {
      const onAdd = vi.fn(async () => true);
      renderSections([listed[2]], counted, { candidateCount: 4, onAdd });
      await userEvent.click(
        screen.getByRole("button", { name: "Add to trip: dive #400" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", {
          name: "Add all 4 dives from this part",
        }),
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Dahab" })).toHaveFocus(),
      );
    });
  });

  describe("while pages remain", () => {
    const toEnd: TripPart = {
      location: { name: "Cairo" },
      end_date: "2026-04-01",
    };

    it("draws only the parts the loaded dives have settled, and every part once the list ends", () => {
      const loaded = [dive("transit", "2026-04-11T09:00:00Z")];
      const { rerender } = renderSections(loaded, [toEnd, ...PARTS], {
        hasMore: true,
      });
      const headings = () =>
        screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
      expect(headings()).toEqual(["Apr 10 - Apr 12, 2026"]);
      expect(
        screen.queryByText("No dives logged for this part yet"),
      ).not.toBeInTheDocument();

      rerender(
        <TripDiveSections
          dives={loaded}
          hasMore={false}
          loadFailed={false}
          parts={[toEnd, ...PARTS]}
          candidateCount={0}
          newDiveHref="/dives/new?trip_uuid=trip-1"
          onAdd={vi.fn(async () => true)}
        />,
      );
      expect(headings()).toEqual(["Apr 10 - Apr 12, 2026", "Dahab", "Cairo"]);
    });
  });
});
