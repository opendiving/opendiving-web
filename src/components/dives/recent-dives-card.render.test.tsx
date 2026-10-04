import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RecentDivesCard } from "./recent-dives-card";
import type { Dive } from "@/lib/api/dives";

// A detail page's dive list that holds nothing drops its header to its hidden
// heading, as the list pages' cards do; the dashboard's preview keeps its own
// beside the trips card.

vi.mock("@/lib/api/dives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dives")>()),
  divesAPI: { getDives: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/gear/gear-1",
  useSearchParams: () => new URLSearchParams(),
}));

// The row is covered where it lives; what matters here is that there is one.
vi.mock("@/components/dives/dive-card", () => ({
  DiveCard: ({ dive }: { dive: Dive }) => <li>Dive {dive.dive_number}</li>,
}));

const { divesAPI } = await import("@/lib/api/dives");
const getDives = vi.mocked(divesAPI.getDives);

const page = (data: Dive[]) => ({
  data,
  total_count: data.length,
  has_more: false,
  page: 1,
  items_per_page: 10,
});

beforeEach(() => {
  vi.clearAllMocks();
  // A fresh object per call - see DECISIONS.md, "A shared mock response object
  // hides a render loop".
  getDives.mockImplementation(async () => page([]));
});

const headingOf = (name: string) =>
  screen.getByRole("heading", { level: 2, name });

const gearCard = () => (
  <RecentDivesCard
    complete
    enabled
    gearItemId="gear-1"
    title="Dives with This Gear"
    description="Every dive this item was used on"
    viewAllHref={null}
    emptyTitle="Not used on any dive yet"
  />
);

describe("RecentDivesCard's header", () => {
  it("drops to its hidden heading when a complete list is empty", async () => {
    render(gearCard());
    await screen.findByText("Not used on any dive yet");

    const heading = headingOf("Dives with This Gear");
    expect(heading).toHaveClass("sr-only");
    expect([...heading.parentElement!.children]).toEqual([heading]);
    expect(
      screen.queryByText("Every dive this item was used on"),
    ).not.toBeInTheDocument();
  });

  it("stays while the list is still loading", () => {
    getDives.mockReturnValue(new Promise(() => {}));

    render(gearCard());

    expect(headingOf("Dives with This Gear")).not.toHaveClass("sr-only");
  });

  it("stays when the list has a dive in it", async () => {
    getDives.mockImplementation(async () =>
      page([{ uuid: "dive-1", dive_number: 7 } as Dive]),
    );

    render(gearCard());
    await screen.findByText("Dive 7");

    expect(headingOf("Dives with This Gear")).not.toHaveClass("sr-only");
    expect(
      screen.getByText("Every dive this item was used on"),
    ).toBeInTheDocument();
  });

  it("stays on the dashboard's empty preview", async () => {
    render(<RecentDivesCard enabled />);
    await screen.findByText("No dives logged yet");

    expect(headingOf("Recent Dives")).not.toHaveClass("sr-only");
    expect(
      screen.getByRole("link", { name: "View all dives" }),
    ).toBeInTheDocument();
  });
});

describe("RecentDivesCard's refreshOn", () => {
  const siteCard = (refreshOn: number) => (
    <RecentDivesCard
      complete
      enabled
      diveSiteId="site-1"
      refreshOn={refreshOn}
    />
  );

  it("re-reads the dives on screen when it changes, and not before", async () => {
    // A site's edit moves the pin on every card below it, so the page counts
    // its saves and the cards are read again on each one.
    getDives.mockImplementation(async () =>
      page([{ uuid: "dive-1", dive_number: 7 } as Dive]),
    );
    const { rerender } = render(siteCard(0));
    await screen.findByText("Dive 7");
    rerender(siteCard(0));
    expect(getDives).toHaveBeenCalledTimes(1);

    getDives.mockImplementation(async () =>
      page([{ uuid: "dive-1", dive_number: 8 } as Dive]),
    );
    rerender(siteCard(1));

    await screen.findByText("Dive 8");
    await waitFor(() => expect(getDives).toHaveBeenCalledTimes(2));
  });
});
