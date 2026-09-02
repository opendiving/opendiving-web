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
import { EntryUnitToggle } from "@/components/entry-unit-toggle";
import { useEntryUnits } from "@/hooks/useEntryUnits";
import { unitLabel } from "@/lib/units";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// The weight box and its label read the diver's units, so this render needs an
// auth context. Metric, which is every existing account's default.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

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

// A set holding two items - all of them, now that the API hard-deletes gear
// rather than hiding it from a set read. That is what makes echoing this list
// back safe, and it is the whole reason the dialog stopped filtering.
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

// The picker names each row's remove button after the item it drops, so these
// say which one they mean rather than taking whatever is first.
const removeItem = (label: string) =>
  userEvent.click(screen.getByRole("button", { name: `Remove ${label}` }));

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
// `replace_gear_items_for_set`, which deletes every membership row and reinserts
// the submitted list. The dialog sends the key on all three of its flows: the
// picker is seeded from a read that hides nothing, so the list it holds is the
// set's whole membership and replacing it with itself is a no-op. The filter
// that used to omit it existed because soft-deleted items were hidden from that
// read, which made the seeded list an echo one or more entries short.
describe("the gear set dialog's PATCH body", () => {
  it("sends the set's members even when the diver changed nothing", async () => {
    editSidemount();

    await save();

    expect((await patchedBody()).gear_item_uuids).toEqual(["item-1", "item-2"]);
  });

  it("sends the members alongside a rename", async () => {
    editSidemount();

    const name = screen.getByLabelText("Set name *");
    await userEvent.clear(name);
    await userEvent.type(name, "Sidemount, cold water");
    await save();

    const body = await patchedBody();
    expect(body.name).toBe("Sidemount, cold water");
    expect(body.gear_item_uuids).toEqual(["item-1", "item-2"]);
  });

  it("sends the members alongside a weight change", async () => {
    editSidemount();

    await userEvent.type(screen.getByLabelText("Weight (kg)"), "8");
    await save();

    const body = await patchedBody();
    expect(body.weight).toBe(68);
    expect(body.gear_item_uuids).toEqual(["item-1", "item-2"]);
  });

  it("carries the whole remaining list when the diver removes an item", async () => {
    editSidemount();

    await removeItem("Scubapro MK25 EVO");
    await save();

    expect((await patchedBody()).gear_item_uuids).toEqual(["item-2"]);
  });

  it("empties the set when the diver removes every item", async () => {
    // `[]` is a wholesale replace with nothing, which is how a set is emptied -
    // and there is no longer any state in which an empty picker means "the API
    // hid the rest", so it can be taken at its word.
    editSidemount();

    await removeItem("Scubapro MK25 EVO");
    await removeItem("Scubapro R195");
    await save();

    expect((await patchedBody()).gear_item_uuids).toEqual([]);
  });

  it("forgets an edit that was abandoned by closing the dialog", async () => {
    // The `reset` on open is what re-seeds the picker from the set, and the
    // dialog is mounted for the whole life of the page - so a removal the diver
    // walked away from has to be gone by the next open, not still sitting in the
    // picker and about to be saved as a real one.
    const props = {
      userId: "user-1",
      onOpenChange: vi.fn(),
      gearSet: SIDEMOUNT,
      onSaved: vi.fn(),
    };
    const { rerender } = render(<GearSetDialog {...props} open />);

    await removeItem("Scubapro MK25 EVO");
    rerender(<GearSetDialog {...props} open={false} />);
    rerender(<GearSetDialog {...props} open />);
    await save();

    expect((await patchedBody()).gear_item_uuids).toEqual(["item-1", "item-2"]);
  });
});

// The other two paths through the same dialog, where the list arrives from the
// dive form through `initialItemUuids` rather than from the set being edited.
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
    // promises here, and the list that does the replacing is the dive's, not the
    // target set's - so this pins which of the two reaches the API.
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

// The weight field's entry-unit switch, and the one place two of them can be on
// screen at once: this dialog opens from *inside* the dive form, and both render
// a weight box over the same dimension.
// The dive form's weight row, in miniature: the same label shape and the same
// toggle over the same dimension. Standing in for `DiveFormFields`, which would
// drag four pickers and their network in to assert one thing about weight.
function FormWeightField() {
  const { entryUnits, toggleEntryUnits } = useEntryUnits();

  return (
    <div data-testid="dive-form-weight">
      <span>Weight ({unitLabel("weight", entryUnits("weight"))})</span>
      <EntryUnitToggle
        dimension="weight"
        entryUnits={entryUnits("weight")}
        onToggle={() => toggleEntryUnits("weight")}
      />
    </div>
  );
}

describe("the gear set dialog's weight entry units", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
  });

  it("enters in the account's units until the toggle is pressed", () => {
    editSidemount();

    expect(screen.getByLabelText("Weight (kg)")).toBeInTheDocument();
  });

  it("relabels and reformats the weight when flipped to pounds", async () => {
    editSidemount();
    await waitFor(() =>
      expect(screen.getByLabelText("Weight (kg)")).toHaveValue(6),
    );

    await userEvent.click(
      screen.getByLabelText("kg | lb — switch weight entry to pounds"),
    );

    expect(screen.getByLabelText("Weight (lb)")).toHaveValue(13);
  });

  it("commits the kilograms behind a weight typed in pounds", async () => {
    editSidemount();
    await waitFor(() =>
      expect(screen.getByLabelText("Weight (kg)")).toHaveValue(6),
    );

    await userEvent.click(
      screen.getByLabelText("kg | lb — switch weight entry to pounds"),
    );
    await userEvent.clear(screen.getByLabelText("Weight (lb)"));
    await userEvent.type(screen.getByLabelText("Weight (lb)"), "12");
    await save();

    expect((await patchedBody()).weight).toBe(5.44);
  });

  it("shares the dimension with a weight field outside it", async () => {
    // The regression two unsubscribed `useEntryUnits()` instances would produce:
    // the dialog and the form behind it showing different units for the same
    // dimension, and each flip clobbering the other's. `within()` rather than a
    // document-wide query because both toggles carry the same accessible name -
    // Radix's modal `aria-hidden` is what keeps only one exposed to assistive
    // tech, and Testing Library does not filter on it.
    render(
      <>
        <FormWeightField />
        <GearSetDialog
          userId="user-1"
          open
          onOpenChange={vi.fn()}
          gearSet={SIDEMOUNT}
          onSaved={vi.fn()}
        />
      </>,
    );

    const form = within(screen.getByTestId("dive-form-weight"));
    const dialog = within(await screen.findByRole("dialog"));
    expect(form.getByText("Weight (kg)")).toBeInTheDocument();

    await userEvent.click(
      dialog.getByLabelText("kg | lb — switch weight entry to pounds"),
    );

    expect(dialog.getByLabelText("Weight (lb)")).toBeInTheDocument();
    expect(form.getByText("Weight (lb)")).toBeInTheDocument();
  });
});
