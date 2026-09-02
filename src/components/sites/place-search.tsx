"use client";

import { Fragment, useCallback, useId, useRef, useState } from "react";
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
import { formatLocationContext } from "@/lib/trip-locations";
import { formatDistance, GeoPoint, haversineMeters } from "@/lib/geo-distance";
import { useUnits } from "@/hooks/useUnits";
import type { UnitSystem } from "@/lib/units";

// Slower than the combobox's own 250 ms, exactly as the trip picker is and for
// the same reason: every keystroke that gets past this reaches the geocoder
// through the API's proxy, which enforces one request a second across the whole
// instance and answers `[]` rather than queueing once that is exceeded - so a
// fast debounce doesn't just waste requests, it turns them into empty menus.
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
// position plus the provider's full label is specific enough that two genuinely
// different places never collide - the same reasoning as `locationKey` in the
// trip picker, which this deliberately does not import: a dive site is not a
// trip location, and the two features share `lib/`, not each other's components.
//
// Still the provider's label rather than the short one the row now shows.
// Nothing renders from this, it only has to be unique for the length of one
// menu, and the longer string is the stricter of the two - a place returned
// twice under different labels is two rows a diver can tell apart, which is not
// the duplicate this is here to collapse.
function placeKey(result: GeocodeResult): string {
  return `${result.latitude}:${result.longitude}:${result.display_name}`;
}

// What the row is called. A result that matched an address rather than a named
// place has no name of its own, so the short composed form stands in.
function placeName(result: GeocodeResult): string {
  return result.name ?? result.location;
}

/**
 * What a catalog row says about itself besides its name: the English name where
 * that is what the diver typed, the finest place context the record has, and how
 * far away it is when the form already has a position.
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

export interface PlaceSearchProps {
  // Called with the row that was picked, tagged with the source it came from -
  // the caller decides which of the form's fields each kind fills.
  onPick: (pick: PlacePick) => void;
  // Where the form already thinks the site is, when it has a position at all.
  // Sent to the catalog so a same-name cluster comes back nearest first, and
  // used to put a distance on each row.
  position?: GeoPoint | null;
  disabled?: boolean;
}

/**
 * Finds a dive site, or failing that a place, so a site can be put on the map
 * without knowing its coordinates.
 *
 * Two sources in one flat list, catalog hits first. The catalog is a read-only
 * extract of real dive sites shipped inside the API image, and it is the half
 * that answers the question this form actually asks - the geocoder knows where
 * Dahab is, not where the Blue Hole's north entry is. The geocoder stays below
 * it because a town is a perfectly good answer when the site itself is not in
 * any database, and the map underneath does the last hundred metres either way.
 *
 * No sections and no change to `CreatableCombobox`: the primitive has no
 * grouping concept, seven other wrappers ride it, and the species picker already
 * merged two heterogeneous sources into one flat list without touching it. The
 * `hint` slot carries the distinction between a dive site and a town.
 *
 * It holds no value of its own: what was found is on the map and in the Location
 * field a moment later, both of which are on screen, and a search box still
 * naming a place after the pin has been dragged off it would be the only thing
 * on the form claiming something untrue. Nothing is creatable either - the
 * escape hatch for a place neither source has heard of is the map, and the
 * Location field beside it is ordinary text.
 */
export function PlaceSearch({ onPick, position, disabled }: PlaceSearchProps) {
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
  // every render of the dialog: the caller parses this out of two form fields,
  // so the object is new each time even when the position has not moved.
  const latitude = position?.latitude;
  const longitude = position?.longitude;

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
        const id = placeKey(result);
        const name = placeName(result);
        // Nominatim occasionally returns the same place twice, and two menu rows
        // sharing a React key is both a warning and a row that can't be picked.
        remember(
          id,
          { kind: "geocode", result },
          {
            id,
            name,
            // The short place-plus-country the API composes ("Dahab, Egypt"),
            // not the provider's "Dahab, South Sinai, 45214, Egypt" - and minus
            // the part of it the row's own name already shows. It is also what
            // picking the row writes into the Location field below, so the menu
            // and the form say the same thing.
            hint: formatLocationContext({
              name,
              display_name: result.location,
            }),
          },
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
      {/* A plain `Label`, not a `FormLabel`: this field holds nothing the form
          saves, and `FormLabel` would need a `FormField` to hang off. Same shape
          as the reassign picker in `delete-with-reassign-dialog.tsx`. */}
      <Label htmlFor={searchId}>Search for a dive site or place</Label>
      <CreatableCombobox
        id={searchId}
        onSearch={search}
        searchDebounceMs={PLACE_SEARCH_DEBOUNCE_MS}
        // Nothing is ever selected here - see the component's own note. A pick
        // reaches `onPick` and the field goes back to empty, ready to be used
        // again for a site whose first search landed in the wrong bay.
        value={undefined}
        onChange={(id) => {
          // `undefined` is the combobox reporting that the typed text no longer
          // matches a row, which for a field with no value is nothing to do.
          if (!id) return;
          const pick = resultsRef.current.get(id);
          if (pick) onPick(pick);
        }}
        disabled={disabled}
        // Not the Location field's own "e.g. Dahab, Egypt", which sits four
        // fields above this one: the same example twice on one form reads as a
        // copy-paste slip, and this one is answering a different question - a
        // bare name is what both sources want.
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
        // Every empty menu here ends the same way, because the map below is the
        // answer to all three: no such site or place, the geocoder's proxy over
        // its rate limit (which the API also answers with `[]`), and the search
        // being unreachable altogether.
        noMatchesLabel="Nothing found - place the site on the map instead."
        searchErrorLabel="Couldn't reach the search - place the site on the map instead."
        // Load-bearing, and not for the reason its name suggests. It is what
        // tells `CreatableCombobox` that leaving this field commits nothing:
        // without it a single-select both picks on an exactly-typed name as you
        // key it in, and commits that same match on blur. Those are right where
        // the input *is* the value - typing a trip's name into the trip picker
        // is how you choose it without a mouse - and wrong here, where a pick
        // writes other fields and moves the map. Reproduced before fixing:
        // a fresh form, "Ko Tao" typed, no row ever clicked, then blur, and the
        // dive site was sitting at 10.0921822, 99.8395362 - so clicking Save
        // next would file a position the diver never chose.
        //
        // The cost is that the menu stays up after a pick, over the top of the
        // map, until the next click anywhere closes it. That is the cheaper of
        // the two: a dropdown briefly covering the pin is visible and one click
        // from gone, and an unchosen position is neither.
        keepOpenOnSelect
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

          Always mounted, with its one line of height reserved rather than
          `empty:hidden`. A credit that materialises with the first search grows
          the field and shoves the map - and everything under it - down the
          dialog while the diver is typing, which is the same defect the trip
          picker's own credit line documents at length. */}
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
