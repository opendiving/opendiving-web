import { z } from "zod";
import { notesField } from "./notes";
import { requiredName } from "./name";
import { coordinateField, formatCoordinateForForm, isSet } from "./coordinates";
import { locationSchema } from "./location";
import { altitudeField, tagsField, vocabularyField } from "./dive";
import {
  ENTRY_TYPES,
  WATER_TYPES,
  type EntryType,
  type WaterType,
} from "@/lib/api/dives";
import type { DiveSite, DiveSiteCreate } from "@/lib/api/dive-sites";

// DiveJSON's bound on another name, which is also the input's `maxLength`.
export const OTHER_NAME_MAX = 255;

// Metres, never below the surface - `ck_dive_site_depth_*_non_negative`.
const siteDepthField = (label: string) =>
  z.number().min(0, `${label} cannot be negative`).nullable().optional();

// One schema for both creating and editing a dive site: `DiveSiteDialog` is the
// only form for either, and it always shows every field, so an update never
// sends a partial object.
export const diveSiteFormSchema = z
  .object({
    name: requiredName("Dive site name", 255),
    // The whole place, not a text box over its name. The dialog seeds this from
    // the site it was handed and PATCHes it back, so a field holding only the
    // name would drop a picked locality's centre and its box on every edit of an
    // existing site. `null` is a site with no locality
    // recorded, and sending it explicitly is how a wrong one is corrected.
    location: locationSchema.nullish(),
    latitude: coordinateField(90, "Latitude", "27.8506"),
    longitude: coordinateField(180, "Longitude", "34.3136"),
    notes: notesField().optional(),
    // A box per name, so a blank one is a row the diver added and left; the
    // submit drops it rather than the schema refusing it.
    other_names: z.array(z.string().max(OTHER_NAME_MAX)).optional(),
    // Never typed: a catalogue pick adds one, and the diver can remove one.
    external_ids: z
      .array(z.object({ registry: z.string(), identifier: z.string() }))
      .optional(),
    depth_from: siteDepthField("Depth from"),
    depth_to: siteDepthField("Depth to"),
    water_type: vocabularyField(WATER_TYPES),
    altitude: altitudeField(),
    entry_types: z.array(z.enum(ENTRY_TYPES)).optional(),
    tags: tagsField().optional(),
  })
  // Both-or-neither, mirroring the API's rule: half a position is not a partial
  // fix, it's meaningless. Two refinements rather than one so the message lands
  // on the field that's actually missing.
  .refine((data) => !isSet(data.longitude) || isSet(data.latitude), {
    message: "Latitude is required when longitude is given",
    path: ["latitude"],
  })
  .refine((data) => !isSet(data.latitude) || isSet(data.longitude), {
    message: "Longitude is required when latitude is given",
    path: ["longitude"],
  })
  // `ck_dive_site_depth_range`. On the deep end, which is the one a diver typing
  // the range left to right has just written.
  .refine(
    (data) =>
      data.depth_from == null ||
      data.depth_to == null ||
      data.depth_from <= data.depth_to,
    {
      message: "Depth to cannot be shallower than depth from",
      path: ["depth_to"],
    },
  );

export type DiveSiteFormInput = z.input<typeof diveSiteFormSchema>;

const isWaterType = (value: unknown): value is WaterType =>
  WATER_TYPES.includes(value as WaterType);
const isEntryType = (value: unknown): value is EntryType =>
  ENTRY_TYPES.includes(value as EntryType);

/** The site's water type, where it is one the web knows; a stored value it does not is read as absent. */
export function siteWaterType(
  site: Pick<DiveSite, "water_type">,
): WaterType | null {
  return isWaterType(site.water_type) ? site.water_type : null;
}

/** The site's entry types the web knows, in the vocabulary's order. */
export function siteEntryTypes(
  site: Pick<DiveSite, "entry_types">,
): EntryType[] {
  return ENTRY_TYPES.filter((entry) => site.entry_types?.includes(entry));
}

/** What the dialog opens on: the site being edited, or a clean slate. */
export function diveSiteFormValues(site?: DiveSite | null): DiveSiteFormInput {
  return {
    name: site?.name ?? "",
    // The whole place, so that saving an edit that never touched this field
    // sends back the name, the centre and the box it was seeded with.
    location: site?.location ?? null,
    latitude: formatCoordinateForForm(site?.latitude),
    longitude: formatCoordinateForForm(site?.longitude),
    notes: site?.notes ?? "",
    other_names: site?.other_names ?? [],
    external_ids: site?.external_ids ?? [],
    depth_from: site?.depth_from ?? null,
    depth_to: site?.depth_to ?? null,
    water_type: (site && siteWaterType(site)) ?? "",
    altitude: site?.altitude ?? null,
    entry_types: site ? siteEntryTypes(site) : [],
    tags: site?.tags ?? [],
  };
}

/**
 * The members a save sends beside the name and the place, every one of them on an
 * edit as on a create: the form shows them all, and a list replaces the stored one
 * whole. A cleared scalar is an explicit `null`, and a blank name box is dropped.
 */
export function diveSiteMembersFromForm(
  data: DiveSiteFormInput,
): Omit<DiveSiteCreate, "name" | "location" | "latitude" | "longitude"> {
  return {
    other_names: (data.other_names ?? [])
      .map((name) => name.trim())
      .filter(Boolean),
    external_ids: data.external_ids ?? [],
    depth_from: data.depth_from ?? null,
    depth_to: data.depth_to ?? null,
    water_type: data.water_type || null,
    altitude: data.altitude ?? null,
    entry_types: data.entry_types ?? [],
    tags: data.tags ?? [],
  };
}
