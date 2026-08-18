import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GearPage from "./page";
import { gearAPI, type GearItem } from "@/lib/api/gear";

// The delete confirmation now offers a way out of deleting, and the way out has to
// actually archive - a wire-up mistake here reads as "Archive instead" on a button
// that deletes, which is the failure the copy is meant to prevent.

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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
  await userEvent.click(screen.getByRole("button", { name: "Delete" }));
  return screen.findByRole("dialog");
};

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
