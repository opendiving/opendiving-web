import { describe, expect, it } from "vitest";
import {
  customPropertiesUpdate,
  normalizeCustomProperties,
} from "./custom-properties";
import { customPropertiesSections } from "@/components/ui/record-info-dialog";

describe("normalizeCustomProperties", () => {
  it("trims each member and drops a row left blank on both sides", () => {
    expect(
      normalizeCustomProperties([
        { key: " Serial ", value: " SN-1 " },
        { key: "  ", value: "" },
        { key: "Firmware", value: "2.4" },
      ]),
    ).toEqual([
      { key: "Serial", value: "SN-1" },
      { key: "Firmware", value: "2.4" },
    ]);
  });
});

describe("customPropertiesUpdate", () => {
  it("sends the rows, an empty list included, for a record read with them", () => {
    expect(customPropertiesUpdate([{ key: "A", value: "1" }], [])).toEqual([]);
    expect(customPropertiesUpdate([], [{ key: "B", value: " 2 " }])).toEqual([
      { key: "B", value: "2" },
    ]);
  });

  it("sends nothing for a record read without them when none were added", () => {
    // A response cached before the member existed: `[]` would clear what
    // another client wrote since.
    expect(customPropertiesUpdate(undefined, [])).toBeUndefined();
    expect(
      customPropertiesUpdate(undefined, [{ key: "", value: "" }]),
    ).toBeUndefined();
  });

  it("still sends what the diver added to such a record", () => {
    expect(
      customPropertiesUpdate(undefined, [{ key: "Serial", value: "SN-1" }]),
    ).toEqual([{ key: "Serial", value: "SN-1" }]);
  });
});

describe("customPropertiesSections", () => {
  it("lists each property under its key, after nothing when there are none", () => {
    expect(customPropertiesSections(undefined)).toEqual([]);
    expect(customPropertiesSections([])).toEqual([]);
    expect(
      customPropertiesSections([{ key: "Serial", value: "SN-1" }]),
    ).toEqual([
      {
        heading: "Custom properties",
        facts: [{ label: "Serial", value: "SN-1" }],
      },
    ]);
  });
});
