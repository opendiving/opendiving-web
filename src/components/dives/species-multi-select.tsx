"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, Loader2, X } from "lucide-react";
import {
  ComboboxItem,
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import { Attribution } from "@/components/attribution";
import { useToast } from "@/components/ui/use-toast";
import {
  MAX_SPECIES_QUERY_LENGTH,
  MIN_SPECIES_QUERY_LENGTH,
  speciesAPI,
  SpeciesSearchResponse,
  SpeciesSearchResult,
  SpeciesSummary,
} from "@/lib/api/species";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  speciesDisplayName,
  speciesRankLabel,
  speciesSecondaryName,
} from "@/lib/species";
import { moveItem, useDragSort } from "@/hooks/useDragSort";
import { cn } from "@/lib/utils";

// Menu-row id for a species that isn't in the catalog yet, and so has no uuid to
// be identified by. Picking one of these is what triggers a resolve; the prefix
// is what tells the two kinds of row apart in `onChange`, which only ever gets
// handed an id back.
//
// Deliberately not a bare number: form state holds uuids, and an id that could
// be mistaken for one is how a synthetic value ends up in a request body.
const PENDING_ID_PREFIX = "aphia:";

/** The menu-row id for an upstream species, keyed by its AphiaID. */
export function pendingSpeciesId(aphiaId: number): string {
  return `${PENDING_ID_PREFIX}${aphiaId}`;
}

/**
 * The AphiaID behind a menu-row id, or `null` when the id is a catalog uuid.
 *
 * The `null` is the branch that matters: it means "this species already exists
 * locally, append it as-is", which is the whole difference between a pick that
 * is instant and one that goes to WoRMS first.
 */
export function parsePendingSpeciesId(id: string): number | null {
  if (!id.startsWith(PENDING_ID_PREFIX)) return null;
  const aphiaId = Number(id.slice(PENDING_ID_PREFIX.length));
  return Number.isInteger(aphiaId) && aphiaId > 0 ? aphiaId : null;
}

export interface MappedSpecies {
  // Menu rows, in the order the API merged and ranked them.
  items: ComboboxItem[];
  // What each of those rows came from, by row id. The pending row a remote pick
  // creates is labelled from this, since the resolve it is waiting on is the
  // only other thing that knows the species' name.
  results: Map<string, SpeciesSearchResult>;
  // The results that are already catalog rows, ready to label a selection with.
  // Upstream-only results have no uuid and so nothing a label map could key on
  // until they are resolved.
  summaries: SpeciesSummary[];
  // The licence notices carried by these results, deduplicated.
  attributions: string[];
  hasMore: boolean;
}

/**
 * Turns a page of search results into what the menu and the picker need.
 *
 * Pure, and separate from the component, because this is the whole of the
 * mapping - everything else here is list plumbing and the resolve dance.
 *
 * The hint carries whichever fact the name doesn't. A row shown by its common
 * name is disambiguated by its binomial; a row shown by its binomial already is
 * one, so the rank is the useful thing to add ("Genus" tells the diver they are
 * about to log a whole genus). `matched_name` is appended on top of either
 * whenever it was some *other* name that matched, because otherwise a search for
 * "Manta birostris" returns a row reading *Mobula birostris* and nothing on
 * screen explains why - the accepted-taxon rule is invisible from the outside.
 *
 * Results sharing a row id are collapsed: two menu rows with the same React key
 * are both a warning and a row that can't be excluded once picked.
 */
export function mapSpeciesResults(
  response: SpeciesSearchResponse,
): MappedSpecies {
  const items: ComboboxItem[] = [];
  const results = new Map<string, SpeciesSearchResult>();
  const summaries: SpeciesSummary[] = [];
  const attributions: string[] = [];

  for (const result of response.results) {
    const id = result.uuid ?? pendingSpeciesId(result.aphia_id);
    if (!results.has(id)) {
      results.set(id, result);
      items.push({
        id,
        name: speciesDisplayName(result),
        hint: hintFor(result),
      });
      if (result.uuid) {
        summaries.push({
          uuid: result.uuid,
          scientific_name: result.scientific_name,
          common_name: result.common_name,
          rank: result.rank,
        });
      }
    }
    if (result.attribution && !attributions.includes(result.attribution)) {
      attributions.push(result.attribution);
    }
  }

  return {
    items,
    results,
    summaries,
    attributions,
    hasMore: response.has_more,
  };
}

function hintFor(result: SpeciesSearchResult): string | undefined {
  const parts: string[] = [];
  const context = result.common_name
    ? result.scientific_name
    : speciesRankLabel(result.rank);
  if (context) parts.push(context);
  const matched = result.matched_name?.trim();
  // Only when it says something the row doesn't already. The API nulls a hint
  // wherever a visible name already accounts for the *query*, which covers this
  // for as long as every `matched_name` is a name that matched - true today, and
  // a string comparison is cheaper than depending on it.
  const isRedundant =
    !matched ||
    equalsIgnoringCase(matched, result.scientific_name) ||
    equalsIgnoringCase(matched, result.common_name);
  if (!isRedundant) parts.push(`matched "${matched}"`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function equalsIgnoringCase(a: string, b: string | null): boolean {
  return b !== null && a.toLowerCase() === b.toLowerCase();
}

// A species picked from the menu that isn't a catalog row yet, while its resolve
// is in flight. Local state rather than form state on purpose - see the
// component's doc comment.
interface PendingSpecies {
  aphiaId: number;
  label: string;
}

export interface SpeciesMultiSelectProps extends FormControlSlotProps {
  // Ordered list of catalog uuids, in the order the diver listed them. Order is
  // presentation only here - unlike the dive site picker, where the first entry
  // is the dive's primary site - but it is preserved end to end, so a diver who
  // puts the manta first sees the manta first.
  value: string[];
  // Names for the species already in `value`, when the caller has them (the edit
  // form does: `Dive.species` carries them). Purely an optimization - any uuid
  // not covered here is fetched individually - but it saves a request per row on
  // the form that always has selections.
  knownSpecies?: SpeciesSummary[];
  onChange: (speciesUuids: string[]) => void;
  // Reports whether a pick is still being resolved into a catalog row, so the
  // form can stop a save from racing it. Without this the window is small but
  // the loss is silent: the diver picks a species, hits Save inside the second
  // or two the resolve takes, and the dive is written without the sighting -
  // the resolve then lands on a form that has already navigated away.
  onPendingChange?: (isPending: boolean) => void;
  disabled?: boolean;
}

/**
 * Lets the diver record what they saw, by searching a global catalog that is
 * backed live by WoRMS and Wikidata.
 *
 * Wraps the generic `CreatableCombobox` the way `DiveSiteMultiSelect` does (see
 * DECISIONS.md) - the combobox is the "add a species" input, with a
 * drag-sortable list of what's already added above it.
 *
 * The one thing this picker does that no other does: **a pick can require a
 * round trip before it has a value at all.** A species the catalog has never
 * seen exists only as an AphiaID upstream, and `POST /species/resolve` is what
 * turns it into a row. That resolve happens here, at pick time, and its result -
 * a real uuid - is what reaches form state. Nothing synthetic is ever put in
 * `value` for the submit path to trip over, and by the time a dive is saved
 * every uuid on it already exists, so saving never waits on a third party.
 *
 * What that costs is a moment where the diver has picked something the form does
 * not yet hold, which is what the pending rows are: local state, rendered with a
 * spinner, excluded from the menu so the same species can't be picked twice, and
 * dropped on either outcome.
 *
 * There is deliberately no "add a species we've never heard of" hatch, unlike
 * the trip location picker's free text. A global catalog has no owner to
 * attribute a made-up row to, and the dive's own notes field is where "weird
 * translucent blob, 10 cm" goes until it has a name.
 */
export function SpeciesMultiSelect({
  value,
  knownSpecies,
  onChange,
  onPendingChange,
  disabled,
  // Forwarded to the "add a species" combobox - the field's one focusable
  // control. The selected-species list above it is a `<ul>` of remove buttons,
  // which the label has nothing to say about.
  ...slotProps
}: SpeciesMultiSelectProps) {
  const { toast } = useToast();
  const [labels, setLabels] = useState<Record<string, SpeciesSummary>>({});
  const [pending, setPending] = useState<PendingSpecies[]>([]);
  // Kept for the session rather than cleared with each query: the credit is a
  // licence condition of data that has already been shown and, once picked, is
  // sitting in the list.
  const [attributions, setAttributions] = useState<string[]>([]);
  // Every uuid a single-species lookup has already been fired for, successful or
  // not.
  const requestedRef = useRef<Set<string>>(new Set());
  // What each menu row would add, by row id - the combobox hands back an id, and
  // this is what turns it back into the result it came from, so a pending row
  // can be labelled without waiting for the resolve it is waiting on.
  const resultsRef = useRef<Map<string, SpeciesSearchResult>>(new Map());
  // The current selection, readable from an async callback. Two resolves can be
  // in flight at once (the menu stays open, so the diver picks the second while
  // the first is still going), and `value` captured in a closure would be the
  // list as it stood when that pick was made - so the second arrival would drop
  // the first. Claimed eagerly on append rather than only mirrored, because both
  // can land before React has re-rendered either.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const isPending = pending.length > 0;
  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  // Read from a ref so the unmount report below can be a mount-only effect: with
  // `onPendingChange` in its dependencies, a caller passing an inline function would
  // make the cleanup run on every render and report `false` over a live resolve.
  const onPendingChangeRef = useRef(onPendingChange);
  useEffect(() => {
    onPendingChangeRef.current = onPendingChange;
  }, [onPendingChange]);

  // A picker that unmounts reports itself no longer pending, and there is no other
  // way for it to: the effect above only fires while this component is alive, so a
  // resolve in flight when the picker leaves the page left the card's
  // `isResolvingSpecies` stuck at true and the Save button reading "Adding
  // species..." until a reload. Reachable from the Fields panel - hide Species, or
  // apply a preset that does - which is what turned a leak nobody could trigger into
  // a wedged form.
  useEffect(() => {
    return () => onPendingChangeRef.current?.(false);
  }, []);

  const rememberLabels = useCallback((species: SpeciesSummary[]) => {
    if (species.length === 0) return;
    setLabels((prev) => {
      const next = { ...prev };
      species.forEach((entry) => (next[entry.uuid] = entry));
      return next;
    });
  }, []);

  const rememberAttributions = useCallback((credits: string[]) => {
    if (credits.length === 0) return;
    setAttributions((previous) => {
      const missing = credits.filter((credit) => !previous.includes(credit));
      return missing.length > 0 ? [...previous, ...missing] : previous;
    });
  }, []);

  // Read through the `knownSpecies` prop rather than copying it into `labels`
  // via an effect: the copy wouldn't have landed yet on the render that first
  // sees a selection, so the lookup below would fire for species the caller had
  // already handed over.
  const labelFor = (uuid: string): SpeciesSummary | undefined =>
    labels[uuid] ?? knownSpecies?.find((entry) => entry.uuid === uuid);

  // Resolve any selected species whose name isn't already known - the safety net
  // that keeps a selection from ever rendering nameless. A dive has a handful of
  // species at most, so these are one-off single-record fetches.
  useEffect(() => {
    const unresolved = value.filter(
      (uuid) =>
        !labels[uuid] &&
        !knownSpecies?.some((entry) => entry.uuid === uuid) &&
        !requestedRef.current.has(uuid),
    );
    if (unresolved.length === 0) return;

    // Marked before the request, not after: a failed lookup must not be retried
    // on every subsequent render, and this effect re-runs whenever `labels`
    // changes - i.e. after each sibling lookup that did succeed.
    //
    // That same guard is why there's no cancellation flag here: it makes each
    // uuid fetch exactly once, so under StrictMode's mount/unmount/remount the
    // only in-flight lookup belongs to the discarded first mount, and ignoring
    // its result would drop the name for good. Writing to a uuid-keyed map is
    // idempotent, so a late arrival is always safe to apply.
    unresolved.forEach((uuid) => requestedRef.current.add(uuid));

    unresolved.forEach(async (uuid) => {
      try {
        rememberLabels([await speciesAPI.getSpecies(uuid)]);
      } catch (error) {
        console.error("Failed to fetch species:", error);
      }
    });
  }, [value, labels, knownSpecies, rememberLabels]);

  const searchSpecies = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const {
        items,
        results,
        summaries,
        attributions: credits,
        hasMore,
      } = mapSpeciesResults(await speciesAPI.searchSpecies(query));
      // Accumulated across queries rather than replaced: the menu can hand back
      // a row from a list the next keystroke has already superseded.
      results.forEach((result, id) => resultsRef.current.set(id, result));
      rememberLabels(summaries);
      rememberAttributions(credits);
      return { items, hasMore };
    },
    [rememberLabels, rememberAttributions],
  );

  // Appends a uuid, claiming it in `valueRef` first so a sibling resolve landing
  // in the same tick appends to this list rather than the one before it.
  const appendUuid = (uuid: string) => {
    const current = valueRef.current;
    // The same species can be reached from two queries, and resolve is
    // idempotent server-side - so a stale menu row's second pick would otherwise
    // add the row it already added.
    if (current.includes(uuid)) return;
    const next = [...current, uuid];
    valueRef.current = next;
    onChange(next);
  };

  const addSpecies = (id: string | undefined) => {
    if (id === undefined) return;
    const aphiaId = parsePendingSpeciesId(id);
    if (aphiaId === null) {
      appendUuid(id);
      return;
    }
    resolveAndAdd(aphiaId, id);
  };

  const resolveAndAdd = async (aphiaId: number, rowId: string) => {
    const result = resultsRef.current.get(rowId);
    setPending((prev) =>
      prev.some((entry) => entry.aphiaId === aphiaId)
        ? prev
        : [
            ...prev,
            {
              aphiaId,
              // The fallback is only reachable if the menu handed back a row it
              // never returned, which it doesn't - but a nameless spinner would
              // be a worse way to find that out.
              label: result ? speciesDisplayName(result) : "Species...",
            },
          ],
    );
    try {
      const species = await speciesAPI.resolveSpecies(aphiaId);
      rememberLabels([species]);
      appendUuid(species.uuid);
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(error, "Couldn't add that species."),
        variant: "destructive",
      });
    } finally {
      setPending((prev) => prev.filter((entry) => entry.aphiaId !== aphiaId));
    }
  };

  const removeSpecies = (id: string) => onChange(value.filter((v) => v !== id));

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
    <div className="space-y-2">
      {(value.length > 0 || pending.length > 0) && (
        // Text selection would otherwise sweep across the rows mid-drag.
        <ul
          className={cn("space-y-1", draggingIndex !== null && "select-none")}
        >
          {value.map((id, index) => {
            const species = labelFor(id);
            // The fallback is only ever visible for the moment between a species
            // being selected and its name being resolved.
            const label = species ? speciesDisplayName(species) : "Species...";
            const binomial = species && speciesSecondaryName(species);
            const isDragging = draggingIndex === index;
            return (
              <li
                key={id}
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
                    aria-label={`Reorder ${label}, position ${index + 1} of ${value.length}. Use arrow up and arrow down to move it.`}
                    disabled={disabled}
                    className="shrink-0 cursor-grab rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                    {...handleProps(index)}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                )}
                <span className="flex-1 truncate">
                  {label}
                  {binomial && (
                    <span className="italic text-muted-foreground">
                      {" "}
                      {binomial}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  disabled={disabled}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => removeSpecies(id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}

          {/* Rows the diver has picked but the catalog doesn't hold yet. No drag
              handle and no remove button: there is nothing in form state to
              reorder or take out, and both would be gone again within a second
              or two anyway. */}
          {pending.map((entry) => (
            <li
              key={pendingSpeciesId(entry.aphiaId)}
              className="flex items-center gap-2 rounded-md border border-dashed bg-background px-2 py-1.5 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span className="flex-1 truncate">{entry.label}</span>
              <span className="sr-only">Adding</span>
            </li>
          ))}
        </ul>
      )}

      <CreatableCombobox
        {...slotProps}
        onSearch={searchSpecies}
        // Slower than the app's own pickers because two live third parties sit
        // behind this one - see DECISIONS.md ("The picker types more slowly than
        // the rest of the app, on purpose").
        searchDebounceMs={450}
        minSearchLength={MIN_SPECIES_QUERY_LENGTH}
        maxSearchLength={MAX_SPECIES_QUERY_LENGTH}
        queryTooLongLabel="That's too long to search for - try just the name."
        // Already-selected species are hidden so the same one can't be added
        // twice, and so are the ones being resolved: re-picking a pending row
        // would fire a second resolve for a species that is on its way in.
        excludeIds={[
          ...value,
          ...pending.map((entry) => pendingSpeciesId(entry.aphiaId)),
        ]}
        value={undefined}
        onChange={addSpecies}
        disabled={disabled}
        placeholder={
          value.length ? "Add another species..." : "Select a species..."
        }
        // No `onAddNew`/`onCreate`: there is no such thing as creating a species,
        // so committed text that matches nothing does nothing.
        noItemsLabel="Type a species name — common or scientific."
        noMatchesLabel="No species found."
        keepOpenOnSelect
      />

      {/* A licence condition of the data, so it is rendered wherever the results
          are - through `Attribution`, in case a provider's credit arrives as a
          markdown link the way the geocoder's does.

          Always mounted, with its one line of height reserved rather than
          `empty:hidden`: a credit that materialises with the first search would
          grow the field and shove Notes down the form while the diver is still
          typing into it. Sized and joined like the trip picker's, which is the
          same credit line in the same role. */}
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
