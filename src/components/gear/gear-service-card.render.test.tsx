import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GearServiceCard } from "./gear-service-card";
import type { GearItem } from "@/lib/api/gear";
import {
  gearServiceAPI,
  fetchAllServiceRecords,
  type GearServiceRecord,
  type GearServiceSchedule,
} from "@/lib/api/gear-service";

// Every row-level control on this card is icon-only, and the card carries two lists whose
// rows can describe the same servicing - so the names have to separate a schedule from the
// history entry that satisfied it as well as one row from the next. Both fixtures below
// hold two rows on purpose: a name built from a constant passes a one-row test exactly as
// well as one built from the record.

vi.mock("@/lib/api/gear-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/gear-service")>();
  return {
    ...actual,
    fetchAllServiceRecords: vi.fn(),
    gearServiceAPI: { ...actual.gearServiceAPI, getSchedules: vi.fn() },
  };
});

// One `toast` for the whole file, not a fresh `vi.fn()` per `useToast()` call: the
// card's mount effect lists `toast` in its dependencies, which is safe against the
// real hook (`toast` is a module-level function) and an infinite refetch loop against
// a mock that hands back a new one on every render. The loop is invisible while it
// happens to lose the race to a passing assertion, which is how it went unnoticed.
vi.mock("@/components/ui/use-toast", () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

const gearItem: GearItem = {
  uuid: "item-1",
  name: "MK25 EVO",
  brand: "Scubapro",
  type: "regulator",
  rented: false,
  is_archived: false,
  dive_count: 12,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
};

const schedule = (
  overrides: Partial<GearServiceSchedule> = {},
): GearServiceSchedule => ({
  uuid: "schedule-1",
  kind: "service",
  is_active: true,
  starts_on: "2025-01-01",
  dive_count_at_start: 0,
  gear_item_uuid: gearItem.uuid,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  interval_months: 12,
  ...overrides,
});

const record = (
  overrides: Partial<GearServiceRecord> = {},
): GearServiceRecord => ({
  uuid: "record-1",
  kind: "service",
  serviced_on: "2025-03-12",
  notes: "",
  dive_count_at_service: 4,
  gear_item_uuid: gearItem.uuid,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

const getSchedules = vi.mocked(gearServiceAPI.getSchedules);
const getRecords = vi.mocked(fetchAllServiceRecords);

// Renders the card and waits out the mount fetch, which the spinner stands in for until
// both lists have arrived.
const renderCard = async (
  schedules: GearServiceSchedule[],
  records: GearServiceRecord[],
) => {
  getSchedules.mockResolvedValue({
    data: schedules,
    total_count: schedules.length,
    has_more: false,
    page: 1,
    items_per_page: 100,
  });
  getRecords.mockResolvedValue(records);
  render(<GearServiceCard gearItem={gearItem} onChanged={vi.fn()} />);
  await screen.findByText("Service history");
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GearServiceCard row controls", () => {
  it("names each schedule's four controls after the schedule", async () => {
    await renderCard(
      [
        schedule(),
        schedule({
          uuid: "schedule-2",
          kind: "visual_inspection",
          is_active: false,
        }),
      ],
      [],
    );

    expect(
      screen.getByRole("button", { name: "Log service for Service" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pause Service schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Service schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Service schedule" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Log service for Visual inspection" }),
    ).toBeInTheDocument();
    // The paused row offers Resume where the active one offers Pause, so the verb is part
    // of what tells the two rows apart and has to survive being given a row name.
    expect(
      screen.getByRole("button", { name: "Resume Visual inspection schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Visual inspection schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Visual inspection schedule" }),
    ).toBeInTheDocument();
  });

  it("keeps two schedules of one kind apart by their labels", async () => {
    // (kind, label) is the pair the API matches an unattached service record on, so two
    // schedules on one item differ by label or not at all.
    await renderCard(
      [
        schedule({ label: "First stage" }),
        schedule({ uuid: "schedule-2", label: "Second stage" }),
      ],
      [],
    );

    expect(
      screen.getByRole("button", {
        name: "Edit Service (First stage) schedule",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Delete Service (Second stage) schedule",
      }),
    ).toBeInTheDocument();
  });

  it("names each history entry by its kind and date", async () => {
    // A history entry's kind repeats every time the work is redone - both rows here are a
    // "Service" - so only the date separates them.
    await renderCard(
      [],
      [record(), record({ uuid: "record-2", serviced_on: "2024-02-05" })],
    );

    expect(
      screen.getByRole("button", { name: "Edit Service on Mar 12, 2025" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Service on Mar 12, 2025" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Service on Feb 5, 2024" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Service on Feb 5, 2024" }),
    ).toBeInTheDocument();
  });

  it("separates a history entry from the schedule it satisfied", async () => {
    // Both lists render the same kind and label, one above the other. Naming a row after
    // its own identity alone would put two "Edit Service" buttons on the page.
    await renderCard([schedule()], [record()]);

    expect(
      screen.getByRole("button", { name: "Edit Service schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Service on Mar 12, 2025" }),
    ).toBeInTheDocument();
  });

  it("leaves no row control named after its icon alone", async () => {
    // Rows the card can tell apart on screen - so anything sharing a name here is the
    // naming failing, not the fixture. Two schedules of one kind with no label between
    // them read identically to a sighted diver too, and are the API's own duplicate.
    await renderCard(
      [schedule(), schedule({ uuid: "schedule-2", kind: "hydrostatic_test" })],
      [record(), record({ uuid: "record-2", serviced_on: "2024-02-05" })],
    );

    // The page's two standing buttons are "Add Schedule" and "Log Service"; everything
    // else is a row control, and no two of them may share a name.
    const names = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);

    expect(names).not.toContain("Edit");
    expect(names).not.toContain("Delete");
    expect(names).not.toContain("Pause");
    expect(names).not.toContain("Resume");
    expect(names).not.toContain("Log service");
    expect(new Set(names).size).toBe(names.length);
  });
});
