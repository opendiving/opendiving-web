import { describe, it, expect } from "vitest";
import { gearItemSchema, gearSetSchema } from "./gear";

describe("gearItemSchema", () => {
  it("accepts a minimal item with only a name", () => {
    const result = gearItemSchema.safeParse({ name: "Wing 17L" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Wing 17L");
      // brand/notes/rented are all optional - nothing is invented for them.
      expect(result.data.brand).toBeUndefined();
      expect(result.data.rented).toBeUndefined();
    }
  });

  it("accepts a fully specified item", () => {
    const result = gearItemSchema.safeParse({
      name: "MK25 EVO",
      brand: "Scubapro",
      notes: "serviced 2025",
      rented: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = gearItemSchema.safeParse({ name: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Gear name is required");
    }
  });

  it("rejects a name longer than 255 characters", () => {
    const result = gearItemSchema.safeParse({ name: "a".repeat(256) });

    expect(result.success).toBe(false);
  });

  it("rejects a brand longer than 255 characters", () => {
    const result = gearItemSchema.safeParse({
      name: "Wing 17L",
      brand: "b".repeat(256),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a known gear type", () => {
    expect(
      gearItemSchema.safeParse({ name: "Jetfins", type: "fins" }).success,
    ).toBe(true);
  });

  it("accepts an empty type - the select's 'no type' state", () => {
    expect(
      gearItemSchema.safeParse({ name: "Odd kit", type: "" }).success,
    ).toBe(true);
  });

  it("rejects a type outside the vocabulary", () => {
    expect(
      gearItemSchema.safeParse({ name: "Odd kit", type: "spaceship" }).success,
    ).toBe(false);
  });
});

describe("gearSetSchema", () => {
  it("defaults to an empty item list", () => {
    const result = gearSetSchema.safeParse({ name: "Sidemount" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gear_item_uuids).toEqual([]);
    }
  });

  it("keeps the item order it was given", () => {
    const result = gearSetSchema.safeParse({
      name: "Tech",
      gear_item_uuids: ["c", "a", "b"],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gear_item_uuids).toEqual(["c", "a", "b"]);
    }
  });

  it("rejects an empty set name", () => {
    const result = gearSetSchema.safeParse({ name: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Set name is required");
    }
  });
});
