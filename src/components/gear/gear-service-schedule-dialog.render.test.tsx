import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GearServiceScheduleDialog } from "./gear-service-schedule-dialog";
import {
  gearServiceAPI,
  type GearServiceSchedule,
} from "@/lib/api/gear-service";
import type { GearItem } from "@/lib/api/gear";

vi.mock("@/lib/api/gear-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/gear-service")>();
  return {
    ...actual,
    gearServiceAPI: {
      ...actual.gearServiceAPI,
      createSchedule: vi.fn(),
      updateSchedule: vi.fn(),
    },
  };
});

const createSchedule = vi.mocked(gearServiceAPI.createSchedule);
const updateSchedule = vi.mocked(gearServiceAPI.updateSchedule);

// A scooter, which has no preset, so a new rule opens with every interval blank.
const SCOOTER: GearItem = {
  uuid: "item-1",
  name: "Seacraft Ghost",
  type: "scooter",
  rented: false,
  is_archived: false,
  dive_count: 4,
  dive_time: 10800,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
};

const SCHEDULE: GearServiceSchedule = {
  uuid: "schedule-1",
  kind: "service",
  is_active: true,
  starts_on: "2026-01-01",
  interval_months: 12,
  interval_hours: 50,
  dive_count_at_start: 0,
  dive_time_at_start: 0,
  gear_item_uuid: SCOOTER.uuid,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  createSchedule.mockResolvedValue(SCHEDULE);
  updateSchedule.mockResolvedValue({ message: "Service schedule updated" });
});

function renderDialog(schedule?: GearServiceSchedule) {
  render(
    <GearServiceScheduleDialog
      gearItem={SCOOTER}
      open
      onOpenChange={() => {}}
      schedule={schedule}
      onSaved={() => {}}
    />,
  );
}

describe("GearServiceScheduleDialog", () => {
  it("offers three intervals, months, dives and hours", () => {
    renderDialog();

    expect(screen.getByLabelText("Every (months)")).toBeInTheDocument();
    expect(screen.getByLabelText("Every (dives)")).toBeInTheDocument();
    expect(screen.getByLabelText("Every (hours)")).toBeInTheDocument();
  });

  it("creates a rule that runs on hours of diving alone", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Every (hours)"), "50");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(createSchedule).toHaveBeenCalled());
    expect(createSchedule.mock.calls[0][0]).toMatchObject({
      gear_item_uuid: SCOOTER.uuid,
      interval_months: null,
      interval_dives: null,
      interval_hours: 50,
    });
  });

  it("refuses a rule with no interval, naming all three", async () => {
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(
      await screen.findByText(
        "Set an interval in months, in dives or in hours of diving",
      ),
    ).toBeInTheDocument();
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it("loads a rule's hours and clears them as an explicit null", async () => {
    renderDialog(SCHEDULE);

    const hours = screen.getByLabelText("Every (hours)");
    expect(hours).toHaveValue(50);
    await userEvent.clear(hours);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateSchedule).toHaveBeenCalled());
    expect(updateSchedule.mock.calls[0][1]).toMatchObject({
      interval_months: 12,
      interval_hours: null,
    });
  });
});
