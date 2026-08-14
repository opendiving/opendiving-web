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

import type { GasRole } from "@/lib/api/dives";

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
export function isNameableMix(oxygen: number, helium: number): boolean {
  return (
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
  // whereas "MOD 0.0 m" reads as a depth this gas may be breathed at, which is the
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
  oxygen: number | null | undefined;
  helium?: number | null | undefined;
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
): string | null {
  if (breathedDepth == null || !Number.isFinite(breathedDepth)) return null;

  const decoLimit = mod(mixture.oxygen, PPO2_DECO);
  const workingLimit = mod(mixture.oxygen, PPO2_WORKING);
  if (decoLimit == null || workingLimit == null) return null;

  if (breathedDepth > decoLimit) {
    return `${breathedDepth} m is past this mix's ${decoLimit.toFixed(1)} m limit at ppO₂ ${PPO2_DECO}.`;
  }
  if (breathedDepth > workingLimit) {
    return `${breathedDepth} m is past this mix's ${workingLimit.toFixed(1)} m working limit (ppO₂ ${PPO2_WORKING}); it is within the ${PPO2_DECO} ceiling used for decompression.`;
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
}: {
  oxygen: number | null | undefined;
  helium: number | null | undefined;
  depth: number | null | undefined;
  // The ppO₂ this gas was planned to, when the dive records one. Absent falls back
  // to `PPO2_WORKING` - the same 1.4, but the fallback is what the printed "@ ppO₂
  // 1.4" then describes, so the label always names the limit the number came from.
  ppO2?: number | null | undefined;
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
    parts.push(`MOD ${workingMod.toFixed(1)} m @ ppO₂ ${limit}`);
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
      parts.push(`END ${end.toFixed(1)} m at ${depth} m (O₂ narcotic)`);
    }
    return parts;
  }

  const equivalent = ead(depth, oxygen, helium);
  if (equivalent !== null) {
    parts.push(`EAD ${equivalent.toFixed(1)} m at ${depth} m`);
  }

  return parts;
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
 * - **Several cylinders logged.** Which one was breathed at the bottom is unknown, so
 *   no single mix can be judged - a staged deco bottle is *supposed* to have a MOD
 *   far shallower than the dive. The one sound inference left is that if the deepest-
 *   capable gas on board still cannot reach the maximum depth, then no gas could
 *   have, whichever order they were breathed in. That is a real finding (a depth
 *   typo, or a genuinely unplanned dive) and it is reported against the dive rather
 *   than blamed on any one cylinder.
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
): string | null {
  if (maxDepth == null || !Number.isFinite(maxDepth)) return null;
  if (mixtures.length === 0) return null;

  if (mixtures.length === 1) return modWarning(mixtures[0], maxDepth);

  const limits = mixtures
    .map((mixture) => mod(mixture.oxygen, PPO2_DECO))
    .filter((limit): limit is number => limit !== null);
  if (limits.length === 0) return null;

  const deepest = Math.max(...limits);
  if (maxDepth <= deepest) return null;

  return `No gas logged for this dive can be breathed at ${maxDepth} m - the deepest-capable of them reaches ${deepest.toFixed(1)} m at ppO₂ ${PPO2_DECO}.`;
}
