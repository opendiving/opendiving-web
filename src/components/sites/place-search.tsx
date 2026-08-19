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
import { formatLocationContext } from "@/lib/trip-locations";

// Slower than the combobox's own 250 ms, exactly as the trip picker is and for
// the same reason: every keystroke that gets past this reaches the geocoder
// through the API's proxy, which enforces one request a second across the whole
// instance and answers `[]` rather than queueing once that is exceeded - so a
// fast debounce doesn't just waste requests, it turns them into empty menus.
const PLACE_SEARCH_DEBOUNCE_MS = 450;

// A stable id for a result, since a geocoded place has none of its own. The
// position plus the provider's full label is specific enough that two genuinely
// different places never collide - the same reasoning as `locationKey` in the
// trip picker, which this deliberately does not import: a dive site is not a
// trip location, and the two features share `lib/`, not each other's components.
function placeKey(result: GeocodeResult): string {
  return `${result.latitude}:${result.longitude}:${result.display_name}`;
}

// What the row is called. A result that matched an address rather than a named
// place has no name of its own, so the short composed form stands in.
function placeName(result: GeocodeResult): string {
  return result.name ?? result.location;
}

export interface PlaceSearchProps {
  // Called with the place that was picked, whole - the caller decides what to do
  // with its position and its name.
  onPick: (result: GeocodeResult) => void;
  disabled?: boolean;
}

/**
 * Finds a place by name, so a dive site can be put on the map without knowing
 * its coordinates.
 *
 * The trip form picks its locations this way and nothing else; here it is the
 * second way in rather than the only one, because a dive site *is* its exact
 * point - the geocoder knows where Dahab is, not where the Blue Hole's north
 * entry is. So this drops the pin in the right bay and the map below it does the
 * last hundred metres.
 *
 * It holds no value of its own: what was found is on the map and in the Location
 * field a moment later, both of which are on screen, and a search box still
 * naming a place after the pin has been dragged off it would be the only thing
 * on the form claiming something untrue. Nothing is creatable either - the
 * escape hatch for a place the geocoder has never heard of is the map, and the
 * Location field beside it is ordinary text.
 */
export function PlaceSearch({ onPick, disabled }: PlaceSearchProps) {
  const searchId = useId();
  // What each menu row would place. Held in a ref rather than state because
  // nothing renders from it - the combobox hands back an id, and this is what
  // turns that id back into the result it came from.
  const resultsRef = useRef<Map<string, GeocodeResult>>(new Map());
  // Kept for the session rather than cleared with each query: the credit is a
  // licence condition of data that has already been shown.
  const [attributions, setAttributions] = useState<string[]>([]);

  const search = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const results = await geocodingAPI.searchPlaces(query);
      const items: ComboboxItem[] = [];
      const seen = new Set<string>();
      const credits: string[] = [];

      for (const result of results) {
        const id = placeKey(result);
        // Nominatim occasionally returns the same place twice, and two menu rows
        // sharing a React key is both a warning and a row that can't be picked.
        if (seen.has(id)) continue;
        seen.add(id);
        resultsRef.current.set(id, result);
        const name = placeName(result);
        items.push({
          id,
          name,
          // What tells "Moalboal, Cebu" apart from "Moalboal, Negros Oriental" -
          // minus the row's own name, which the label repeats at the front and
          // the row is already showing.
          hint: formatLocationContext({
            name,
            display_name: result.display_name,
          }),
        });
        if (result.attribution && !credits.includes(result.attribution)) {
          credits.push(result.attribution);
        }
      }

      if (credits.length > 0) {
        setAttributions((previous) => {
          const missing = credits.filter(
            (credit) => !previous.includes(credit),
          );
          return missing.length > 0 ? [...previous, ...missing] : previous;
        });
      }
      return { items };
    },
    [],
  );

  return (
    <div className="space-y-2">
      {/* A plain `Label`, not a `FormLabel`: this field holds nothing the form
          saves, and `FormLabel` would need a `FormField` to hang off. Same shape
          as the reassign picker in `delete-with-reassign-dialog.tsx`. */}
      <Label htmlFor={searchId}>Search for a place</Label>
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
          const result = resultsRef.current.get(id);
          if (result) onPick(result);
        }}
        disabled={disabled}
        // Not the Location field's own "e.g. Dahab, Egypt", which sits four
        // fields above this one: the same example twice on one form reads as a
        // copy-paste slip, and this one is answering a different question - a
        // bare place name is what the geocoder wants.
        placeholder="e.g. Ko Tao"
        noItemsLabel="Type to search places."
        // What `searchPlaces` will actually ask about - a shorter query is
        // answered `[]` locally, and calling that "no places found" would be
        // reporting on a search that never happened.
        minSearchLength={MIN_PLACE_QUERY_LENGTH}
        maxSearchLength={MAX_PLACE_QUERY_LENGTH}
        queryTooLongLabel="Too long to search for a place."
        // Every empty menu here ends the same way, because the map below is the
        // answer to all three: no such place, the proxy over its rate limit
        // (which the API also answers with `[]`), and the search being
        // unreachable altogether.
        noMatchesLabel="No places found - place the site on the map instead."
        searchErrorLabel="Couldn't reach the place search - place the site on the map instead."
        // Load-bearing, and not for the reason its name suggests. It is what
        // tells `CreatableCombobox` that leaving this field commits nothing:
        // without it a single-select both picks on an exactly-typed name as you
        // key it in, and commits that same match on blur. Those are right where
        // the input *is* the value - typing a trip's name into the trip picker
        // is how you choose it without a mouse - and wrong here, where a pick
        // writes three other fields and moves the map. Reproduced before fixing:
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
          are - through `Attribution`, since the API sends the licence URL as a
          markdown link and printing that raw would show a diver
          `[Data © OpenStreetMap contributors, ODbL 1.0.](https://...)`.

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
