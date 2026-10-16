import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { GearItem, GearSet } from "@/lib/api/gear";
import type { GearServiceScheduleSummary } from "@/lib/api/gear-service";
import { GearItemCard } from "./gear-item-card";
import { GearSetCard } from "./gear-set-card";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

const gearItem = (overrides: Partial<GearItem> = {}): GearItem => ({
  uuid: "item-1",
  name: "MK25 EVO",
  brand: "Scubapro",
  type: "regulator",
  rented: false,
  is_archived: false,
  dive_count: 12,
  dive_time: 43200,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

// Due by dive count alone, so its status needs no clock.
const schedule = (
  overrides: Partial<GearServiceScheduleSummary> = {},
): GearServiceScheduleSummary => ({
  uuid: "schedule-1",
  kind: "service",
  interval_dives: 100,
  next_due_at_dive_count: 100,
  is_active: true,
  ...overrides,
});

const itemHandlers = () => ({
  onEdit: vi.fn(),
  onArchiveToggle: vi.fn(),
  onDelete: vi.fn(),
});

// The card is a list item, as every list's card is.
const itemCard = (
  overrides: Partial<GearItem> = {},
  handlers: Partial<ReturnType<typeof itemHandlers>> = {},
) =>
  render(
    <ul>
      <GearItemCard
        item={gearItem(overrides)}
        {...itemHandlers()}
        {...handlers}
        isArchiving={false}
        isDeleting={false}
      />
    </ul>,
  ).container.querySelector("li") as HTMLElement;

const figure = (card: HTMLElement, label: string) =>
  within(card).getByText(label, { selector: "dt" }).nextElementSibling;

describe("GearItemCard", () => {
  it("opens the item's page from its name", () => {
    const card = itemCard();

    expect(
      within(card).getByRole("link", { name: "MK25 EVO" }),
    ).toHaveAttribute("href", "/gear/item-1");
  });

  it("says what it is under its name, a cylinder's own facts included", () => {
    const card = itemCard({
      type: "cylinder",
      brand: "Faber",
      volume: 12,
      working_pressure: 232,
      material: "steel",
    });

    expect(card).toHaveTextContent("Cylinder · Faber · 12 L · 232 bar · Steel");
  });

  it("carries what it has been dived", () => {
    const card = itemCard();

    expect(figure(card, "Dives")).toHaveTextContent("12");
    expect(figure(card, "Dive time")).toHaveTextContent("12h");
  });

  it("chips a rented or archived item", () => {
    const card = itemCard({ rented: true, is_archived: true });

    expect(within(card).getByText("Rented")).toBeInTheDocument();
    expect(within(card).getByText("Archived")).toBeInTheDocument();
  });

  it("chips its service status, and nothing where nothing is tracked", () => {
    const tracked = itemCard({
      dive_count: 120,
      service: [schedule()],
    });
    expect(within(tracked).getByText("Overdue")).toBeInTheDocument();

    const untracked = itemCard({ uuid: "item-2" });
    expect(untracked).not.toHaveTextContent(/Overdue|Due soon|In service|—/);
  });

  it("edits, archives and deletes from a menu named after brand and name", async () => {
    const onEdit = vi.fn();
    const onArchiveToggle = vi.fn();
    const onDelete = vi.fn();
    const card = itemCard({}, { onEdit, onArchiveToggle, onDelete });
    const menu = within(card).getByRole("button", {
      name: "Actions for Scubapro MK25 EVO",
    });

    for (const [item, handler] of [
      ["Edit", onEdit],
      ["Archive", onArchiveToggle],
      ["Delete", onDelete],
    ] as const) {
      await userEvent.click(menu);
      await userEvent.click(
        await screen.findByRole("menuitem", { name: item }),
      );
      expect(handler).toHaveBeenCalledOnce();
    }
  });
});

const gearSet = (overrides: Partial<GearSet> = {}): GearSet => ({
  uuid: "set-1",
  name: "Warm water rig",
  gear_items: [],
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

const setHandlers = () => ({
  onEdit: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
});

const setCard = (
  overrides: Partial<GearSet> = {},
  handlers: Partial<ReturnType<typeof setHandlers>> = {},
) =>
  render(
    <ul>
      <GearSetCard
        set={gearSet(overrides)}
        {...setHandlers()}
        {...handlers}
        isDeleting={false}
      />
    </ul>,
  ).container.querySelector("li") as HTMLElement;

describe("GearSetCard", () => {
  it("lists its kit under its name, which links nowhere", () => {
    const card = setCard({
      weight: 4,
      gear_items: [
        {
          uuid: "item-1",
          name: "MK25 EVO",
          brand: "Scubapro",
          rented: false,
          is_archived: false,
        },
        {
          uuid: "item-2",
          name: "Hydros Pro",
          brand: "Scubapro",
          rented: false,
          is_archived: false,
        },
      ],
    });

    expect(card).toHaveTextContent("Scubapro MK25 EVO · Scubapro Hydros Pro");
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    expect(figure(card, "Items")).toHaveTextContent("2");
    expect(figure(card, "Weight")).toHaveTextContent("4 kg");
  });

  it("says an empty set is empty, and dashes a weight it does not carry", () => {
    const card = setCard();

    expect(within(card).getByText("Empty")).toBeInTheDocument();
    expect(figure(card, "Items")).toHaveTextContent("0");
    expect(figure(card, "Weight")).toHaveTextContent("-");
  });

  it("edits, duplicates and deletes from a menu named after the set", async () => {
    const onEdit = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const card = setCard({}, { onEdit, onDuplicate, onDelete });
    const menu = within(card).getByRole("button", {
      name: "Actions for Warm water rig",
    });

    for (const [item, handler] of [
      ["Edit", onEdit],
      ["Duplicate", onDuplicate],
      ["Delete", onDelete],
    ] as const) {
      await userEvent.click(menu);
      await userEvent.click(
        await screen.findByRole("menuitem", { name: item }),
      );
      expect(handler).toHaveBeenCalledOnce();
    }
  });
});
