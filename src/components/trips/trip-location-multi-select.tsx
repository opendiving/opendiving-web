"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import {
  ComboboxItem,
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import {
  geocodingAPI,
  GeocodeResult,
  MAX_PLACE_QUERY_LENGTH,
  MIN_PLACE_QUERY_LENGTH,
} from "@/lib/api/geocoding";
import { moveItem, useDragSort } from "@/hooks/useDragSort";
import {
  MAX_LOCATION_NAME_LENGTH,
  MAX_TRIP_LOCATIONS,
  type TripLocationFormValue,
} from "@/lib/validations/trip";
import { formatLocationContext } from "@/lib/trip-locations";
import { Attribution } from "@/components/attribution";
import { cn } from "@/lib/utils";

// Slower than the combobox's own 250 ms on purpose. Every keystroke that gets
// past this reaches Nominatim through the API's proxy, which enforces one
// request a second across the whole instance and answers `[]` rather than
// queueing once that is exceeded - so a fast debounce doesn't just waste
// requests, it turns them into empty menus.
const PLACE_SEARCH_DEBOUNCE_MS = 450;

/**
 * A stable id for a location, since these rows have none of their own.
 *
 * Locations are value objects - the API stores what the geocoder said rather
 * than pointing at a shared gazetteer entry - so identity has to come from the
 * content. The position plus the label the row keeps is specific enough that two
 * genuinely different places never collide, and identical enough that picking
 * the same place twice is recognised as a duplicate.
 *
 * The label is the short "Dahab, Egypt" form now, so two Moalboals no longer
 * differ by it - they differ by position, which they always did and which is
 * what actually separates two places of one name. The one thing that costs: a
 * place saved before the picker switched forms carries the provider's label, so
 * it keys differently from a fresh pick of the same place and "already in the
 * list" lets that duplicate through, once, on a row that predates the change.
 *
 * A location typed in by hand has no position at all, so those are keyed by
 * name. Case- and whitespace-insensitively: "moalboal" and "Moalboal " are the
 * same place typed twice, not two places.
 */
export function locationKey(location: TripLocationFormValue): string {
  const { latitude, longitude } = location;
  if (latitude == null || longitude == null) {
    return `txt:${location.name.trim().toLowerCase()}`;
  }
  return `geo:${latitude}:${longitude}:${location.display_name ?? location.name}`;
}

/**
 * A geocoder result as the form holds it.
 *
 * `name` falls back to `location` (the short composed form, "Dahab, Egypt")
 * because a result that matched an address rather than a named place has no name
 * of its own, and a row has to say something.
 *
 * `display_name` is that same short form rather than the provider's own label,
 * which is the one place the two `display_name`s in this app diverge:
 * `GeocodeResult.display_name` is what the provider said, and
 * `trip_location.display_name` is what a diver reads under the name. Nominatim's
 * is "Dahab, South Sinai, 45214, Egypt" - a postcode and an administrative level
 * nobody writes in a dive log - while `location` is the place-plus-country the
 * API composes from the structured address for exactly this purpose. It cannot
 * be recovered from the label later, which is why the choice happens here rather
 * than at render (DECISIONS.md).
 */
export function geocodeResultToLocation(
  result: GeocodeResult,
): TripLocationFormValue {
  return {
    name: result.name ?? result.location,
    display_name: result.location,
    latitude: result.latitude,
    longitude: result.longitude,
    bbox_south: result.bbox_south,
    bbox_north: result.bbox_north,
    bbox_west: result.bbox_west,
    bbox_east: result.bbox_east,
  };
}

export interface MappedPlaces {
  // Menu rows, in the order the provider ranked them.
  items: ComboboxItem[];
  // What to append when one of those rows is picked, by row id.
  locations: Map<string, TripLocationFormValue>;
  // The licence notices carried by these results, deduplicated.
  attributions: string[];
}

/**
 * Turns a page of geocoder results into what the menu and the picker need.
 *
 * Pure, and separate from the component, because this is the whole of the
 * mapping: everything else here is list plumbing. Results that key identically
 * are collapsed - Nominatim occasionally returns the same place twice, and two
 * menu rows sharing a React key is both a warning and a row that can't be
 * excluded once picked.
 */
export function mapSearchResults(results: GeocodeResult[]): MappedPlaces {
  const items: ComboboxItem[] = [];
  const locations = new Map<string, TripLocationFormValue>();
  const attributions: string[] = [];

  for (const result of results) {
    const location = geocodeResultToLocation(result);
    const id = locationKey(location);
    if (!locations.has(id)) {
      locations.set(id, location);
      items.push({
        id,
        name: location.name,
        // The place-plus-country the row would be added as, minus the part of
        // it the row's own name already shows. What the diver reads in the menu
        // is then exactly what lands in the list a click later.
        hint: formatLocationContext(location),
      });
    }
    if (result.attribution && !attributions.includes(result.attribution)) {
      attributions.push(result.attribution);
    }
  }

  return { items, locations, attributions };
}

export interface TripLocationMultiSelectProps extends FormControlSlotProps {
  // Ordered list of places the trip went, first-listed first. Self-describing
  // objects rather than ids: there is nothing to resolve them against.
  value: TripLocationFormValue[];
  onChange: (locations: TripLocationFormValue[]) => void;
  disabled?: boolean;
}

/**
 * Picks the places a trip went, by searching for them.
 *
 * Search-first rather than pin-first: a trip location is a *name* - a country, a
 * region, an island, a sea - so the diver types and picks, and the map beside
 * this field only confirms the pick. Dropping a pin is the dive site picker's
 * job, where the exact point is the point.
 *
 * Anything the geocoder can't answer is still addable as plain text (Enter on an
 * unmatched query). That is not only for obscure places: the proxy answers `[]`
 * while it is over the provider's rate limit, so without the escape hatch a
 * throttled minute would be a picker that refuses to accept anything.
 */
export function TripLocationMultiSelect({
  value,
  onChange,
  disabled,
  // Forwarded to the search input - the field's one focusable control. The
  // selected-places list above it is a `<ul>` of remove buttons, which the form
  // label has nothing to say about.
  ...slotProps
}: TripLocationMultiSelectProps) {
  // What each menu row would append. Held in a ref rather than state because
  // nothing renders from it - the combobox hands back an id, and this is what
  // turns that id back into the object it came from.
  const resultsRef = useRef<Map<string, TripLocationFormValue>>(new Map());
  // Kept for the session rather than cleared with each query: the credit is a
  // licence condition of data that has already been shown and, once picked, is
  // sitting in the list.
  const [attributions, setAttributions] = useState<string[]>([]);
  // Why the last attempt to add a place didn't add one. Cleared by the next
  // search, since typing again is the diver having moved on.
  const [notice, setNotice] = useState<string | null>(null);
  // Set by the append that takes the list to its cap, and read by the effect
  // below - a flag rather than a `value.length` check, so opening the dialog on
  // a trip that is already full doesn't grab focus from the name field.
  const fillsListRef = useRef(false);
  const lastRemoveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!fillsListRef.current) return;
    fillsListRef.current = false;
    lastRemoveRef.current?.focus();
  }, [value.length]);

  const searchPlaces = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      // Typed queries only. Adding a place reopens the menu, which fires an
      // empty search of its own - and clearing on that would wipe the notice a
      // few milliseconds after the attempt that earned it.
      if (query) setNotice(null);
      const {
        items,
        locations,
        attributions: credits,
      } = mapSearchResults(await geocodingAPI.searchPlaces(query));
      locations.forEach((location, id) => resultsRef.current.set(id, location));
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

  // Returns whether the place went in, so a caller with something further to say
  // about it - the truncation notice below - doesn't say it over a refusal.
  const appendLocation = (location: TripLocationFormValue): boolean => {
    // The cap is the schema's, enforced here so it is felt as "that one didn't
    // go in" rather than discovered at Save, where the diver would be told they
    // have too many and left to work out which of twenty-one rows is the extra.
    if (value.length >= MAX_TRIP_LOCATIONS) return false;
    const key = locationKey(location);
    // The same place can be reached from two different queries, and the menu
    // only hides what the current one returned - so a typed name can collide
    // with a row that is sitting right there. Said out loud, because the
    // combobox clears the input on the way through and a refusal that clears
    // the field and adds nothing is indistinguishable from a bug.
    if (value.some((existing) => locationKey(existing) === key)) {
      setNotice(`${location.name} is already in the list.`);
      return false;
    }
    setNotice(null);
    // The one add that has nowhere to put the cursor afterwards: it fills the
    // list, the search field disables, and a browser blurs an element it
    // disables - so the combobox's own "ready for the next one" focus lands on
    // `<body>` and Tab restarts at the top of the dialog. The last row's Remove
    // is the only thing left to do here, so that is where focus goes.
    if (value.length + 1 >= MAX_TRIP_LOCATIONS) fillsListRef.current = true;
    onChange([...value, location]);
    return true;
  };

  const addPickedLocation = (id: string | undefined) => {
    if (id === undefined) return;
    const location = resultsRef.current.get(id);
    // An id with no result behind it is the free-text path reporting back what
    // `onCreate` has already appended - there is nothing left to do with it.
    if (!location) return;
    appendLocation(location);
  };

  // The unmatched-query escape hatch: a place with a name and nothing else.
  // Async only because `onCreate` is - there is nobody to ask about this one.
  //
  // Only ever from an explicit Enter: `keepOpenOnSelect` also tells the combobox
  // that leaving this field commits nothing at all, so clicking Save with a
  // query half typed doesn't file a place called "phil".
  //
  // Both ways a search can come back empty-handed reach here, which is what
  // makes the hatch worth having. A search that *resolves* empty - no such
  // place, or the provider throttled instance-wide - is the ordinary case. A
  // search that *rejects* (the per-user 429, a network blip) normally leaves the
  // combobox's `searchedQuery` stale and a commit a no-op, since an unanswered
  // query is no reason to clear a single-select's loaded value; this field has
  // no such value to protect and asks to create anyway, because refusing would
  // leave a diver mid-outage unable to add anything at all. The two cases say
  // different things in the menu, and both accept Enter.
  const addTypedLocation = async (name: string): Promise<ComboboxItem> => {
    // Truncated rather than rejected: a name this long is a paste, not a place,
    // and the alternative is a row the form then refuses to save. Geocoded picks
    // need no such guard - the API truncates those before they get here.
    const trimmed = name.trim();
    const typed = { name: trimmed.slice(0, MAX_LOCATION_NAME_LENGTH) };
    // After the append, which clears the notice on its way through. Shortening
    // a diver's text without a word is the same silence as refusing it without
    // one - they should see which of the two happened. Only when it *was* added,
    // though: a pasted name that is both over-long and already in the list would
    // otherwise be told the wrong reason nothing happened.
    const added = appendLocation(typed);
    if (added && trimmed.length > MAX_LOCATION_NAME_LENGTH) {
      setNotice(`Shortened to ${MAX_LOCATION_NAME_LENGTH} characters.`);
    }
    return { id: locationKey(typed), name: typed.name };
  };

  // By position, not by key. `locationKey` is derived from content, and the API
  // allows a trip to hold the same place twice - this picker won't create that,
  // but an already-saved trip can arrive holding it, and then removing one row
  // by key would take both with it.
  const removeLocation = (index: number) => {
    // Whatever the notice was about, removing a row can only have resolved it -
    // "already in the list" outliving the row it named is its own small lie.
    setNotice(null);
    onChange(value.filter((_, position) => position !== index));
  };

  const reorder = useCallback(
    (from: number, to: number) => onChange(moveItem(value, from, to)),
    [value, onChange],
  );

  // A trip already holding more than the cap can only have come from elsewhere,
  // and the field still has to let its owner cut it back down.
  const isFull = value.length >= MAX_TRIP_LOCATIONS;

  const { draggingIndex, dragOffset, setItemRef, handleProps } = useDragSort({
    itemCount: value.length,
    onReorder: reorder,
    disabled,
  });

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        // Text selection would otherwise sweep across the rows mid-drag.
        <ul
          className={cn("space-y-1", draggingIndex !== null && "select-none")}
        >
          {value.map((location, index) => {
            const isDragging = draggingIndex === index;
            // The label without the leading repeat of the name beside it, so
            // the row reads "Dahab, Egypt" rather than naming Dahab twice.
            // `undefined` when the label said no more than the name does, and
            // then the row is just the name.
            const context = formatLocationContext(location);
            return (
              <li
                // The position, for the same reason removal uses it: two
                // identical rows are legal and would otherwise share a key. It
                // also happens to be what a live drag-reorder wants, since the
                // rows hold no state of their own to be reset by reusing them.
                key={index}
                ref={setItemRef(index)}
                className={cn(
                  "flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm",
                  isDragging && "relative z-10 shadow-lg ring-2 ring-ring",
                )}
                // The dragged row is translated to follow the pointer; the rest
                // stay put and are simply re-ordered around it by React.
                style={
                  isDragging
                    ? { transform: `translateY(${dragOffset}px)` }
                    : undefined
                }
              >
                {value.length > 1 && (
                  <button
                    type="button"
                    // The gesture's keyboard equivalent lives on this button
                    // (Up/Down), so the label has to say so - "drag to reorder"
                    // alone would be a dead end for keyboard users.
                    aria-label={`Reorder ${location.name}, position ${index + 1} of ${value.length}. Use arrow up and arrow down to move it.`}
                    disabled={disabled}
                    className="shrink-0 cursor-grab rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                    {...handleProps(index)}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                )}
                {/* `min-w-0` is what makes `truncate` mean anything: a flex
                    item's default `min-width: auto` is its content, and this
                    row is one nowrap line - which was "Ko Tao, Ko Tao, Ko
                    Pha-ngan District, Surat Thani Province, Thailand" when the
                    defect was found, so the row refused to shrink and pushed the
                    whole form out past the side of the dialog. Short labels made
                    that rarer, not impossible: a typed-in name is 255 characters
                    wide before the form objects. The same text is on `title`,
                    since an ellipsis is exactly what a narrow dialog produces
                    here. */}
                <span
                  className="min-w-0 flex-1 truncate"
                  title={
                    context ? `${location.name}, ${context}` : location.name
                  }
                >
                  {location.name}
                  <span className="text-muted-foreground">
                    {location.display_name
                      ? context && `, ${context}`
                      : // Not a warning - a typed-in place is a perfectly good
                        // answer - but the map below only draws what has a
                        // position, and its absence should be explained rather
                        // than read as the map having missed one.
                        " - not on the map"}
                  </span>
                </span>
                <button
                  type="button"
                  // Named per row, as in the sibling multiselects: with up to
                  // twenty rows, a screen reader would otherwise announce
                  // twenty identical buttons in a list whose order is the point.
                  ref={index === value.length - 1 ? lastRemoveRef : undefined}
                  aria-label={`Remove ${location.name}`}
                  disabled={disabled}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => removeLocation(index)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <CreatableCombobox
        {...slotProps}
        onSearch={searchPlaces}
        searchDebounceMs={PLACE_SEARCH_DEBOUNCE_MS}
        // Already-picked places are hidden from the menu so the same one can't
        // be added twice.
        excludeIds={value.map(locationKey)}
        value={undefined}
        onChange={addPickedLocation}
        onCreate={addTypedLocation}
        // At the cap the field is closed rather than left to accept a search
        // whose every result would silently fail to append.
        disabled={disabled || isFull}
        placeholder={
          isFull
            ? `${MAX_TRIP_LOCATIONS} locations maximum - remove one to add another`
            : value.length
              ? "Add another place..."
              : "Search for a place..."
        }
        noItemsLabel="Type to search places."
        // What `searchPlaces` will actually ask about - a shorter query is
        // answered `[]` locally, and calling that "no places found" would be
        // reporting on a search that never happened.
        minSearchLength={MIN_PLACE_QUERY_LENGTH}
        maxSearchLength={MAX_PLACE_QUERY_LENGTH}
        // Not "type to search": there is already a paragraph in the field,
        // and the only thing left to do with it is add it as text.
        queryTooLongLabel="Too long to search - press Enter to add as text."
        // The two ways a search comes back empty are indistinguishable here on
        // purpose (the API answers a throttled provider with `[]` too), and the
        // same sentence is the right advice for both.
        noMatchesLabel="No places found - press Enter to add as text."
        // The third case: not "no such place", but no answer at all. Enter still
        // adds the typed text - `CreatableCombobox` allows it here because this
        // field only ever appends - which is the difference between a failing
        // geocoder costing a diver the display name and costing them the trip.
        searchErrorLabel="Couldn't reach the place search - press Enter to add as text."
        keepOpenOnSelect
      />

      {/* `status`, not an error: nothing has gone wrong, the place is simply
          already there, and a screen reader should hear that without being
          alarmed by it.

          Rendered even while empty - a live region has to be in the
          accessibility tree *before* its text changes, and mounting the two
          together is announced unreliably or not at all. Which would leave the
          refusal silent for exactly the people a visible line does nothing for,
          in a field whose whole argument is that a refusal nobody sees is
          indistinguishable from a bug. Same shape as
          `dive-site-map-field.tsx`. */}
      <p role="status" className="text-xs text-muted-foreground empty:hidden">
        {notice}
      </p>

      {/* A licence condition of the data, so it is rendered wherever the
          results are - through `Attribution`, since the API sends the licence
          URL as a markdown link and printing that raw would show a diver
          `[Data © OpenStreetMap contributors, ODbL 1.0.](https://...)`.

          Always mounted, with its one line of height reserved rather than
          `empty:hidden` like the notice above it. A credit that materialises
          with the first search grows the field and shoves the map - and the
          Notes field under it - down the dialog while the diver is typing,
          which is the very thing `TripDialog`'s always-on map exists to avoid.

          Sized to match the tile credit drawn over that map, because the two
          sit within 8px of each other and fine print that disagrees with itself
          reads as a mistake. The size is load-bearing, not cosmetic: at 10px
          the credit holds one line on a 375px phone, where the old shape with
          its URL spelled out needed 341px against the 325px the dialog has.

          One line, joined, rather than a paragraph each: what the credit must
          do is name where the data came from, and a second provider is
          hypothetical while a growing stack of fine print is not. No "Place
          search:" label either - each credit names its own provider, and the
          label was most of what made this wrap. */}
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
