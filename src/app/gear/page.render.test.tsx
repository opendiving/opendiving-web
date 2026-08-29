import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GearPage from "./page";
import { gearAPI, type GearItem, type GearSet } from "@/lib/api/gear";

// Returned by identity rather than rebuilt per call, and for `user` that is
// load-bearing rather than tidiness: the real `AuthContext` holds it in state, so it
// keeps one identity across renders, and this page's two fetch callbacks list `user`
// in their dependencies. A mock handing back a fresh `user` per render gives
// `usePaginatedResource` a new `fetchFn` every time, and its fetch-on-mount effect
// re-runs on every render the fetch itself causes. See "The new-dive render test was
// in a loop with itself" in DECISIONS.md, and "reads the gear list once" below.
//
// `vi.hoisted` because a `vi.mock` factory is hoisted above every other statement in
// the file and so cannot close over an ordinary `const`.
const stable = vi.hoisted(() => ({
  auth: {
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  },
  router: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => stable.router,
}));

vi.mock("@/lib/api/gear", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/gear")>();
  return {
    ...actual,
    gearAPI: {
      ...actual.gearAPI,
      getGearItems: vi.fn(),
      getGearSets: vi.fn(),
      updateGearItem: vi.fn(),
      deleteGearItem: vi.fn(),
    },
  };
});

const gearItem = (overrides: Partial<GearItem> = {}): GearItem => ({
  uuid: "item-1",
  name: "MK25 EVO",
  brand: "Scubapro",
  type: "regulator",
  rented: false,
  is_archived: false,
  dive_count: 12,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

const gearSet = (overrides: Partial<GearSet> = {}): GearSet => ({
  uuid: "set-1",
  name: "Warm water rig",
  gear_items: [],
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

const page = <T,>(items: T[]) => ({
  data: items,
  total_count: items.length,
  has_more: false,
  page: 1,
  items_per_page: 10,
});

const getGearItems = vi.mocked(gearAPI.getGearItems);
const updateGearItem = vi.mocked(gearAPI.updateGearItem);
const deleteGearItem = vi.mocked(gearAPI.deleteGearItem);

beforeEach(() => {
  vi.clearAllMocks();
  getGearItems.mockResolvedValue(page([gearItem()]));
  vi.mocked(gearAPI.getGearSets).mockResolvedValue(page([]));
  updateGearItem.mockResolvedValue({ message: "Gear updated" });
  deleteGearItem.mockResolvedValue({ message: "Gear deleted" });
});

// Renders the page and opens the delete confirmation for its first row.
const openDeleteDialog = async () => {
  render(<GearPage />);
  await screen.findByText("MK25 EVO");
  await userEvent.click(
    screen.getByRole("button", { name: "Delete Scubapro MK25 EVO" }),
  );
  return screen.findByRole("dialog");
};

// The delete confirmation offers a way out of deleting, and the way out has to
// actually archive - a wire-up mistake here reads as "Archive instead" on a button
// that deletes, which is the failure the copy is meant to prevent.
describe("gear page delete confirmation", () => {
  it("tells the diver what deleting actually does", async () => {
    const dialog = await openDeleteDialog();

    expect(dialog).toHaveTextContent(
      "Deleting removes this gear from your dives and gear sets",
    );
  });

  it("puts the reminders on both paths, not just the delete", async () => {
    // Archiving silences a schedule as surely as deleting does. Attached to the
    // delete alone, the sentence reads as a reason to archive that isn't true.
    const dialog = await openDeleteDialog();

    expect(dialog).toHaveTextContent("Either way, its service reminders stop.");
  });

  it("archives rather than deletes when the diver takes the way out", async () => {
    await openDeleteDialog();
    await userEvent.click(
      screen.getByRole("button", { name: "Archive instead" }),
    );

    await waitFor(() =>
      expect(updateGearItem).toHaveBeenCalledWith("item-1", {
        is_archived: true,
      }),
    );
    expect(deleteGearItem).not.toHaveBeenCalled();
  });

  it("leaves the delete dialog closed once the diver archives instead", async () => {
    await openDeleteDialog();
    await userEvent.click(
      screen.getByRole("button", { name: "Archive instead" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("doesn't offer to archive gear that is archived already", async () => {
    // `toggleArchived` on an archived item unarchives it, so the offer would do the
    // opposite of what its label says. Reachable via the list's "Show archived".
    getGearItems.mockResolvedValue(page([gearItem({ is_archived: true })]));

    const dialog = await openDeleteDialog();

    expect(dialog).not.toHaveTextContent("Archive instead");
  });
});

// A screen reader's controls list is flat: ten rows of "Edit" name nothing, so each
// row's controls carry the item they act on. See DECISIONS.md, "Ten rows of 'Edit'
// name nothing".
describe("gear row actions name their row", () => {
  it("names each gear item's controls after the item", async () => {
    render(<GearPage />);
    await screen.findByText("MK25 EVO");

    expect(
      screen.getByRole("button", { name: "Edit Scubapro MK25 EVO" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Archive Scubapro MK25 EVO" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Scubapro MK25 EVO" }),
    ).toBeInTheDocument();
  });

  it("keeps the item in the name when the action flips to Unarchive", async () => {
    getGearItems.mockResolvedValue(page([gearItem({ is_archived: true })]));

    render(<GearPage />);
    await screen.findByText("MK25 EVO");

    expect(
      screen.getByRole("button", { name: "Unarchive Scubapro MK25 EVO" }),
    ).toBeInTheDocument();
  });

  it("tells two rows apart by name rather than by position", async () => {
    getGearItems.mockResolvedValue(
      page([
        gearItem(),
        gearItem({ uuid: "item-2", name: "R195", brand: "Scubapro" }),
      ]),
    );

    render(<GearPage />);
    await screen.findByText("R195");

    const editButtons = screen.getAllByRole("button", { name: /^Edit / });
    expect(
      editButtons.map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Edit Scubapro MK25 EVO", "Edit Scubapro R195"]);
  });

  it("names each gear set's controls after the set", async () => {
    vi.mocked(gearAPI.getGearSets).mockResolvedValue(page([gearSet()]));

    render(<GearPage />);
    await screen.findByText("Warm water rig");

    expect(
      screen.getByRole("button", { name: "Edit Warm water rig" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Warm water rig" }),
    ).toBeInTheDocument();
  });
});

// The page's fetch callbacks close over `user`, and `usePaginatedResource` fetches
// from an effect keyed on the callback - so anything that gives `user` a new identity
// per render puts the effect in a loop with the fetch it started.
//
// `mockImplementation` rather than this file's usual `mockResolvedValue`, and that is
// the whole reason this test can fail: a single resolved value is one object handed
// back to every call, so `setItems` receives the array it already holds, React bails
// out of the re-render, and the loop stalls after a handful of passes. Measured, the
// same mount goes from 6 fetches a second to ~400 once each call answers with its own
// object, which is what a real API client does. See "A shared mock response object
// hides a render loop" in DECISIONS.md.
describe("the gear list is read once, not once per render", () => {
  it("reads the gear list once", async () => {
    getGearItems.mockImplementation(async () => page([gearItem()]));

    render(<GearPage />);
    await screen.findByText("MK25 EVO");

    expect(getGearItems).toHaveBeenCalledTimes(1);
  });
});
