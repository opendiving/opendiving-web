import { describe, expect, it } from "vitest";
import {
  carriedVessel,
  isVolumeFromVessel,
  linkedVessel,
  tankVolume,
} from "./tank-vessel";

const AL80 = {
  uuid: "vessel-1",
  name: "AL80",
  type: "cylinder" as const,
  rented: false,
  is_archived: false,
  volume: 11.1,
};

describe("linkedVessel", () => {
  it("is the embedded item while the uuid names it", () => {
    expect(linkedVessel({ gear_item_uuid: AL80.uuid, gear_item: AL80 })).toBe(
      AL80,
    );
  });

  it("is nothing once the link is cleared, whatever the row still carries", () => {
    expect(linkedVessel({ gear_item_uuid: "", gear_item: AL80 })).toBeNull();
    expect(
      linkedVessel({ gear_item_uuid: "other", gear_item: AL80 }),
    ).toBeNull();
  });
});

describe("the read-only volume", () => {
  it("is read-only while linked to a vessel recording its capacity", () => {
    expect(
      isVolumeFromVessel({ gear_item_uuid: AL80.uuid, gear_item: AL80 }),
    ).toBe(true);
    // A vessel recorded without a volume leaves the box editable.
    expect(
      isVolumeFromVessel({
        gear_item_uuid: AL80.uuid,
        gear_item: { ...AL80, volume: null },
      }),
    ).toBe(false);
    expect(isVolumeFromVessel({ volume: 12 })).toBe(false);
  });

  it("shows the tank's own figure, else the vessel's", () => {
    const link = { gear_item_uuid: AL80.uuid, gear_item: AL80 };
    expect(tankVolume({ ...link, volume: 11.1 })).toBe(11.1);
    // An import's link keeps its document's figure.
    expect(tankVolume({ ...link, volume: 12 })).toBe(12);
    expect(tankVolume({ ...link, volume: "" })).toBe(11.1);
    expect(tankVolume({ volume: "" })).toBe("");
  });
});

describe("carriedVessel", () => {
  it("carries the last dive's vessel onto the same tank", () => {
    expect(carriedVessel({ gear_item: AL80 })).toEqual({
      gear_item_uuid: AL80.uuid,
      gear_item: AL80,
    });
  });

  it("skips an archived vessel, as the prefill skips archived gear", () => {
    expect(
      carriedVessel({ gear_item: { ...AL80, is_archived: true } })
        .gear_item_uuid,
    ).toBe("");
  });

  it("skips a vessel since retyped away from cylinder, which a create would refuse", () => {
    expect(
      carriedVessel({ gear_item: { ...AL80, type: "regulator" } })
        .gear_item_uuid,
    ).toBe("");
    // Untyped stays: the API refuses only a type that is set and is not a cylinder.
    expect(
      carriedVessel({ gear_item: { ...AL80, type: null } }).gear_item_uuid,
    ).toBe(AL80.uuid);
  });

  it("carries nothing from an unlinked tank", () => {
    expect(carriedVessel({ gear_item: null })).toEqual({
      gear_item_uuid: "",
      gear_item: null,
    });
  });
});
