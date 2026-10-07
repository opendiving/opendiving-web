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
} from "@/lib/api/geocoding";
import {
  diveSiteCatalogAPI,
  diveSitePlaceContext,
  DiveSiteSuggestion,
  MAX_SITE_QUERY_LENGTH,
  MIN_SITE_QUERY_LENGTH,
} from "@/lib/api/dive-site-catalog";
import { geocodeResultLabel } from "@/lib/locations";
import { formatDistance, GeoPoint, haversineMeters } from "@/lib/geo-distance";
import { useUnits } from "@/hooks/useUnits";
import type { UnitSystem } from "@/lib/units";
import {
  MAX_LOCATION_NAME_LENGTH,
  type LocationFormValue,
} from "@/lib/validations/location";

// Slower than the combobox's own 250 ms, exactly as the trip picker is and for
// the same reason: every keystroke that gets past this reaches the geocoder
// through the API's proxy, which enforces one request a second to each provider
// across the whole instance and answers `[]` rather than queueing once that is
// exceeded - so a fast debounce doesn't just waste requests, it turns them into
// empty menus.
//
// The catalog half would prefer the 250 ms default - it is a scan over a file
// already in memory - but one box means one debounce, and it is not made worse
// by waiting: this field already waited 450 ms for everything.
const PLACE_SEARCH_DEBOUNCE_MS = 450;

// What a menu row would place, tagged by where it came from. The two sources
// fill different numbers of fields - only a catalog row names the site itself -
// so the caller has to be able to tell them apart, and this is how: a tagged
// union rather than a prefix on the id, so nothing downstream parses a string to
// find out what it is holding.
export type PlacePick =
  | { kind: "geocode"; result: GeocodeResult }
  | { kind: "catalog"; site: DiveSiteSuggestion };

// Keeps the two kinds of row in disjoint id namespaces inside one results map,
// following the species picker's prefixed synthetic ids. A geocoded row's id
// opens with its latitude, so nothing it mints can collide with this - and the
// source is in there because two databases number their records independently.
const CATALOG_ID_PREFIX = "catalog:";

function catalogKey(site: DiveSiteSuggestion): string {
  return `${CATALOG_ID_PREFIX}${site.source}:${site.source_id}`;
}

// A stable id for a result, since a geocoded place has none of its own. The
// position plus the composed name is specific enough that two genuinely
// different places never collide - the same reasoning as `locationKey` in the
// trip picker, which this deliberately does not import: a dive site is not a
// trip location, and the two features share `lib/`, not each other's components.
// Two results at one position under one name are one place, and one row.
function placeKey(result: GeocodeResult): string {
  return `${result.latitude}:${result.longitude}:${result.location}`;
}

// A geocoded row that is the same OSM object as a catalog row in this answer.
// The catalog's names the dive site, which is the better of the two, and a
// Wikidata row never matches - its `source` is not `osm`.
function sameRecord(result: GeocodeResult) {
  return (site: DiveSiteSuggestion) =>
    !!result.source &&
    !!result.source_id &&
    result.source === site.source &&
    result.source_id === site.source_id;
}

/**
 * What a catalog row says about itself besides its name: which of the diver's own
 * sites already carries its registry entry, the English name where that is what
 * the diver typed, the finest place context the record has, and how far away it
 * is when the form already has a position.
 *
 * The place context is what pulls a duplicate name apart - five `Shark Point`s
 * resolve to four countries, and the two Malaysian ones only come apart on their
 * region. It cannot always succeed: the seven `Diving Spot` records sit within
 * about four kilometres of each other in one bay, and no hint built from this
 * record shape can separate them. They are then shown as what they are - seven
 * identical rows - rather than given a fabricated difference, and picking any of
 * them still brings its own coordinates for the pin to be dragged from.
 */
function catalogHint(
  site: DiveSiteSuggestion,
  position: GeoPoint | null,
  units: UnitSystem,
): string | undefined {
  const parts: string[] = [];
  // First, because it is what decides the pick: a site the diver already has is
  // offered rather than made twice.
  if (site.held_site) parts.push(`In your sites as ${site.held_site.name}`);
  // Only when it says something the row's own name does not. A search for
  // "Sunabe" otherwise returns a row reading 砂辺 with nothing on screen
  // explaining why it matched.
  const english = site.name_en?.trim();
  if (english && english !== site.name.trim()) parts.push(english);
  const place = diveSitePlaceContext(site);
  if (place) parts.push(place);
  if (position) {
    parts.push(formatDistance(haversineMeters(position, site), units));
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// The id the field's own value goes by, so the combobox shows the place the
// dialog holds rather than a row it found. A geocoded row's id opens with its
// latitude and a catalog row's with its own prefix, so nothing collides.
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
  // Sent to the catalog so a same-name cluster comes back nearest first, and
  // used to put a distance on each row.
  position?: GeoPoint | null;
  // A name to search for as soon as the field mounts.
  initialQuery?: string;
  disabled?: boolean;
}

/**
 * The location search dialog's Location field: it shows the place the dialog
 * holds, and typing in it finds a dive site or, failing that, a place.
 *
 * Two sources in one flat list, catalog hits first. The catalog is a read-only
 * extract of real dive sites shipped inside the API image, and it is the half
 * that answers the question the dialog actually asks - the geocoder knows where
 * Dahab is, not where the Blue Hole's north entry is. The geocoder stays below
 * it because a town is a perfectly good answer when the site itself is not in
 * any database, and the map underneath does the last hundred metres either way.
 *
 * No sections and no change to `CreatableCombobox`: the primitive has no
 * grouping concept, seven other wrappers ride it, and the species picker already
 * merged two heterogeneous sources into one flat list without touching it. The
 * `hint` slot carries the distinction between a dive site and a town.
 */
export function PlaceSearch({
  value,
  onPick,
  onTypeName,
  position,
  initialQuery,
  disabled,
}: PlaceSearchProps) {
  const searchId = useId();
  const units = useUnits();
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
      // blip, delete catalog results that arrived perfectly well, and let a
      // catalog failure regress the geocoder box that works today.
      const [catalog, geocoded] = await Promise.allSettled([
        diveSiteCatalogAPI.suggestDiveSites(query, point),
        geocodingAPI.searchPlaces(query),
      ]);

      // Only when neither source could answer is there nothing to say but "we
      // couldn't ask". One source down is a shorter menu, not an error.
      if (catalog.status === "rejected" && geocoded.status === "rejected") {
        throw catalog.reason;
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

      // Catalog rows first, and the order is the whole of the decision: the
      // primitive preserves what the caller returns, so a named dive site beats
      // a town by being listed above it.
      const suggestions = catalog.status === "fulfilled" ? catalog.value : null;
      for (const site of suggestions?.results ?? []) {
        const id = catalogKey(site);
        remember(
          id,
          { kind: "catalog", site },
          { id, name: site.name, hint: catalogHint(site, point, units) },
        );
        credit(site.attribution);
      }

      for (const result of geocoded.status === "fulfilled"
        ? geocoded.value
        : []) {
        if (suggestions?.results.some(sameRecord(result))) continue;
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
      // Only the catalog has a cap to report. The geocoder returns a bare list
      // and says nothing about what it held back, so a menu of geocoder rows
      // alone never claims there is more.
      return { items, hasMore: suggestions?.has_more ?? false };
    },
    [latitude, longitude, units],
  );

  return (
    <div className="space-y-2">
      {/* A plain `Label`, not a `FormLabel`: the dialog is not a form, and what
          this field holds reaches the site form only through "Use location". */}
      <Label htmlFor={searchId}>Location</Label>
      <CreatableCombobox
        id={searchId}
        onSearch={search}
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
        placeholder="e.g. Thistlegorm"
        noItemsLabel="Type to search dive sites and places."
        // The narrowest bounds outside which *neither* source is asked anything,
        // so an empty menu here is never reported as "nothing found" for a
        // search that no one ran. Both declare 2..200 today; taken as a min and
        // a max rather than either one's, so a source that later widens its own
        // does not silently make this label a lie.
        minSearchLength={Math.min(
          MIN_PLACE_QUERY_LENGTH,
          MIN_SITE_QUERY_LENGTH,
        )}
        maxSearchLength={Math.max(
          MAX_PLACE_QUERY_LENGTH,
          MAX_SITE_QUERY_LENGTH,
        )}
        queryTooLongLabel="Too long to search for a dive site."
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

      {/* A licence condition of the data, so it is rendered wherever the results
          are - through `Attribution`, since both sources send the licence URL as
          a markdown link and printing that raw would show a diver
          `[Data © OpenStreetMap contributors, ODbL 1.0.](https://...)`.

          One line for both sources, accumulated and collapsed by string. The
          catalog's OSM credit is byte-identical to the geocoder's, so a menu
          showing both still shows one OpenStreetMap credit; a Wikidata row adds
          its own. The map's own credit below is left alone - it names whoever
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
