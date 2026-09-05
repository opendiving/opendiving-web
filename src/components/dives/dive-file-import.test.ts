import { describe, it, expect } from "vitest";
import { applyParsedDiveToForm } from "./dive-file-import";
import { describeMixtureImport } from "@/lib/dive-import";
import { DEFAULT_MIXTURE } from "./mixture-fields";
import type { ParsedDive, ParsedDiveMixture } from "@/lib/api/dives";
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

// A form stub with just the two methods `applyParsedDiveToForm` touches. The
// mixtures it returns are the literal initial state both dive pages use.
function formHolding(mixtures: DiveMixtureInput[]) {
  return {
    getValues: (name?: string) => (name === "mixtures" ? mixtures : undefined),
    setValue: () => {},
  } as unknown as Parameters<typeof applyParsedDiveToForm>[0];
}

function parsedDive(
  mixtures: ParsedDiveMixture[],
  overrides: Partial<ParsedDive> = {},
) {
  return {
    dive_number: null,
    start_time: null,
    duration: null,
    max_depth: null,
    avg_depth: null,
    bottom_temperature: null,
    // Applied to the form like the scalars above, unlike the import-owned block
    // below - null is the ordinary case, since only a FIT file records it at all.
    water_type: null,
    mixtures,
    // Returned by the parse but never applied to the form - the API writes these
    // itself when the file is attached. Spelled out so this fixture stays a complete
    // `ParsedDive` rather than a partial one the compiler happens to accept.
    cns_start: null,
    cns_end: null,
    otu_start: null,
    otu_end: null,
    surface_pressure_bar: null,
    file_token: "token",
    ...overrides,
  };
}

// Records what `applyParsedDiveToForm` wrote, for the scalar fields the mixture
// tests above don't reach. `formHolding`'s stub swallows `setValue` entirely.
function recordingForm(mixtures: DiveMixtureInput[] = []) {
  const written: Record<string, unknown> = {};
  const form = {
    getValues: (name?: string) => (name === "mixtures" ? mixtures : undefined),
    setValue: (name: string, value: unknown) => {
      written[name] = value;
    },
  } as unknown as Parameters<typeof applyParsedDiveToForm>[0];
  return { form, written };
}

describe("applyParsedDiveToForm", () => {
  // What an import actually meets, rather than the hand-picked `existing` the unit
  // tests above pass in. Two real starting states now, and the difference is the
  // whole point: the create form starts empty (see `dives/new/page.tsx` - a form must
  // not write gas the diver never entered), while a form the diver has added a
  // cylinder to, or that the last-dive prefill filled in, holds one.
  const seededForm = () => formHolding([{ ...DEFAULT_MIXTURE }]);
  const emptyForm = () => formHolding([]);

  it("flags a cylinder size the file didn't record, against a seeded form", () => {
    // The bug this pins: the note used to require that *no* source had the value,
    // and the seed always has one. So on the ordinary one-cylinder import the note
    // never appeared - on either form - and 11.1 L went in looking like a reading,
    // which is the ~26 %-low RMV case. The size on screen here is the seeded
    // cylinder's rather than a default the merge invented, which is the only way
    // this note can fire now - and it is exactly the case worth firing on.
    const notes = applyParsedDiveToForm(
      seededForm(),
      parsedDive([parsed({ oxygen: 32 })]),
      () => {},
    );

    expect(notes.guessed.volume).toBe("form");
    expect(describeMixtureImport(notes)).toContain("cylinder size");
  });

  it("flags gas and volume for an export that records neither", () => {
    // The 2026 Suunto Ocean JSON shape: pressures and nothing else.
    const notes = applyParsedDiveToForm(
      seededForm(),
      parsedDive([parsed({ start_pressure: 205.11, end_pressure: 91.55 })]),
      () => {},
    );

    expect(notes.guessed).toEqual({
      volume: "form",
      oxygen: "form",
      helium: "form",
    });
    const note = describeMixtureImport(notes);
    expect(note).toContain("cylinder size");
    expect(note).toContain("gas mix");
  });

  it("leaves the size blank and says nothing when the form held nothing", () => {
    // The create form's actual starting state. `existingMixtureFor` won't pair a
    // one-cylinder file against a zero-cylinder form, so nothing supplies the volume
    // and it stays empty - which is what the API stores and what the dive page shows.
    // This used to be the loudest of the notes ("Those are defaults"), because
    // `DEFAULT_MIXTURE` put an 11.1 L on screen that no dive ever recorded; there is
    // nothing on screen to warn about now, and the empty box says it better than a
    // sentence 2 200 px above it could.
    let applied: DiveMixtureInput[] = [];
    const notes = applyParsedDiveToForm(
      emptyForm(),
      parsedDive([parsed({ oxygen: 32 })]),
      (mixtures) => {
        applied = mixtures;
      },
    );

    expect(applied[0].volume).toBe("");
    expect(applied[0].helium).toBe("");
    expect(applied[0].oxygen).toBe(32);
    expect(notes.guessed).toEqual({});
    expect(describeMixtureImport(notes)).toBeNull();
  });

  it("reports no lost pressures importing onto an empty form", () => {
    // The counts differ (nought against one), which is what makes
    // `existingMixtureFor` refuse to pair - and on the *seeded* form that refusal
    // could cost real pressures. Here there was nothing to lose, so saying they were
    // cleared would send the diver looking for data that never existed.
    const notes = applyParsedDiveToForm(
      emptyForm(),
      parsedDive([parsed({ oxygen: 32, helium: 0, volume: 12 })]),
      () => {},
    );

    expect(notes.discardedPressures).toBe(false);
    expect(describeMixtureImport(notes)).toBeNull();
  });

  it("says nothing when the file recorded the lot", () => {
    const notes = applyParsedDiveToForm(
      seededForm(),
      parsedDive([parsed({ volume: 12, oxygen: 32, helium: 0 })]),
      () => {},
    );

    expect(notes.guessed).toEqual({});
    expect(describeMixtureImport(notes)).toBeNull();
  });

  it("reports a carried-over value as the form's, not as a default", () => {
    // The diver's own 15 L is still not something the file recorded, so it is still
    // worth flagging - but it is not a default, and saying so is the whole distinction.
    const notes = applyParsedDiveToForm(
      formHolding([{ ...DEFAULT_MIXTURE, volume: 15 }]),
      parsedDive([parsed({ oxygen: 32 })]),
      () => {},
    );

    expect(notes.guessed.volume).toBe("form");
    expect(describeMixtureImport(notes)).toContain("already on this form");
  });

  it("reports pressures carried onto a file that had none", () => {
    const notes = applyParsedDiveToForm(
      formHolding([{ ...DEFAULT_MIXTURE, start_pressure: 211.62 }]),
      parsedDive([parsed({ oxygen: 21, helium: 0, volume: 12 })]),
      () => {},
    );

    expect(notes.keptPressures).toBe(true);
  });

  it("does not pair cylinders when the counts differ", () => {
    // The safety-critical half of the carry-over: position is the only signal,
    // so pairing a one-cylinder form onto a two-cylinder file could put a back
    // gas's pressures on a stage bottle and yield a confidently wrong RMV.
    // Inverting or deleting the guard left the whole suite green.
    let applied: DiveMixtureInput[] = [];
    const notes = applyParsedDiveToForm(
      formHolding([onForm({ start_pressure: 211.62, end_pressure: 127.16 })]),
      parsedDive([parsed({ oxygen: 21 }), parsed({ oxygen: 50 })]),
      (mixtures) => {
        applied = mixtures;
      },
    );

    expect(applied[0].start_pressure).toBe("");
    // Blank rather than the form's 11.1 L, for the same reason the pressure above it
    // is blank: with no pairing there is no cylinder to carry anything from, and the
    // import path invents nothing.
    expect(applied[0].volume).toBe("");
    expect(notes.keptPressures).toBe(false);
    // ...and the diver is told the pressures went, which on the edit form takes the
    // dive's `gas_use` with it.
    expect(notes.discardedPressures).toBe(true);
    expect(describeMixtureImport(notes)).toContain("were cleared");
  });

  it("returns empty notes when the file carries no mixtures at all", () => {
    const notes = applyParsedDiveToForm(seededForm(), parsedDive([]), () => {});

    expect(notes).toEqual({
      guessed: {},
      keptPressures: false,
      discardedPressures: false,
    });
  });

  it("applies the water type a FIT file recorded", () => {
    const { form, written } = recordingForm();

    applyParsedDiveToForm(
      form,
      parsedDive([], { water_type: "en13319" }),
      () => {},
    );

    // `en13319` verbatim, not folded into "salt": it is what the computer was
    // actually set to, and the parser refuses to substitute a plausible value
    // for a recorded one. The diver corrects it on the form if it is wrong.
    expect(written.water_type).toBe("en13319");
  });

  it("leaves the water type alone for a file that records none", () => {
    // Every Suunto export, and any FIT file set to `custom`. Writing `""` here
    // would clear a value the edit form was seeded with from the dive itself.
    const { form, written } = recordingForm();

    applyParsedDiveToForm(form, parsedDive([]), () => {});

    expect(written).not.toHaveProperty("water_type");
  });
});
