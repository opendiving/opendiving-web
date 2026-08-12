import { describe, it, expect } from "vitest";
import {
  describeMixtureImport,
  mergeMixture,
  mixtureImportNotes,
  type MixtureImportNotes,
} from "./dive-import";
import {
  DEFAULT_MIXTURE,
  getDefaultMixtureName,
} from "@/components/dives/mixture-fields";
import type { ParsedDiveMixture } from "@/lib/api/dives";
import type { DiveMixtureInput } from "@/lib/validations/dive";

// A mixture exactly as the API returns one, i.e. with every field explicitly
// present - `null` is a real answer here ("the file didn't record this"), not an
// omission, so the fixture spells all of them out.
function parsed(overrides: Partial<ParsedDiveMixture> = {}): ParsedDiveMixture {
  return {
    name: null,
    volume: null,
    start_pressure: null,
    end_pressure: null,
    oxygen: null,
    helium: null,
    ...overrides,
  };
}

// A cylinder already on the form, as an earlier import or the diver left it.
function onForm(overrides: Partial<DiveMixtureInput> = {}): DiveMixtureInput {
  return { ...DEFAULT_MIXTURE, ...overrides };
}

describe("mergeMixture", () => {
  it("keeps every value the export actually recorded", () => {
    const mixture = mergeMixture(
      parsed({
        name: "Back Gas",
        volume: 12,
        start_pressure: 207.14,
        end_pressure: 122.44,
        oxygen: 32,
        helium: 0,
      }),
      0,
    ).value;

    expect(mixture).toEqual({
      name: "Back Gas",
      volume: 12,
      start_pressure: 207.14,
      end_pressure: 122.44,
      oxygen: 32,
      helium: 0,
    });
  });

  it("fills gas and volume the export never recorded from DEFAULT_MIXTURE", () => {
    // The 2026 Suunto Ocean JSON export records transmitter pressures but no gas
    // fraction and no tank size anywhere, and a FIT file cannot express cylinder
    // size at all. The API sends `null` rather than inventing air, so the guess
    // happens here - where it is the same one a hand-added cylinder starts with.
    const mixture = mergeMixture(
      parsed({ start_pressure: 205.11, end_pressure: 91.55 }),
      0,
    ).value;

    expect(mixture.volume).toBe(DEFAULT_MIXTURE.volume);
    expect(mixture.oxygen).toBe(DEFAULT_MIXTURE.oxygen);
    expect(mixture.helium).toBe(DEFAULT_MIXTURE.helium);
    // The values that *were* read are untouched.
    expect(mixture.start_pressure).toBe(205.11);
    expect(mixture.end_pressure).toBe(91.55);
  });

  it("treats a recorded zero as a reading, not as a gap", () => {
    // 0 % helium on a nitrox fill is a real recorded value. `??` (not `||`) is
    // what keeps it from being replaced by the default - which for `helium`
    // happens to be 0 too, so `oxygen` is the field that would actually break.
    const mixture = mergeMixture(parsed({ helium: 0, oxygen: 0 }), 0).value;

    expect(mixture.helium).toBe(0);
    expect(mixture.oxygen).toBe(0);
  });

  it("leaves unrecorded pressures blank rather than zero", () => {
    // "" is the form's unset placeholder for the pressure fields - an
    // untransmitted deco cylinder has no start pressure, and 0 bar would read as
    // an empty tank.
    const mixture = mergeMixture(parsed({ oxygen: 49, volume: 11 }), 0).value;

    expect(mixture.start_pressure).toBe("");
    expect(mixture.end_pressure).toBe("");
  });

  it("names an unnamed cylinder the way a hand-added one is named", () => {
    // Mixture names are never parsed, and multi-gas FIT imports are routine (4
    // of 19 dives in the API's Ocean corpus), so leaving them anonymous is a
    // chore the diver repeats every dive.
    expect(mergeMixture(parsed(), 0).value.name).toBe(getDefaultMixtureName(0));
    expect(mergeMixture(parsed(), 1).value.name).toBe(getDefaultMixtureName(1));
  });

  it("keeps what the form already held for anything the file lacks", () => {
    // The two Suunto Ocean exports are complementary - the FIT carries gas mixes
    // and no transmitter data, the JSON carries pressures and no gas mix - so
    // importing both for one dive is the documented way to log a multi-gas dive.
    // Before this, the second import silently erased the first one's half.
    const mixture = mergeMixture(
      parsed({ oxygen: 21, helium: 0 }),
      0,
      onForm({ volume: 15, start_pressure: 211.62, end_pressure: 127.16 }),
    ).value;

    expect(mixture.start_pressure).toBe(211.62);
    expect(mixture.end_pressure).toBe(127.16);
    expect(mixture.volume).toBe(15);
    // The file's own values still win over what was there.
    expect(mixture.oxygen).toBe(21);
  });

  it("never mixes a file pressure with a form pressure", () => {
    // One from each describes a fill that never existed: it either trips the
    // form's `end <= start` refine on a field the diver never touched, or passes
    // and feeds `compute_gas_use` a consumption spanning two different fills.
    const partial = mergeMixture(
      parsed({ start_pressure: 180, oxygen: 21 }),
      0,
      onForm({ start_pressure: 100, end_pressure: 127 }),
    ).value;

    expect(partial.start_pressure).toBe(180);
    expect(partial.end_pressure).toBe("");

    // The carry-over still happens when the file supplies neither.
    const carried = mergeMixture(
      parsed({ oxygen: 21 }),
      0,
      onForm({ start_pressure: 211.62, end_pressure: 127.16 }),
    ).value;

    expect(carried.start_pressure).toBe(211.62);
    expect(carried.end_pressure).toBe(127.16);
  });

  it("prefers the file's values over the form's", () => {
    const mixture = mergeMixture(
      parsed({ volume: 12, start_pressure: 200 }),
      0,
      onForm({ volume: 15, start_pressure: 180 }),
    ).value;

    expect(mixture.volume).toBe(12);
    expect(mixture.start_pressure).toBe(200);
  });
});

describe("describeMixtureImport", () => {
  const notesFor = (
    guessed: MixtureImportNotes["guessed"],
    rest: Partial<MixtureImportNotes> = {},
  ): MixtureImportNotes => ({
    guessed,
    keptPressures: false,
    discardedPressures: false,
    ...rest,
  });

  it("says nothing when the file recorded everything", () => {
    expect(describeMixtureImport(notesFor({}))).toBeNull();
  });

  it("says the values were kept when they came off the form", () => {
    const note = describeMixtureImport(
      notesFor({ volume: "form", oxygen: "form" }),
    );

    expect(note).toContain("Those values were already on this form");
    expect(note).not.toContain("default");
  });

  it("says the value is a default when nothing supplied it", () => {
    expect(describeMixtureImport(notesFor({ volume: "default" }))).toContain(
      "That is a default",
    );
  });

  it("calls it a default when a folded-away helium was the default", () => {
    // Helium is folded into the "gas mix" label when oxygen was guessed too, so judging
    // provenance over the *named* fields alone let a defaulted helium hide behind a
    // form-sourced oxygen: the note said "already on this form" while the He box showed
    // a DEFAULT_MIXTURE 0 the diver had deliberately cleared.
    expect(
      describeMixtureImport(
        notesFor({ volume: "form", oxygen: "form", helium: "default" }),
      ),
    ).toContain("Those are defaults");
  });

  it("calls it a default when any one of them was", () => {
    // Something on screen that no dive ever recorded is the more urgent of the two.
    expect(
      describeMixtureImport(notesFor({ volume: "form", oxygen: "default" })),
    ).toContain("Those are defaults");
  });

  it("quotes no values at all", () => {
    // The note lives in the import card and the gas fields are ~2 200 px below it, so a
    // quoted figure can never be compared with the one in the box - and quoting a value
    // is what forced the sentence to track the form and go stale when it didn't.
    const note = describeMixtureImport(
      notesFor({ volume: "default", oxygen: "default", helium: "default" }),
    );

    expect(note).not.toMatch(/\d/);
    expect(note).toContain("check the gas mixtures below");
  });

  it("names helium on its own rather than an oxygen it didn't guess", () => {
    const note = describeMixtureImport(notesFor({ helium: "default" }));

    expect(note).toContain("helium fraction");
  });

  it("folds helium into the gas mix when both were guessed", () => {
    const note = describeMixtureImport(
      notesFor({ oxygen: "default", helium: "default" }),
    );

    expect(note).toContain("gas mix");
    expect(note).not.toContain("helium fraction");
  });

  it("reports pressures carried over from the form", () => {
    expect(
      describeMixtureImport(notesFor({}, { keptPressures: true })),
    ).toContain("Tank pressures already on this dive were kept");
  });

  it("says nothing about lost pressures when the file brought its own", () => {
    // `discardedPressures` asked only whether the old pressures had nowhere to go, never
    // whether anything replaced them - so a two-cylinder transmitter file imported onto a
    // one-cylinder edit form claimed a loss while the form held the file's own readings.
    const cylinders = [
      parsed({
        start_pressure: 210,
        end_pressure: 70,
        oxygen: 21,
        helium: 0,
        volume: 12,
      }),
      parsed({
        start_pressure: 180,
        end_pressure: 90,
        oxygen: 50,
        helium: 0,
        volume: 11,
      }),
    ];
    const merged = cylinders.map((mixture, index) =>
      mergeMixture(mixture, index, undefined),
    );
    const notes = mixtureImportNotes(cylinders, merged, [
      onForm({ start_pressure: 200, end_pressure: 60 }),
    ]);

    expect(notes.discardedPressures).toBe(false);
    expect(describeMixtureImport(notes)).toBeNull();
  });

  it("reports pressures lost because the cylinder counts differed", () => {
    // `existingMixtureFor` refuses to pair, so there is nowhere to carry them - and on
    // the edit form that takes the dive's `gas_use` with it, silently.
    expect(
      describeMixtureImport(notesFor({}, { discardedPressures: true })),
    ).toContain("were cleared");
  });
});
