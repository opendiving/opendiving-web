import { describe, expect, it } from "vitest";
import { NOTES_MAX_LENGTH } from "./notes";
import {
  gearServiceRecordSchema,
  gearServiceScheduleSchema,
} from "@/lib/validations/gear-service";

const validSchedule = {
  kind: "service" as const,
  starts_on: "2026-01-01",
  interval_months: 12,
};

describe("gearServiceScheduleSchema", () => {
  it("accepts a time-only rule", () => {
    expect(gearServiceScheduleSchema.safeParse(validSchedule).success).toBe(
      true,
    );
  });

  it("accepts a dive-only rule", () => {
    const result = gearServiceScheduleSchema.safeParse({
      kind: "service",
      starts_on: "2026-01-01",
      interval_dives: 100,
    });
    expect(result.success).toBe(true);
  });

  it("accepts both arms together", () => {
    const result = gearServiceScheduleSchema.safeParse({
      ...validSchedule,
      interval_dives: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a rule with no interval at all", () => {
    // Mirrors the API validator and the DB CheckConstraint: such a rule could never
    // become due.
    const result = gearServiceScheduleSchema.safeParse({
      kind: "service",
      starts_on: "2026-01-01",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("Set an interval");
  });

  it("rejects a rule whose intervals were both cleared in the form", () => {
    // `""` is what a cleared number input holds, and must not satisfy the refine.
    const result = gearServiceScheduleSchema.safeParse({
      kind: "service",
      starts_on: "2026-01-01",
      interval_months: "",
      interval_dives: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts one arm cleared as long as the other is set", () => {
    const result = gearServiceScheduleSchema.safeParse({
      kind: "service",
      starts_on: "2026-01-01",
      interval_months: "",
      interval_dives: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero, negative and fractional intervals", () => {
    for (const interval_months of [0, -12, 1.5]) {
      expect(
        gearServiceScheduleSchema.safeParse({
          ...validSchedule,
          interval_months,
        }).success,
      ).toBe(false);
    }
  });

  it("requires a well-formed in-service date", () => {
    expect(
      gearServiceScheduleSchema.safeParse({ ...validSchedule, starts_on: "" })
        .success,
    ).toBe(false);
    expect(
      gearServiceScheduleSchema.safeParse({
        ...validSchedule,
        starts_on: "01/01/2026",
      }).success,
    ).toBe(false);
  });

  it("rejects a kind outside the shared vocabulary", () => {
    expect(
      gearServiceScheduleSchema.safeParse({ ...validSchedule, kind: "vip" })
        .success,
    ).toBe(false);
  });

  it("caps the label length", () => {
    expect(
      gearServiceScheduleSchema.safeParse({
        ...validSchedule,
        label: "x".repeat(121),
      }).success,
    ).toBe(false);
  });
});

describe("gearServiceRecordSchema", () => {
  it("accepts a minimal record", () => {
    const result = gearServiceRecordSchema.safeParse({
      kind: "hydrostatic_test",
      serviced_on: "2026-03-14",
    });
    expect(result.success).toBe(true);
  });

  it("requires a service date", () => {
    expect(
      gearServiceRecordSchema.safeParse({ kind: "service", serviced_on: "" })
        .success,
    ).toBe(false);
  });

  it("rejects a kind outside the shared vocabulary", () => {
    expect(
      gearServiceRecordSchema.safeParse({
        kind: "annual",
        serviced_on: "2026-03-14",
      }).success,
    ).toBe(false);
  });

  it("caps performed_by and notes", () => {
    expect(
      gearServiceRecordSchema.safeParse({
        kind: "service",
        serviced_on: "2026-03-14",
        performed_by: "x".repeat(256),
      }).success,
    ).toBe(false);
    expect(
      gearServiceRecordSchema.safeParse({
        kind: "service",
        serviced_on: "2026-03-14",
        notes: "x".repeat(NOTES_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
