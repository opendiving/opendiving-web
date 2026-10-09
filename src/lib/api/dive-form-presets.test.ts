import { describe, expect, it } from "vitest";
import {
  currentDiveFormPreset,
  isAllFieldsPresetName,
  type DiveFormPreset,
} from "./dive-form-presets";
import type { DiveFormFieldKey } from "@/lib/dive-form-fields";

const preset = (
  uuid: string,
  hidden_fields: DiveFormFieldKey[],
): DiveFormPreset => ({
  uuid,
  user_uuid: "user-1",
  name: uuid,
  hidden_fields,
  created_at: "2026-01-01T00:00:00Z",
});

const recreational = preset("recreational", ["altitude", "water_type"]);
const twin = preset("twin", ["water_type", "altitude"]);
const everything = preset("everything", []);
const rows = [recreational, twin, everything];

describe("currentDiveFormPreset", () => {
  it("names the pick among presets holding the same set", () => {
    expect(
      currentDiveFormPreset(rows, ["altitude", "water_type"], "twin"),
    ).toEqual({ kind: "saved", preset: twin });
  });

  it("falls back past a pick whose set no longer matches", () => {
    expect(currentDiveFormPreset(rows, ["altitude"], "twin")).toEqual({
      kind: "custom",
    });
    expect(
      currentDiveFormPreset(rows, ["altitude", "water_type"], "everything"),
    ).toEqual({ kind: "saved", preset: recreational });
  });

  it("names All for nothing hidden unless a preset holding nothing was picked", () => {
    expect(currentDiveFormPreset(rows, [], null)).toEqual({ kind: "all" });
    expect(currentDiveFormPreset(rows, [], "everything")).toEqual({
      kind: "saved",
      preset: everything,
    });
  });

  it("knows All before the presets arrive, and nothing else", () => {
    expect(currentDiveFormPreset(null, [], null)).toEqual({ kind: "all" });
    expect(currentDiveFormPreset(null, ["altitude"], "twin")).toEqual({
      kind: "loading",
    });
  });
});

describe("isAllFieldsPresetName", () => {
  it("matches the built-in name trimmed and in any case", () => {
    expect(isAllFieldsPresetName(" all ")).toBe(true);
    expect(isAllFieldsPresetName("ALL")).toBe(true);
    expect(isAllFieldsPresetName("All fields")).toBe(false);
  });
});
