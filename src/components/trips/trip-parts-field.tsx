"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  ComboboxItem,
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  AddRowButton,
  RepeatableRow,
  RepeatableRowField,
} from "@/components/ui/repeatable-row";
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
  type LocationFormValue,
} from "@/lib/validations/location";
import {
  emptyTripPart,
  MAX_TRIP_PARTS,
  type TripPartFormValue,
} from "@/lib/validations/trip";
import { ContactCombobox } from "@/components/contacts/contact-combobox";
import type { ContactRole } from "@/lib/api/contacts";
import { geocodeResultLabel, geocodeResultToLocation } from "@/lib/locations";
import { formatTripDateRange } from "@/lib/date-time";
import { Attribution } from "@/components/attribution";
import { cn } from "@/lib/utils";

// Slower than the combobox's own 250 ms on purpose. Every keystroke that gets
// past this reaches the geocoder through the API's proxy, which enforces one
// request a second to each provider across the whole instance and answers `[]`
// rather than queueing once that is exceeded - so a fast debounce doesn't just
// waste requests, it turns them into empty menus.
const PLACE_SEARCH_DEBOUNCE_MS = 450;

/**
 * A stable id for a place, since these have none of their own.
 *
 * Places are value objects - the API stores what the geocoder said rather than
 * pointing at a shared gazetteer entry - so a menu row's id has to come from the
 * content. The position plus the label is specific enough that two genuinely
 * different places never collide, which is what keeps one search's results from
 * sharing a React key and what lets a row picked earlier be recognised as the
 * one a part already holds.
 *
 * A place typed in by hand has no position at all, so those are keyed by name.
 * Case- and whitespace-insensitively: "moalboal" and "Moalboal " are the same
 * place typed twice, not two places.
 *
 * Two parts may name the same place - a trip that goes Dahab, then Sharm, then
 * back to Dahab - so nothing compares these keys *across* parts. They identify a
 * place within one part's menu, and rows are keyed and removed by position.
 */
export function locationKey(location: LocationFormValue): string {
  const { latitude, longitude } = location;
  if (latitude == null || longitude == null) {
    return `txt:${location.name.trim().toLowerCase()}`;
  }
  return `geo:${latitude}:${longitude}:${location.full_name ?? location.name}`;
}

export interface MappedPlaces {
  // Menu rows, in the order the provider ranked them.
  items: ComboboxItem[];
  // What to set the part's place to when one of those rows is picked, by row id.
  locations: Map<string, LocationFormValue>;
  // The licence notices carried by these results, deduplicated.
  attributions: string[];
}

// A search result as a trip part's place, named as its menu row reads in the
// dive site search too: "Moalboal, Cebu, Philippines". Cut to the API's ceiling
// here because it is composed here - the API bounds each part, not the join.
function tripPartLocation(result: GeocodeResult): LocationFormValue {
  const { name, context } = geocodeResultLabel(result);
  return {
    ...geocodeResultToLocation(result),
    name: [name, context]
      .filter(Boolean)
      .join(", ")
      .slice(0, MAX_LOCATION_NAME_LENGTH),
  };
}

/**
 * Turns a page of geocoder results into what the menu and the row need.
 *
 * Pure, and separate from the component, because this is the whole of the
 * mapping: everything else here is list plumbing. Results that key identically
 * are collapsed, because two menu rows sharing a React key is both a warning and
 * an id that resolves back to whichever of them was written last.
 */
export function mapSearchResults(results: GeocodeResult[]): MappedPlaces {
  const items: ComboboxItem[] = [];
  const locations = new Map<string, LocationFormValue>();
  const attributions: string[] = [];

  for (const result of results) {
    const location = tripPartLocation(result);
    const id = locationKey(location);
    if (!locations.has(id)) {
      locations.set(id, location);
      // The row's `name` is exactly what a pick saves, with no hint beside it:
      // the combobox writes a picked row's `name` into the input, and an Enter
      // with nothing highlighted picks a row whose `name` equals the typed text.
      // A bare "Moalboal" would put that in the field after a pick, and make
      // "moalboal" + Enter pick the first of two Moalboals instead of adding
      // what was typed.
      items.push({ id, name: location.name });
    }
    if (result.attribution && !attributions.includes(result.attribution)) {
      attributions.push(result.attribution);
    }
  }

  return { items, locations, attributions };
}

/**
 * What to call a part, in the order a diver would: its place, then its dates,
 * then its position in the list.
 *
 * A part has no name of its own, so the two controls that have to name one -
 * the drag handle and the Remove button - ask here rather than each settling on
 * a different answer for the same row. The date fields do not: they are what
 * names an undated part, so naming them after its dates would rename the
 * control under the diver as they filled it in.
 */
export function describeTripPart(
  part: TripPartFormValue,
  index: number,
): string {
  const name = part.location?.name?.trim();
  if (name) return name;
  return (
    formatTripDateRange(
      part.start_date || undefined,
      part.end_date || undefined,
    ) ?? `part ${index + 1}`
  );
}

export interface TripPartsFieldErrors {
  // What the schema said about the list as a whole - the cap.
  list?: string;
  // What it said about each part, by position.
  parts?: (string | undefined)[];
}

/**
 * React Hook Form's error for `parts`, taken apart into something renderable.
 *
 * A failing *part* makes `errors.parts` an array whose own `message` is
 * `undefined`, so the single `FormMessage` this field would otherwise get
 * renders the string "undefined" in red and says nothing about which row is
 * wrong. The field shows them itself instead, one per row.
 *
 * `firstMessage` walks rather than reading a known key: both dates and the
 * place sit on one row, so whichever of them the schema objected to, the row is
 * what has to say so - and a message nobody renders is a save that refuses in
 * silence.
 */
export function tripPartErrors(error: unknown): TripPartsFieldErrors {
  if (Array.isArray(error)) return { parts: error.map(firstMessage) };
  const list = firstMessage(error);
  return list ? { list } : {};
}

function firstMessage(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const { message } = node as { message?: unknown };
  if (typeof message === "string") return message;
  for (const value of Object.values(node)) {
    const found = firstMessage(value);
    if (found) return found;
  }
  return undefined;
}

export interface TripPartsFieldProps extends FormControlSlotProps {
  // The trip's parts, in the order the diver arranged them.
  value: TripPartFormValue[];
  onChange: (parts: TripPartFormValue[]) => void;
  // What the schema objected to, from `tripPartErrors`. Passed in rather than
  // read off the form, so this stays a plain controlled component.
  errors?: TripPartsFieldErrors;
  disabled?: boolean;
}

/**
 * Edits the stretches a trip ran: each one a place, a date range, or both.
 *
 * Adding a part and choosing what goes in it are two acts rather than one,
 * because the half a diver has is not always the place - a transit day and a
 * week nobody geocoded are dates and nothing else. So a part arrives empty and
 * the row is where it is filled in, which is also what makes a place
 * changeable: the wrong pick is corrected where it sits instead of being removed
 * and re-added at the end of the list.
 *
 * Search-first rather than pin-first: a part's place is a *name* - a country, a
 * region, an island, a sea - so the diver types and picks, and the map below the
 * field only confirms it. Dropping a pin is the dive site picker's job, where
 * the exact point is the point.
 *
 * Anything the geocoder can't answer is still addable as plain text (Enter on an
 * unmatched query). That is not only for obscure places: the proxy answers `[]`
 * while it is over the provider's rate limit, so without the escape hatch a
 * throttled minute would be a field that refuses to accept anything.
 */
export function TripPartsField({
  value,
  onChange,
  errors,
  disabled,
  // Forwarded to the Add button, which is the field's one control that exists
  // whatever the list holds - a row's own controls come and go with the row, and
  // each carries a name naming its part. `FormLabel`'s `htmlFor` therefore lands
  // on something real; the button keeps its own `aria-label` so that what it
  // announces is what it does rather than the group's heading.
  ...slotProps
}: TripPartsFieldProps) {
  // Kept for the session rather than cleared with each query: the credit is a
  // licence condition of data that has already been shown and, once picked, is
  // sitting in a row.
  const [attributions, setAttributions] = useState<string[]>([]);
  // Why the last attempt to set a place didn't do what was typed. Cleared by the
  // next search, since typing again is the diver having moved on.
  const [notice, setNotice] = useState<string | null>(null);

  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  // Set by the Add button and read by the effect below - a flag rather than a
  // `value.length` check, so opening the dialog on a trip that already has parts
  // doesn't grab focus from the name field.
  const focusNewRowRef = useRef(false);

  // A new part is empty, so the first thing to do with it is say where or when
  // it was. This also covers the add that reaches the cap: the button disables,
  // a browser blurs what it disables, and focus would otherwise land on `<body>`
  // with Tab restarting at the top of the dialog.
  useEffect(() => {
    if (!focusNewRowRef.current) return;
    focusNewRowRef.current = false;
    rowRefs.current[value.length - 1]
      ?.querySelector<HTMLInputElement>('input[role="combobox"]')
      ?.focus();
  }, [value.length]);

  const noteAttributions = useCallback((credits: string[]) => {
    if (credits.length === 0) return;
    setAttributions((previous) => {
      const missing = credits.filter((credit) => !previous.includes(credit));
      return missing.length > 0 ? [...previous, ...missing] : previous;
    });
  }, []);

  const isFull = value.length >= MAX_TRIP_PARTS;

  const addPart = () => {
    // The cap is the schema's, enforced here so it is felt as "that one didn't
    // go in" rather than discovered at Save, where the diver would be told they
    // have too many and left to work out which of twenty-one rows is the extra.
    if (isFull) return;
    setNotice(null);
    focusNewRowRef.current = true;
    onChange([...value, emptyTripPart()]);
  };

  const updatePart = useCallback(
    (index: number, changes: Partial<TripPartFormValue>) =>
      onChange(
        value.map((part, position) =>
          position === index ? { ...part, ...changes } : part,
        ),
      ),
    [value, onChange],
  );

  // By position, not by content. Two parts may name the same place - a trip that
  // returns to one is the shape this whole field exists to record - so removing
  // by anything derived from what a row holds would take both with it.
  const removePart = (index: number) => {
    setNotice(null);
    onChange(value.filter((_, position) => position !== index));
  };

  const reorder = useCallback(
    (from: number, to: number) => onChange(moveItem(value, from, to)),
    [value, onChange],
  );

  const { draggingIndex, dragOffset, setItemRef, handleProps } = useDragSort({
    itemCount: value.length,
    onReorder: reorder,
    disabled,
  });

  return (
    <div className="space-y-4">
      {value.length > 0 ? (
        // Text selection would otherwise sweep across the rows mid-drag.
        <ul
          className={cn("space-y-4", draggingIndex !== null && "select-none")}
        >
          {value.map((part, index) => (
            <TripPartRow
              // The position, for the same reason removal uses it: two identical
              // rows are legal and would otherwise share a key. It also happens
              // to be what a live drag-reorder wants, since the rows hold no
              // state of their own to be reset by reusing them.
              key={index}
              part={part}
              index={index}
              total={value.length}
              error={errors?.parts?.[index]}
              disabled={disabled}
              isDragging={draggingIndex === index}
              dragOffset={dragOffset}
              handleProps={handleProps}
              setRef={(el) => {
                setItemRef(index)(el);
                rowRefs.current[index] = el;
              }}
              onChange={updatePart}
              onRemove={removePart}
              onAttributions={noteAttributions}
              onNotice={setNotice}
            />
          ))}
        </ul>
      ) : (
        // In words, because the shape is new and the useful half of it is the
        // one nothing on screen suggests: a part need not be a place.
        <p className="text-sm text-muted-foreground">
          No parts yet. Add one for each place the trip went - or one with dates
          and no place, for a travel day or a week nobody geocoded.
        </p>
      )}

      <AddRowButton
        {...slotProps}
        aria-label="Add a part"
        disabled={disabled || isFull}
        onClick={addPart}
      >
        Add a part
      </AddRowButton>

      {isFull && (
        <p className="text-xs text-muted-foreground">
          {MAX_TRIP_PARTS} parts maximum - remove one to add another.
        </p>
      )}

      {/* The cap again, as the schema sees it. Unreachable while the Add button
          is the only thing that grows the list, and rendered anyway: a save
          that refuses with nothing on screen is the failure this field's whole
          error path exists to avoid. */}
      {errors?.list && (
        <p className="text-sm font-medium text-destructive">{errors.list}</p>
      )}

      {/* `status`, not an error: nothing has gone wrong, and a screen reader
          should hear what happened without being alarmed by it.

          Rendered even while empty - a live region has to be in the
          accessibility tree *before* its text changes, and mounting the two
          together is announced unreliably or not at all. One for the field
          rather than one per row: what it reports is the shortening of a name
          the diver has just this moment typed, so which row it was about is not
          in doubt. Same shape as `dive-site-map-field.tsx`. */}
      <p role="status" className="text-xs text-muted-foreground empty:hidden">
        {notice}
      </p>

      {/* A licence condition of the data, so it is rendered wherever the
          results are - through `Attribution`, since the API sends the licence
          URL as a markdown link and printing that raw would show a diver
          `[Data © OpenStreetMap contributors, ODbL 1.0.](https://...)`.

          One line for the whole field, fed by whichever row searched: the
          credit names a provider, not a row.

          Always mounted, with its one line of height reserved rather than
          `empty:hidden` like the notice above it. A credit that materialises
          with the first search grows the field and shoves the map - and the
          Notes field under it - down the dialog while the diver is typing,
          which is the very thing `TripDialog`'s always-on map exists to avoid.

          Sized to match the tile credit drawn over that map, because the two
          sit within 8px of each other and fine print that disagrees with itself
          reads as a mistake. The size is load-bearing, not cosmetic: at 10px
          the credit holds one line on a 375px phone, where the old shape with
          its URL spelled out needed 341px against the 295px the dialog has.

          One line, joined, rather than a paragraph each: what the credit must
          do is name where the data came from, and a second credit is
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

// What a contact created from a part's accommodation picker starts as.
const ACCOMMODATION: readonly ContactRole[] = ["accommodation"];

interface TripPartRowProps {
  part: TripPartFormValue;
  index: number;
  total: number;
  error?: string;
  disabled?: boolean;
  isDragging: boolean;
  dragOffset: number;
  handleProps: ReturnType<typeof useDragSort>["handleProps"];
  setRef: (el: HTMLElement | null) => void;
  onChange: (index: number, changes: Partial<TripPartFormValue>) => void;
  onRemove: (index: number) => void;
  onAttributions: (credits: string[]) => void;
  onNotice: (notice: string | null) => void;
}

// One part: where it was and when. The place search lives in the row rather than
// once at the foot of the field, so that changing a part's place is an edit
// rather than a delete and a re-add - which, in an ordered list, would also move
// the part to the end.
function TripPartRow({
  part,
  index,
  total,
  error,
  disabled,
  isDragging,
  dragOffset,
  handleProps,
  setRef,
  onChange,
  onRemove,
  onAttributions,
  onNotice,
}: TripPartRowProps) {
  const fieldId = useId();
  // What each menu row would set the place to. Held in a ref rather than state
  // because nothing renders from it - the combobox hands back an id, and this is
  // what turns that id back into the object it came from.
  const resultsRef = useRef<Map<string, LocationFormValue>>(new Map());

  const errorId = `${fieldId}-error`;
  const location = part.location ?? null;
  const name = describeTripPart(part, index);
  // The fields are named by position rather than by `describeTripPart`, unlike
  // the row's buttons: they are what names a part, so naming them after it
  // would rename the control under the diver as they filled it in.
  const labelSuffix = `part ${index + 1} of ${total}`;
  // A place typed in by hand has no position, and `LocationsMap` draws only
  // what has one. Said out loud on the row, because the map below simply omits
  // it and an absence nobody explains reads as the map having missed a place.
  const isUnmapped =
    location != null &&
    (location.latitude == null || location.longitude == null);

  const searchPlaces = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      // Typed queries only. Focusing the field fires an empty search of its own,
      // and clearing on that would wipe a notice a few milliseconds after the
      // attempt that earned it.
      if (query) onNotice(null);
      const { items, locations, attributions } = mapSearchResults(
        await geocodingAPI.searchPlaces(query),
      );
      locations.forEach((place, id) => resultsRef.current.set(id, place));
      onAttributions(attributions);
      return { items };
    },
    [onAttributions, onNotice],
  );

  // The one path that sets a part's place: a picked row, a typed name the
  // combobox has just created, or `undefined` from its Clear button, which is
  // how a part that had a place goes back to being dates alone.
  //
  // It deliberately does not clear the notice. `onCreate` resolves *before* the
  // combobox reports the id back, so a clear here would wipe the "shortened"
  // line a few milliseconds after the paste that earned it. Typing clears it,
  // which is the diver having moved on.
  const setPickedPlace = (id: string | undefined) => {
    onChange(index, {
      location: id ? (resultsRef.current.get(id) ?? null) : null,
    });
  };

  // The unmatched-query escape hatch: a place with a name and nothing else.
  // Async only because `onCreate` is - there is nobody to ask about this one.
  //
  // Only ever from an explicit Enter: `commitOnEnterOnly` also tells the combobox
  // that leaving this field commits nothing at all, so clicking Save with a query
  // half typed doesn't file a place called "phil".
  const setTypedPlace = async (typed: string): Promise<ComboboxItem> => {
    // Truncated rather than rejected: a name this long is a paste, not a place,
    // and the alternative is a row the form then refuses to save.
    const trimmed = typed.trim();
    const place = { name: trimmed.slice(0, MAX_LOCATION_NAME_LENGTH) };
    const id = locationKey(place);
    // Registered rather than applied: the combobox reports the created id
    // straight back through `onChange`, and that is the one path that sets a
    // part's place, picked or typed.
    resultsRef.current.set(id, place);
    // Shortening a diver's text without a word is the same silence as refusing
    // it without one - they should see which of the two happened.
    onNotice(
      trimmed.length > MAX_LOCATION_NAME_LENGTH
        ? `Shortened to ${MAX_LOCATION_NAME_LENGTH} characters.`
        : null,
    );
    return { id, name: place.name };
  };

  return (
    <RepeatableRow
      as="li"
      ref={setRef}
      title={`Part ${index + 1}`}
      // Named by what the part holds, as in the sibling multiselects. The
      // handle's label carries its keyboard equivalent, since "drag to reorder"
      // alone is a dead end for keyboard users.
      removeLabel={`Remove ${name}`}
      onRemove={() => onRemove(index)}
      dragHandle={
        total > 1
          ? {
              label: `Reorder ${name}, position ${index + 1} of ${total}. Use arrow up and arrow down to move it.`,
              props: handleProps(index),
            }
          : undefined
      }
      disabled={disabled}
      className={cn(
        isDragging && "relative z-10 bg-background shadow-lg ring-2 ring-ring",
      )}
      // The dragged row is translated to follow the pointer; the rest stay put
      // and are simply re-ordered around it by React.
      style={
        isDragging ? { transform: `translateY(${dragOffset}px)` } : undefined
      }
    >
      <RepeatableRowField
        id={fieldId}
        label="Location"
        labelSuffix={labelSuffix}
      >
        <CreatableCombobox
          id={fieldId}
          onSearch={searchPlaces}
          searchDebounceMs={PLACE_SEARCH_DEBOUNCE_MS}
          // No `excludeIds`, deliberately: a trip that goes Dahab, then Sharm,
          // then back to Dahab names the same place in two parts, and hiding
          // it from the second menu would make that trip unrecordable.
          value={location ? locationKey(location) : undefined}
          // What the row holds was picked under some other query, or in an
          // earlier session entirely, so the current results rarely contain
          // it and the field would sit empty without this.
          selectedItem={
            location
              ? { id: locationKey(location), name: location.name }
              : undefined
          }
          onChange={setPickedPlace}
          onCreate={setTypedPlace}
          disabled={disabled}
          placeholder="Search for a place..."
          noItemsLabel="Type to search places."
          // What `searchPlaces` will actually ask about - a shorter query is
          // answered `[]` locally, and calling that "no places found" would be
          // reporting on a search that never happened.
          minSearchLength={MIN_PLACE_QUERY_LENGTH}
          maxSearchLength={MAX_PLACE_QUERY_LENGTH}
          // Not "type to search": there is already a paragraph in the field,
          // and the only thing left to do with it is add it as text.
          queryTooLongLabel="Too long to search - press Enter to add as text."
          // The two ways a search comes back empty are indistinguishable here
          // on purpose (the API answers a throttled provider with `[]` too),
          // and the same sentence is the right advice for both.
          noMatchesLabel="No places found - press Enter to add as text."
          // The third case: not "no such place", but no answer at all. Enter
          // still adds the typed text, which is the difference between a
          // failing geocoder costing a diver the display name and costing
          // them the place.
          searchErrorLabel="Couldn't reach the place search - press Enter to add as text."
          commitOnEnterOnly
        />
        {/* Not a warning - a typed-in place is a perfectly good answer - but
            the map below the field only draws what has a position, and its
            absence should be explained rather than read as the map having
            missed one. `LocationsMap` says this is where that explanation
            lives. */}
        {isUnmapped && (
          <p className="text-xs text-muted-foreground">Not on the map</p>
        )}
      </RepeatableRowField>

      {/* A contact made from here starts as a place to stay. */}
      <RepeatableRowField
        id={`${fieldId}-accommodation`}
        label="Accommodation"
        labelSuffix={labelSuffix}
      >
        <ContactCombobox
          id={`${fieldId}-accommodation`}
          value={part.accommodation_uuid ?? null}
          onChange={(accommodation_uuid) =>
            onChange(index, { accommodation_uuid })
          }
          initialRoles={ACCOMMODATION}
          placeholder="Select accommodation..."
          addNewLabel="Add accommodation..."
          disabled={disabled}
        />
      </RepeatableRowField>

      <div className="grid gap-4 sm:grid-cols-2">
        <RepeatableRowField
          id={`${fieldId}-start`}
          label="Start date"
          labelSuffix={labelSuffix}
        >
          <DatePicker
            id={`${fieldId}-start`}
            value={part.start_date ?? ""}
            onChange={(start_date) => onChange(index, { start_date })}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={!!error}
            disabled={disabled}
          />
        </RepeatableRowField>
        <RepeatableRowField
          id={`${fieldId}-end`}
          label="End date"
          labelSuffix={labelSuffix}
        >
          <DatePicker
            id={`${fieldId}-end`}
            value={part.end_date ?? ""}
            onChange={(end_date) => onChange(index, { end_date })}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={!!error}
            disabled={disabled}
          />
        </RepeatableRowField>
      </div>

      {/* On the row rather than once above the list. What the schema objects
          to is a part - an end before its start - and twenty rows under one
          message is a diver hunting for which. */}
      {error && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </RepeatableRow>
  );
}
