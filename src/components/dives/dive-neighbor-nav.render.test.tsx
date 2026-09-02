import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DiveNeighborNav } from "./dive-neighbor-nav";
import type { DiveNeighbors } from "@/lib/api/dives";

// What only a render reaches is the wiring: which button points at which end of the
// log (getting this backwards is invisible until you click), that the word on screen
// stays put while the destination behind it changes - the reason the date is on the
// accessible name and not in the label - that an end of the log leaves a button
// present but dead rather than dropping it, that a new `diveUuid` never leaves the
// pager aimed at the dive you just left - the reason the fetched neighbours are keyed
// by uuid - and that the link keeps its DOM node while it goes dead and comes back,
// which is the only thing standing between a keyboard diver and re-tabbing to "Next"
// on every dive in a trip.
//
// The prop change below is a `rerender`, and a real step is a route change: the two
// were conflated here for a while, and the difference is why this file passed for
// months while a diver following the arrows lost focus on every single one. Whether
// this component survives a step at all is the route tree's business - see "The step
// remounted the page..." in DECISIONS.md. What is left here is what it does once it
// has survived one.

vi.mock("@/lib/api/dives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dives")>()),
  divesAPI: {
    getDiveNeighbors: vi.fn(),
  },
}));

const push = vi.fn();
// Stable reference, as in `useAuthGuard.test.tsx`.
const router = { push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { divesAPI } = await import("@/lib/api/dives");

function neighbors(overrides: Partial<DiveNeighbors> = {}): DiveNeighbors {
  return {
    previous: {
      uuid: "older-uuid",
      dive_number: 11,
      start_time: "2021-04-03T09:00:00+02:00",
    },
    next: {
      uuid: "newer-uuid",
      dive_number: 13,
      start_time: "2021-04-05T09:00:00+02:00",
    },
    ...overrides,
  };
}

describe("DiveNeighborNav", () => {
  beforeEach(() => {
    vi.mocked(divesAPI.getDiveNeighbors).mockReset();
    push.mockClear();
  });

  // The `console.error` stub below would otherwise stay installed for the rest of
  // the file, silently disarming the one signal an unexpected failure would raise.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("points the left button at the earlier dive and the right at the later one", async () => {
    // The whole point of the control, and the one thing it can get wrong while
    // still rendering perfectly: `getDives` lists newest first, so "next" is the
    // opposite direction there.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(neighbors());

    render(<DiveNeighborNav diveUuid="current-uuid" />);

    const previous = await screen.findByRole("link", {
      name: /previous dive/i,
    });
    expect(previous).toHaveAttribute("href", "/dives/older-uuid");
    expect(previous).toHaveAccessibleName(/#11, Apr 3, 2021/);

    const next = screen.getByRole("link", { name: /next dive/i });
    expect(next).toHaveAttribute("href", "/dives/newer-uuid");
    expect(next).toHaveAccessibleName(/#13, Apr 5, 2021/);
  });

  it("shows a word that doesn't change with the destination behind it", async () => {
    // A label carrying the neighbour's date would empty and refill on every step,
    // resizing the button under the cursor of the diver clicking it. The words are
    // fixed, and each is the start of its own accessible name - so the visible
    // label stays part of the announced one.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(neighbors());

    render(<DiveNeighborNav diveUuid="current-uuid" />);

    // On screen before the neighbours land, since neither word depends on them.
    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();

    await screen.findByRole("link", { name: /previous dive:/i });
    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("names the pair, so the two links are heard as one control", async () => {
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(neighbors());

    render(<DiveNeighborNav diveUuid="current-uuid" />);

    expect(
      screen.getByRole("navigation", { name: "Adjacent dives" }),
    ).toBeInTheDocument();
    await screen.findByRole("link", { name: /previous dive:/i });
  });

  it("leaves an end of the log dead rather than dropping its button", async () => {
    // The newest dive in the log. A dropped button would slide the pair sideways as
    // the diver steps onto it, and would say nothing about why stepping stopped.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(
      neighbors({ next: null }),
    );

    render(<DiveNeighborNav diveUuid="current-uuid" />);

    await screen.findByRole("link", { name: /previous dive/i });
    // Still a link, and still named: `aria-disabled` rather than a `<button
    // disabled>`, so the node survives the step and keeps its accessible name.
    const next = screen.getByRole("link", { name: "Next dive" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).not.toHaveAttribute("href");
    // The end of the log, not a pending fetch - the one distinction a screen
    // reader has between "you've reached the oldest dive" and "hang on".
    expect(next).toHaveAttribute("aria-busy", "false");
  });

  it("keeps the same link node - and the focus on it - when the dive changes", async () => {
    // The reason this component doesn't use `next/link`. A keyboard diver tabs to
    // "Next", presses Enter, and lands on the next dive; if the link's DOM node is
    // replaced on the way - which alternating `<Link>` with anything else does -
    // the browser drops focus to `<body>` and they tab back for every dive in the
    // trip. The replacement this reaches is the one inside a mounted component:
    // the link goes dead and comes back once per dive, and has to stay one node
    // through it. The route change around that is verified in a browser.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(neighbors());

    const { rerender } = render(<DiveNeighborNav diveUuid="current-uuid" />);
    const before = await screen.findByRole("link", { name: /next dive/i });
    before.focus();
    expect(document.activeElement).toBe(before);

    // What a step leaves behind here: same component, new dive, neighbours not
    // yet known - the window in which the button has nothing to point at.
    rerender(<DiveNeighborNav diveUuid="newer-uuid" />);

    const during = screen.getByRole("link", { name: "Next dive" });
    expect(during).toBe(before);
    expect(during).toHaveAttribute("aria-disabled", "true");
    // Dead because the neighbours aren't known yet, which is a different thing
    // from having run out of dives.
    expect(during).toHaveAttribute("aria-busy", "true");
    expect(document.activeElement).toBe(before);

    // And still the same node once the new neighbours arrive.
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /next dive:/i })).toBe(before);
    });
    expect(document.activeElement).toBe(before);
  });

  it("navigates on a plain click and leaves a modified one to the browser", async () => {
    // Both halves of what `<Link>` was doing before the node-identity problem
    // above pushed it out: a plain click is a client-side push, and cmd-click
    // still opens the dive in a new tab.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(neighbors());

    render(<DiveNeighborNav diveUuid="current-uuid" />);
    const next = await screen.findByRole("link", { name: /next dive/i });

    next.click();
    expect(push).toHaveBeenCalledWith("/dives/newer-uuid");

    push.mockClear();
    next.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
      }),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("leaves both buttons dead when the neighbours can't be loaded", async () => {
    // A failure here is not the diver's problem - the dive they came for rendered
    // fine - so it costs them the shortcut and nothing else.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(divesAPI.getDiveNeighbors).mockRejectedValue(new Error("boom"));

    render(<DiveNeighborNav diveUuid="current-uuid" />);

    // Waiting on the log line, not on the call: the call is made synchronously in
    // the effect, so waiting for it would resolve on the first check and assert a
    // state indistinguishable from "still in flight".
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to load neighbouring dives:",
        expect.any(Error),
      );
    });
    for (const name of ["Previous dive", "Next dive"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("aria-disabled", "true");
      expect(link).not.toHaveAttribute("href");
    }
  });

  it("never aims the pager at the dive that was just navigated away from", async () => {
    // Following one of these links swaps the uuid on a component that stays
    // mounted. Held as plain state, the old dive's neighbours would still be on
    // screen for the length of the new fetch - long enough to click, and the click
    // would land two dives from where it looked like it went.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(neighbors());

    const { rerender } = render(<DiveNeighborNav diveUuid="current-uuid" />);
    await screen.findByRole("link", { name: /previous dive/i });

    let resolveSecond: (value: DiveNeighbors) => void = () => {};
    vi.mocked(divesAPI.getDiveNeighbors).mockReturnValue(
      new Promise<DiveNeighbors>((resolve) => {
        resolveSecond = resolve;
      }),
    );
    rerender(<DiveNeighborNav diveUuid="newer-uuid" />);

    // Dead, rather than still carrying the previous dive's destination.
    expect(
      screen.getByRole("link", { name: "Previous dive" }),
    ).not.toHaveAttribute("href");

    resolveSecond(
      neighbors({
        previous: {
          uuid: "current-uuid",
          dive_number: 12,
          start_time: "2021-04-04T10:04:47+02:00",
        },
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /previous dive:/i }),
      ).toHaveAttribute("href", "/dives/current-uuid");
    });
  });
});
