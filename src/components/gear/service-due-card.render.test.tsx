import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceDueCard } from "./service-due-card";
import {
  gearServiceAPI,
  type GearServiceDueEntry,
} from "@/lib/api/gear-service";

// The log-service button on each row is icon-only, and this list spans every item a diver
// owns - so its name has to say which item as well as which schedule. Both fixtures below
// hold two rows on purpose: a name built from a constant passes a one-row test exactly as
// well as one built from the entry. Same reasoning as `gear-service-card.render.test.tsx`,
// whose card is the one this button was copied from.

vi.mock("@/lib/api/gear-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/gear-service")>();
  return {
    ...actual,
    gearServiceAPI: { ...actual.gearServiceAPI, getDue: vi.fn() },
  };
});

// Long past, so every row is overdue whenever this suite runs. The card renders only the
// schedules `serviceStatus` calls something other than "ok", and a due date relative to
// today would make that depend on the clock.
const entry = (
  overrides: Partial<GearServiceDueEntry> = {},
): GearServiceDueEntry => ({
  schedule_uuid: "schedule-1",
  kind: "service",
  next_due_on: "2020-01-01",
  gear_item_uuid: "item-1",
  gear_item_name: "MK25 EVO",
  gear_item_brand: "Scubapro",
  gear_item_dive_count: 12,
  ...overrides,
});

const getDue = vi.mocked(gearServiceAPI.getDue);

const renderCard = async (entries: GearServiceDueEntry[]) => {
  getDue.mockResolvedValue({ data: entries });
  render(<ServiceDueCard userId="user-1" />);
  await screen.findByText("Service due");
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServiceDueCard log-service button", () => {
  it("names each row's button after its schedule and its gear item", async () => {
    await renderCard([
      entry(),
      entry({
        schedule_uuid: "schedule-2",
        kind: "visual_inspection",
        gear_item_uuid: "item-2",
        gear_item_name: "12L steel",
        gear_item_brand: "Faber",
      }),
    ]);

    expect(
      screen.getByRole("button", {
        name: "Log service for Service on Scubapro MK25 EVO",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Log service for Visual inspection on Faber 12L steel",
      }),
    ).toBeInTheDocument();
  });

  it("keeps two schedules of one item apart, and two items of one kind too", async () => {
    // A cylinder carries its visual inspection and its hydro on different clocks, so one
    // item can hold two rows; and a diver with two regulators has the same kind twice.
    // Neither the item nor the schedule alone separates all four.
    await renderCard([
      entry({ schedule_uuid: "schedule-1", kind: "visual_inspection" }),
      entry({ schedule_uuid: "schedule-2", kind: "hydrostatic_test" }),
      entry({
        schedule_uuid: "schedule-3",
        gear_item_uuid: "item-2",
        gear_item_name: "R195",
        gear_item_brand: "Scubapro",
      }),
      entry({
        schedule_uuid: "schedule-4",
        label: "Second stage",
        gear_item_uuid: "item-3",
        gear_item_name: "MK25 EVO",
        gear_item_brand: null,
      }),
    ]);

    const names = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);

    expect(names).toEqual([
      "Log service for Visual inspection on Scubapro MK25 EVO",
      "Log service for Hydrostatic test on Scubapro MK25 EVO",
      "Log service for Service on Scubapro R195",
      "Log service for Service (Second stage) on MK25 EVO",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("names the item in the dialog the button opens", async () => {
    // The dialog is the one place the row's context is gone: it is reached from a list
    // spanning every item, and its title alone says "Log Service" and nothing more.
    await renderCard([entry()]);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Log service for Service on Scubapro MK25 EVO",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Log Service");
    expect(dialog).toHaveTextContent("Scubapro MK25 EVO");
  });
});
