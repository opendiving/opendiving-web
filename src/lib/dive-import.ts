// Turning a parsed dive-computer export into dive-form values, and saying what
// had to be guessed on the way.
//
// Split out of `components/dives/dive-file-import.tsx`, which was doing four
// separable things at 411 lines: this mapping, the note derivation, the note
// prose, and the React component. Living here also puts it inside the
// `src/lib/**` coverage window, which is where the logic worth unit-testing is
// supposed to live - and this is the densest logic in the import path.

import type { ParsedDiveMixture } from "@/lib/api/dives";
import type { DiveMixtureInput } from "@/lib/validations/dive";

// A mixture field an export may not have recorded, and that the form can therefore
// only fill from the cylinder it already held. `start_pressure`/`end_pressure` are
// absent on purpose: those have always stayed `""` when unknown, and these three now
// join them - what makes the three a set is that a value carried over from the last
// dive is a claim worth reporting, which a pressure never was because it was never
// carried across a gap the file left.
//
// It was `DefaultedMixtureField` while `DEFAULT_MIXTURE` was the third tier. Nothing
// on this path defaults any more, so the name would have outlived the behaviour.
export type CarriedMixtureField = "volume" | "oxygen" | "helium";

/**
 * Where the value now sitting in a mixture field actually came from.
 *
 * `"blank"` is the third answer since the import path stopped defaulting: the file
 * recorded nothing, the form held nothing, and the box is empty - which is what the
 * API stores and what the dive page then shows as an absence. It is deliberately not
 * reported in the note below; an empty box is its own notice, and the note exists for
 * numbers on screen that no dive recorded.
 */
export type MixtureValueSource = "file" | "form" | "blank";

/**
 * What filling the form in from a file left standing that the file did not say, so
 * the import box can say so. The API deliberately sends `null` rather than a
 * plausible number for anything an export didn't record (see `DiveMixtureSchema`);
 * if the form silently turns that back into a number, that care is thrown away at
 * the last step and the diver cannot tell a reading from a placeholder.
 *
 * The form no longer turns it into a number *of its own* - `mergeMixture` leaves a
 * gap the file and the form both fail to fill as a blank box, and the API stores
 * NULL for it. What survives is the case this note was always sharper about: a value
 * carried over from the cylinder already on the form, which is a real number on
 * screen that this file never recorded.
 */
export interface MixtureImportNotes {
  /**
   * Fields the file didn't record on at least one cylinder, where the value the
   * diver is now looking at came from the cylinder already on the form. Only
   * `"form"` ever appears: `"file"` is not a gap, and `"blank"` leaves an empty box
   * that says so itself.
   *
   * Reporting the carry-over is the whole message. Importing onto a form prefilled
   * from the previous dive keeps that dive's gases, so the fields are *untouched* -
   * and saying they were "filled in as a starting point" describes something that
   * didn't happen. Note this is not the unanswerable "did the diver type this or did
   * the form seed it": it is which branch of the merge ran, which `mergeMixture`
   * knows exactly.
   *
   * Keyed off the file alone, and not off "no source had a value". Both forms once
   * seeded a complete `DEFAULT_MIXTURE` cylinder before any import, so a rule that
   * also consulted the carried-over cylinder was always empty and the warning was
   * unreachable. Neither seeds one now - the create form starts empty, and the edit
   * form holds whatever the dive records - but the rule stays keyed off the file,
   * because a form the prefill filled in, an earlier import wrote to, or a dive with
   * cylinders usually has all three values, and those are the imports the warning
   * exists for. *Usually* rather than *still*, since the columns became nullable: a
   * dive imported from a file that recorded no cylinder size holds a blank, and
   * `pick` reads that as the gap it is rather than as something to carry over.
   */
  guessed: Partial<Record<CarriedMixtureField, MixtureValueSource>>;
  /**
   * Whether tank pressures already on the form were carried onto the new cylinders
   * because the file had none of its own.
   */
  keptPressures: boolean;
  /**
   * Whether pressures that were on the form have been *lost* - the file brought a
   * different number of cylinders, so `existingMixtureFor` refused to pair and there was
   * nowhere to carry them. Worth saying out loud: on the edit form that silently takes a
   * dive's `gas_use` away with it.
   */
  discardedPressures: boolean;
}

/** One cylinder merged onto the form, and where each carryable field came from. */
export interface MergedMixture {
  value: DiveMixtureInput;
  sources: Record<CarriedMixtureField, MixtureValueSource>;
}

/**
 * Converts a parsed mixture (nullable fields, no `id`) into the shape the
 * mixture form fields expect.
 *
 * Two sources, in order: what the file recorded, then whatever the form already held
 * for the cylinder in this position. A field neither of them has is left blank.
 *
 * The second one matters because the two Suunto Ocean exports are complementary - its
 * FIT carries the gas mixes and no transmitter data, its JSON the pressures and no gas
 * mix - so importing both for one dive is the documented way to log a multi-gas dive
 * (see the API's DECISIONS.md). Without it the second import silently erased whatever
 * the first one contributed, and a dive that had a `gas_use` before quietly stopped
 * having one after.
 *
 * **There is no third tier any more, and its absence is the point.** `DEFAULT_MIXTURE`
 * used to fill the rest, which meant every FIT import claimed an 11.1 L cylinder of air
 * - one cylinder, an average depth and both pressures being exactly what
 * `compute_gas_use` needs, so a diver on a 15 L was handed an RMV about 26 % low and
 * told nothing but a sentence 2 200 px up the page. The column is nullable now, so
 * blank survives the save: absence is data, and a file that recorded no vessel says so
 * all the way to the dive page. A cylinder added by hand still starts from
 * `DEFAULT_MIXTURE`, where the numbers are in front of the diver and can be changed -
 * that convenience was never the problem, and typing 21 and 0 for every air dive would
 * be.
 */
export function mergeMixture(
  mixture: ParsedDiveMixture,
  existing?: DiveMixtureInput,
): MergedMixture {
  // The pressures move as a pair. Falling back field-by-field would let a start
  // from the file meet an end from whatever was on the form - a fill that never
  // existed, which either trips `diveMixtureSchema`'s `end <= start` refine on a
  // field the diver never touched, or passes and feeds `compute_gas_use` a
  // consumption figure spanning two different fills.
  const carriedPressures =
    mixture.start_pressure == null && mixture.end_pressure == null
      ? existing
      : undefined;

  // Reported rather than reconstructed afterwards: this is the only place that
  // knows which of the three sources supplied a field, and every attempt to work
  // it out from the outside has been wrong in a different way.
  const pick = (
    mixtureField: CarriedMixtureField,
  ): { value: number | ""; source: MixtureValueSource } => {
    const fromFile = mixture[mixtureField];
    if (fromFile != null) return { value: fromFile, source: "file" };
    // `""` and not just null-ish: the form's cleared state is a real value on this
    // field, so a form row that is genuinely blank must not read as one that holds
    // something. Carrying a `""` over as if it were a number is how a note would come
    // to say "that value was already on this form" about an empty box.
    const fromForm = existing?.[mixtureField];
    if (typeof fromForm === "number")
      return { value: fromForm, source: "form" };
    return { value: "", source: "blank" };
  };

  const volume = pick("volume");
  const oxygen = pick("oxygen");
  const helium = pick("helium");

  return {
    value: {
      volume: volume.value,
      start_pressure:
        mixture.start_pressure ?? carriedPressures?.start_pressure ?? "",
      end_pressure:
        mixture.end_pressure ?? carriedPressures?.end_pressure ?? "",
      oxygen: oxygen.value,
      helium: helium.value,
      // File, then form, then nothing - the same two tiers `pick` applies above,
      // and these three are deliberately absent from `CarriedMixtureField`, so a
      // carry-over here is never reported. There is nothing to warn about: a
      // missing ppO₂ limit falls back to `PPO2_WORKING` at the point a MOD is
      // computed, and a missing role or gas number simply isn't displayed. Compare
      // `volume`, where a hand-added cylinder's 11.1 L carried onto a cylinder the
      // file never described is a claim worth flagging - the tiers are the same, and
      // what separates the two sets is whether the value carried says something the
      // diver could mistake for a reading.
      po2_limit: mixture.po2_limit ?? existing?.po2_limit ?? "",
      gas_number: mixture.gas_number ?? existing?.gas_number,
      // `""` rather than `undefined` for the same reason as `po2_limit` above: it
      // is the cleared state the `<select>` and `normalizeMixtures` agree on, so
      // the row this replaces reads the same whether it came from a file or a form.
      role: mixture.role ?? existing?.role ?? "",
      // Form, then nothing - there is no file tier at all, because no format this
      // app parses carries the flag and `ParsedDiveMixture` therefore has no
      // `usage` to read. Listed anyway rather than left out: this object is
      // constructed field by field, so a field missing from it is silently
      // *dropped* rather than preserved, which is the exact failure the note above
      // records. A diver who flagged a pair Parallel and then imported the dive's
      // computer file would have watched both flags disappear.
      usage: existing?.usage ?? "",
    },
    sources: {
      volume: volume.source,
      oxygen: oxygen.source,
      helium: helium.source,
    },
  };
}

/**
 * One cylinder under the fill-only rule: everything the form already holds
 * stays, and the file supplies only what is blank.
 *
 * The mirror image of `mergeMixture` above, which is file-first because it is
 * the *first* file of a recording and that file is the best thing the form has.
 * A second file of the same recording is not — the diver has seen the form by
 * then, and may have corrected it — so precedence flips. The Suunto app's JSON
 * and the same computer's FIT of one dive are the case this exists for: the FIT
 * lands its oxygen fraction on the cylinder the JSON left blank, and touches
 * nothing else.
 *
 * The pressures still move as a pair, for `mergeMixture`'s reason: a start from
 * the file meeting an end from the form is a fill that never existed, and it
 * either trips `diveMixtureSchema`'s `end <= start` refine or feeds a
 * consumption figure spanning two different fills. Here that means the file's
 * pair is taken only when the form carries **neither** side.
 *
 * No `MixtureImportNotes` come back, and the absence is deliberate: those
 * sentences exist to flag a value the import *guessed* and the diver should
 * check, and a fill that writes only into blanks has guessed nothing.
 */
export function fillMixture(
  mixture: ParsedDiveMixture,
  existing: DiveMixtureInput,
): DiveMixtureInput {
  // `""` is the form's cleared state and a real value on these fields, so
  // "blank" has to mean both it and `undefined` - a `typeof` check rather than
  // `??`, which would read `""` as present and fill nothing.
  const keep = <TValue>(
    current: TValue | "" | undefined,
    fromFile: number | null | undefined,
  ): TValue | number | "" =>
    typeof current === "number" ||
    (typeof current === "string" && current !== "")
      ? (current as TValue)
      : (fromFile ?? "");

  const formHasPressures = hasPressure(existing);

  return {
    ...existing,
    volume: keep(existing.volume, mixture.volume),
    oxygen: keep(existing.oxygen, mixture.oxygen),
    helium: keep(existing.helium, mixture.helium),
    start_pressure: formHasPressures
      ? existing.start_pressure
      : (mixture.start_pressure ?? ""),
    end_pressure: formHasPressures
      ? existing.end_pressure
      : (mixture.end_pressure ?? ""),
    po2_limit: keep(existing.po2_limit, mixture.po2_limit),
    gas_number:
      typeof existing.gas_number === "number"
        ? existing.gas_number
        : (mixture.gas_number ?? undefined),
    role: existing.role ? existing.role : (mixture.role ?? ""),
  };
}

/**
 * Pairs incoming cylinders with the ones already on the form, but only when the
 * counts match exactly - the same conservative rule the API uses to pair tank
 * telemetry to gases. Position is the only signal available, and carrying a
 * stage bottle's pressures onto a back gas would produce a confidently wrong
 * SAC/RMV, which is worse than an empty field the diver fills in.
 */
export function existingMixtureFor(
  existing: DiveMixtureInput[],
  parsedCount: number,
  index: number,
): DiveMixtureInput | undefined {
  return existing.length === parsedCount ? existing[index] : undefined;
}

function hasPressure(cylinder: DiveMixtureInput): boolean {
  return (
    typeof cylinder.start_pressure === "number" ||
    typeof cylinder.end_pressure === "number"
  );
}

/** What the file left for the form to supply, per field. */
export function mixtureImportNotes(
  parsed: ParsedDiveMixture[],
  merged: MergedMixture[],
  existing: DiveMixtureInput[],
): MixtureImportNotes {
  const fields: CarriedMixtureField[] = ["volume", "oxygen", "helium"];
  const guessed: Partial<Record<CarriedMixtureField, MixtureValueSource>> = {};
  for (const mixtureField of fields) {
    // `"form"` only. A `"blank"` field is a gap the file left and nothing filled,
    // which the empty box in front of the diver states more plainly than a sentence
    // 2 200 px above it could - and which the dive page will go on stating as an
    // absence rather than as an invented number. What still needs saying is a figure
    // that came from the last dive and could be mistaken for this one's.
    if (merged.some((cylinder) => cylinder.sources[mixtureField] === "form")) {
      guessed[mixtureField] = "form";
    }
  }

  return {
    guessed,
    keptPressures: parsed.some((mixture, index) => {
      const cylinder = merged[index].value;
      return (
        mixture.start_pressure == null &&
        mixture.end_pressure == null &&
        (cylinder.start_pressure !== "" || cylinder.end_pressure !== "")
      );
    }),
    // Three conditions, and the third is the one that keeps it honest. The counts
    // differing is what makes `existingMixtureFor` refuse to pair, and the form having
    // had pressures is what makes that a loss - but if the file brought pressures of its
    // own, nothing was lost and saying so sends the diver looking for data that is
    // sitting right there.
    discardedPressures:
      existing.length !== parsed.length &&
      existing.some(hasPressure) &&
      merged.every((cylinder) => !hasPressure(cylinder.value)),
  };
}

const FIELD_LABELS: Record<CarriedMixtureField, string> = {
  volume: "cylinder size",
  oxygen: "gas mix",
  helium: "helium fraction",
};

/**
 * One or two sentences naming what the file did not record and the form supplied from
 * the cylinder it already held, or `null` when there is nothing of the sort to say.
 *
 * **A statement about the file, not about the form.** "This export doesn't record
 * cylinder size" is true when the note appears and stays true; nothing the diver types
 * afterwards bears on it. Two earlier rounds pulled the other way - quote the live value
 * so the figure in the field is recognisable, then track provenance so a corrected field
 * stops being called a default - and both were right *given* a note that talks about
 * form state. It shouldn't.
 *
 * The reason the whole idea collapses is layout: this sits in the import card and the gas
 * fields are ~2 200 px below it, so the two are never on screen together. A quoted number
 * cannot be compared with the one in the box, and a sentence that rewrites itself while
 * the diver edits a field two viewports away is a change nobody sees. Which left only the
 * cost - a snapshot of the imported cylinders, a `form.watch` subscription, an
 * `addressed` check, and a live region re-announcing itself per keystroke.
 *
 * So: no numbers, no tracking, computed once. If pointing at the specific value ever
 * matters, the place for it is a hint on the field itself, where the two *are* visible
 * together - not a sentence 2 200 px away trying to describe it.
 */
export function describeMixtureImport(
  notes: MixtureImportNotes,
): string | null {
  const fields = (
    ["volume", "oxygen", "helium"] as CarriedMixtureField[]
  ).filter((mixtureField) => notes.guessed[mixtureField] !== undefined);
  // Helium rides along with oxygen: a file that recorded neither has no gas mix at all,
  // and "0% helium" adds nothing to that. On its own it is named, since "gas mix" would
  // then be describing an oxygen the file *did* record.
  const named = fields.filter(
    (mixtureField) =>
      !(mixtureField === "helium" && notes.guessed.oxygen !== undefined),
  );

  const sentences: string[] = [];
  if (named.length > 0) {
    const labels = named.map((mixtureField) => FIELD_LABELS[mixtureField]);
    const one = named.length === 1;
    // One provenance, because there is one left. `notes.guessed` records `"form"` and
    // nothing else now that the merge has no default tier: a field neither source had
    // is blank, and an empty box is not a claim to warn about. The earlier version
    // chose between this sentence and "Those are defaults" - and had to judge that
    // over `fields` rather than `named`, so a defaulted helium could not hide behind a
    // form-sourced oxygen under the shared "gas mix" label. Nothing hides now; there
    // is one thing to say.
    const provenance = one
      ? "That value was already on this form"
      : "Those values were already on this form";
    sentences.push(
      `This file doesn't record ${labels.join(" or ")}. ${provenance}, not read from the file — check the gas mixtures below before saving.`,
    );
  }
  if (notes.keptPressures) {
    sentences.push("Tank pressures already on this dive were kept.");
  }
  if (notes.discardedPressures) {
    sentences.push(
      "The tank pressures on this dive were cleared — the file has a different number of cylinders.",
    );
  }
  return sentences.length > 0 ? sentences.join(" ") : null;
}
