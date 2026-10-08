import { describe, it, expect } from "vitest";
import {
  applyParsedDiveToForm,
  type InferredFigures,
} from "./dive-file-import";
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
    mixtures,
    // The rest of the dive, which most dive-computer files leave unstated.
    notes: null,
    visibility: null,
    weight: null,
    water_type: null,
    altitude: null,
    type: null,
    rating: null,
    air_temperature: null,
    current: null,
    waves: null,
    weather: null,
    entry_type: null,
    boat_name: null,
    tags: [],
    // A setting of the device, never applied to the form - null is the ordinary
    // case, since only a FIT file records it at all.
    salinity: null,
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
  // whole point: the create form starts empty (see `new-dive-page-content.tsx` - a form must
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

  it("never takes the dive's water type from a file's salinity", () => {
    // A FIT file's `dive_settings.water_type` is the density the computer was
    // set to - `en13319` is a calibration, not a kind of water - so it stays the
    // recording's setting, and the dive's water type stays the diver's answer.
    const { form, written } = recordingForm();

    applyParsedDiveToForm(
      form,
      parsedDive([], { salinity: "en13319" }),
      () => {},
    );

    expect(written).not.toHaveProperty("water_type");
  });

  it("takes the water type a file states for the dive itself", () => {
    const { form, written } = recordingForm();

    applyParsedDiveToForm(
      form,
      parsedDive([], { water_type: "fresh", salinity: "en13319" }),
      () => {},
    );

    expect(written.water_type).toBe("fresh");
  });

  it("prefills the rest of the dive a logbook file states", () => {
    // A UDDF dive carries the diver's own entries beside the readings, and logbook
    // import stores every one of them; the form takes the same file the same way.
    const { form, written } = recordingForm();

    applyParsedDiveToForm(
      form,
      parsedDive([], {
        notes: "Turtle at the safety stop",
        visibility: 15,
        weight: 4,
        altitude: 0,
        rating: 4,
        air_temperature: 31.5,
        current: "light",
        entry_type: "boat",
        tags: ["reef"],
      }),
      () => {},
    );

    expect(written).toMatchObject({
      notes: "Turtle at the safety stop",
      visibility: 15,
      weight: 4,
      altitude: 0,
      rating: 4,
      air_temperature: 31.5,
      current: "light",
      entry_type: "boat",
      tags: ["reef"],
    });
  });

  it("leaves a member the file states nothing about to the form", () => {
    // The Suunto app writes `""` for notes on every Ocean file, and a file with no
    // tags reads as an empty list: neither may wipe what the last dive carried over.
    const { form, written } = recordingForm();

    applyParsedDiveToForm(
      form,
      parsedDive([], { notes: "", tags: [], weight: null, boat_name: null }),
      () => {},
    );

    expect(written).not.toHaveProperty("notes");
    expect(written).not.toHaveProperty("tags");
    expect(written).not.toHaveProperty("weight");
    expect(written).not.toHaveProperty("boat_name");
  });
});

// A form already holding values, for the fill-only cases below. Unlike
// `recordingForm` above it answers `getValues(name)` for scalars as well as for
// `mixtures`, because fill-only asks the form what it already has before writing
// anything - which is the whole mechanism under test.
function formHoldingValues(
  values: Record<string, unknown>,
  mixtures: DiveMixtureInput[] = [],
) {
  const written: Record<string, unknown> = {};
  const form = {
    getValues: (name?: string) =>
      name === "mixtures" ? mixtures : values[name as string],
    setValue: (name: string, value: unknown) => {
      written[name] = value;
      values[name] = value;
    },
  } as unknown as Parameters<typeof applyParsedDiveToForm>[0];
  return { form, written };
}

describe("applyParsedDiveToForm with a file that states only a day", () => {
  it("keeps a date-only dive a date rather than giving it a midnight", () => {
    const { form, written } = formHoldingValues({ start_time: "2002-06-18" });

    applyParsedDiveToForm(
      form,
      parsedDive([], { start_time: "2002-06-19" }),
      () => {},
    );

    expect(written.start_time).toBe("2002-06-19");
  });

  it("still gives a dive with a clock the file's day at midnight", () => {
    // The create form needs an instant, and a diver can correct the hour.
    const { form, written } = formHoldingValues({
      start_time: "2026-04-17T11:49:23+02:00",
    });

    applyParsedDiveToForm(
      form,
      parsedDive([], { start_time: "2002-06-19" }),
      () => {},
    );

    expect(written.start_time).toMatch(/^2002-06-19T00:00:00[+-]\d{2}:\d{2}$/);
  });
});

describe("applyParsedDiveToForm in fill-only mode", () => {
  it("leaves a figure the form already carries exactly as it is", () => {
    // The case the rule exists for: the Suunto app's JSON has been imported, and
    // the same computer's FIT of the same dive follows. The FIT's own `avg_depth`
    // 9.49 and `duration` 3474 are that machine's second telling of numbers the
    // form already holds from the first, and overwriting them would silently
    // replace figures the diver has been looking at - and may have corrected.
    // Marked as stating them: a figure the file derived is the case below.
    const { form, written } = formHoldingValues({
      avg_depth: 10.74,
      duration: "50:51",
      max_depth: 19.04,
    });

    applyParsedDiveToForm(
      form,
      parsedDive([], {
        avg_depth: 9.49,
        duration: 3474,
        max_depth: 19.1,
        inferred: [],
      }),
      () => {},
      "fill-only",
    );

    expect(written).not.toHaveProperty("avg_depth");
    expect(written).not.toHaveProperty("duration");
    expect(written).not.toHaveProperty("max_depth");
  });

  it("still fills a field the form left empty", () => {
    // "Fills, never overwrites" is two claims, and this is the half that makes
    // the second file worth attaching at all. A bottom temperature the JSON
    // never recorded is one the FIT can supply.
    const { form, written } = formHoldingValues({
      avg_depth: 10.74,
      bottom_temperature: undefined,
    });

    applyParsedDiveToForm(
      form,
      parsedDive([], { avg_depth: 9.49, bottom_temperature: 21.8 }),
      () => {},
      "fill-only",
    );

    expect(written.bottom_temperature).toBe(21.8);
    expect(written).not.toHaveProperty("avg_depth");
  });

  it("reads a cleared number input as empty rather than as a value", () => {
    // A number field the diver cleared reads back as `NaN`, not `undefined` -
    // the one non-obvious empty state on this form, and the one a `!= null`
    // guard gets wrong.
    const { form, written } = formHoldingValues({ max_depth: Number.NaN });

    applyParsedDiveToForm(
      form,
      parsedDive([], { max_depth: 19.1 }),
      () => {},
      "fill-only",
    );

    expect(written.max_depth).toBe(19.1);
  });

  it("fills the dive's other members only where the form is empty", () => {
    const { form, written } = formHoldingValues({
      notes: "Typed on the boat",
      tags: [],
      weight: undefined,
    });

    applyParsedDiveToForm(
      form,
      parsedDive([], { notes: "From the logbook", tags: ["reef"], weight: 4 }),
      () => {},
      "fill-only",
    );

    expect(written).not.toHaveProperty("notes");
    expect(written.tags).toEqual(["reef"]);
    expect(written.weight).toBe(4);
  });

  it("treats zero as a reading, not as an absence", () => {
    // A freedive that surfaced logs `max_depth` 0, and a falsiness check would
    // overwrite it from the second file.
    const { form, written } = formHoldingValues({ max_depth: 0 });

    applyParsedDiveToForm(
      form,
      parsedDive([], { max_depth: 19.1 }),
      () => {},
      "fill-only",
    );

    expect(written).not.toHaveProperty("max_depth");
  });

  it("fills a blank cylinder member without touching the ones that are filled", () => {
    // The case the whole rule was designed around, on the form: the Suunto
    // app's JSON gives cylinder 0 its pressures and no oxygen fraction, and the
    // same computer's FIT of the same dive has the fraction. The FIT's oxygen
    // lands; the pressures stay the JSON's, because the FIT's would be a second
    // fill's figures read against the first's.
    const replaced: DiveMixtureInput[][] = [];
    const { form } = formHoldingValues({}, [
      onForm({ start_pressure: 205.11, end_pressure: 91.55, oxygen: "" }),
    ]);

    applyParsedDiveToForm(
      form,
      parsedDive([
        parsed({ oxygen: 33, start_pressure: 210, end_pressure: 80 }),
      ]),
      (mixtures) => replaced.push(mixtures),
      "fill-only",
    );

    expect(replaced).toHaveLength(1);
    expect(replaced[0][0].oxygen).toBe(33);
    expect(replaced[0][0].start_pressure).toBe(205.11);
    expect(replaced[0][0].end_pressure).toBe(91.55);
  });

  it("will not reshape a cylinder list it cannot line up", () => {
    // A file describing a different number of cylinders cannot be lined up
    // with the form's rows by position, and the API pairs it at the attach.
    // Carrying a stage bottle's readings onto a back gas is worse than leaving
    // a blank.
    const replaced: DiveMixtureInput[][] = [];
    const { form } = formHoldingValues({}, [onForm({ oxygen: 32 })]);

    applyParsedDiveToForm(
      form,
      parsedDive([parsed({ oxygen: 33 }), parsed({ oxygen: 50 })]),
      (mixtures) => replaced.push(mixtures),
      "fill-only",
    );

    expect(replaced).toHaveLength(0);
  });

  it("takes the file's cylinders whole onto a form that has none", () => {
    // Filling by definition: there is nothing to overwrite. The create form
    // starts here, and so does an edit form for a dive logged without gas.
    const replaced: DiveMixtureInput[][] = [];
    const { form } = formHoldingValues({}, []);

    applyParsedDiveToForm(
      form,
      parsedDive([parsed({ oxygen: 33 })]),
      (mixtures) => replaced.push(mixtures),
      "fill-only",
    );

    expect(replaced[0]).toHaveLength(1);
    expect(replaced[0][0].oxygen).toBe(33);
  });

  it("raises no guessed-value notes, having guessed nothing", () => {
    // Those sentences exist to flag a value the import invented and the diver
    // should check. A fill that writes only into blanks has invented nothing,
    // and a note here would send them to check a field nothing touched.
    const { form } = formHoldingValues({}, [onForm({ volume: 12 })]);

    const notes = applyParsedDiveToForm(
      form,
      parsedDive([parsed({ oxygen: 33 })]),
      () => {},
      "fill-only",
    );

    expect(notes.guessed).toEqual({});
    expect(describeMixtureImport(notes)).toBeNull();
  });
});

// A form row recording only what the overrides say - `onForm` starts from
// `DEFAULT_MIXTURE`'s air, which would be a recorded mix in every case below.
function blankRow(overrides: Partial<DiveMixtureInput> = {}): DiveMixtureInput {
  return {
    volume: "",
    start_pressure: "",
    end_pressure: "",
    oxygen: "",
    helium: "",
    po2_limit: "",
    role: "",
    usage: "",
    ...overrides,
  };
}

// Applies a later file's cylinders onto a form holding `rows`, and returns the
// list the form was given, or `undefined` where it was left alone.
function fillOnto(rows: DiveMixtureInput[], cylinders: ParsedDiveMixture[]) {
  const replaced: DiveMixtureInput[][] = [];
  const { form } = formHoldingValues({}, rows);
  applyParsedDiveToForm(
    form,
    parsedDive(cylinders),
    (mixtures) => replaced.push(mixtures),
    "fill-only",
  );
  return replaced[0];
}

describe("a later file's cylinders on a form that has some", () => {
  it("fills no cylinder from a file listing the form's in another order", () => {
    expect(
      fillOnto(
        [
          blankRow({ oxygen: 21, helium: 0 }),
          blankRow({ oxygen: 50, helium: 0 }),
        ],
        [
          parsed({ oxygen: 50, helium: 0, start_pressure: 200 }),
          parsed({ oxygen: 21, helium: 0, start_pressure: 210 }),
        ],
      ),
    ).toBeUndefined();
  });

  it("fills none where a cylinder's mix is another row's", () => {
    // The API pairs the file's 21 % with the form's second row by mix, and the
    // file's other cylinder with the first row by position - not the pairs a
    // positional fill would make.
    expect(
      fillOnto(
        [blankRow(), blankRow({ oxygen: 21, helium: 0 })],
        [
          parsed({ oxygen: 21, helium: 0, volume: 12 }),
          parsed({ start_pressure: 200, end_pressure: 60 }),
        ],
      ),
    ).toBeUndefined();
  });

  it("fills none where a position pair records two different fractions", () => {
    expect(
      fillOnto([blankRow({ oxygen: 32 })], [parsed({ oxygen: 33 })]),
    ).toBeUndefined();
  });

  it("fills none from pressures with no mix over rows of 21 % and 50 %", () => {
    // Which tank drained to 60 bar is a guess the file's mixes would settle.
    expect(
      fillOnto(
        [
          blankRow({ oxygen: 21, helium: 0 }),
          blankRow({ oxygen: 50, helium: 0 }),
        ],
        [
          parsed({ start_pressure: 200, end_pressure: 60 }),
          parsed({ start_pressure: 210, end_pressure: 150 }),
        ],
      ),
    ).toBeUndefined();
  });

  it("fills none from a second computer's mixes over rows carrying pressures and no mix", () => {
    expect(
      fillOnto(
        [
          blankRow({ start_pressure: 200, end_pressure: 60 }),
          blankRow({ start_pressure: 210, end_pressure: 150 }),
        ],
        [parsed({ oxygen: 21, helium: 0 }), parsed({ oxygen: 50, helium: 0 })],
      ),
    ).toBeUndefined();
  });

  it("fills a row that records nothing, and leaves the one that records a mix", () => {
    const rows = [blankRow({ oxygen: 21, helium: 0 }), blankRow()];
    const filled = fillOnto(rows, [
      parsed({ start_pressure: 200, end_pressure: 60 }),
      parsed({ start_pressure: 210, end_pressure: 150 }),
    ]);

    expect(filled?.[0]).toEqual(rows[0]);
    expect(filled?.[1].start_pressure).toBe(210);
    expect(filled?.[1].end_pressure).toBe(150);
  });

  it("fills every row a cylinder pairs with by mix", () => {
    const filled = fillOnto(
      [
        blankRow({ oxygen: 21, helium: 0 }),
        blankRow({ oxygen: 50, helium: 0 }),
      ],
      [
        parsed({ oxygen: 21, helium: 0, start_pressure: 200 }),
        parsed({ oxygen: 50, helium: 0, start_pressure: 210 }),
      ],
    );

    expect(filled?.map((row) => row.start_pressure)).toEqual([200, 210]);
  });

  it("fills the one-cylinder pair's row whichever file came first", () => {
    // The Suunto Ocean's JSON carries the pressures and no mix, its FIT the mix
    // and no pressures. One row meeting one cylinder is a pair no later file can
    // re-pair, so it fills even though each side records what the other lacks.
    const fitThenJson = fillOnto(
      [blankRow({ oxygen: 21, helium: 0 })],
      [parsed({ start_pressure: 212.81, end_pressure: 83.59, gas_number: 0 })],
    );
    const jsonThenFit = fillOnto(
      [blankRow({ start_pressure: 212.81, end_pressure: 83.59 })],
      [parsed({ oxygen: 21, helium: 0 })],
    );

    for (const filled of [fitThenJson, jsonThenFit]) {
      expect(filled?.[0]).toMatchObject({
        oxygen: 21,
        helium: 0,
        start_pressure: 212.81,
        end_pressure: 83.59,
      });
    }
  });

  it("writes no label, leaving the one a row has", () => {
    const filled = fillOnto(
      [blankRow(), blankRow({ gas_number: 1 })],
      [
        parsed({ start_pressure: 200, gas_number: 0 }),
        parsed({ start_pressure: 210, gas_number: 3 }),
      ],
    );

    expect(filled?.[0].start_pressure).toBe(200);
    expect(filled?.[0].gas_number).toBeUndefined();
    expect(filled?.[1].gas_number).toBe(1);
  });

  it("writes no label onto a form that had no cylinders", () => {
    const filled = fillOnto([], [parsed({ oxygen: 21, gas_number: 0 })]);

    expect(filled?.[0].oxygen).toBe(21);
    expect(filled?.[0].gas_number).toBeUndefined();
  });
});

describe("a later file's fill that would re-pair the rows it fills", () => {
  it("fills none where a mix it writes makes a row another cylinder's match", () => {
    // Two air tanks. The form's second row records nothing, so it could take
    // the file's second cylinder's 21 %; but then the API, pairing the saved
    // rows by mix, gives it the file's first cylinder and that tank's
    // pressures, beside the first row's own.
    expect(
      fillOnto(
        [blankRow({ start_pressure: 200, end_pressure: 50 }), blankRow()],
        [
          parsed({ oxygen: 21, start_pressure: 198, end_pressure: 52 }),
          parsed({ oxygen: 21 }),
        ],
      ),
    ).toBeUndefined();
  });
});

describe("a later file's cylinders sharing one mix", () => {
  it("fills two blank rows from two air cylinders, which the API pairs in order", () => {
    const filled = fillOnto(
      [blankRow(), blankRow()],
      [
        parsed({ oxygen: 21, helium: 0, start_pressure: 200 }),
        parsed({ oxygen: 21, helium: 0, start_pressure: 190 }),
      ],
    );

    expect(filled?.map((row) => [row.oxygen, row.start_pressure])).toEqual([
      [21, 200],
      [21, 190],
    ]);
  });

  it("fills none where the API would give a shared mix's first row to a later cylinder", () => {
    // The first cylinder records no mix, so the API gives the second the first
    // row recording 21 % - the form's first, not its second.
    expect(
      fillOnto(
        [
          blankRow({ oxygen: 21, helium: 0 }),
          blankRow({ oxygen: 21, helium: 0 }),
        ],
        [parsed({ start_pressure: 200 }), parsed({ oxygen: 21, helium: 0 })],
      ),
    ).toBeUndefined();
  });
});

describe("applyParsedDiveToForm with a figure an earlier file derived", () => {
  // One Suunto Ocean dive's two exports, as the API reads them. The FIT states
  // neither figure, so the reader derives both; the JSON states both. Their
  // devices are as each file names the watch, and are one computer.
  const oceanFit = () =>
    parsedDive([], {
      duration: 3440,
      avg_depth: 10.58,
      max_depth: 19.1,
      inferred: ["duration", "avg_depth"],
      device: { brand: "suunto", model: "Suunto Ocean" },
    });
  const oceanJson = () =>
    parsedDive([], {
      duration: 3424,
      avg_depth: 10.62,
      max_depth: 19.04,
      inferred: [],
      device: { brand: "Suunto", serial: "253810000400" },
    });
  const perdixUddf = () =>
    parsedDive([], {
      duration: 3380,
      avg_depth: 10.4,
      max_depth: 18.9,
      inferred: [],
      device: { brand: "Shearwater", model: "Perdix 3", serial: "D9772626" },
    });

  // Applies each file as the form does within one session: the first prefills,
  // every later one fills, all against the one session's marks.
  function applyInTurn(
    values: Record<string, unknown>,
    ...files: (ReturnType<typeof parsedDive> | ((v: typeof values) => void))[]
  ) {
    const { form } = formHoldingValues(values);
    const marks: InferredFigures = {};
    let first = true;
    for (const file of files) {
      if (typeof file === "function") {
        file(values);
        continue;
      }
      applyParsedDiveToForm(
        form,
        file,
        () => {},
        first ? "prefill" : "fill-only",
        marks,
      );
      first = false;
    }
    return values;
  }

  it("takes the JSON's figures when the FIT came first", () => {
    const values = applyInTurn({}, oceanFit(), oceanJson());

    expect(values.duration).toBe("57:04");
    expect(values.avg_depth).toBe(10.62);
    // The FIT stated its maximum, so the JSON only fills.
    expect(values.max_depth).toBe(19.1);
  });

  it("keeps the JSON's figures when the FIT comes second", () => {
    const values = applyInTurn({}, oceanJson(), oceanFit());

    expect(values.duration).toBe("57:04");
    expect(values.avg_depth).toBe(10.62);
  });

  it("keeps a duration the diver typed between the two", () => {
    const values = applyInTurn(
      {},
      oceanFit(),
      (v) => {
        v.duration = "57:00";
      },
      oceanJson(),
    );

    expect(values.duration).toBe("57:00");
    expect(values.avg_depth).toBe(10.62);
  });

  it("keeps the first of two FITs, neither stating its figures", () => {
    const second = { ...oceanFit(), duration: 3500, avg_depth: 10.1 };
    const values = applyInTurn({}, oceanFit(), second);

    expect(values.duration).toBe("57:20");
    expect(values.avg_depth).toBe(10.58);
  });

  it("keeps the Ocean's derived figures against another computer's stated ones", () => {
    const values = applyInTurn({}, oceanFit(), perdixUddf());

    expect(values.duration).toBe("57:20");
    expect(values.avg_depth).toBe(10.58);
  });

  it("replaces a derived figure only once", () => {
    // The JSON's figure is stated, so a third file of the computer only fills.
    const values = applyInTurn({}, oceanFit(), oceanJson(), {
      ...oceanJson(),
      duration: 3400,
    });

    expect(values.duration).toBe("57:04");
  });

  it("fills only, as before, from an API build that marks nothing", () => {
    const { inferred: _fit, ...fit } = oceanFit();
    const { inferred: _json, ...json } = oceanJson();
    const values = applyInTurn({}, fit, json);

    expect(values.duration).toBe("57:20");
    expect(values.avg_depth).toBe(10.58);
  });
});
