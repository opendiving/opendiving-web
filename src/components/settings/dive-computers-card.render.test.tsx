import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DiveComputer } from "@/lib/api/dive-computers";
import { DiveComputersCard } from "./dive-computers-card";

// The reorder is driven through the arrow keys, the one path a DOM without
// layout can drive; the pointer path is `useDragSort`'s own.

const mocks = vi.hoisted(() => ({
  getDiveComputers: vi.fn(),
  setOrder: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api/dive-computers", () => ({
  diveComputersAPI: {
    getDiveComputers: mocks.getDiveComputers,
    setOrder: mocks.setOrder,
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const PERDIX: DiveComputer = {
  serial: "D9772626",
  brand: "Shearwater",
  model: "Perdix 3",
  name: null,
  position: 0,
};
const OCEAN: DiveComputer = {
  serial: "2238104",
  brand: "suunto",
  model: "Suunto Ocean",
  name: "Porvoo",
  position: 1,
};
// Placed before any recording of it arrived.
const PLACED: DiveComputer = {
  serial: "253810000400",
  brand: null,
  model: null,
  name: null,
  position: 2,
};

const inOrder = (...computers: DiveComputer[]) =>
  computers.map((computer, position) => ({ ...computer, position }));

const rows = () =>
  screen.getAllByRole("listitem").map((row) => row.textContent?.trim());

beforeEach(() => {
  mocks.getDiveComputers.mockReset();
  mocks.setOrder.mockReset();
  mocks.toast.mockReset();
});

describe("DiveComputersCard", () => {
  it("lists the computers in the API's order, each named as a recording's device", async () => {
    mocks.getDiveComputers.mockResolvedValue(inOrder(PERDIX, OCEAN, PLACED));
    render(<DiveComputersCard />);

    expect(
      await screen.findByRole("heading", { name: "Dive Computers" }),
    ).toBeInTheDocument();
    expect(rows()).toEqual([
      "Shearwater Perdix 3 · D9772626",
      "Suunto Ocean · 2238104 (Porvoo)",
      "253810000400",
    ]);
    expect(
      screen.getByText(
        "When more than one computer recorded a dive, the recording from the highest one in this list is shown by default. Dives already in your logbook keep the recording they show.",
      ),
    ).toBeInTheDocument();
  });

  it("sends the whole order on each arrow-key move and redraws from the answer", async () => {
    mocks.getDiveComputers.mockResolvedValue(inOrder(PERDIX, OCEAN, PLACED));
    // The API's answer is what is drawn, labels and all.
    mocks.setOrder.mockResolvedValue(
      inOrder({ ...OCEAN, name: "Renamed" }, PERDIX, PLACED),
    );
    render(<DiveComputersCard />);

    (
      await screen.findByRole("button", {
        name: /^Reorder Shearwater Perdix 3 · D9772626, position 1 of 3/,
      })
    ).focus();
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() =>
      expect(mocks.setOrder).toHaveBeenCalledWith([
        "2238104",
        "D9772626",
        "253810000400",
      ]),
    );
    expect(mocks.setOrder).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(rows()).toEqual([
        "Suunto Ocean · 2238104 (Renamed)",
        "Shearwater Perdix 3 · D9772626",
        "253810000400",
      ]),
    );
  });

  it("holds a move made during a save until it settles, then sends the latest order", async () => {
    mocks.getDiveComputers.mockResolvedValue(inOrder(PERDIX, OCEAN, PLACED));
    let answerFirst: (computers: DiveComputer[]) => void = () => {};
    mocks.setOrder
      .mockImplementationOnce(
        () => new Promise((resolve) => (answerFirst = resolve)),
      )
      .mockResolvedValueOnce(inOrder(OCEAN, PLACED, PERDIX));
    render(<DiveComputersCard />);

    (
      await screen.findByRole("button", { name: /^Reorder Shearwater/ })
    ).focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toMatch(
        /position 2 of 3/,
      ),
    );
    await userEvent.keyboard("{ArrowDown}");
    const latest = [
      "Suunto Ocean · 2238104 (Porvoo)",
      "253810000400",
      "Shearwater Perdix 3 · D9772626",
    ];
    await waitFor(() => expect(rows()).toEqual(latest));
    expect(mocks.setOrder).toHaveBeenCalledTimes(1);

    // The first answer is behind the second move, and is not drawn.
    await act(async () => answerFirst(inOrder(OCEAN, PERDIX, PLACED)));
    expect(rows()).toEqual(latest);

    await waitFor(() => expect(mocks.setOrder).toHaveBeenCalledTimes(2));
    expect(mocks.setOrder).toHaveBeenLastCalledWith([
      "2238104",
      "253810000400",
      "D9772626",
    ]);
    await act(async () => {});
    expect(rows()).toEqual(latest);
  });

  it("says when a move is refused and redraws the stored order", async () => {
    mocks.getDiveComputers.mockResolvedValue(inOrder(PERDIX, OCEAN));
    mocks.setOrder.mockRejectedValue({
      response: { status: 422, data: { detail: "A serial is repeated." } },
    });
    render(<DiveComputersCard />);

    (
      await screen.findByRole("button", { name: /^Reorder Shearwater/ })
    ).focus();
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    await waitFor(() =>
      expect(rows()).toEqual([
        "Shearwater Perdix 3 · D9772626",
        "Suunto Ocean · 2238104 (Porvoo)",
      ]),
    );
    expect(mocks.getDiveComputers).toHaveBeenCalledTimes(2);
  });

  it("offers no handle for a single computer", async () => {
    mocks.getDiveComputers.mockResolvedValue(inOrder(PERDIX));
    render(<DiveComputersCard />);

    expect(await screen.findByText(/^Shearwater Perdix 3/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Reorder/ }),
    ).not.toBeInTheDocument();
  });

  it("draws nothing for an account with no computer", async () => {
    mocks.getDiveComputers.mockResolvedValue([]);
    const { container } = render(<DiveComputersCard />);

    await waitFor(() => expect(mocks.getDiveComputers).toHaveBeenCalled());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  // An API from before the route 404s on it: a feature this copy does not have.
  it("draws nothing when the API has no such route", async () => {
    mocks.getDiveComputers.mockRejectedValue({ response: { status: 404 } });
    const { container } = render(<DiveComputersCard />);

    await waitFor(() => expect(mocks.getDiveComputers).toHaveBeenCalled());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("offers another try when the list fails to load", async () => {
    mocks.getDiveComputers
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce(inOrder(PERDIX));
    render(<DiveComputersCard />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );

    expect(await screen.findByText(/^Shearwater Perdix 3/)).toBeInTheDocument();
  });
});
