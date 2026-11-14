"use client";

import { Fragment, useCallback, useId, useMemo, useRef, useState } from "react";
import {
  ComboboxItem,
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import { Label } from "@/components/ui/label";
import { Attribution } from "@/components/attribution";
import {
  geocodingAPI,
  GeocodeResult,
  MAX_PLACE_QUERY_LENGTH,
  MIN_PLACE_QUERY_LENGTH,
  PLACE_SEARCH_DEBOUNCE_MS,
} from "@/lib/api/geocoding";
import {
  diveSitesAPI,
  MAX_SITE_QUERY_LENGTH,
  MIN_SITE_QUERY_LENGTH,
  type DiveSiteLookupItem,
} from "@/lib/api/dive-sites";
import { commonsMark } from "@/components/sites/commons-site";
import { geocodeResultLabel } from "@/lib/locations";
import { GeoPoint, haversineMeters } from "@/lib/geo-distance";
import { useUnits } from "@/hooks/useUnits";
import {
  MAX_LOCATION_NAME_LENGTH,
  type LocationFormValue,
} from "@/lib/validations/location";

// What a menu row stands for, tagged by where it came from. A geocoded row places
// the site being made and a Commons row is a site already made, so the caller has
// to be able to tell them apart, and this is how: a tagged union rather than a
// prefix on the id, so nothing downstream parses a string to find out what it is
// holding.
export type PlacePick =
  | { kind: "geocode"; result: GeocodeResult }
  | { kind: "commons"; site: DiveSiteLookupItem };

// A stable id for a result, since a geocoded place has none of its own. The
// position plus the composed name is specific enough that two genuinely
// different places never collide - the same reasoning as `locationKey` in the
// trip picker, which this deliberately does not import: a dive site is not a
// trip location, and the two features share `lib/`, not each other's components.
// Two results at one position under one name are one place, and one row.
function placeKey(result: GeocodeResult): string {
  return `${result.latitude}:${result.longitude}:${result.location}`;
}

// A geocoded row for an OpenStreetMap object a listed site names. The site's row
// says what the place is called to divers, which is the better of the two; only
// an OpenStreetMap entry can match, the geocoder's `source` being `osm`.
function sameRecord(result: GeocodeResult) {
  return (site: DiveSiteLookupItem) =>
    result.source === "osm" &&
    !!result.source_id &&
    !!site.external_ids?.some(
      (entry) =>
        entry.registry === "openstreetmap" &&
        entry.identifier === result.source_id,
    );
}

// The other name that explains the row: the one the diver typed where they typed
// one, since a search for "Sunabe" otherwise returns a row reading 砂辺 with nothing
// on screen saying why it matched. Otherwise the first the record has.
function otherNameFor(
  site: DiveSiteLookupItem,
  query: string,
): string | undefined {
  const typed = query.trim().toLowerCase();
  const names = site.other_names ?? [];
  return names.find((name) => name.toLowerCase().includes(typed)) ?? names[0];
}

/**
 * What a Commons row says about itself besides its name: another name, its
 * locality, and how far away it is when the form already has a position.
 *
 * The locality is what pulls a duplicate name apart - there are five `Shark
 * Point`s in four countries. It cannot always succeed: seven `Diving Spot` records
 * sit in one bay, and they are then shown as what they are, identical rows, rather
 * than given a fabricated difference.
 */
function commonsHint(
  site: DiveSiteLookupItem,
  query: string,
  position: GeoPoint | null,
  formatDistance: ReturnType<typeof useUnits>["formatDistance"],
): string | undefined {
  const parts: string[] = [];
  const otherName = otherNameFor(site, query);
  if (otherName) parts.push(otherName);
  if (site.location?.name) parts.push(site.location.name);
  if (position && site.latitude != null && site.longitude != null) {
    const { latitude, longitude } = site;
    parts.push(
      formatDistance(haversineMeters(position, { latitude, longitude })),
    );
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// The id the field's own value goes by, so the combobox shows the place the
// dialog holds rather than a row it found. A geocoded row's id opens with its
// latitude and a Commons row's is a uuid, so nothing collides.
const LOCATION_ID_PREFIX = "location:";

export interface PlaceSearchProps {
  // The place the dialog holds, whose name the field shows while nobody is
  // typing in it.
  value: LocationFormValue | null;
  // Called with the row that was picked, tagged with the source it came from -
  // the caller decides which of its fields each kind fills.
  onPick: (pick: PlacePick) => void;
  // Called with text committed by Enter that no row matched, as a place known
  // by its name alone - or with null when the field was cleared.
  onTypeName: (name: string | null) => void;
  // Where the dialog already thinks the site is, when it has a position at all.
  // Sent with a Commons search so a same-name cluster comes back nearest first,
  // and used to put a distance on each row.
  position?: GeoPoint | null;
  // Whether Commons records are listed beside places: only where a pick can be
  // used, which is a site being made. Editing one, the search is places alone.
  listCommonsSites: boolean;
  // A name to search for as soon as the field mounts.
  initialQuery?: string;
  disabled?: boolean;
}

/**
 * The location search dialog's Location field: it shows the place the dialog
 * holds, and typing in it finds a place and, for a new site, a Commons record.
 *
 * Two sources in one flat list, Commons records first. They answer the question
 * the dialog actually asks - the geocoder knows where Dahab is, not where the Blue
 * Hole's north entry is - and the geocoder stays below because a town is a
 * perfectly good answer when the site itself is in no database, and the map
 * underneath does the last hundred metres either way.
 *
 * No sections in `CreatableCombobox`: the primitive has no grouping concept, and
 * a row's `badge` carries the distinction between a dive site and a town.
 */
export function PlaceSearch({
  value,
  onPick,
  onTypeName,
  position,
  listCommonsSites,
  initialQuery,
  disabled,
}: PlaceSearchProps) {
  const searchId = useId();
  const { formatDistance } = useUnits();
  // What each menu row would place. Held in a ref rather than state because
  // nothing renders from it - the combobox hands back an id, and this is what
  // turns that id back into the pick it came from, already tagged.
  const resultsRef = useRef<Map<string, PlacePick>>(new Map());
  // Kept for the session rather than cleared with each query: the credit is a
  // licence condition of data that has already been shown.
  const [attributions, setAttributions] = useState<string[]>([]);

  // Destructured rather than passed whole so the search below doesn't rebuild on
  // every render of the dialog: the caller parses this out of two inputs, so
  // the object is new each time even when the position has not moved.
  const latitude = position?.latitude;
  const longitude = position?.longitude;

  const name = value?.name;
  const selectedItem = useMemo(
    () => (name ? { id: `${LOCATION_ID_PREFIX}${name}`, name } : undefined),
    [name],
  );

  const search = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const point =
        latitude !== undefined && longitude !== undefined
          ? { latitude, longitude }
          : null;

      // Settled independently, and that is the whole point of `allSettled` here.
      // The combobox treats any throw from `onSearch` as total failure - it
      // empties the menu and shows `searchErrorLabel` - so awaiting both
      // together would let the geocoder's per-user rate limit, or any network
      // blip, delete Commons rows that arrived perfectly well, and let a lookup
      // failure regress the geocoder box.
      const [commons, geocoded] = await Promise.allSettled([
        listCommonsSites
          ? diveSitesAPI.searchCommonsSites(query, point)
          : { data: [], has_more: false },
        geocodingAPI.searchPlaces(query),
      ]);

      // Only when neither source could answer is there nothing to say but "we
      // couldn't ask". One source down is a shorter menu, not an error.
      if (commons.status === "rejected" && geocoded.status === "rejected") {
        throw commons.reason;
      }

      const items: ComboboxItem[] = [];
      const seen = new Set<string>();
      const credits: string[] = [];
      const remember = (id: string, pick: PlacePick, item: ComboboxItem) => {
        if (seen.has(id)) return false;
        seen.add(id);
        resultsRef.current.set(id, pick);
        items.push(item);
        return true;
      };
      const credit = (attribution: string | undefined) => {
        if (attribution && !credits.includes(attribution)) {
          credits.push(attribution);
        }
      };

      // Commons rows first, and the order is the whole of the decision: the
      // primitive preserves what the caller returns, so a named dive site beats
      // a town by being listed above it.
      const sites = commons.status === "fulfilled" ? commons.value : null;
      for (const site of sites?.data ?? []) {
        remember(
          site.uuid,
          { kind: "commons", site },
          {
            id: site.uuid,
            name: site.name,
            hint: commonsHint(site, query, point, formatDistance),
            ...commonsMark(site),
          },
        );
        credit(site.attribution ?? undefined);
      }

      for (const result of geocoded.status === "fulfilled"
        ? geocoded.value
        : []) {
        if (sites?.data.some(sameRecord(result))) continue;
        const id = placeKey(result);
        const { name, context } = geocodeResultLabel(result);
        // Keyed by content, so two results that key alike would share a React
        // key - both a warning and a row that can't be picked.
        remember(
          id,
          { kind: "geocode", result },
          { id, name, hint: context ?? undefined },
        );
        credit(result.attribution);
      }

      if (credits.length > 0) {
        setAttributions((previous) => {
          const missing = credits.filter((entry) => !previous.includes(entry));
          return missing.length > 0 ? [...previous, ...missing] : previous;
        });
      }
      // Only the lookup has a page to report. The geocoder returns a bare list
      // and says nothing about what it held back, so a menu of geocoder rows
      // alone never claims there is more.
      return { items, hasMore: sites?.has_more ?? false, credits };
    },
    [latitude, longitude, listCommonsSites, formatDistance],
  );

  return (
    <div className="space-y-2">
      {/* A plain `Label`, not a `FormLabel`: the dialog is not a form, and what
          this field holds reaches the site form only through "Use location". */}
      <Label htmlFor={searchId}>Location</Label>
      <CreatableCombobox
        id={searchId}
        onSearch={search}
        // The geocoder's debounce for the Commons half too, which alone would
        // take the 250 ms default: one box means one debounce.
        searchDebounceMs={PLACE_SEARCH_DEBOUNCE_MS}
        value={selectedItem?.id}
        selectedItem={selectedItem}
        initialQuery={initialQuery}
        onChange={(id) => {
          if (!id) {
            onTypeName(null);
            return;
          }
          const pick = resultsRef.current.get(id);
          if (pick) onPick(pick);
        }}
        // A place nobody has heard of is still a place the diver can name, as
        // the site form's own Location field lets them.
        // Cut to the API's ceiling, which a typed query can outrun.
        onCreate={async (typed) => {
          const text = typed.slice(0, MAX_LOCATION_NAME_LENGTH);
          onTypeName(text);
          return { id: `${LOCATION_ID_PREFIX}${text}`, name: text };
        }}
        disabled={disabled}
        placeholder={listCommonsSites ? "e.g. Thistlegorm" : "e.g. Dahab"}
        noItemsLabel={
          listCommonsSites
            ? "Type to search dive sites and places."
            : "Type to search places."
        }
        // The narrowest bounds outside which *neither* source is asked anything,
        // so an empty menu here is never reported as "nothing found" for a
        // search that no one ran. Taken as a min and a max rather than either
        // one's, so a source that later widens its own does not silently make
        // this label a lie.
        minSearchLength={
          listCommonsSites
            ? Math.min(MIN_PLACE_QUERY_LENGTH, MIN_SITE_QUERY_LENGTH)
            : MIN_PLACE_QUERY_LENGTH
        }
        maxSearchLength={
          listCommonsSites
            ? Math.max(MAX_PLACE_QUERY_LENGTH, MAX_SITE_QUERY_LENGTH)
            : MAX_PLACE_QUERY_LENGTH
        }
        queryTooLongLabel={
          listCommonsSites
            ? "Too long to search for a dive site."
            : "Too long to search for a place."
        }
        // Every empty menu here ends the same way, because the map below and
        // the typed name are the answer to all three: no such site or place,
        // the geocoder's proxy over its rate limit (which the API also answers
        // with `[]`), and the search being unreachable altogether.
        noMatchesLabel="Nothing found - press Enter to use it as typed, or place the site on the map."
        searchErrorLabel="Couldn't reach the search - press Enter to use it as typed, or place the site on the map."
        // A pick writes the coordinates and moves the map as well as this
        // field, so it comes from a click or Enter and nothing else: typing an
        // exact name, or leaving the field, must not place the site somewhere
        // the diver never chose.
        commitOnEnterOnly
      />

      {/* The menu's foot credits the rows while they are open, over this line;
          this one outlasts the menu. A licence condition of the data, so it is
          rendered wherever the results are - through `Attribution`, since both sources send the licence URL as
          a markdown link and printing that raw would show a diver
          `[Data © OpenStreetMap contributors, ODbL 1.0.](https://...)`.

          One line for both sources, accumulated and collapsed by string. An
          OpenStreetMap record's credit is byte-identical to the geocoder's, so a
          menu showing both still shows one OpenStreetMap credit; a Wikidata row
          adds its own. The map's own credit below is left alone - it names whoever
          serves the tiles, which a self-hoster configures separately, so merging
          the two would make one line a false statement about the other.

          Always mounted, with its one line of height reserved, so a credit that
          materialises with the first search does not shove the map down. */}
      <p className="min-h-4 text-[10px] leading-4 text-muted-foreground">
        {attributions.map((attribution, index) => (
          <Fragment key={attribution}>
            {index > 0 && " · "}
            <Attribution value={attribution} />
          </Fragment>
        ))}
      </p>
    </div>
  );
}
