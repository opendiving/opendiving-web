import { describe, expect, it } from "vitest";

import { describeImportChange } from "./import-changes";

const describe_ = (member: string, before: unknown, after: unknown) =>
  describeImportChange({ member, before, after }, "metric");

describe("describeImportChange", () => {
  it("labels a dive's member in the form's words, in the diver's units", () => {
    expect(describe_("max_depth", 21, 21.8)).toEqual({
      kind: "value",
      label: "Maximum depth",
      before: "21 m",
      after: "21.8 m",
    });
    expect(describe_("water_type", null, "salt")).toEqual({
      kind: "value",
      label: "Water type",
      before: "—",
      after: "Salt water",
    });
  });

  it("follows the diver's units", () => {
    const row = describeImportChange(
      { member: "bottom_temperature", before: null, after: 20 },
      "imperial",
    );
    expect(row).toMatchObject({ after: expect.stringContaining("°F") });
  });

  it("names a recording's and a cylinder's member by its place", () => {
    expect(describe_("recordings/0/device/firmware", "1.0", "1.1")).toEqual({
      kind: "value",
      label: "Recording 1: Device firmware",
      before: "1.0",
      after: "1.1",
    });
    expect(describe_("mixtures/1/start_pressure", null, 200)).toMatchObject({
      label: "Tank 2: Start pressure",
      after: expect.stringContaining("200"),
    });
    expect(describe_("mixtures/0/gas_number", 0, 1)).toEqual({
      kind: "value",
      label: "Tank 1: Gas number",
      before: "0",
      after: "1",
    });
    expect(describe_("recordings/1/cns_end", null, 9)).toMatchObject({
      label: "Recording 2: CNS at the end",
      after: "9%",
    });
  });

  it("reads an element added as one row", () => {
    expect(
      describe_("recordings/1", null, {
        ordinal: 1,
        device: { model: "Perdix 3" },
        files: [{ original_filename: "perdix.uddf" }],
      }),
    ).toEqual({
      kind: "element",
      text: "Recording 2 added — Perdix 3, perdix.uddf",
    });
    expect(
      describe_("recordings/0/files/1", null, {
        original_filename: "dive.json",
      }),
    ).toEqual({ kind: "element", text: "File added — dive.json" });
    expect(
      describe_("mixtures/1", null, { oxygen: 32, helium: 0, volume: 12 }),
    ).toEqual({
      kind: "element",
      text: "Tank 2 added — EAN32, 12 L",
    });
  });

  it("reads an element removed likewise", () => {
    expect(
      describe_("recordings/0/files/1", { original_filename: "a.fit" }, null),
    ).toEqual({ kind: "element", text: "File removed — a.fit" });
    expect(describe_("tags/0", "Wreck", null)).toEqual({
      kind: "element",
      text: "Tag removed — Wreck",
    });
  });

  it("reads a list position whose value moved as a value, not an element", () => {
    expect(
      describe_("recordings/0/profile/channels/1", "temperature", "ceiling"),
    ).toEqual({
      kind: "value",
      label: "Recording 1: Curve",
      before: "Temperature",
      after: "Deco ceiling",
    });
    expect(
      describe_("recordings/0/profile/channels/2", null, "temperature"),
    ).toEqual({
      kind: "element",
      text: "Recording 1: Curve added — Temperature",
    });
  });

  it("names a curve as the profile chart does", () => {
    expect(describe_("recordings/0/profile/channels/3", null, "ndl")).toEqual({
      kind: "element",
      text: "Recording 1: Curve added — No-deco time",
    });
    expect(
      describe_(
        "recordings/0/profile/channels/4",
        "surface_gradient_factor",
        null,
      ),
    ).toEqual({
      kind: "element",
      text: "Recording 1: Curve removed — Surface gradient factor",
    });
  });

  it("reads a curve this build has no name for rather than hiding it", () => {
    expect(
      describe_("recordings/0/profile/channels/5", null, "scrubber_life"),
    ).toEqual({
      kind: "element",
      text: "Recording 1: Curve added — Scrubber life",
    });
  });

  it("summarises a whole member that arrives as an object", () => {
    expect(
      describe_("recordings/0/profile", null, {
        duration: 3_120_000,
        depth_sample_count: 1200,
        max_depth: 21.8,
      }),
    ).toMatchObject({
      label: "Recording 1: Profile",
      before: "—",
      after: expect.stringContaining("1200 samples"),
    });
    expect(
      describe_("recordings/0/device", null, { model: "Perdix 3" }),
    ).toMatchObject({ label: "Recording 1: Device", after: "Perdix 3" });
  });

  it("shows a member it has no label for by its path, never hiding it", () => {
    expect(describe_("gas_use/sac", 12.5, { rate: 13 })).toEqual({
      kind: "value",
      label: "gas_use/sac",
      before: "12.5",
      after: '{"rate":13}',
    });
    expect(describe_("recordings/0/start_on_dive_axis", null, 93)).toEqual({
      kind: "value",
      label: "recordings/0/start_on_dive_axis",
      before: "—",
      after: "93",
    });
    expect(describe_("mixtures/0/id", 4, 5)).toMatchObject({
      label: "mixtures/0/id",
    });
  });
});
