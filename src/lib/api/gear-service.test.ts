import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gearServiceAPI } from "./gear-service";
import { onServiceDueChanged } from "@/lib/service-due";

vi.mock("./client", () => ({
  apiClient: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  fetchAllPages: vi.fn(),
}));

const { apiClient } = await import("./client");
const post = vi.mocked(apiClient.post);

// The bell under the header reads what is due on navigation, and these saves move it
// without one.
describe("a save that moves what is due", () => {
  const heard = vi.fn();
  let stop: () => void;

  beforeEach(() => {
    post.mockReset();
    heard.mockReset();
    stop = onServiceDueChanged(heard);
  });

  afterEach(() => stop());

  it("announces a created schedule", async () => {
    post.mockResolvedValue({ data: { uuid: "schedule-1" } });

    await gearServiceAPI.createSchedule({
      gear_item_uuid: "item-1",
      kind: "service",
      starts_on: "2025-10-14",
      interval_months: 12,
    });

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("announces a logged service", async () => {
    post.mockResolvedValue({ data: { uuid: "record-1" } });

    await gearServiceAPI.createRecord({
      gear_item_uuid: "item-1",
      kind: "service",
      serviced_on: "2026-10-14",
    });

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the save fails", async () => {
    post.mockRejectedValue(new Error("offline"));

    await expect(
      gearServiceAPI.createSchedule({
        gear_item_uuid: "item-1",
        kind: "service",
        starts_on: "2025-10-14",
      }),
    ).rejects.toThrow("offline");

    expect(heard).not.toHaveBeenCalled();
  });
});
