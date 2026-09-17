import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GearItemMultiSelect } from "./gear-item-multi-select";
import type { GearItemSummary } from "@/lib/api/gear";

// The picker's own network. `importOriginal` keeps `gearItemLabel` and
// `gearTypeLabel`, which are what a row is rendered from - and what the row's
// buttons are named after.
vi.mock("@/lib/api/gear", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/gear")>();
  return {
    ...actual,
    gearAPI: {
      ...actual.gearAPI,
      getGearItems: vi.fn(),
      getGearItem: vi.fn(),
    },
  };
});

const { gearAPI } = await import("@/lib/api/gear");
const getGearItem = vi.mocked(gearAPI.getGearItem);

// Two items whose display names differ in the brand half as well as the name
// half, so a label that dropped either would still fail the assertions.
const REGULATOR: GearItemSummary = {
  uuid: "item-1",
  name: "MK25 EVO",
  brand: "Scubapro",
  type: "regulator",
  rented: false,
  is_archived: false,
};

const COMPUTER: GearItemSummary = {
  uuid: "item-2",
  name: "Perdix 2",
  brand: "Shearwater",
  type: "computer",
  rented: true,
  is_archived: false,
};

beforeEach(() => {
  getGearItem.mockReset();
});

const renderBoth = (onChange = () => {}) =>
  render(
    <GearItemMultiSelect
      value={[REGULATOR.uuid, COMPUTER.uuid]}
      knownItems={[REGULATOR, COMPUTER]}
      onChange={onChange}
    />,
  );

describe("GearItemMultiSelect", () => {
  it("names both per-row controls after the item they act on", async () => {
    // Two rows is the smallest list that can prove it: with one, "Remove" and
    // "Remove Scubapro MK25 EVO" are equally unambiguous. The name is
    // `gearItemLabel` alone - neither the muted ", Type" suffix nor the
    // Rented/Archived badges are part of it.
    renderBoth();

    expect(
      screen.getByRole("button", { name: "Remove Scubapro MK25 EVO" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Shearwater Perdix 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Reorder Scubapro MK25 EVO\./ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Reorder Shearwater Perdix 2\./ }),
    ).toBeInTheDocument();
    // Seeded rows are labelled from the prop, so nothing was fetched to name
    // them - which is the state these names have to hold in.
    expect(getGearItem).not.toHaveBeenCalled();
  });

  it("removes the item whose button was pressed", async () => {
    const onChange = vi.fn();
    renderBoth(onChange);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Shearwater Perdix 2" }),
    );

    expect(onChange).toHaveBeenCalledWith([REGULATOR.uuid]);
  });
});
