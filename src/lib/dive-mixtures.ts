// The shape a mixture form field starts from, how a cylinder's role is written, and the
// breathing-gas maths that turns an O₂/He pair into something a diver recognizes - a gas
// name, a maximum operating depth, an equivalent narcotic or air depth. Pure data and
// pure functions with no React in it, and imported by `lib/dive-import.ts` - which is
// why it lives here rather than in `mixture-fields.tsx`: a `lib` module reaching into a
// `"use client"` component to pull react-hook-form, lucide-react and three shadcn
// components along with one constant is the wrong direction.
//
// `DEFAULT_MIXTURE` is re-exported from `mixture-fields.tsx` so existing call sites are
// unchanged.
//
// **Why the maths is client-side.** `services/dive_gas.py` draws the line at values
// derivable purely from stored columns; `gear_service.py` has a web twin because the
// browser holds an input the server lacks. That is this case exactly. The decisive
// input is *live form state* - the O₂ the diver is halfway through typing, which has
// not been saved and may never be - so an API round trip could not answer the
// question being asked, and a second server-side implementation would exist only to
// duplicate this one. Lift it to the API the moment a non-browser consumer needs the
// same labels (an export renderer, a mobile client, a notification job); until then
// one implementation, here.

import type { GasRole, TankUsage } from "@/lib/api/dives";
import {
  formatComparableDepth,
  formatDepth,
  type UnitSystem,
} from "@/lib/units";

// Every depth this module *computes* is metres, and every depth it *prints* goes
// through `formatDepth`, or `formatComparableDepth` where a limit is stated against a
// depth. The maths below is unit-blind on purpose - `METERS_PER_BAR`
// is a fact about water, not a display choice - so `units` reaches only the string
// builders, and only ever as the last step.

// Default values pre-filled when a new mixture (tank) is added. Start/end
// pressure are deliberately left blank ("") rather than defaulted, since
// they vary per tank/fill and shouldn't be guessed.
//
// `po2_limit` is blank for the same reason and one more: a MOD is the number this
// whole module exists to get right, and seeding 1.4 would make every hand-added
// cylinder claim a limit the diver never chose. Absent, `mod()` applies
// `PPO2_WORKING` itself - the same 1.4, but as a documented fallback rather than as
// a value pretending to be a decision. `role` carries no *value* either, for a third
// reason: it is a fact about the dive plan that only the diver knows.
//
// `role` is still spelled `""` rather than left off, because `""` is this form's word
// for cleared - `mergeMixture` and `toDiveMixtureInput` both write it, and
// `normalizeMixtures` converts it away at the edge. Omitting it here made a
// hand-added cylinder the one row where the field arrived `undefined`, which is the
// value react-hook-form treats as "show the default" (see `diveMixtureSchema`).
// `gas_number` is the genuine exception: no input writes it, so it has no cleared
// state to spell - it is a file's own identifier and a hand-added cylinder has none.
export const DEFAULT_MIXTURE = {
  volume: 11.1,
  start_pressure: "" as const,
  end_pressure: "" as const,
  oxygen: 21.0,
  helium: 0,
  po2_limit: "" as const,
  role: "" as const,
  // `""` for the same reason as `role`, and it carries no value for the same third
  // reason too: how the cylinders were breathed is a fact about the dive only the
  // diver knows, and no import can ever supply it.
  usage: "" as const,
};

// How each `GasRole` is written for a diver. Separate from the wire values, which are
// the API's vocabulary (`GasRole` in `schemas/dive_mixture.py`) - capitalized, and
// free to diverge if a role is ever better named than its enum member. Lives in this
// module, beside the maths, so the form's picker and the detail badge name a role
// identically rather than each keeping their own copy of the mapping.
//
// One word each, and the "gas" that "Bottom gas"/"Deco gas" would naturally carry is
// deliberately dropped. Both places these appear supply that word already - a badge
// beside the gas name in a column headed **Gas**, and an option under the form's
// **Role** label - so it was pure redundancy, and redundancy is expensive in that
// table: it ran to eight columns in a 667 px card and was ~52 px wider than its slot
// before this badge existed. See DECISIONS.md - the width is a real, measured trade-off,
// not a rounding error, and shortening these was the cheap half of it.
export const GAS_ROLE_LABELS: Record<GasRole, string> = {
  bottom: "Bottom",
  deco: "Deco",
  diluent: "Diluent",
  oxygen: "Oxygen",
};

// How each `TankUsage` is written for a diver, on the same terms as `GAS_ROLE_LABELS`
// above: separate from the wire vocabulary (`TankUsage` in `schemas/dive_mixture.py`),
// capitalized, and shared by the form's picker and the dive page so the two cannot
// name the same flag differently.
//
// One word each because it is a *name*, not a description: it is the word the diver
// picked in the form, quoted back to them inside `tankUsageSentences` below. The
// meaning rides alongside it there, and in the form's own longer options ("Parallel
// (sidemount / independent)") - so this map never has to carry both jobs at once.
export const TANK_USAGE_LABELS: Record<TankUsage, string> = {
  parallel: "Parallel",
  staged: "Staged",
};

// Just the flag, so a saved `DiveMixture` and a half-filled form row both satisfy the
// two predicates below - the same looseness `OxygenFractions` is built on, and the
// `""` is there for the same reason: it is how a cleared `<select>` spells itself.
interface TankUsageOnly {
  usage?: TankUsage | "" | null | undefined;
}

// Whether this is a set the API will sum: two or more cylinders, every one of them
// flagged `parallel`. Mirrors the first two guards of `compute_parallel_gas_use`, and
// exists once rather than at each of its two call sites - `diveModWarning` below and
// `gasUseUnavailableReason` in `lib/dive-gas.ts` - because a set the reason text calls
// summable and the warning treats as a switch plan would be two answers to one
// question.
//
// A mixed set is deliberately not partially honoured. The API refuses one outright
// (a partial sum understates RMV), and there is nothing weaker for the browser to say.
export function isParallelSet(mixtures: readonly TankUsageOnly[]): boolean {
  return (
    mixtures.length >= 2 &&
    mixtures.every((mixture) => mixture.usage === "parallel")
  );
}

// Whether any cylinder is explicitly flagged `staged`, which is the tell of a set the
// diver has already answered for and that the API refuses by design. `gas-use`'s nudge
// keys on exactly this and nothing wider - see `gasUseUnavailableReason`.
export function hasStagedCylinder(mixtures: readonly TankUsageOnly[]): boolean {
  return mixtures.some((mixture) => mixture.usage === "staged");
}

// What each flag *means*, as the clause trailing its name in the sentences below.
// Split from `TANK_USAGE_LABELS` rather than folded into it because the two are read
// at different moments: the label is the word the diver chose and has to match the
// form's picker exactly, the gloss is the definition a reader who has never used the
// control needs once. Worded so it holds for one cylinder or five - "at a separate
// depth" rather than "at its own depth" - since a group can be either.
const TANK_USAGE_GLOSSES: Record<TankUsage, string> = {
  parallel:
    "breathed alternately at the same depth, as a sidemount pair or independent doubles",
  staged: "breathed at a separate depth",
};

// "1 and 2", "1, 2 and 3" - the cylinder numbers as the mixtures table's `#` column
// shows them, which is the only handle a cylinder has: they have no names.
function cylinderNumberList(numbers: readonly number[]): string {
  if (numbers.length <= 2) return numbers.join(" and ");
  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

// Every tank-usage flag on the dive, as sentences to print beneath the mixtures
// table - one per distinct flag, in the order the flags first appear down the table.
// Empty when nothing is flagged, which is every imported dive: no format this app
// parses carries the distinction, so only the diver can ever set it.
//
// **Prose rather than a per-row badge, and the width is why.** A third badge in the
// Gas cell pushed the MOD column 73 px off screen at the 1024 px pinch - measured, not
// projected - and this table's width is already a settled trade-off in this repo. The
// invariant the prose has to keep is the one the badge kept for free: every flag a
// diver recorded is visible on the dive page without opening the edit form, *and* a
// reader can tell which cylinder each one belongs to. Naming the numbers is what buys
// the second half back, so a mixed set - a parallel pair plus a staged bottle, the set
// the per-row control exists to keep expressible - still reads correctly. See
// DECISIONS.md for the measurements and the decision.
//
// Grouped rather than one sentence per row: a sidemount pair is one fact about two
// cylinders, and "Cylinder 1 is flagged Parallel. Cylinder 2 is flagged Parallel." says
// it twice while reading like two unrelated cylinders.
export function tankUsageSentences(
  mixtures: readonly TankUsageOnly[],
): string[] {
  const groups = new Map<TankUsage, number[]>();
  mixtures.forEach((mixture, index) => {
    // `""` is how a cleared `<select>` spells itself, and null is how the API sends
    // an unflagged row - neither is a flag to state.
    if (!mixture.usage) return;
    const numbered = groups.get(mixture.usage);
    if (numbered) numbered.push(index + 1);
    else groups.set(mixture.usage, [index + 1]);
  });

  return [...groups].map(([usage, numbers]) => {
    // Same hand-kept-mirror fallback the role and usage badges carried: a value added
    // to the API's `TankUsage` before these two maps catch up still names itself and
    // still says which cylinder it is on. Losing it would leave a flag the diver
    // recorded visible nowhere but the edit form.
    const label = TANK_USAGE_LABELS[usage] ?? usage;
    const gloss = TANK_USAGE_GLOSSES[usage] as string | undefined;
    const subject =
      numbers.length === 1
        ? `Cylinder ${numbers[0]} is`
        : `Cylinders ${cylinderNumberList(numbers)} are`;

    return gloss
      ? `${subject} flagged ${label} - ${gloss}.`
      : `${subject} flagged ${label}.`;
  });
}

// The gas badge, sized so every cylinder's pill is the same width whatever it holds.
// Both tables render this badge and are read against each other row by row, so a pill
// that shrank to fit "Air" and grew for "EAN54" put the two tables' badges - and the
// role badges pinned to their right - at different offsets on every row.
//
// 4.5rem is 72 px, against the widest label `gasName` can return for a real gas:
// "Oxygen" at 66.8 px, measured in the rendered table at 12 px semibold. Not "EAN100",
// which looks wider and cannot occur - anything at or above `OXYGEN_MIN` is named
// "Oxygen" - so EAN tops out at "EAN99" and trimix at five characters. The remaining
// 5 px absorbs the font falling back to something a shade wider.
//
// A `min-width`, so the one label that can exceed it still fits: the spelled-out
// "O₂ 50% / He 60%" of an impossible mix, at 122 px. That row breaking the alignment
// is correct - it is the row that isn't a gas.
export const GAS_BADGE_CLASS = "min-w-[4.5rem] justify-center";

// Meters of seawater per bar of ambient pressure. Deliberately the round 10 the
// API's `METERS_PER_BAR` (`services/dive_gas.py`) already uses, not the ~10.06 a
// density-corrected figure would give: the two numbers have to agree or a depth
// shown here and an RMV computed there would quietly disagree about what a bar is,
// and the difference is far below the precision any of this is read at.
const METERS_PER_BAR = 10;

// Fraction of air that is nitrogen, as a percentage - the reference an equivalent
// air depth is equivalent *to*. 79 rather than 78.08 because EAD is defined against
// the idealized 21/79 air the tables were built on, and mixing the real atmospheric
// figure into it would put this out of step with every published table a diver might
// check it against.
const AIR_NITROGEN = 79;

// The two ppO₂ ceilings this app reasons about, in bar.
//
// Function parameters rather than a user setting, deliberately. These are not a
// preference: 1.4 is the working limit essentially every agency teaches for the
// active part of a dive, and 1.6 the contingency ceiling reserved for a
// decompression stop, where the diver is stationary and CO₂ retention is lowest.
// Making them configurable would invite exactly the edit that turns an over-MOD
// warning into silence, which is the one thing this module exists to prevent.
export const PPO2_WORKING = 1.4;
export const PPO2_DECO = 1.6;

// Whether an (O₂, He) pair is a real breathing gas that standard shorthand can name.
//
// Exported because every figure derived from a mix is only meaningful when this holds,
// so the callers that render one (`gasHintParts` here, the MOD column on the mixtures
// card) have to agree on the answer rather than each deciding for themselves.
//
// Parsed dive-file previews are not validated against the DB's
// `ck_dive_mixture_oxygen_helium_sum`, and neither is a half-typed form field, so an
// impossible mix genuinely reaches this module and must come out looking impossible
// rather than acquiring a plausible name. Zero oxygen is excluded for the same
// reason: "EAN0" is a well-formed label for a gas nobody can breathe.
// An unrecorded fraction is not a nameable mix either, and the parameters say so
// rather than leaving each caller to check first: `gasName` and `mod` beside this one
// have always taken `null | undefined`, and a cylinder may now record a mix with no
// vessel *or* a vessel with no mix, so the callers holding a stored `DiveMixture` hold
// nulls as a matter of course.
export function isNameableMix(
  oxygen: number | null | undefined,
  helium: number | null | undefined,
): boolean {
  return (
    oxygen != null &&
    helium != null &&
    Number.isFinite(oxygen) &&
    Number.isFinite(helium) &&
    oxygen > 0 &&
    helium >= 0 &&
    oxygen + helium <= 100
  );
}

// Air is 20.9 % oxygen, devices variously record 20.9, 20.99 or 21, and divers call
// all of them air. The band is wide enough to cover that spread and narrow enough
// that a deliberately enriched EAN22 is still named as one.
const AIR_OXYGEN_MIN = 20.5;
const AIR_OXYGEN_MAX = 21.4;

// Below 100 % but close enough that the cylinder is pure oxygen with an analyzer's
// rounding on it.
const OXYGEN_MIN = 99.5;

/**
 * What a diver would call this gas: `"Air"`, `"Oxygen"`, `"EAN32"` for nitrox, or
 * `"21/35"` for trimix.
 *
 * Returns `null` when either fraction is unrecorded, which is a real state rather
 * than an omission - a parsed preview reports what the file held and `null` for what
 * it didn't, and a gas whose helium content is unknown cannot be told apart from air
 * by any honest label. Callers render nothing in that case.
 *
 * Names round to whole percent, because the shorthand is integer shorthand: a 32.4 %
 * fill is an EAN32 in every logbook and on every cylinder sticker. That rounding is
 * safe here precisely because it is only ever a *label* - the mixtures card prints
 * the recorded fractions unrounded in the adjacent columns (see DECISIONS.md on
 * matching the API's 2-decimal precision), so the exact number is never more than a
 * glance away. An impossible mix falls back to spelling both fractions out.
 */
export function gasName(
  oxygen: number | null | undefined,
  helium: number | null | undefined,
): string | null {
  if (oxygen == null || helium == null) return null;
  if (!Number.isFinite(oxygen) || !Number.isFinite(helium)) return null;
  if (!isNameableMix(oxygen, helium)) {
    // Spelled out rather than named, so an impossible mix cannot pass for a real
    // one. Only reached for finite values - a NaN fraction returns null above
    // rather than rendering "O₂ NaN%".
    return `O₂ ${oxygen}% / He ${helium}%`;
  }

  if (helium > 0) return `${Math.round(oxygen)}/${Math.round(helium)}`;
  if (oxygen >= OXYGEN_MIN) return "Oxygen";
  if (oxygen >= AIR_OXYGEN_MIN && oxygen <= AIR_OXYGEN_MAX) return "Air";

  return `EAN${Math.round(oxygen)}`;
}

/**
 * Partial pressure of oxygen, in bar, breathing this mix at `depth` meters.
 *
 * `null` for an oxygen fraction that isn't a usable number, so a half-typed field
 * shows nothing rather than `NaN`.
 *
 * Nothing renders this today - it is `mod` read in the other direction, and exists so
 * the tests can check the pair against each other (a MOD is by definition the depth
 * where this returns the limit it was given). Kept for that and for the next caller
 * that needs a ppO₂ rather than a depth; don't go hunting for the call site.
 */
export function ppO2AtDepth(
  depth: number,
  oxygen: number | null | undefined,
): number | null {
  if (oxygen == null || !Number.isFinite(oxygen) || !Number.isFinite(depth)) {
    return null;
  }
  return (depth / METERS_PER_BAR + 1) * (oxygen / 100);
}

/**
 * Maximum operating depth in meters - how deep this mix can be breathed before its
 * ppO₂ passes `ppO2` bar. Defaults to the working limit; pass `PPO2_DECO` for the
 * stop-only contingency ceiling.
 *
 * `null` when oxygen isn't a positive number to divide by. A hypothetical 0 % mix
 * has no MOD rather than an infinite one, and returning `Infinity` would render.
 */
export function mod(
  oxygen: number | null | undefined,
  ppO2: number = PPO2_WORKING,
): number | null {
  if (oxygen == null || !Number.isFinite(oxygen) || oxygen <= 0) return null;
  const depth = (ppO2 / (oxygen / 100) - 1) * METERS_PER_BAR;
  // A mix already past its ppO₂ limit at the surface has no operating depth at all.
  // `null`, not `Math.max(0, …)` as `endDepth` and `ead` use: 0 m is a real answer for
  // those two — a rich mix in shallow water genuinely is equivalent to the surface —
  // whereas "MOD 0 m" reads as a depth this gas may be breathed at, which is the
  // opposite of what it means. Both call sites already render `-` for null.
  //
  // Unreachable until this branch: `mod` was only ever called with the 1.4/1.6
  // constants, which need oxygen above 140 % to go negative. A diver-editable
  // `po2_limit` down to 0.4 puts it one plausible EAN50 away.
  return depth < 0 ? null : depth;
}

/**
 * The ppO₂ a cylinder's MOD should be worked out at: what the dive recorded, or
 * `PPO2_WORKING` when it recorded nothing.
 *
 * One place, because a MOD shown against a limit other than the one it was computed
 * from is worse than no MOD at all, and three callers were about to make this choice
 * independently.
 */
export function ppO2Limit(mixture: { po2_limit?: number | null }): number {
  const limit = mixture.po2_limit;
  return limit != null && Number.isFinite(limit) ? limit : PPO2_WORKING;
}

// `sharedPpO2Limit` lived here: the one ppO₂ every cylinder on a dive shared, or null
// when they differed, so the mixtures table could hoist "MOD @ ppO₂ 1.4" into its
// column header and drop into per-row qualifiers only when a dive mixed limits. The
// table now states the limit on every row unconditionally, so nothing asks the
// question - and the helper's whole purpose was choosing between two spellings of the
// same column, which was itself the thing making that column look like two columns.

export interface EndOptions {
  // Whether oxygen is counted as narcotic. Default true, which is the conservative
  // reading and the one most agencies now teach: oxygen's narcotic potency is
  // comparable to nitrogen's, so only the helium fraction genuinely buys back
  // clarity. Setting it false reverts to the older N₂-only convention, which gives a
  // shallower - more flattering - number for the same gas.
  o2Narcotic?: boolean;
}

/**
 * Equivalent narcotic depth in meters: the air depth whose narcosis matches
 * breathing this mix at `depth`.
 *
 * The point of trimix stated as a depth. Returns `null` on unusable inputs.
 *
 * Floored at 0, exactly as `ead` is and for the same reason: a helium mix in shallow
 * water is less narcotic than air at the surface, and the arithmetic runs negative
 * below about 8 m. That is reachable in the live form the moment a diver has typed
 * the "4" of a "45" into the depth box.
 */
export function endDepth(
  depth: number,
  helium: number | null | undefined,
  oxygen: number | null | undefined,
  { o2Narcotic = true }: EndOptions = {},
): number | null {
  if (helium == null || !Number.isFinite(helium) || !Number.isFinite(depth)) {
    return null;
  }

  // With oxygen counted narcotic, everything that isn't helium is, so the mix's
  // oxygen fraction never enters - which is why `oxygen` may be absent in that mode.
  const narcoticFraction = o2Narcotic
    ? 1 - helium / 100
    : (() => {
        if (oxygen == null || !Number.isFinite(oxygen)) return null;
        return (100 - oxygen - helium) / 100;
      })();

  if (narcoticFraction == null) return null;

  const equivalent =
    (depth + METERS_PER_BAR) * narcoticFraction - METERS_PER_BAR;

  return Math.max(0, equivalent);
}

/**
 * Equivalent air depth in meters: the air depth carrying the same nitrogen load as
 * this nitrox mix at `depth`, and so the depth its decompression is planned to.
 *
 * Nitrox only - a mix with helium in it has an END, not an EAD, and passing one here
 * returns `null` rather than a number that would understate the real nitrogen
 * exposure. Floored at 0: a rich mix in shallow water is equivalent to the surface,
 * and a negative depth is not a thing.
 */
export function ead(
  depth: number,
  oxygen: number | null | undefined,
  helium: number | null | undefined = 0,
): number | null {
  if (oxygen == null || !Number.isFinite(oxygen) || !Number.isFinite(depth)) {
    return null;
  }
  // `helium > 0` alone would let NaN through - it compares false - and compute an
  // EAD that silently ignores the helium the caller could not measure.
  if (helium == null || !Number.isFinite(helium) || helium > 0) return null;

  const nitrogen = 100 - oxygen;
  const equivalent =
    ((depth + METERS_PER_BAR) * nitrogen) / AIR_NITROGEN - METERS_PER_BAR;

  return Math.max(0, equivalent);
}

// Just the fields the oxygen-exposure warnings need, so both a saved `DiveMixture`
// and a half-filled form row satisfy it without either type being imported here.
export interface OxygenFractions {
  // `""` for the reason `po2_limit` and `usage` below give, and it reached these two
  // last: a cleared O₂ or He box is now a live form value, because a cylinder may
  // record a vessel with no mix. `recordedFraction` is what every reader here puts it
  // through.
  //
  // Optional as well as nullable, which `helium` already was and `oxygen` has just
  // become: the key is absent on a `DiveMixture` too, and requiring it here only
  // forced the two callers holding one to spread it back in - a promise the wire never
  // made, which is the same mistake `DiveMixture` itself was corrected for.
  oxygen?: number | "" | null | undefined;
  helium?: number | "" | null | undefined;
  // Accepted and **deliberately never read** - `PPO2_WORKING`/`PPO2_DECO` are what
  // the warnings judge against, and a dive's own recorded limit must not be able to
  // move them (see `modWarning`). Declared rather than left off so that reading
  // right here is the answer to "does the limit feed the warning?", instead of the
  // question surviving as an excess-property error at one call site.
  //
  // `""` is in the union for the same reason the rest of this interface is loose:
  // a live form row spells a cleared number that way, and this type exists to be
  // satisfied by both a saved `DiveMixture` and a half-filled one.
  po2_limit?: number | "" | null | undefined;
  // How the cylinder was breathed, and - unlike `po2_limit` above - genuinely read:
  // `diveModWarning` uses it to tell a sidemount pair from a set of cylinders
  // breathed at different depths, which is the one thing that decides whether a
  // single mix can be judged against the dive's maximum depth.
  //
  // `""` is in the union for the reason the interface's lead comment gives, the same
  // one `po2_limit` carries: a live form row spells a cleared select that way, and
  // this type has to be satisfied by a half-filled row as well as a saved one.
  usage?: TankUsage | "" | null | undefined;
}

// One recorded fraction, or `null` for every way of not having one - a cleared form
// box, an API `null`, a field that was never there. The three functions below take
// whole `OxygenFractions` rather than loose numbers, so this is where their `""`
// stops: everything downstream (`gasName`, `mod`, `modWarning`'s comparisons) already
// deals in numbers and nulls, and letting `""` past would have `0`-coerce it into a
// gas nobody can breathe.
function recordedFraction(
  value: number | "" | null | undefined,
): number | null {
  return typeof value === "number" ? value : null;
}

// The margin a depth has to clear a limit by to count as past it, in meters.
//
// `mod` divides by a fraction with no exact binary form, so a limit that is round in
// decimal comes back a few ULPs under it: EAN28's 1.4 limit is 39.999999999999993, so
// a bare `>` puts a 40 m dive on EAN28 past a limit the same sentence prints as
// "40 m". EAN40 at 25 m and oxygen at 4 m sit the same way and EAN32's 33.75 m does
// not - which side the error falls on is a property of the constants rather than of
// the question, so every depth-against-limit comparison here goes through this.
//
// A nanometre: far above the ~1e-14 at stake, far below the centimetre a dive file
// records.
const DEPTH_TOLERANCE = 1e-9;

// Whether `depth` is past `limit` by more than the rounding error above.
function isPastLimit(depth: number, limit: number): boolean {
  return depth > limit + DEPTH_TOLERANCE;
}

/**
 * Why this mix is a problem at `breathedDepth`, phrased for the diver, or `null` when
 * it isn't one.
 *
 * **`breathedDepth` must be a depth this gas was actually breathed at.** It is not
 * the dive's maximum depth unless the two genuinely coincide, which is only knowable
 * for a dive logging a single cylinder. A staged deco bottle is carried to the bottom
 * and breathed on the ascent, so judging it against the deepest point of the dive
 * reports every correctly planned decompression as a problem. Pass `null` when the
 * depth this gas saw is unknown - see `diveModWarning`, which is what callers holding
 * a whole dive should use.
 *
 * Two distinct findings, not one with a threshold: past the 1.4 working limit the
 * gas is still breathable where a diver is decompressing but not where they are
 * working, which is a planning note. Past 1.6 there is no depth at which it was
 * appropriate, which is a different sentence and a louder one.
 *
 * **A recorded `po2_limit` deliberately does not move these thresholds**, even though
 * it moves the MOD displayed beside them. The two are different claims: the MOD
 * column says what the diver planned this gas to, while this says what the gas can
 * physiologically take. Letting the dive's own number set the limit it is judged
 * against would make a cylinder recorded at ppO₂ 2.0 unwarnable - the "edit that
 * turns an over-MOD warning into silence" that `PPO2_WORKING`/`PPO2_DECO` are
 * constants to prevent, arriving through a file instead of a settings screen.
 */
export function modWarning(
  mixture: OxygenFractions,
  breathedDepth: number | null | undefined,
  units: UnitSystem,
): string | null {
  if (breathedDepth == null || !Number.isFinite(breathedDepth)) return null;

  const oxygen = recordedFraction(mixture.oxygen);
  const decoLimit = mod(oxygen, PPO2_DECO);
  const workingLimit = mod(oxygen, PPO2_WORKING);
  if (decoLimit == null || workingLimit == null) return null;

  // Both figures print at one scale and the limit rounds down, which is what keeps a
  // metric sentence from putting the same number on both sides of "is past". Imperial
  // still can, for a breach under a tenth of a foot and depending where in that tenth
  // the limit falls - see `formatComparableDepth`.
  if (isPastLimit(breathedDepth, decoLimit)) {
    return `${formatComparableDepth(breathedDepth, units)} is past this mix's ${formatComparableDepth(decoLimit, units, { floor: true })} limit at ppO₂ ${PPO2_DECO}.`;
  }
  if (isPastLimit(breathedDepth, workingLimit)) {
    return `${formatComparableDepth(breathedDepth, units)} is past this mix's ${formatComparableDepth(workingLimit, units, { floor: true })} working limit (ppO₂ ${PPO2_WORKING}); it is within the ${PPO2_DECO} ceiling used for decompression.`;
  }

  return null;
}

/**
 * The figures worth showing under one cylinder's O₂/He boxes, in reading order, or
 * an empty array when the gas isn't yet identifiable.
 *
 * Always: the gas's name and its MOD, which are properties of the gas alone.
 *
 * Conditionally: END for a helium mix, EAD for nitrox - and neither for air, where
 * both equal the depth itself and `EAD 30.0 m at 30 m` is noise dressed as
 * information. Both are claims about a depth the gas was breathed at, so `depth`
 * must be `null` whenever that is unknown, which is any dive logging more than one
 * cylinder (see `diveModWarning`).
 *
 * Lives here rather than in the component so the *choice* of figure is covered by
 * the same tests as the maths behind it - and so deciding "is this air?" is a
 * comparison of numbers rather than of `gasName`'s output string, which would
 * silently break the day that label changed.
 */
export function gasHintParts({
  oxygen,
  helium,
  depth,
  ppO2,
  units,
}: {
  oxygen: number | null | undefined;
  helium: number | null | undefined;
  depth: number | null | undefined;
  // The ppO₂ this gas was planned to, when the dive records one. Absent falls back
  // to `PPO2_WORKING` - the same 1.4, but the fallback is what the printed "@ ppO₂
  // 1.4" then describes, so the label always names the limit the number came from.
  ppO2?: number | null | undefined;
  // Which system the depths in these strings are written in. ppO₂ is not one of
  // them: it is bar in both, as it is on every dive computer ever made.
  units: UnitSystem;
}): string[] {
  const name = gasName(oxygen, helium);
  if (name === null) return [];

  const parts = [name];

  // An impossible mix gets its spelled-out name and nothing further. MOD, END and
  // EAD would each be a confident figure derived from fractions that cannot coexist
  // in one cylinder - the same "don't let it pass for a real gas" rule `gasName`
  // applies to the label, carried through to the numbers under it.
  if (oxygen == null || helium == null || !isNameableMix(oxygen, helium)) {
    return parts;
  }

  const limit = ppO2Limit({ po2_limit: ppO2 });
  const workingMod = mod(oxygen, limit);
  if (workingMod !== null) {
    parts.push(
      `MOD ${formatComparableDepth(workingMod, units, { floor: true })} @ ppO₂ ${limit}`,
    );
  }

  if (depth == null || !Number.isFinite(depth)) return parts;

  const isAir =
    helium === 0 &&
    oxygen != null &&
    oxygen >= AIR_OXYGEN_MIN &&
    oxygen <= AIR_OXYGEN_MAX;
  if (isAir) return parts;

  if (helium != null && helium > 0) {
    const end = endDepth(depth, helium, oxygen);
    // Qualified for the same reason the card's MOD column names its ppO₂: a diver
    // taught the older nitrogen-only convention computes 14.2 m where this says
    // 25.8 m for the same gas, and nothing else on screen explains the gap.
    if (end !== null) {
      parts.push(
        `END ${formatDepth(end, units, { decimals: 1 })} at ${formatDepth(depth, units)} (O₂ narcotic)`,
      );
    }
    return parts;
  }

  const equivalent = ead(depth, oxygen, helium);
  if (equivalent !== null) {
    parts.push(
      `EAD ${formatDepth(equivalent, units, { decimals: 1 })} at ${formatDepth(depth, units)}`,
    );
  }

  return parts;
}

// A flagged parallel set carrying one gas: the case `diveModWarning` can judge as a
// single cylinder. Both halves are required - see that function's doc comment just
// below - and the gas comparison uses the recorded fractions rather than `gasName`,
// which rounds: two rows at 31.6% and 32.4% are both "EAN32" and are not the same fill.
//
// `helium` is normalized to 0 because that is what the form and every parser write for
// a non-trimix, while `OxygenFractions` allows it absent - and an absent one now
// genuinely arrives, from an import that stopped writing a 0 the file never recorded.
// That normalization is safe where the same one on oxygen would not be: every figure
// this predicate feeds is derived from the oxygen fraction alone (`modWarning`), so a
// pairing that is wrong about helium changes nothing that gets warned about, while one
// that is wrong about oxygen picks a cylinder's MOD to judge the whole dive by.
//
// **An unrecorded oxygen is not a gas two cylinders can share.** Two rows that both say
// nothing are equal as values and identical about nothing, so comparing them raw would
// call a pair of unanalysed cylinders one mix and hand `diveModWarning` the first of
// them to judge. It answers `null` for that pair anyway - `mod(null)` has no depth to
// give - but the agreement would be an accident of what the caller does next rather
// than of what this predicate claims, and a later caller reading it as "these hold the
// same gas" would be reading it wrong.
//
// It sits *above* that doc block rather than between it and its function: a `/** */`
// binds to the next declaration whatever `//` comments intervene, so parking a helper
// in the gap silently reassigns ~50 lines of documentation to it and leaves
// `diveModWarning` with none.
export function isSingleGasParallelSet(
  mixtures: readonly OxygenFractions[],
): boolean {
  if (!isParallelSet(mixtures)) return false;

  const [first] = mixtures;
  const firstOxygen = recordedFraction(first.oxygen);
  if (firstOxygen === null) return false;

  return mixtures.every(
    (mixture) =>
      recordedFraction(mixture.oxygen) === firstOxygen &&
      (recordedFraction(mixture.helium) ?? 0) ===
        (recordedFraction(first.helium) ?? 0),
  );
}

/**
 * The oxygen-exposure warning for a whole dive, or `null` when there is nothing
 * honest to say.
 *
 * This exists because a dive does not record which cylinder was breathed at which
 * depth - the same gap that stops `gasUseUnavailableReason` deriving RMV for a
 * multi-tank dive. What can be concluded splits cleanly in two:
 *
 * - **One cylinder logged.** It was breathed throughout, so the dive's maximum depth
 *   is a depth this gas genuinely saw and `modWarning` applies directly, both
 *   thresholds included.
 * - **Several cylinders logged, all flagged `parallel` and all holding one gas.** A
 *   sidemount pair or independent doubles breathed alternately at the same depth is
 *   one gas plan, not a switch plan: there is only one mix on board and it was
 *   breathed throughout, so the dive's maximum depth is a depth it genuinely saw and
 *   the single-cylinder reasoning applies unchanged, working limit included. Both
 *   halves of that are load-bearing - the flag says the cylinders were breathed
 *   together, and the equal `(oxygen, helium)` says there is nothing to choose
 *   between. A flagged pair holding *different* gases is a switch plan again, and
 *   falls to the case below.
 *
 *   This is not the per-tank-attribution argument rejected further down, and that
 *   rejection does not reach it. Attribution offers a *mean* depth per cylinder,
 *   which is the wrong input for a MOD; this offers the diver's own statement that
 *   every cylinder saw the same depths, which is the right one. Nothing is being
 *   inferred from a profile here.
 *
 * - **Several cylinders logged.** Which one was breathed at the bottom is unknown, so
 *   no single mix can be judged - a staged deco bottle is *supposed* to have a MOD
 *   far shallower than the dive. The one sound inference left is that if the deepest-
 *   capable gas on board still cannot reach the maximum depth, then no gas could
 *   have, whichever order they were breathed in. That is a real finding (a depth
 *   typo, or a genuinely unplanned dive) and it is reported against the dive rather
 *   than blamed on any one cylinder. A cylinder with no usable oxygen fraction - a
 *   box mid-retype, or an import from a file that recorded no analysis - is left out
 *   of the maximum rather than silencing the sentence; see the comment at that branch
 *   for why the weaker claim is the right one.
 *
 * The 1.4 working limit is deliberately not applied in the multi-cylinder case: a
 * deco gas exceeding 1.4 somewhere on the dive is the normal, intended state of
 * affairs, and saying so on every technical dive is the noise this function exists to
 * avoid.
 *
 * Per-tank attribution has since landed (`DiveGasUse.tanks`) and is *not* enough to
 * lift this restriction. It reports a **mean** depth per cylinder, which is the right
 * input for a consumption rate and the wrong one for a MOD: a gas averaging 6 m may
 * still have been breathed at 20 m for a minute, and warning against the mean would
 * clear exactly the excursion worth warning about. What this needs is a deepest-point
 * per gas, which nothing sends yet.
 */
export function diveModWarning(
  mixtures: readonly OxygenFractions[],
  maxDepth: number | null | undefined,
  units: UnitSystem,
): string | null {
  if (maxDepth == null || !Number.isFinite(maxDepth)) return null;
  if (mixtures.length === 0) return null;

  if (mixtures.length === 1) return modWarning(mixtures[0], maxDepth, units);

  // A flagged parallel set holding one gas is judged as that gas, for the reason this
  // function's own doc comment gives. Read off the first row because
  // `isSingleGasParallelSet` has already established that every row matches it.
  if (isSingleGasParallelSet(mixtures)) {
    return modWarning(mixtures[0], maxDepth, units);
  }

  // A cylinder with no usable oxygen fraction is left out of the maximum rather than
  // silencing the sentence, and a nullable `oxygen` does not change that. It reads
  // like a weaker claim than "no gas logged can reach" deserves - an unanalysed
  // cylinder could have held the deep mix - but the direction of the error is what
  // settles it: a warning that vanishes because one row is blank is the missing
  // warning `PPO2_WORKING` is a constant to prevent, arriving through an import
  // instead of a settings screen, and it would flicker off every time a diver cleared
  // an O₂ box to retype it. The gases that *are* logged still cannot reach the depth,
  // which is a true and useful thing to say.
  const limits = mixtures
    .map((mixture) => mod(recordedFraction(mixture.oxygen), PPO2_DECO))
    .filter((limit): limit is number => limit !== null);
  if (limits.length === 0) return null;

  const deepest = Math.max(...limits);
  if (!isPastLimit(maxDepth, deepest)) return null;

  return `No gas logged for this dive can be breathed at ${formatComparableDepth(maxDepth, units)} - the deepest-capable of them reaches ${formatComparableDepth(deepest, units, { floor: true })} at ppO₂ ${PPO2_DECO}.`;
}
