import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GearSetDialog } from "./gear-set-dialog";
import {
  fetchAllGearSets,
  gearAPI,
  type GearItem,
  type GearItemSummary,
  type GearSet,
} from "@/lib/api/gear";

// The dialog's own network. `importOriginal` keeps `gearItemLabel` and
// `gearTypeLabel`, which the picker inside it renders rows with.
vi.mock("@/lib/api/gear", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/gear")>();
  return {
    ...actual,
    fetchAllGearSets: vi.fn(),
    gearAPI: {
      ...actual.gearAPI,
      updateGearSet: vi.fn(),
      getGearSet: vi.fn(),
      createGearSet: vi.fn(),
      getGearItems: vi.fn(),
      getGearItem: vi.fn(),
    },
  };
});

const item = (uuid: string, name: string): GearItemSummary => ({
  uuid,
  name,
  brand: "Scubapro",
  type: "regulator",
  rented: false,
  is_archived: false,
});

// A set the diver sees as holding two items. Whether it also holds a third,
// soft-deleted one is not knowable from here - the API stopped rendering those
// on a read, which is exactly why echoing this list back is unsafe.
const SIDEMOUNT: GearSet = {
  uuid: "set-1",
  name: "Sidemount",
  weight: 6,
  gear_items: [item("item-1", "MK25 EVO"), item("item-2", "R195")],
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
};

const updateGearSet = vi.mocked(gearAPI.updateGearSet);
const createGearSet = vi.mocked(gearAPI.createGearSet);

beforeEach(() => {
  vi.clearAllMocks();
  updateGearSet.mockResolvedValue({ message: "Gear set updated" });
  vi.mocked(gearAPI.getGearSet).mockResolvedValue(SIDEMOUNT);
  createGearSet.mockResolvedValue(SIDEMOUNT);
  vi.mocked(fetchAllGearSets).mockResolvedValue([SIDEMOUNT]);
  // The picker resolves any selection it wasn't handed details for, which is
  // every uuid on the "save this dive's gear" path.
  vi.mocked(gearAPI.getGearItem).mockImplementation(
    async (uuid) =>
      ({
        ...item(uuid, uuid),
        dive_count: 0,
        user_uuid: "user-1",
        created_at: "2026-01-01T00:00:00+00:00",
      }) as GearItem,
  );
});

// Waits for the PATCH and hands back the body it carried.
const patchedBody = async () => {
  await waitFor(() => expect(updateGearSet).toHaveBeenCalled());
  return updateGearSet.mock.calls[0][1];
};

const save = () =>
  userEvent.click(screen.getByRole("button", { name: /Save Changes/ }));

const editSidemount = () =>
  render(
    <GearSetDialog
      userId="user-1"
      open
      onOpenChange={vi.fn()}
      gearSet={SIDEMOUNT}
      onSaved={vi.fn()}
    />,
  );

// `PATCH /gear-set` routes any `gear_item_uuids` it is given through
// `replace_gear_items_for_set`, which deletes every membership row and
// reinserts the submitted list. The dialog seeds itself from a read that hides
// soft-deleted gear, so sending that list back on an edit the diver made
// elsewhere in the form destroys the hidden rows - permanently, and out of
// `export.json` with them. Omitting the field is how the API is told to leave
// the members alone.
describe("the gear set dialog's PATCH body", () => {
  it("says nothing about the items when the diver changed nothing", async () => {
    editSidemount();

    await save();

    expect(await patchedBody()).not.toHaveProperty("gear_item_uuids");
  });

  it("says nothing about the items when the set is renamed", async () => {
    editSidemount();

    const name = screen.getByLabelText("Set name *");
    await userEvent.clear(name);
    await userEvent.type(name, "Sidemount, cold water");
    await save();

    const body = await patchedBody();
    expect(body.name).toBe("Sidemount, cold water");
    expect(body).not.toHaveProperty("gear_item_uuids");
  });

  it("says nothing about the items when only the weight changed", async () => {
    editSidemount();

    await userEvent.type(screen.getByLabelText("Weight (kg)"), "8");
    await save();

    const body = await patchedBody();
    expect(body.weight).toBe(68);
    expect(body).not.toHaveProperty("gear_item_uuids");
  });

  it("carries the whole remaining list when the diver removes an item", async () => {
    // The picker replaces the field's value wholesale on every edit, so this is
    // the marker shape react-hook-form gives a registered array leaf - asserted
    // against the real library rather than a literal, because that shape comes
    // out of a heuristic an upgrade can move.
    editSidemount();

    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await save();

    expect((await patchedBody()).gear_item_uuids).toEqual(["item-2"]);
  });

  it("forgets an edit that was abandoned by closing the dialog", async () => {
    // The `reset` on open is what establishes the baseline every one of these
    // tests reads against, and the dialog is mounted for the whole life of the
    // page - so a picker edit the diver walked away from has to be gone by the
    // next open, not still marked dirty and still replacing the members.
    const props = {
      userId: "user-1",
      onOpenChange: vi.fn(),
      gearSet: SIDEMOUNT,
      onSaved: vi.fn(),
    };
    const { rerender } = render(<GearSetDialog {...props} open />);

    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    rerender(<GearSetDialog {...props} open={false} />);
    rerender(<GearSetDialog {...props} open />);
    await save();

    expect(await patchedBody()).not.toHaveProperty("gear_item_uuids");
  });
});

// The other two paths through the same dialog, where the list is the point of
// the request and arrives via `reset` rather than the picker - so it never
// reads as dirty, and a filter that only asked `isDirty` would drop it.
describe("the gear set dialog's other save paths", () => {
  const saveDivesGear = () =>
    render(
      <GearSetDialog
        userId="user-1"
        open
        onOpenChange={vi.fn()}
        initialItemUuids={["item-9", "item-8"]}
        initialWeight={4}
        allowChoosingTarget
        onSaved={vi.fn()}
      />,
    );

  it("creates a set with the gear it was prefilled with", async () => {
    saveDivesGear();

    await userEvent.type(screen.getByLabelText("Set name *"), "Warm water rec");
    await userEvent.click(screen.getByRole("button", { name: /Create Set/ }));

    await waitFor(() => expect(createGearSet).toHaveBeenCalled());
    expect(createGearSet.mock.calls[0][0]).toMatchObject({
      name: "Warm water rec",
      weight: 4,
      gear_item_uuids: ["item-9", "item-8"],
    });
  });

  it("overwrites an existing set's members when one is chosen as the target", async () => {
    // "This replaces everything currently in that set" is what the dialog
    // promises here, so this is the one update that must send the list - and
    // the diver never touched the picker to produce it.
    saveDivesGear();

    await userEvent.click(screen.getByRole("combobox", { name: "Save to" }));
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByRole("option", {
        name: "Sidemount",
      }),
    );
    await save();

    const body = await patchedBody();
    expect(updateGearSet.mock.calls[0][0]).toBe("set-1");
    expect(body.gear_item_uuids).toEqual(["item-9", "item-8"]);
  });
});
