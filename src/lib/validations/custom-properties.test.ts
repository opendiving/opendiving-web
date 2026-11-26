import { describe, expect, it } from "vitest";
import { customPropertiesField } from "./custom-properties";
import { CUSTOM_PROPERTIES_MAX } from "@/lib/custom-properties";

const issues = (rows: { key: string; value: string }[]) => {
  const result = customPropertiesField().safeParse(rows);
  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

describe("customPropertiesField", () => {
  it("passes complete rows and a row left blank on both sides", () => {
    expect(
      issues([
        { key: "Serial", value: "SN-1" },
        { key: " ", value: "" },
      ]),
    ).toEqual([]);
  });

  it("asks for the missing half of a row on that half", () => {
    expect(
      issues([
        { key: "Serial", value: " " },
        { key: "", value: "2.4" },
      ]),
    ).toEqual([
      ["0.value", "Give this key a value"],
      ["1.key", "Give this value a key"],
    ]);
  });

  it("refuses a key given twice, ignoring case and spaces, on the second", () => {
    expect(
      issues([
        { key: "Serial", value: "1" },
        { key: " SERIAL", value: "2" },
      ]),
    ).toEqual([["1.key", "This key is already used above"]]);
  });

  it("bounds the lengths and the count as the API does", () => {
    expect(issues([{ key: "k".repeat(101), value: "v" }])).toHaveLength(1);
    expect(issues([{ key: "k", value: "v".repeat(1001) }])).toHaveLength(1);
    const many = Array.from({ length: CUSTOM_PROPERTIES_MAX + 1 }, (_, i) => ({
      key: `Key ${i}`,
      value: "v",
    }));
    expect(issues(many)).toEqual([
      ["", `A record holds at most ${CUSTOM_PROPERTIES_MAX} custom properties`],
    ]);
  });
});
