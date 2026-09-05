import { describe, it, expect } from "vitest";
import {
  describeMixtureImport,
  mergeMixture,
  mixtureImportNotes,
  type MixtureImportNotes,
} from "./dive-import";
import { DEFAULT_MIXTURE } from "@/lib/dive-mixtures";
import type { ParsedDiveMixture } from "@/lib/api/dives";
import type { DiveMixtureInput } from "@/lib/validations/dive";

// A mixture exactly as the API returns one, i.e. with every field explicitly
// present - `null` is a real answer here ("the file didn't record this"), not an
// omission, so the fixture spells all of them out.
function parsed(overrides: Partial<ParsedDiveMixture> = {}): ParsedDiveMixture {
  return {
    volume: null,
    start_pressure: null,
    end_pressure: null,
    oxygen: null,
    helium: null,
    po2_limit: null,
    gas_number: null,
    role: null,
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
        volume: 12,
        start_pressure: 207.14,
        end_pressure: 122.44,
        oxygen: 32,
        helium: 0,
        po2_limit: 1.4,
        gas_number: 1,
        role: "bottom",
      }),
    ).value;

    expect(mixture).toEqual({
      volume: 12,
      start_pressure: 207.14,
      end_pressure: 122.44,
      oxygen: 32,
      helium: 0,
      po2_limit: 1.4,
      gas_number: 1,
      role: "bottom",
      // Cleared, and it can be nothing else: no format this app parses carries
      // the flag, so `ParsedDiveMixture` has no `usage` for a file to supply.
      usage: "",
    });
  });

  it("keeps a usage flag the diver set before importing the file", () => {
    // `mergeMixture` builds its result field by field, so a field left out of that
    // object is silently *dropped* rather than preserved - the exact
    // form-value-lost-on-import failure its own JSDoc records. `usage` is the one
    // field with no file tier at all, which makes it the one where losing the
    // form's value loses it outright: nothing would ever put it back.
    const mixture = mergeMixture(
      parsed({ oxygen: 21, helium: 0 }),
      onForm({ usage: "parallel" }),
    ).value;

    expect(mixture.usage).toBe("parallel");
  });

  it("leaves the tech fields empty when the file recorded none", () => {
    // An absent ppO2 limit falls back to PPO2_WORKING where a MOD is computed, and an
    // absent role or gas number simply isn't shown - so there is nothing here for the
    // import note to warn about. Volume and the gas fractions are left empty too now,
    // but they *are* in the note's field list, because a value carried over from the
    // previous dive's cylinder is a number on screen this file never recorded.
    const mixture = mergeMixture(parsed({ oxygen: 21, helium: 0 })).value;

    // `""` for the two the form has an input for - the cleared state their
    // fields read back - and `undefined` for the one it doesn't.
    expect(mixture.po2_limit).toBe("");
    expect(mixture.gas_number).toBeUndefined();
    expect(mixture.role).toBe("");
  });

  it("carries the form's tech fields when the file has none of its own", () => {
    // The middle tier, same as the pressures: importing a second export for one dive
    // (the Ocean's FIT and JSON are complementary) must not erase what the first
    // contributed.
    const mixture = mergeMixture(
      parsed({ oxygen: 21, helium: 0 }),
      onForm({ po2_limit: 1.6, gas_number: 2, role: "deco" }),
    ).value;

    expect(mixture.po2_limit).toBe(1.6);
    expect(mixture.gas_number).toBe(2);
    expect(mixture.role).toBe("deco");
  });

  it("prefers the file's tech fields over the form's", () => {
    const mixture = mergeMixture(
      parsed({ oxygen: 21, helium: 0, po2_limit: 1.4, gas_number: 0 }),
      onForm({ po2_limit: 1.6, gas_number: 2 }),
    ).value;

    expect(mixture.po2_limit).toBe(1.4);
    // Zero is a value, not an absence - a Suunto Ocean numbers its cylinders from 0,
    // so `??` rather than `||` is what keeps that number from being replaced.
    expect(mixture.gas_number).toBe(0);
  });

  it("leaves gas and volume the export never recorded blank", () => {
    // The 2026 Suunto Ocean JSON export records transmitter pressures but no gas
    // fraction and no tank size anywhere, and a FIT file cannot express cylinder size
    // at all. The API sends `null` rather than inventing air, and the form no longer
    // converts that back into a number: every one of these boxes stays empty, saves as
    // NULL, and shows on the dive page as an absence. `DEFAULT_MIXTURE` is still what a
    // cylinder added *by hand* starts from - it is the import path that stopped
    // guessing.
    const mixture = mergeMixture(
      parsed({ start_pressure: 205.11, end_pressure: 91.55 }),
    ).value;

    expect(mixture.volume).toBe("");
    expect(mixture.oxygen).toBe("");
    expect(mixture.helium).toBe("");
    // The values that *were* read are untouched.
    expect(mixture.start_pressure).toBe(205.11);
    expect(mixture.end_pressure).toBe(91.55);
  });

  it("does not carry a blank form field over as if it were a value", () => {
    // The form's cleared state is `""`, which is a value in the union and not a gap:
    // read with `!= null` it would count as something the form held, and the import
    // note would report a carry-over of an empty box. A diver who cleared the size on
    // the previous dive gets a blank here, and no sentence about it.
    const merged = mergeMixture(
      parsed({ start_pressure: 205.11 }),
      onForm({ volume: "", oxygen: "", helium: "" }),
    );

    expect(merged.value.volume).toBe("");
    expect(merged.sources.volume).toBe("blank");
    expect(merged.sources.oxygen).toBe("blank");
  });

  it("treats a recorded zero as a reading, not as a gap", () => {
    // 0 % helium on a nitrox fill is a real recorded value, and `!= null` rather than
    // a truthiness test is what keeps it from being read as an absence and blanked.
    const mixture = mergeMixture(parsed({ helium: 0, oxygen: 0 })).value;

    expect(mixture.helium).toBe(0);
    expect(mixture.oxygen).toBe(0);
  });

  it("leaves unrecorded pressures blank rather than zero", () => {
    // "" is the form's unset placeholder for the pressure fields - an
    // untransmitted deco cylinder has no start pressure, and 0 bar would read as
    // an empty tank.
    const mixture = mergeMixture(parsed({ oxygen: 49, volume: 11 })).value;

    expect(mixture.start_pressure).toBe("");
    expect(mixture.end_pressure).toBe("");
  });

  it("keeps what the form already held for anything the file lacks", () => {
    // The two Suunto Ocean exports are complementary - the FIT carries gas mixes
    // and no transmitter data, the JSON carries pressures and no gas mix - so
    // importing both for one dive is the documented way to log a multi-gas dive.
    // Before this, the second import silently erased the first one's half.
    const mixture = mergeMixture(
      parsed({ oxygen: 21, helium: 0 }),
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
      onForm({ start_pressure: 100, end_pressure: 127 }),
    ).value;

    expect(partial.start_pressure).toBe(180);
    expect(partial.end_pressure).toBe("");

    // The carry-over still happens when the file supplies neither.
    const carried = mergeMixture(
      parsed({ oxygen: 21 }),
      onForm({ start_pressure: 211.62, end_pressure: 127.16 }),
    ).value;

    expect(carried.start_pressure).toBe(211.62);
    expect(carried.end_pressure).toBe(127.16);
  });

  it("prefers the file's values over the form's", () => {
    const mixture = mergeMixture(
      parsed({ volume: 12, start_pressure: 200 }),
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

  it("says it in the singular for one carried-over field", () => {
    expect(describeMixtureImport(notesFor({ volume: "form" }))).toContain(
      "That value was already on this form",
    );
  });

  it("says nothing about a field neither the file nor the form had", () => {
    // The blank case is not a note. There is no number on screen to mistake for a
    // reading - the box is empty, the save stores NULL, and the dive page renders the
    // absence as an absence. A sentence 2 200 px above the empty box would be the
    // second place for that fact to live and the one that could go stale.
    const merged = [
      mergeMixture(parsed({ start_pressure: 205.11, end_pressure: 91.55 })),
    ];
    const notes = mixtureImportNotes(
      [parsed({ start_pressure: 205.11, end_pressure: 91.55 })],
      merged,
      [],
    );

    expect(notes.guessed).toEqual({});
    expect(describeMixtureImport(notes)).toBeNull();
  });

  it("quotes no values at all", () => {
    // The note lives in the import card and the gas fields are ~2 200 px below it, so a
    // quoted figure can never be compared with the one in the box - and quoting a value
    // is what forced the sentence to track the form and go stale when it didn't.
    const note = describeMixtureImport(
      notesFor({ volume: "form", oxygen: "form", helium: "form" }),
    );

    expect(note).not.toMatch(/\d/);
    expect(note).toContain("check the gas mixtures below");
  });

  it("names helium on its own rather than an oxygen it didn't guess", () => {
    const note = describeMixtureImport(notesFor({ helium: "form" }));

    expect(note).toContain("helium fraction");
  });

  it("folds helium into the gas mix when both were guessed", () => {
    const note = describeMixtureImport(
      notesFor({ oxygen: "form", helium: "form" }),
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
    const merged = cylinders.map((mixture) => mergeMixture(mixture));
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
