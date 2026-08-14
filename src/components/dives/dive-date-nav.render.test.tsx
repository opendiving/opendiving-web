import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DiveDateNav } from "./dive-date-nav";
import type { DiveNeighbors } from "@/lib/api/dives";

// The date line itself is `formatDiveStartTime`'s and is tested in
// `lib/date-time.test.ts`. What only a render reaches is the wiring around it: which
// arrow points at which end of the log (getting this backwards is invisible until you
// click), that an end of the log leaves an arrow present but dead rather than dropping
// it, that stepping to a neighbour never leaves the arrows aimed at the dive you just
// left - the reason the fetched neighbours are keyed by uuid - and that the arrow
// keeps its DOM node across that step, which is the only thing standing between a
// keyboard diver and re-tabbing to `>` on every dive in a trip.

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

const APRIL_4 = "2021-04-04T10:04:47+02:00";

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

describe("DiveDateNav", () => {
  beforeEach(() => {
    vi.mocked(divesAPI.getDiveNeighbors).mockReset();
    push.mockClear();
  });

  // The `console.error` stub below would otherwise stay installed for the rest of
  // the file, silently disarming the one signal an unexpected failure would raise.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("points the left arrow at the earlier dive and the right at the later one", async () => {
    // The whole point of the control, and the one thing a `>` can get wrong while
    // still rendering perfectly: `getDives` lists newest first, so "next" is the
    // opposite direction there.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(neighbors());

    render(<DiveDateNav diveUuid="current-uuid" startTime={APRIL_4} />);

    const previous = await screen.findByRole("link", {
      name: /previous dive/i,
    });
    expect(previous).toHaveAttribute("href", "/dives/older-uuid");
    expect(previous).toHaveAccessibleName(/#11, Apr 3, 2021/);

    const next = screen.getByRole("link", { name: /next dive/i });
    expect(next).toHaveAttribute("href", "/dives/newer-uuid");
    expect(next).toHaveAccessibleName(/#13, Apr 5, 2021/);
  });

  it("keeps the dive's own date beside the arrows", async () => {
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(neighbors());

    render(<DiveDateNav diveUuid="current-uuid" startTime={APRIL_4} />);

    // Rendered from the prop, so it is on screen before the neighbours arrive -
    // asserted without awaiting for exactly that reason.
    expect(screen.getByText(/April 4, 2021 at 10:04/)).toBeInTheDocument();

    // Then let the fetch settle, so the state update lands inside the test rather
    // than after teardown.
    await screen.findByRole("link", { name: /previous dive/i });
  });

  it("leaves an end of the log dead rather than dropping its arrow", async () => {
    // The newest dive in the log. A dropped arrow would slide the date sideways as
    // the diver steps onto it, and would say nothing about why stepping stopped.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(
      neighbors({ next: null }),
    );

    render(<DiveDateNav diveUuid="current-uuid" startTime={APRIL_4} />);

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

  it("keeps the same arrow node - and the focus on it - across a step", async () => {
    // The reason this component doesn't use `next/link`. A keyboard diver tabs to
    // `>`, presses Enter, and lands on the next dive; if the arrow's DOM node is
    // replaced on the way - which alternating `<Link>` with anything else does -
    // the browser drops focus to `<body>` and they tab back for every dive in the
    // trip.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(neighbors());

    const { rerender } = render(
      <DiveDateNav diveUuid="current-uuid" startTime={APRIL_4} />,
    );
    const before = await screen.findByRole("link", { name: /next dive/i });
    before.focus();
    expect(document.activeElement).toBe(before);

    // The step itself: same component, new dive, neighbours not yet known - the
    // window in which the arrow has nothing to point at.
    rerender(
      <DiveDateNav
        diveUuid="newer-uuid"
        startTime="2021-04-05T09:00:00+02:00"
      />,
    );

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

    render(<DiveDateNav diveUuid="current-uuid" startTime={APRIL_4} />);
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

  it("leaves both arrows dead when the neighbours can't be loaded", async () => {
    // A failure here is not the diver's problem - the dive they came for rendered
    // fine - so it costs them the shortcut and nothing else.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(divesAPI.getDiveNeighbors).mockRejectedValue(new Error("boom"));

    render(<DiveDateNav diveUuid="current-uuid" startTime={APRIL_4} />);

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
      const arrow = screen.getByRole("link", { name });
      expect(arrow).toHaveAttribute("aria-disabled", "true");
      expect(arrow).not.toHaveAttribute("href");
    }
  });

  it("never aims the arrows at the dive that was just navigated away from", async () => {
    // Following one of these arrows swaps the uuid on a component that stays
    // mounted. Held as plain state, the old dive's neighbours would still be on
    // screen for the length of the new fetch - long enough to click, and the click
    // would land two dives from where it looked like it went.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue(neighbors());

    const { rerender } = render(
      <DiveDateNav diveUuid="current-uuid" startTime={APRIL_4} />,
    );
    await screen.findByRole("link", { name: /previous dive/i });

    let resolveSecond: (value: DiveNeighbors) => void = () => {};
    vi.mocked(divesAPI.getDiveNeighbors).mockReturnValue(
      new Promise<DiveNeighbors>((resolve) => {
        resolveSecond = resolve;
      }),
    );
    rerender(
      <DiveDateNav
        diveUuid="newer-uuid"
        startTime="2021-04-05T09:00:00+02:00"
      />,
    );

    // Dead, rather than still carrying the previous dive's destination.
    expect(
      screen.getByRole("link", { name: "Previous dive" }),
    ).not.toHaveAttribute("href");

    resolveSecond(
      neighbors({
        previous: {
          uuid: "current-uuid",
          dive_number: 12,
          start_time: APRIL_4,
        },
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /previous dive/i }),
      ).toHaveAttribute("href", "/dives/current-uuid");
    });
  });
});
