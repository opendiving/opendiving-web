// Turning a parsed dive-computer export into dive-form values, and saying what
// had to be guessed on the way.
//
// Split out of `components/dives/dive-file-import.tsx`, which was doing four
// separable things at 411 lines: this mapping, the note derivation, the note
// prose, and the React component. Living here also puts it inside the
// `src/lib/**` coverage window, which is where the logic worth unit-testing is
// supposed to live - and this is the densest logic in the import path.

import { DEFAULT_MIXTURE, getDefaultMixtureName } from "@/lib/dive-mixtures";
import type { ParsedDiveMixture } from "@/lib/api/dives";
import type { DiveMixtureInput } from "@/lib/validations/dive";

// A mixture field the form has to hold a number for, which an export may not
// have recorded. `start_pressure`/`end_pressure` are absent on purpose: those
// stay "" when unknown, so they are never guessed at.
export type DefaultedMixtureField = "volume" | "oxygen" | "helium";

/** Where the number now sitting in a mixture field actually came from. */
export type MixtureValueSource = "file" | "form" | "default";

/**
 * What filling the form in from a file had to guess, so the import box can say
 * so. The API deliberately sends `null` rather than a plausible number for
 * anything an export didn't record (see `DiveMixtureSchema`); if the form
 * silently turns that back into a number, that care is thrown away at the last
 * step and the diver cannot tell a reading from a placeholder.
 */
export interface MixtureImportNotes {
  /**
   * Fields the file didn't record on at least one cylinder, and where the value
   * the diver is now looking at came from - `"form"` when whatever was already
   * there was kept, `"default"` when nothing was and `DEFAULT_MIXTURE` supplied
   * it. (`"file"` never appears: a field the file recorded isn't guessed.)
   *
   * The distinction is the whole message. Importing onto a form prefilled from
   * the previous dive keeps that dive's gases, so the fields are *untouched* -
   * and saying they were "filled in as a starting point" describes something
   * that didn't happen. Note this is not the unanswerable "did the diver type
   * this or did the form seed it": it is which branch of the merge ran, which
   * `mergeMixture` knows exactly.
   *
   * Keyed off the file alone, and not off "no source had a value": both dive
   * forms seed `mixtures` with a complete `DEFAULT_MIXTURE` cylinder before any
   * import happens, so a rule that also consulted the carried-over cylinder was
   * always empty on the ordinary one-cylinder import and the warning never
   * appeared at all.
   */
  guessed: Partial<Record<DefaultedMixtureField, MixtureValueSource>>;
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

/** One cylinder merged onto the form, and where each guessable field came from. */
export interface MergedMixture {
  value: DiveMixtureInput;
  sources: Record<DefaultedMixtureField, MixtureValueSource>;
}

/**
 * Converts a parsed mixture (nullable fields, no `id`) into the shape the
 * mixture form fields expect.
 *
 * Three sources, in order: what the file recorded, then whatever the form
 * already held for the cylinder in this position, then `DEFAULT_MIXTURE`.
 *
 * The middle one matters because the two Suunto Ocean exports are
 * complementary - its FIT carries the gas mixes and no transmitter data, its
 * JSON the pressures and no gas mix - so importing both for one dive is the
 * documented way to log a multi-gas dive (see the API's DECISIONS.md). Without
 * it the second import silently erased whatever the first one contributed, and
 * a dive that had a `gas_use` before quietly stopped having one after.
 *
 * `name` falls back to `getDefaultMixtureName(index)` for the same reason the
 * numeric fields fall back to `DEFAULT_MIXTURE`: an imported cylinder should
 * arrive as a hand-added one does, and multi-gas imports are routine enough
 * that leaving them anonymous is a chore the diver repeats every dive.
 */
export function mergeMixture(
  mixture: ParsedDiveMixture,
  index: number,
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
    mixtureField: DefaultedMixtureField,
  ): { value: number; source: MixtureValueSource } => {
    const fromFile = mixture[mixtureField];
    if (fromFile != null) return { value: fromFile, source: "file" };
    const fromForm = existing?.[mixtureField];
    if (fromForm != null) return { value: fromForm, source: "form" };
    return { value: DEFAULT_MIXTURE[mixtureField], source: "default" };
  };

  const volume = pick("volume");
  const oxygen = pick("oxygen");
  const helium = pick("helium");

  return {
    value: {
      name: mixture.name ?? existing?.name ?? getDefaultMixtureName(index),
      volume: volume.value,
      start_pressure:
        mixture.start_pressure ?? carriedPressures?.start_pressure ?? "",
      end_pressure:
        mixture.end_pressure ?? carriedPressures?.end_pressure ?? "",
      oxygen: oxygen.value,
      helium: helium.value,
      // File, then form, then nothing - these three deliberately have no default
      // tier, so they are absent from `DefaultedMixtureField` and never appear in
      // the import note. There is nothing to warn about: a missing ppO₂ limit falls
      // back to `PPO2_WORKING` at the point a MOD is computed, and a missing role or
      // gas number simply isn't displayed. Compare `volume`, where the form showing
      // 11.1 L for a cylinder the file never described is a claim worth flagging.
      po2_limit: mixture.po2_limit ?? existing?.po2_limit ?? "",
      gas_number: mixture.gas_number ?? existing?.gas_number,
      // `""` rather than `undefined` for the same reason as `po2_limit` above: it
      // is the cleared state the `<select>` and `normalizeMixtures` agree on, so
      // the row this replaces reads the same whether it came from a file or a form.
      role: mixture.role ?? existing?.role ?? "",
    },
    sources: {
      volume: volume.source,
      oxygen: oxygen.source,
      helium: helium.source,
    },
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
  const fields: DefaultedMixtureField[] = ["volume", "oxygen", "helium"];
  const guessed: Partial<Record<DefaultedMixtureField, MixtureValueSource>> =
    {};
  for (const mixtureField of fields) {
    const supplied = merged
      .map((cylinder) => cylinder.sources[mixtureField])
      .filter((source) => source !== "file");
    if (supplied.length === 0) continue;
    // A default anywhere is the more urgent of the two: something is on screen
    // that no dive ever recorded, rather than a value the diver has seen before.
    guessed[mixtureField] = supplied.includes("default") ? "default" : "form";
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

const FIELD_LABELS: Record<DefaultedMixtureField, string> = {
  volume: "cylinder size",
  oxygen: "gas mix",
  helium: "helium fraction",
};

/**
 * One or two sentences naming what the import could not fill in from the file, or `null`
 * when it filled in everything.
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
    ["volume", "oxygen", "helium"] as DefaultedMixtureField[]
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
    // A default anywhere among them wins the wording: something is on screen that no
    // dive ever recorded, which is the more urgent of the two to say.
    // Over `fields`, not `named`: helium is folded into the "gas mix" label when oxygen
    // was guessed too, so judging provenance over the named ones alone let a defaulted
    // helium hide behind a form-sourced oxygen - the note said "already on this form"
    // while the He box showed a `DEFAULT_MIXTURE` 0 the diver had deliberately cleared.
    // The label speaks for helium, so its provenance has to count.
    const defaulted = fields.some(
      (mixtureField) => notes.guessed[mixtureField] === "default",
    );
    const provenance = defaulted
      ? `${one ? "That is a" : "Those are"} default${one ? "" : "s"}`
      : `${one ? "That value was" : "Those values were"} already on this form`;
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
