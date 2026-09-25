import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DiveDetailPage from "./page";
import {
  DiveDetailProvider,
  useDiveDetail,
  type DiveDetailValue,
} from "@/components/dives/dive-detail-context";
import type { Dive } from "@/lib/api/dives";

// What this page is, once the header and the fetch moved up into the layout: the
// card grid, plus the one piece of state the split exists to make reachable. The
// dim under `isLoading` is dead code without it - the page used to be re-mounted
// by the step it is supposed to fade through, so it never rendered with a dive
// *and* a load in flight. A render is the only place that combination can be
// staged; the step that produces it in a browser is `dives/(detail)/layout.tsx`'s
// business and is verified there, by hand.

vi.mock("@/components/dives/dive-detail-main", () => ({
  DiveDetailMain: ({ dive }: { dive: Dive }) => (
    <div data-testid="main">{dive.uuid}</div>
  ),
}));

vi.mock("@/components/dives/dive-detail-sidebar", () => ({
  DiveDetailSidebar: ({ dive }: { dive: Dive }) => (
    <div data-testid="sidebar">{dive.uuid}</div>
  ),
}));

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "dive-492",
    dive_number: 492,
    start_time: "2021-04-04T10:04:47+02:00",
    duration: 2700,
    created_at: "2021-04-05T08:00:00+02:00",
    user_uuid: "user",
    notes: "",
    dive_sites: [],
    gear_items: [],
    mixtures: [],
    ...overrides,
  };
}

function renderPage(value: Partial<DiveDetailValue> = {}) {
  const { container } = render(
    <DiveDetailProvider
      value={{
        dive: dive(),
        isLoading: false,
        trip: null,
        course: null,
        contact: null,
        refreshDive: vi.fn(),
        ...value,
      }}
    >
      <DiveDetailPage />
    </DiveDetailProvider>,
  );
  return container.firstElementChild as HTMLElement;
}

describe("DiveDetailPage", () => {
  it("renders the layout's dive in both cards", () => {
    renderPage();

    expect(screen.getByTestId("main")).toHaveTextContent("dive-492");
    expect(screen.getByTestId("sidebar")).toHaveTextContent("dive-492");
  });

  it("dims the grid while a neighbouring dive is on its way in", () => {
    // The cards still describe the dive being stepped away from - which is why
    // they are faded rather than replaced, and why the layout keeps handing this
    // page the outgoing dive until the next one lands.
    expect(renderPage({ isLoading: true })).toHaveClass("opacity-50");
  });

  it("leaves the grid at full opacity once the dive has settled", () => {
    expect(renderPage()).not.toHaveClass("opacity-50");
  });

  it("refuses to render outside the layout that loads the dive", () => {
    // The context has no default, so a consumer moved out from under the layout
    // fails here rather than rendering a page with no dive on it.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    function Orphan() {
      useDiveDetail();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(/inside the dive detail layout/);

    consoleError.mockRestore();
  });
});
