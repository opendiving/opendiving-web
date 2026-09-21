import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteWithReassignDialog } from "./delete-with-reassign-dialog";

vi.mock("@/lib/api/trips", () => ({
  tripsAPI: { getTrips: vi.fn() },
}));

vi.mock("@/lib/api/dive-sites", () => ({
  diveSitesAPI: { getDiveSites: vi.fn() },
}));

const { tripsAPI } = await import("@/lib/api/trips");
const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const getTrips = vi.mocked(tripsAPI.getTrips);
const getDiveSites = vi.mocked(diveSitesAPI.getDiveSites);

const OTHER_TRIP = { uuid: "trip-2", name: "Cebu 2026" };
const OTHER_SITE = {
  uuid: "site-2",
  name: "Blue Hole",
  location: { name: "Dahab, Egypt" },
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
  getTrips.mockReset();
  getDiveSites.mockReset();
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
      targetId={targetId}
      isDeleting={false}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />
  );
}

const deleteButton = () => screen.getByRole("button", { name: "Delete" });

// Picks "Cebu 2026" out of the replacement picker.
const pickReplacement = async () => {
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: /Cebu/ }));
};

describe("DeleteWithReassignDialog", () => {
  it("says what deleting does and offers a destination straight away", async () => {
    // Both without asking the API anything first: the sentence is true at any
    // number of dives, so there is nothing to wait for before showing either.
    render(<Dialog />);

    expect(
      screen.getByText(/removes this trip from every dive logged on it/i),
    ).toBeVisible();
    expect(screen.getByRole("combobox")).toBeVisible();
    expect(deleteButton()).toBeEnabled();
  });

  it("deletes without moving anything while the picker is empty", async () => {
    // The picker's empty state *is* the "just delete it" option, so this has to
    // send no `move_dives_to` argument at all rather than an empty one.
    const onConfirm = vi.fn();
    render(<Dialog onConfirm={onConfirm} />);

    await userEvent.click(deleteButton());

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith());
  });

  it("opens without the picker grabbing focus", async () => {
    // Radix focuses the first tabbable descendant on open, and this dialog's
    // only child is a combobox that opens its menu on focus - so every delete
    // confirmation used to open with a list of options painted over the footer
    // (absolutely positioned, so it covers the buttons rather than moving
    // them). A click aimed at Delete landed on a trip instead, quietly filling
    // in a destination nobody chose. It also searched on every confirmation,
    // including the plain deletes that never needed to.
    render(<Dialog />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(getTrips).not.toHaveBeenCalled();
  });

  it("refuses to delete while a destination is half-typed", async () => {
    // "Ceb" with "Cebu 2026" in the menu is not a choice: the combobox clears
    // its selection on every keystroke and only an exact match re-fills it, and
    // the click on Delete blurs the field without committing a prefix. Left
    // clickable, this would delete the trip and drop the move the diver was in
    // the middle of asking for - neither of which can be undone from the UI.
    const onConfirm = vi.fn();
    render(<Dialog onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Ceb");

    await waitFor(() => expect(deleteButton()).toBeDisabled());
    expect(screen.getByText(/Pick a trip from the list/)).toBeVisible();

    // And clearing the field is the way back out to a plain delete.
    await userEvent.clear(screen.getByRole("combobox"));

    await waitFor(() => expect(deleteButton()).toBeEnabled());
    await userEvent.click(deleteButton());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith());
  });

  it("hands back the chosen replacement, and its name for the toast", async () => {
    // The uuid becomes `move_dives_to` on the delete; the name is only carried so
    // the toast afterwards can say where the dives went, since the API has no
    // reason to know what the destination is called.
    const onConfirm = vi.fn();
    render(<Dialog onConfirm={onConfirm} />);

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
    // name here picked the trip being deleted: the request went out with
    // `move_dives_to` equal to the uuid being deleted - a 422.
    getTrips.mockResolvedValue(
      onePageOf([
        { uuid: "trip-1", name: "Cebu 2026" },
        { uuid: "trip-2", name: "Cebu 2026" },
      ]),
    );
    const onConfirm = vi.fn();
    render(<Dialog onConfirm={onConfirm} />);

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

    await userEvent.click(screen.getByRole("combobox"));

    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /Cebu/ })).toHaveLength(1),
    );
  });

  it("starts clean when reopened on a different trip", async () => {
    // The picked replacement belongs to the trip it was picked for. Carried over,
    // the dialog would offer to move the new trip's dives onto a destination the
    // diver chose for the old one - and confirming would send it.
    const onConfirm = vi.fn();
    const { rerender } = render(<Dialog onConfirm={onConfirm} />);
    await pickReplacement();

    rerender(<Dialog onConfirm={onConfirm} targetId="trip-9" />);
    await userEvent.click(deleteButton());

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith());
  });
});

// The site half of the component is the same flow through a different half of
// `COPY` - its own endpoint, its own wording - and none of that is exercised by
// the trip tests above.
describe("DeleteWithReassignDialog, deleting a dive site", () => {
  const SiteDialog = ({ onConfirm = vi.fn() }) => (
    <DeleteWithReassignDialog
      kind="dive-site"
      targetId="site-1"
      isDeleting={false}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />
  );

  it("searches dive sites, not trips", async () => {
    const onConfirm = vi.fn();
    render(<SiteDialog onConfirm={onConfirm} />);

    expect(
      screen.getByText(/removes this site from every dive logged here/i),
    ).toBeVisible();

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
    expect(getDiveSites).toHaveBeenCalledWith(1, 25, "");
    expect(getTrips).not.toHaveBeenCalled();
  });
});
