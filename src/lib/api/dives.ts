import { apiClient } from "./client";
import type { PaginatedResponse } from "./client";
import { GearItemSummary } from "./gear";
import { SpeciesSummary } from "./species";

// A single gas mixture / scuba tank used during a dive.
// The ppO₂ vocabulary and the cylinder-role vocabulary the API accepts. Mirrors
// `GasRole` (`schemas/dive_mixture.py`), which is the single source of truth - the API
// rejects anything outside it, so this list has to be kept in step by hand.
export const GAS_ROLES = ["bottom", "deco", "diluent", "oxygen"] as const;
export type GasRole = (typeof GAS_ROLES)[number];

// How a cylinder was breathed, which is not what it was carried for - the two are
// orthogonal, and a dive can carry a `parallel` pair and a `staged` bottle at once.
// Mirrors `TankUsage` (`schemas/dive_mixture.py`), which is the single source of truth -
// the same hand-kept mirroring as `GAS_ROLES` above.
//
// `parallel` is a sidemount pair or independent doubles, breathed alternately at the
// same depth; `staged` is a bottle breathed at its own depth. Null is "not recorded",
// which is what every imported cylinder says: no format this app parses carries the
// distinction, so the flag only ever arrives from the diver's own answer on the form.
//
// Declaration order is the picker's order, and `parallel` leads for the reason the API's
// enum gives: it is the answer that does something. A dive whose cylinders are *all*
// `parallel` gets a consumption figure by summing their litres, which is otherwise
// unavailable without per-cylinder gas switches; `staged` changes no arithmetic today.
export const TANK_USAGE = ["parallel", "staged"] as const;
export type TankUsage = (typeof TANK_USAGE)[number];

// How the dive computer was calibrated for the water it was in, and what a logbook
// records as a fact about the dive. Mirrors `WaterType` (`schemas/dive.py`), which is
// the single source of truth - the same hand-kept mirroring as `GAS_ROLES` above and
// `GEAR_TYPES` in `lib/api/gear.ts`.
//
// Declaration order is the picker's order, so the two real answers come first.
// `en13319` is the European CE standard for depth instruments rather than a kind of
// water, and it is here because it is what real files say: a computer left on the
// EN13319 factory default exports exactly that, and the parser records what the file
// recorded instead of folding it into "salt". The diver can correct it on the form.
export const WATER_TYPES = ["salt", "fresh", "brackish", "en13319"] as const;
export type WaterType = (typeof WATER_TYPES)[number];

// Display labels, kept beside the vocabulary the way `GEAR_TYPE_LABELS` is. "Salt
// water"/"Fresh water" rather than the bare adjective because the field's own label
// is "Water type" and the option has to read as an answer to it; EN13319 keeps the
// standard's own spelling, which is the only name it has.
export const WATER_TYPE_LABELS: Record<WaterType, string> = {
  salt: "Salt water",
  fresh: "Fresh water",
  brackish: "Brackish",
  en13319: "EN13319",
};

// Every optional field is `| null` because that is what comes back on the wire, not
// merely what could be missing: the API declares them `X | None` (`DiveMixtureBase`
// in `schemas/dive_mixture.py`) and sets no `exclude_none`, so an unrecorded field
// arrives as an explicit `null` rather than an absent key. Writing them `?: number`
// alone made TypeScript vouch for a value the response never promised, and the form
// pages - which feed these straight into `diveMixtureSchema`, where `null` is not a
// member of any field's union - were the ones that paid for it.
export interface DiveMixture {
  id?: number;
  volume: number;
  start_pressure?: number | null;
  end_pressure?: number | null;
  oxygen: number;
  helium: number;
  // The ppO₂ this gas was planned to, in bar - the limit its MOD is derived from.
  // Imported from the dive computer where the export records one, and editable.
  // Null/undefined falls back to `PPO2_WORKING` at every call site computing a MOD.
  po2_limit?: number | null;
  // How the source export identifies this cylinder, and the join key to the profile's
  // per-cylinder pressure channels. **A label, not an index** - a Suunto Ocean numbers
  // its cylinders from 0 while the other parsers count from 1 (see the API's
  // DECISIONS.md). Carried through edits rather than edited: the form round-trips it
  // untouched so an import's numbering survives a save, and a hand-added cylinder has
  // none.
  gas_number?: number | null;
  // What the cylinder was carried for. Rarely present on an import - most exports
  // don't record it - so this is mostly the diver's own label.
  role?: GasRole | null;
  // How the cylinder was breathed. *Never* present on an import - no format this app
  // parses records it, so unlike `role` this is always the diver's own answer - and it
  // is the one mixture field that changes what the API can derive: a dive whose
  // cylinders are all `parallel` gets its consumption summed across them.
  usage?: TankUsage | null;
}

// A dive site visited during a dive, as embedded in a `Dive`. Dives are
// ordered by the sequence they were visited in - `dive_sites[0]` is the
// primary/first site, shown wherever only one site can be displayed.
export interface DiveSiteSummary {
  uuid: string;
  name: string;
  location?: string;
  // Where the site is, so a dive can be mapped from its own response instead of
  // fetching every linked site separately. The API kept these off the embedded
  // summary while no map view existed (see its DECISIONS.md); the dive page's
  // map is what reversed that.
  //
  // Optional *and* nullable, and both halves are real: a site with no pin sends
  // explicit `null`s, while a dive payload cached before the API started
  // sending them at all has no keys - which is why nothing may read one without
  // an `!= null` guard, and why they are a both-or-neither pair (the API's
  // `WholeCoordinatePair` refuses to store half of one).
  latitude?: number | null;
  longitude?: number | null;
}

// One cylinder's share of a dive's consumption, on a dive where the API could tell
// which tank was breathed when.
//
// That knowledge comes from **the gas switches the dive computer recorded**, and from
// nothing else (`dive_profile.gas_attribution`, derived by `derive_gas_attribution`).
// The obvious second source - watching each cylinder's pressure curve for activity -
// was considered and rejected on both counts: the exports carry one pressure channel
// per file, and a cylinder's pressure moves with its temperature long after the diver
// has switched away from it. Without switches, a dive with several cylinders yields no
// figures at all rather than a guess (see `DiveGasUse.tanks`).
//
// The litres still come from `DiveMixture.start_pressure`/`end_pressure`, which
// round-trip through the form - not from the profile's pressure curve, which disagrees
// with the recorded header by several bar on a cylinder that kept cooling after the
// switch. The attribution column deliberately carries no pressures at all: only which
// cylinder, for how long, at what mean depth.
export interface DiveTankGasUse {
  // Which cylinder this is, joined against `DiveMixture.gas_number`. Carries that
  // field's warning with it: a device's own label, not an index, and 0 is a real
  // one. The API only emits a row it could match to exactly one mixture, so a
  // number here identifies a single cylinder - but the browser re-checks, since a
  // duplicate on the *mixture* side would otherwise show one tank's litres twice.
  gas_number: number;
  // The same three figures as the dive-wide ones below, computed over just the
  // stretch of the dive this cylinder was breathed for - which is what makes them
  // worth showing at all. A deco bottle emptied at 6 m and a back gas breathed at
  // 40 m produce wildly different RMVs, and dividing either by the whole dive's
  // average depth is the misattribution `compute_gas_use` refuses to commit.
  gas_used: number;
  rmv: number;
  sac_bar_per_min: number;
  // The segmentation the three figures above rest on: how long this cylinder was
  // breathed, and the mean depth over that stretch. Displayed rather than kept
  // internal because the split is an inference from the profile, not a recorded
  // fact, and a diver who can see "12 min at 6.4 m" can judge whether it matches
  // the dive they remember.
  seconds_on_gas: number;
  mean_depth: number;
}

// Surface-normalized gas consumption for a dive, derived by the API from the
// dive's duration, average depth and cylinder pressures - see the API's
// `services/dive_gas.py` for the arithmetic and the assumptions baked into it.
//
// Deliberately *not* recomputed in the browser, unlike gear service status:
// that one depends on today's date, so a cached value would be a lie, whereas
// this is a pure function of stored fields and can never go stale. There is one
// implementation of the formula and it lives in the API.
export interface DiveGasUse {
  // Gas breathed, in liters at surface pressure. The sum across `tanks` where
  // there are several.
  gas_used: number;
  // Respiratory minute volume: liters/minute at surface pressure. Independent
  // of cylinder size, so this is the figure to compare across dives.
  rmv: number;
  // The same consumption as a pressure drop rate, meaningful only alongside
  // this dive's cylinder volume - but it's what a pressure gauge shows.
  //
  // **Null on a multi-tank dive**, where there is generally no such thing: 10 bar
  // out of an 11 L stage and 10 bar out of a 22 L twinset are different amounts of
  // gas, so a sum across cylinders of different sizes is not a rate of anything.
  // Each entry in `tanks` carries its own, which is meaningful because a tank has
  // one volume.
  //
  // **One exception**, and it is the whole reason this comment no longer says
  // "always": a dive whose cylinders are *all* flagged `parallel` **and are of
  // exactly equal volume** gets their pooled figure - the mean drop across them per
  // surface-minute, which is what the same pair logged as one manifolded cylinder
  // would report. Unequal volumes on that path leave this null while `rmv` and
  // `gas_used` still compute, so a present `rmv` is no longer a promise of a SAC.
  sac_bar_per_min: number | null;
  // Per-cylinder breakdown. The API sends `[]` - not null, not an absent key -
  // on every dive it derived without attributing time per cylinder, so "is this
  // array non-empty" is the whole test for which layout the consumption card
  // should render. Typed optional and nullable anyway, because this field is
  // younger than the interface and a response cached before it existed has neither.
  //
  // **Empty is no longer synonymous with single-tank.** It also arrives on the
  // additive parallel path, where a flagged sidemount pair is summed against the
  // dive's own duration and average depth: that derivation needs no attribution and
  // so has none to break down. The non-empty test still selects the right layout -
  // an additive dive genuinely has one set of whole-dive figures to show - but
  // anything reading `[]` as "one cylinder" is now wrong.
  //
  // **A one-entry array is the normal multi-cylinder shape, not a degenerate
  // one**: every multi-gas dive in the corpus is one entry, because a diver
  // carries a single transmitter on the back gas and the deco bottle logs no
  // pressures to derive anything from. It still arrives with two mixtures, so
  // the table has a row the attribution never reached - which is a fact worth
  // rendering, and the reason nothing keys off `tanks.length > 1`.
  tanks?: DiveTankGasUse[] | null;
  // How much of the recorded dive the per-tank split accounts for, against the
  // span it was splitting. The two exist because attribution can leave a
  // remainder - a stretch before the first gas switch on a file that records
  // switches but not the gas carried into the water, say - and figures covering
  // 38 of 42 minutes should say so rather than pass for the whole dive.
  //
  // Both null wherever the whole dive is accounted for and there is no fraction to
  // report: a single-cylinder dive, and a flagged parallel set summed over the
  // dive's own duration. Seconds, matching `Dive.duration` and
  // `DiveProfileInfo.duration`.
  //
  // **The `duration` below is the profile's span, not `Dive.duration`** - that is
  // what the attribution actually ran over, and a hand-edited dive duration would
  // make the fraction unfalsifiable. The two carry the same word since the profile
  // shape started speaking DiveJSON, so anything reading either has to say which
  // one it means.
  //
  // They are routinely different, and the profile's span is usually the larger: a
  // dive computer goes on recording after the diver surfaces (4300 against a
  // logged 4001 on dive #493). Anything rendering this denominator has to say
  // whose number it is, or it reads as contradicting the duration shown at the top
  // of the same page - see `gasAttributionNote`.
  attributed_seconds?: number | null;
  duration?: number | null;
}

export interface Dive {
  uuid: string;
  dive_number: number;
  // ISO 8601, e.g. "2021-04-04T10:04:47.910+02:00" - the offset is the dive's
  // own original timezone (see `lib/date-time.ts`'s "UTC-offset-aware dive
  // `start_time` helpers"), not the viewer's.
  //
  // **It may carry no offset at all** ("2026-04-17T11:49:23"), which is a dive
  // imported from a DiveJSON document that recorded a wall clock and no zone.
  // Read it with the `formatDive*` helpers, which render that state as the clock
  // alone; never with `new Date(...)` and local getters, which would silently
  // reinterpret it in the viewer's own timezone.
  start_time: string;
  duration: number;
  max_depth?: number;
  avg_depth?: number;
  bottom_temperature?: number;
  visibility?: number;
  // What the water was and where it was, both hand-enterable and both settable on the
  // form - unlike the import-owned readings below. `water_type` is seeded from a FIT
  // file's own `dive_settings` through the parse prefill, then owned by the diver;
  // `altitude` is metres above sea level of the water surface, and is the fact a diver
  // can actually type where `surface_pressure_bar` below is the barometer's reading of
  // it.
  //
  // `| null` for the same reason as `cns_start` below: the API declares them
  // `X | None` on `DiveBase` with no `exclude_none`, so an unrecorded field arrives as
  // an explicit `null` rather than an absent key.
  water_type?: WaterType | null;
  altitude?: number | null;
  // Oxygen exposure and surface pressure as the dive computer recorded them, written
  // by the import and **not settable through the form** - the API keeps these off its
  // create/update schemas entirely (see its DECISIONS.md), because nothing on a logged
  // dive reconstructs a CNS clock or an OTU count. Undefined on a hand-logged dive, on
  // one imported from a format that doesn't record them (every FIT file has no surface
  // pressure; a 2026 Suunto Ocean export has none of them), and on any dive imported
  // before the backfill ran.
  //
  // Unlike `gas_use`/`profile`/`source_file` below, these are on the list response too:
  // those are kept off it because each costs the hottest query an extra lookup, and
  // these are plain columns on the row being selected anyway.
  //
  // `| null` for the same reason as `DiveMixture`'s optional fields, and it is the same
  // schema decision behind it: `DiveTechScalars` declares all five `float | None` with
  // no `exclude_none`, so an unrecorded reading arrives as an explicit `null`, not an
  // absent key. `DiveExposureCard` guards with `!= null` and would survive either way -
  // but a type that promises `number | undefined` over a response that sends `null` is
  // exactly what let three mixture fields reach a resolver unconverted.
  cns_start?: number | null;
  cns_end?: number | null;
  otu_start?: number | null;
  otu_end?: number | null;
  // Ambient pressure at the surface, in bar. Display only - the API's gas-use maths
  // deliberately assumes 1 bar.
  surface_pressure_bar?: number | null;
  // Where the diver actually entered and left the water, as the dive computer's GPS
  // recorded it. On `DiveTechScalars` alongside the exposure fields above, so they
  // carry all of that block's properties: written by the import, **not settable
  // through the form**, explicit `null` rather than an absent key on a dive that has
  // none, and absent entirely on a payload cached before the API sent them.
  //
  // These are also **not the dive site's position** - they are where this dive
  // happened, which is why both can be shown at once and why a wide gap between them
  // is worth seeing.
  //
  // **Exit-only is the normal case, not a half-filled pair**: every GPS-carrying file
  // in the API's corpus logs its first fix after surfacing, so a lone exit pair is a
  // complete recording and must read as one. Each pair is both-or-neither.
  entry_latitude?: number | null;
  entry_longitude?: number | null;
  exit_latitude?: number | null;
  exit_longitude?: number | null;
  // Total ballast carried on the dive, in kilograms. A plain per-dive number
  // rather than a gear item - see the API's DECISIONS.md.
  weight?: number;
  trip_uuid?: string;
  // The training course this dive was part of, if the diver recorded one. A
  // separate grouping from the trip: a course is where a dive came from in the
  // logbook's training sense, and a dive can have both.
  course_uuid?: string;
  dive_sites: DiveSiteSummary[];
  // Gear used on the dive. A dive records the items themselves, never the gear
  // set they were loaded from - sets are only a form-filling shortcut.
  gear_items: GearItemSummary[];
  notes: string;
  user_uuid: string;
  created_at: string;
  mixtures: DiveMixture[];
  // The dive-computer export this dive was imported from, if any.
  //
  // Optional because this same interface backs both the list and the detail
  // response, and the API deliberately only sends it on the detail one - the
  // list is the app's hottest query and nothing in it renders this. Don't
  // "fix" a missing value in the list by adding it server-side.
  source_file?: DiveFileInfo | null;
  // Set only when the dive records everything needed to derive it. For one
  // mixture that is an average depth plus both of its pressures. For several,
  // either a profile the API could attribute per cylinder - the result then
  // carries `tanks` - or every cylinder flagged `usage: "parallel"` with both
  // pressures on each, which is summed against the dive's own average depth and
  // needs no profile at all. Optional for the same reason as `source_file` -
  // it's a detail-response field, and it additionally derives from `mixtures`,
  // which the list response doesn't carry either. Use
  // `gasUseUnavailableReason()` (`lib/dive-gas.ts`) to explain a missing value
  // to the user rather than showing nothing.
  gas_use?: DiveGasUse | null;
  // Summary of the dive's per-sample profile, if one was extracted from its
  // imported file. Optional for the same reason as `source_file` above: the API
  // deliberately only sends it on the detail response. The curves themselves are
  // tens of KB and are fetched separately via `getDiveProfile`.
  profile?: DiveProfileInfo | null;
  // What was spotted on the dive, in the order the diver listed them.
  //
  // Optional for the same reason as `source_file` and `gas_use` above: the API
  // sends it on the detail response only, since embedding it on the list would
  // cost the app's hottest query a lookup per row and nothing in the list draws
  // it. It is also absent - rather than `[]` - on any detail payload the API
  // cached before species existed, so read it through `?.` and default it.
  species?: SpeciesSummary[];
}

// What the dive detail response says about a dive's profile without carrying it:
// enough to decide whether to render the card, what to put in its heading, and
// which version of the series to ask for.
export interface DiveProfileInfo {
  uuid: string;
  // Span of the recorded samples, which is *not* `dive.duration` despite sharing
  // the word - a dive computer keeps logging for a few seconds after the dive
  // ends, and `dive.duration` is the diver's own record and may have been
  // hand-edited.
  duration: number;
  depth_sample_count: number;
  // Which curves the profile carries: any of "depth", "ceiling",
  // "temperature", "pressure".
  channels: string[];
  // How many event markers the profile carries. Deliberately a count rather
  // than a fifth entry in `channels`: an event is not a curve with an axis, and
  // "3 markers" is worth showing where a bare boolean isn't. Null on a profile
  // extracted before the API recorded events at all - a row the backfill hasn't
  // reached - where 0 is this extractor having looked and found none.
  event_count?: number | null;
  // Display units (meters, Celsius, bar) - unlike the series, which stay
  // integer-scaled. These are scalars a human reads, not points to map.
  max_depth?: number | null;
  // Deepest deco ceiling the dive was held to, in meters. Null when it owed no
  // decompression at all, which is every recreational dive.
  max_ceiling?: number | null;
  min_temperature?: number | null;
  max_temperature?: number | null;
  min_pressure?: number | null;
  max_pressure?: number | null;
  updated_at?: string | null;
}

// One channel of a profile, in the DiveJSON vocabulary the API serves it in:
// `times` is elapsed seconds from the start of the dive, `values` is
// integer-scaled (see `PROFILE_CHANNELS` in `lib/dive-profile.ts` for the divisor
// per channel). The API's *storage* still uses the compact `t`/`v` keys and maps
// them here on the way out, so a payload dumped from its JSONB column does not
// look like this.
//
// Integers rather than floats deliberately, both on the wire and in the
// database: a float round-trip reintroduces `20.600000000000023`-class noise
// several thousand times per dive, and the chart is going to map every point
// through a scale function anyway - so it divides once per point there.
//
// There are no nulls inside a series. A sensor dropout is a *gap in `times`*,
// which `segmentByTimeGap` turns into separate polylines.
export interface DiveProfileSeries {
  times: number[];
  values: number[];
}

export interface DiveProfilePressureSeries extends DiveProfileSeries {
  // Which cylinder this curve belongs to: the device's own gas number where the
  // export carries one (1 on a 2025 D5, 0 on a Suunto Ocean), otherwise the
  // cylinder's 1-based position in the file (FIT, which identifies a tank only
  // by its transmitter's ANT serial - useless in a legend). A label to display,
  // never an index to trust.
  gas_number: number;
}

// What a marker on the profile chart says happened. A closed vocabulary the API
// normalizes three export formats into (`ProfileEventType` in its
// `schemas/dive_profile.py`), so a chart never has to interpret a device's own
// wording - except for `other`, which is exactly the case where it hands that
// wording over in `label`.
export type DiveProfileEventType =
  "gas_switch" | "deep_stop" | "safety_stop" | "bookmark" | "other";

// One thing the dive computer recorded happening, at an instant rather than
// over a channel.
export interface DiveProfileEvent {
  // Elapsed seconds from the start of the dive, on the same axis as every
  // series' `times`.
  time: number;
  type: DiveProfileEventType;
  // Set only on a `gas_switch`, and the same label `DiveMixture.gas_number` and
  // the pressure curves carry - so a switch marker and the cylinder it switched
  // to can be joined. Null where the file recorded that a switch happened
  // without saying to what.
  gas_number?: number | null;
  // The device's own wording, always present on an `other` and absent on the
  // types that speak for themselves.
  //
  // The only parser-derived free text in any response body: everything else an
  // import produces is a number or a value from a closed vocabulary. The API
  // caps it at 120 characters, which is still long enough to overflow a
  // `whitespace-nowrap` tooltip - see how `ProfileTooltip` lets it wrap.
  label?: string | null;
}

export interface DiveProfile {
  // The span of the sample channels, in seconds. An event may sit past it: the
  // API leaves a marker pressed after the recorder's last sample where the file
  // put it, and clipping that to the plot is the chart's job (see
  // `dive-profile-chart.tsx`).
  duration: number;
  depth?: DiveProfileSeries | null;
  // The deco ceiling, in centimeters on depth's own scale, because it is drawn
  // against depth's axis and a ceiling of 3 m has to be the same integer as a
  // depth of 3 m for the shading to line up with the curve it bounds.
  //
  // Present only while the dive owed decompression: a gap in `times` is a
  // stretch with no obligation, not a sensor dropout, and the channel is absent
  // entirely on every no-deco dive.
  ceiling?: DiveProfileSeries | null;
  temperature?: DiveProfileSeries | null;
  // Plural, unlike the three channels above, because this one is genuinely
  // multi-tank: one entry per cylinder the device reported.
  pressures: DiveProfilePressureSeries[];
  events: DiveProfileEvent[];
}

/**
 * What the API accepts as a dive-computer export, mirrored here so the file
 * picker can filter and so an obviously-oversized file is rejected before it
 * is uploaded. The API re-checks both regardless - this is convenience, not
 * validation.
 */
export const DIVE_FILE_ACCEPT = ".xml,.json,.fit";
export const MAX_DIVE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Metadata about the stored export a dive was imported from - never its bytes.
// The file itself is fetched separately (and authenticated) via
// `getDiveFileBlob`.
export interface DiveFileInfo {
  uuid: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  // Which parser read the file, e.g. "suunto_xml". Render it with
  // `diveParserLabel` rather than showing the raw key.
  parser_key: string;
  updated_at?: string | null;
}

/**
 * Human-readable label per API parser key (`DiveParser.key` in the API's
 * `dive_parsers` registry).
 *
 * Exported so `DIVE_FILE_ACCEPT` can be pinned against it in `dives.test.ts` via
 * `satisfies Record<keyof typeof DIVE_PARSER_LABELS, string>` — adding a parser
 * here without offering its extension stops the test compiling, rather than
 * silently greying the file out in the picker.
 *
 * Not "Garmin FIT": one API parser reads the FIT files of every vendor that
 * writes them, so naming a single manufacturer would mislabel the other one's
 * dives.
 */
export const DIVE_PARSER_LABELS = {
  suunto_xml: "Suunto XML export",
  suunto_json: "Suunto JSON export",
  fit: "FIT export",
};

/**
 * Human-readable name for a `parser_key`. Falls back to the raw key rather
 * than to a blank or "Unknown": if the API grows a parser this build hasn't
 * heard of, showing "garmin_fit" is worse than a label but far better than an
 * empty cell that looks like a bug.
 */
export function diveParserLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  // Widened at the lookup rather than on the declaration, so the map keeps its
  // literal key type for the accept-list test while still accepting a parser
  // key this build has never heard of.
  const labels: Record<string, string> = DIVE_PARSER_LABELS;
  return labels[key] ?? key;
}

export interface DiveCreate {
  user_uuid: string;
  dive_number: number;
  // Must be an offset-aware ISO 8601 string, e.g.
  // "2021-04-04T10:04:47.910+02:00" - see `Dive.start_time` above. Build one
  // with `combineStartTime()` from `lib/date-time.ts`.
  //
  // Offset-**required**, unlike `Dive.start_time` and `DiveUpdate.start_time`:
  // import is the only thing that may create a dive with no offset, so a new one
  // entered here always has a zone to state.
  start_time: string;
  duration: number;
  max_depth?: number | null;
  avg_depth?: number | null;
  bottom_temperature?: number | null;
  visibility?: number | null;
  water_type?: WaterType | null;
  // Metres above sea level of the water surface. Bounded by the API's
  // `ck_dive_altitude_range` (-450 to 6500), which `diveCreateSchema` mirrors.
  altitude?: number | null;
  weight?: number | null;
  trip_uuid?: string;
  course_uuid?: string;
  dive_site_uuids?: string[];
  gear_item_uuids?: string[];
  // Catalog uuids, in spotting order. Every uuid must already exist - the
  // picker resolves an upstream pick into a catalog row before it reaches form
  // state, so saving a dive never waits on WoRMS.
  species_uuids?: string[];
  notes?: string;
  mixtures?: DiveMixture[];
}

export interface DiveUpdate {
  dive_number?: number;
  // Same ISO 8601 format as `Dive.start_time`, offset included **or omitted**.
  //
  // The API accepts an offsetless value only on a dive whose stored offset is
  // already unknown, and leaves it unknown; on a dive that has any offset - `0`
  // included - it refuses with 422 and a flat `{"detail": "<sentence>"}`, so
  // render the failure through `getApiErrorMessage`. Adopting a real offset is
  // always allowed and is the only way out of the unknown state.
  start_time?: string;
  duration?: number;
  max_depth?: number | null;
  avg_depth?: number | null;
  bottom_temperature?: number | null;
  visibility?: number | null;
  // Same "explicit null clears, absent means no change" contract as the nullable
  // measurements around them, and the reason the form's `<select>` normalizes its
  // cleared `""` to `null` rather than dropping the field - see `buildDiveUpdate`.
  water_type?: WaterType | null;
  altitude?: number | null;
  weight?: number | null;
  // `null` detaches the dive from its trip; omitting the field leaves whatever
  // trip it already has alone. Same "explicit null clears, absent means no
  // change" contract as the nullable measurements above - and the reason
  // `TripCombobox` normalizes its cleared value to `null` rather than
  // `undefined`, which the update payload builder drops from the request.
  trip_uuid?: string | null;
  // Same contract as `trip_uuid` above: `null` detaches the dive from its
  // training course, and omitting the key leaves whatever course it already has
  // alone. `CourseCombobox` normalizes its cleared value to `null` for exactly
  // this reason.
  course_uuid?: string | null;
  dive_site_uuids?: string[];
  gear_item_uuids?: string[];
  // Same wholesale-replace contract as the two lists above: an omitted key
  // leaves the dive's species alone, and any list provided - `[]` included -
  // replaces them. See "Locations are always sent on edit" in DECISIONS.md for
  // why the form always sends it.
  species_uuids?: string[];
  notes?: string;
  mixtures?: DiveMixture[];
}

// What to prefill a new dive's number with, from `/dives/next-number`.
//
// Derived by the API from the dive's *date*, not from the newest dive in the
// log: back-filling a 2019 dive into a log that already reaches #212 should
// suggest #12, not #213. See the API's `services/dive_numbering.py`.
export interface DiveNumberSuggestion {
  dive_number: number;
  // Whether an existing dive already carries this number. Advisory only - show
  // it, don't block on it. Back-filling a run of old dives collides by
  // construction, and `renumberDives` is what reconciles the log afterwards.
  is_taken: boolean;
}

// The state of a user's dive numbering, from `/dives/numbering`.
//
// Reported, never enforced. A gap means "part of my log lives in a paper
// logbook" as often as it means "my numbering is a mess", and only the diver
// knows which - so this drives an indicator they can ignore, not a warning.
export interface DiveNumberingSummary {
  total_dives: number;
  // Null only when the log is empty.
  lowest: number | null;
  highest: number | null;
  // How many numbers between `lowest` and `highest` no dive uses.
  missing_count: number;
  // How many dives carry a number another dive also carries.
  duplicate_count: number;
  // How many dives are numbered lower than the dive chronologically before them.
  out_of_date_order_count: number;
  // One unbroken run, no duplicates. Doesn't require starting at 1: a log
  // running #47-#212 is exactly as tidy as one running #1-#166.
  is_sequential: boolean;
}

export interface DiveRenumberRequest {
  // The number to give the earliest dive in scope.
  start_at?: number;
  // Offset-aware ISO 8601, and still offset-**required** where `Dive.start_time`
  // no longer is: this names an *instant* to compare dives against, which an
  // offsetless wall clock cannot do. Renumber only dives at or after it, leaving
  // earlier ones alone - so a log whose older entries mirror a paper logbook can
  // have just its recent tail tidied. Omit to renumber everything.
  from_start_time?: string;
  // Compute the changes and write nothing. Always send `true` first: it's what
  // the confirmation dialog renders.
  dry_run?: boolean;
}

export interface DiveRenumberChange {
  dive_uuid: string;
  start_time: string;
  dive_number: number;
  new_dive_number: number;
}

export interface DiveRenumberResult {
  dry_run: boolean;
  dives_in_scope: number;
  // Only the dives whose number actually moves, in chronological order - a log
  // already numbered as requested comes back with this empty.
  changes: DiveRenumberChange[];
}

// One of the two dives chronologically adjacent to another, from
// `/dive/{uuid}/neighbors`. Just enough to label a link and follow it - the
// neighbour itself is loaded when the diver actually goes there.
export interface DiveNeighbor {
  uuid: string;
  dive_number: number;
  start_time: string;
}

// A dive's chronological neighbours, ordered by `start_time` and **not** by
// `dive_number`: numbers can have gaps, duplicates and runs that don't follow
// the dates (see `DiveNumberingSummary`), so they are a label, not a sequence.
//
// `next` is the *later* dive. That's the opposite end of the log from where
// `getDives` starts - it lists newest first, so a dive's `next` is the one
// above it there - and it is the direction a `>` control has to move for the
// arrows to read as a timeline rather than as list navigation.
//
// Either side is null at the ends of the log; a log of one dive has both null.
export interface DiveNeighbors {
  previous: DiveNeighbor | null;
  next: DiveNeighbor | null;
}

export type PaginatedDivesResponse = PaginatedResponse<Dive>;

// A gas mixture as read out of a dive-computer export, mirroring the API's
// `DiveMixtureSchema`. Every field is nullable and `null` means "the file didn't
// record this" - the API's parsers report what they read and never substitute a
// plausible value.
//
// Fill the gaps with `DEFAULT_MIXTURE` (`components/dives/mixture-fields.tsx`),
// which is what the form shows for a cylinder added by hand - and say so, via
// `describeMixtureImport`. A guessed cylinder size feeds `gas_use`, so a diver
// who cannot tell it from a reading gets an RMV presented as a derived fact.
export interface ParsedDiveMixture {
  volume: number | null;
  start_pressure: number | null;
  end_pressure: number | null;
  oxygen: number | null;
  helium: number | null;
  // All nullable like everything else here, and for the same reason: a parser reports
  // what the file recorded. Only the two Suunto exports carry a ppO₂ at all, and only
  // the JSON one carries anything role-shaped.
  po2_limit: number | null;
  gas_number: number | null;
  role: GasRole | null;
}

// Result of parsing a dive-computer export file (Suunto XML or JSON, or a FIT file) via /dive/parse.
// Most fields are nullable since not every dive-computer format populates every field.
export interface ParsedDive {
  dive_number: number | null;
  // The dive computer's raw exported timestamp - unlike `Dive.start_time`,
  // this may or may not carry an explicit UTC offset (e.g.
  // "2025-06-03T12:15:33.8" vs. "2021-04-04T10:04:47.910+02:00"), since not
  // every dive-computer format records one. See `normalizeParsedStartTime()`
  // in `lib/date-time.ts` for how this is normalized before it ever reaches
  // the create/edit form.
  start_time: string | null;
  duration: number | null;
  max_depth: number | null;
  avg_depth: number | null;
  bottom_temperature: number | null;
  // Applied to the form like the fields above it, not held back like the block below:
  // a FIT file records the computer's own salinity setting, and that is the diver's
  // answer to "what water was this" until they say otherwise. Null for every Suunto
  // export (neither format carries salinity) and for a FIT file set to `custom`, which
  // is a density number rather than a type.
  water_type: WaterType | null;
  mixtures: ParsedDiveMixture[];
  // Returned by the parse so a preview can show them, but deliberately **not** applied
  // to the form: the API writes these itself when the file is attached, from its own
  // re-parse of the same bytes. Nothing here should try to send them back.
  cns_start: number | null;
  cns_end: number | null;
  otu_start: number | null;
  otu_end: number | null;
  surface_pressure_bar: number | null;
  // Proof that the API parsed this exact file for this user. Hand it back to
  // `uploadDiveFile` along with the same `File` once the dive exists, and the
  // export is stored against that dive. Nothing else can be attached: the API
  // re-hashes the body it receives and compares it against this token.
  file_token: string;
  [key: string]: unknown;
}

/**
 * Dive CRUD, plus dive-computer file import, profile fetching and numbering.
 *
 * Two things differ from the other resources here. Updates replace the list-valued fields
 * (`mixtures`, `dive_site_uuids`, `gear_item_uuids`, `species_uuids`) wholesale rather than
 * merging, so a caller must send the full intended list. And importing a file is two steps - parse to
 * pre-fill the form, then upload against the created dive - because the diver gets to
 * correct the parsed values before anything is stored.
 */
export const divesAPI = {
  // Create a new dive. `diveData.user_uuid` must be the currently signed-in user's uuid.
  async createDive(diveData: DiveCreate): Promise<Dive> {
    const response = await apiClient.post(`/dive`, diveData);
    return response.data;
  },

  // Get all dives for a user (paginated). Pass `tripUuid`/`diveSiteUuid`/
  // `gearItemUuid`/`courseUuid`/`speciesUuid` to only return dives that belong to
  // a given trip / were made at a given site / used a given piece of gear / were
  // part of a given training course / recorded a given species. The filters are
  // combinable, and one naming something that doesn't exist or isn't the
  // caller's returns an empty page rather than an error.
  //
  // `courseUuid` and `speciesUuid` come last rather than beside `tripUuid`, where
  // they belong by meaning: these are positional, and inserting a parameter would
  // silently re-point every existing call's site and gear filters. Appending is
  // the only safe direction, which is why each new filter joins the end.
  async getDives(
    userUuid: string,
    page: number = 1,
    items_per_page: number = 10,
    tripUuid?: string,
    diveSiteUuid?: string,
    gearItemUuid?: string,
    courseUuid?: string,
    speciesUuid?: string,
  ): Promise<PaginatedDivesResponse> {
    const response = await apiClient.get(`/dives`, {
      params: {
        user_uuid: userUuid,
        page,
        items_per_page,
        ...(tripUuid !== undefined ? { trip_uuid: tripUuid } : {}),
        ...(diveSiteUuid !== undefined ? { dive_site_uuid: diveSiteUuid } : {}),
        ...(gearItemUuid !== undefined ? { gear_item_uuid: gearItemUuid } : {}),
        ...(courseUuid !== undefined ? { course_uuid: courseUuid } : {}),
        ...(speciesUuid !== undefined ? { species_uuid: speciesUuid } : {}),
      },
    });
    return response.data;
  },

  // Get a specific dive by uuid
  async getDive(diveUuid: string): Promise<Dive> {
    const response = await apiClient.get(`/dive/${diveUuid}`);
    return response.data;
  },

  // The dives immediately before and after `diveUuid` in the signed-in user's
  // log, by start time. Either side is null at the ends of the log.
  //
  // Separate from `getDive` rather than embedded in it: the neighbours change
  // whenever any *other* dive is added, moved or deleted, so folding them into
  // the dive would tie the detail response's cache lifetime to edits that have
  // nothing to do with the dive being shown.
  async getDiveNeighbors(diveUuid: string): Promise<DiveNeighbors> {
    const response = await apiClient.get(`/dive/${diveUuid}/neighbors`);
    return response.data;
  },

  // The dive number to prefill for a dive starting at `startTime` (offset-aware
  // ISO 8601 - build one with `combineStartTime()` from `lib/date-time.ts`).
  // Offset-**required**, for the same reason as `DiveRenumberRequest`: it orders
  // the new dive against existing ones, which is a question about instants.
  //
  // A suggestion, not a reservation. Always the signed-in user's own log, so
  // unlike `getDives` this takes no user uuid.
  async getNextDiveNumber(startTime: string): Promise<DiveNumberSuggestion> {
    const response = await apiClient.get(`/dives/next-number`, {
      params: { start_time: startTime },
    });
    return response.data;
  },

  // The state of the signed-in user's dive numbering, for the log's numbering
  // indicator.
  async getDiveNumbering(): Promise<DiveNumberingSummary> {
    const response = await apiClient.get(`/dives/numbering`);
    return response.data;
  },

  // Renumber the signed-in user's dives consecutively, in date order.
  //
  // The one call in the app that rewrites numbers the diver entered. Call it
  // with `dry_run: true` first and show the result before calling it for real -
  // some of those numbers may also be written in a paper logbook.
  async renumberDives(
    request: DiveRenumberRequest = {},
  ): Promise<DiveRenumberResult> {
    const response = await apiClient.post(`/dives/renumber`, request);
    return response.data;
  },

  // Update a dive
  async updateDive(
    diveUuid: string,
    updateData: DiveUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(`/dive/${diveUuid}`, updateData);
    return response.data;
  },

  // Delete a dive
  async deleteDive(diveUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/dive/${diveUuid}`);
    return response.data;
  },

  // Parse a dive-computer export file (Suunto XML or JSON, or a FIT file) into structured dive data
  async parseDiveFile(file: File): Promise<ParsedDive> {
    const formData = new FormData();
    formData.append("file", file);

    // The apiClient instance has a fixed default "Content-Type: application/json" header.
    // For multipart uploads we must clear it so the browser can set the correct
    // "multipart/form-data; boundary=..." header itself.
    const response = await apiClient.post("/dive/parse", formData, {
      headers: { "Content-Type": undefined },
    });
    return response.data;
  },

  // Attach (or replace) the dive-computer export a dive was imported from.
  //
  // Called after the dive has been created or updated, not when the file is
  // picked: `/dive/parse` stores nothing, so a file only becomes worth keeping
  // once it has actually produced a dive.
  //
  // `fileToken` is the `file_token` from the `parseDiveFile` call for this same
  // file. Without it the API rejects the upload - it is what proves the bytes
  // are the ones that pre-filled the form rather than an arbitrary blob.
  //
  // The `Content-Type` header is explicitly cleared so the browser sets
  // `multipart/form-data` *with its own boundary* - same as `parseDiveFile`.
  async uploadDiveFile(
    diveUuid: string,
    file: File,
    fileToken: string,
  ): Promise<DiveFileInfo> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("file_token", fileToken);

    const response = await apiClient.put(`/dive/${diveUuid}/file`, formData, {
      headers: { "Content-Type": undefined },
    });
    return response.data;
  },

  async deleteDiveFile(diveUuid: string): Promise<void> {
    await apiClient.delete(`/dive/${diveUuid}/file`);
  },

  // Fetch a dive's stored export as a Blob.
  //
  // This has to go through the API client rather than a plain link: the file is
  // private, the endpoint requires an `Authorization` header, and an `<a href>`
  // cannot send one (the access token lives in memory, not in a cookie).
  //
  // `version` is sent as a `v` query param the API ignores. Its job is to give
  // each version of a file its own URL: the response is cached with
  // `max-age=300`, so without it the browser would keep serving the old bytes
  // for five minutes after a replace.
  async getDiveFileBlob(diveUuid: string, version?: string): Promise<Blob> {
    const response = await apiClient.get(`/dive/${diveUuid}/file`, {
      responseType: "blob",
      params: version ? { v: version } : undefined,
    });
    return response.data;
  },

  // Fetch a dive's per-sample profile. 404s when the dive has no imported file,
  // or has one that carried no samples - check `dive.profile` first rather than
  // calling this speculatively.
  //
  // `version` is sent as a `v` query param the API ignores, for the same reason
  // as `getDiveFileBlob`: the response is `max-age=300`, and a re-extraction
  // (after an extractor-version bump, say) would otherwise be masked by the
  // previous payload for five minutes. Pass the profile's `updated_at`.
  async getDiveProfile(
    diveUuid: string,
    version?: string,
  ): Promise<DiveProfile> {
    const response = await apiClient.get(`/dive/${diveUuid}/profile`, {
      params: version ? { v: version } : undefined,
    });
    return response.data;
  },
};
