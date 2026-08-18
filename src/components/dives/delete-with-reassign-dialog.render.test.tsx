import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteWithReassignDialog } from "./delete-with-reassign-dialog";

vi.mock("@/lib/api/dives", () => ({
  divesAPI: { countDives: vi.fn() },
}));

vi.mock("@/lib/api/trips", () => ({
  tripsAPI: { getTrips: vi.fn() },
}));

vi.mock("@/lib/api/dive-sites", () => ({
  diveSitesAPI: { getDiveSites: vi.fn() },
}));

const { divesAPI } = await import("@/lib/api/dives");
const { tripsAPI } = await import("@/lib/api/trips");
const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const countDives = vi.mocked(divesAPI.countDives);
const getTrips = vi.mocked(tripsAPI.getTrips);
const getDiveSites = vi.mocked(diveSitesAPI.getDiveSites);

const OTHER_TRIP = { uuid: "trip-2", name: "Cebu 2026" };
const OTHER_SITE = {
  uuid: "site-2",
  name: "Blue Hole",
  location: "Dahab, Egypt",
};

const onePageOf = (data: unknown[]) =>
  ({
    data,
    total_count: data.length,
    has_more: false,
    page: 1,
    items_per_page: 25,
  }) as never;

beforeEach(() => {
  countDives.mockReset();
  getTrips.mockReset();
  getDiveSites.mockReset();
  countDives.mockResolvedValue(3);
  getTrips.mockResolvedValue(onePageOf([OTHER_TRIP]));
  getDiveSites.mockResolvedValue(onePageOf([OTHER_SITE]));
});

function Dialog({
  onConfirm = vi.fn(),
  targetId = "trip-1",
}: {
  onConfirm?: (moveDivesTo?: string, name?: string) => void | Promise<void>;
  targetId?: string | null;
}) {
  return (
    <DeleteWithReassignDialog
      kind="trip"
      userId="u1"
      targetId={targetId}
      title="Delete trip"
      description="Are you sure?"
      isDeleting={false}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />
  );
}

const moveCheckbox = () =>
  screen.getByRole("checkbox", { name: /Move 3 dives to another trip first/ });

const deleteButton = () => screen.getByRole("button", { name: "Delete" });

// Picks "Cebu 2026" out of the replacement picker.
const pickReplacement = async () => {
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: /Cebu/ }));
};

describe("DeleteWithReassignDialog", () => {
  it("offers to move the dives once the count comes back", async () => {
    render(<Dialog />);

    expect(await screen.findByRole("checkbox")).not.toBeChecked();
    expect(moveCheckbox()).toBeVisible();
  });

  it("holds the delete shut until the count says whether to offer", async () => {
    // The dialog opens instantly; the count lands a beat later. Deleting in that
    // gap would silently skip an offer the diver never saw - and orphaning dives
    // is not undoable from the UI, since a deleted trip stops appearing anywhere
    // they could be re-pointed from.
    let resolveCount: (n: number) => void = () => {};
    countDives.mockReturnValue(
      new Promise<number>((resolve) => {
        resolveCount = resolve;
      }),
    );
    render(<Dialog />);

    expect(deleteButton()).toBeDisabled();

    await act(async () => resolveCount(3));

    await waitFor(() => expect(deleteButton()).toBeEnabled());
  });

  it("gives up on a count that never answers", async () => {
    // A hang is not a rejection: `apiClient` sets no timeout, so without a
    // deadline the disabled Delete button would wait as long as the browser does.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    countDives.mockReturnValue(new Promise<number>(() => {}));
    render(<Dialog />);

    expect(deleteButton()).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(await screen.findByText(/Couldn't check which dives/)).toBeVisible();
    expect(deleteButton()).toBeEnabled();
    vi.useRealTimers();
  });

  it("makes no offer when nothing references the target", async () => {
    countDives.mockResolvedValue(0);
    render(<Dialog />);

    await waitFor(() => expect(countDives).toHaveBeenCalled());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(deleteButton()).toBeEnabled();
  });

  it("says so rather than silently dropping the offer when the count fails", async () => {
    countDives.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Dialog />);

    expect(await screen.findByText(/Couldn't check which dives/)).toBeVisible();
    // Deleting outright is still on the table - the count failing says nothing
    // about whether the diver meant to delete.
    expect(deleteButton()).toBeEnabled();
  });

  it("deletes without moving anything while the box is unchecked", async () => {
    const onConfirm = vi.fn();
    render(<Dialog onConfirm={onConfirm} />);
    await screen.findByRole("checkbox");

    await userEvent.click(deleteButton());

    // No `move_dives_to` argument at all, which is what keeps a plain delete
    // byte-identical to the one this dialog replaced.
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith());
  });

  it("blocks the delete until a replacement is chosen", async () => {
    render(<Dialog />);
    await userEvent.click(await screen.findByRole("checkbox"));

    expect(deleteButton()).toBeDisabled();

    await pickReplacement();

    await waitFor(() => expect(deleteButton()).toBeEnabled());
  });

  it("hands back the chosen replacement, and its name for the toast", async () => {
    // The uuid becomes `move_dives_to` on the delete; the name is only carried so
    // the toast afterwards can say where the dives went, since the API answers
    // with a count and nothing to call the destination.
    const onConfirm = vi.fn();
    render(<Dialog onConfirm={onConfirm} />);

    await userEvent.click(await screen.findByRole("checkbox"));
    await pickReplacement();
    await userEvent.click(deleteButton());

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith("trip-2", "Cebu 2026"),
    );
  });

  it("keeps the target out of its own replacement list", async () => {
    // Moving a trip's dives onto the trip being deleted is the one choice that
    // cannot work - and the API answers it with a 422 rather than a silent no-op,
    // so this is the difference between an impossible option and an error.
    render(<Dialog />);
    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("combobox"));

    await screen.findByRole("option", { name: /Cebu/ });
    expect(
      screen.queryByRole("option", { name: /trip-1/ }),
    ).not.toBeInTheDocument();
  });

  it("will not resolve a typed name to the target itself", async () => {
    // Two trips of the same name is the merge case this feature is for, and the
    // combobox resolves typed text against its *result list*, not against the
    // menu. Before the target was filtered out of the results, typing the shared
    // name here picked the trip being deleted: Delete lit up, and the request
    // went out with `move_dives_to` equal to the uuid being deleted - a 422.
    getTrips.mockResolvedValue(
      onePageOf([
        { uuid: "trip-1", name: "Cebu 2026" },
        { uuid: "trip-2", name: "Cebu 2026" },
      ]),
    );
    const onConfirm = vi.fn();
    render(<Dialog onConfirm={onConfirm} />);

    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Cebu 2026");
    await userEvent.tab();

    // Whatever it resolved to, it cannot be the trip being deleted.
    await userEvent.click(deleteButton());
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm).not.toHaveBeenCalledWith("trip-1", expect.anything());
  });

  it("offers only one option when a duplicate name is the target's own", async () => {
    getTrips.mockResolvedValue(
      onePageOf([
        { uuid: "trip-1", name: "Cebu 2026" },
        { uuid: "trip-2", name: "Cebu 2026" },
      ]),
    );
    render(<Dialog />);

    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("combobox"));

    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /Cebu/ })).toHaveLength(1),
    );
  });

  it("starts clean when reopened on a different trip", async () => {
    // The offer, the checkbox and the picked replacement all belong to the trip
    // they were chosen for. Carried over, the dialog would offer to move the new
    // trip's dives onto a destination the diver picked for the old one.
    const onConfirm = vi.fn();
    const { rerender } = render(<Dialog onConfirm={onConfirm} />);
    await userEvent.click(await screen.findByRole("checkbox"));
    await pickReplacement();

    rerender(<Dialog onConfirm={onConfirm} targetId="trip-9" />);

    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

// The site half of the component is the same flow through a different half of
// `COPY` - its own endpoint, its own wording - and none of that is exercised by
// the trip tests above.
describe("DeleteWithReassignDialog, deleting a dive site", () => {
  const SiteDialog = ({ onConfirm = vi.fn() }) => (
    <DeleteWithReassignDialog
      kind="dive-site"
      userId="u1"
      targetId="site-1"
      title="Delete dive site"
      description="Are you sure?"
      isDeleting={false}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />
  );

  it("counts and searches against the dive site, not the trip", async () => {
    const onConfirm = vi.fn();
    render(<SiteDialog onConfirm={onConfirm} />);

    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: /Move 3 dives to another dive site first/,
      }),
    );
    await userEvent.click(screen.getByRole("combobox"));
    // The location rides along as the option's hint, which is what tells two
    // sites of the same name apart in the menu.
    await userEvent.click(
      await screen.findByRole("option", { name: /Blue Hole.*Dahab/ }),
    );
    await userEvent.click(deleteButton());

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith("site-2", "Blue Hole"),
    );
    expect(countDives).toHaveBeenCalledWith("u1", { diveSiteUuid: "site-1" });
    expect(getTrips).not.toHaveBeenCalled();
  });
});
