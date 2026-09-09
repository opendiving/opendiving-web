"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconTooltip } from "@/components/ui/tooltip";
import { Loader2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FormControlSlotProps } from "@/components/ui/form";
import { cn } from "@/lib/utils";

// Where Up/Down moves the highlight, given the current position and how many
// options are on offer.
//
// `-1` means "nothing highlighted", which is the state the menu opens in: Enter
// then keeps its old meaning of committing whatever was typed, rather than
// silently picking whichever option happened to be first. From there Down goes
// to the top of the list and Up to the bottom, so either key gets you moving.
// Movement clamps rather than wrapping - running off the end of a long list and
// silently reappearing at the other end is disorienting.
export function nextActiveIndex(
  current: number,
  delta: 1 | -1,
  count: number,
): number {
  if (count === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + delta));
}

// Keeps a highlight from outliving the row it pointed at.
//
// `activeIndex` is clamped when it *moves*, but the option list can also shrink
// underneath it: a debounced remote search narrowing, or a sibling pick changing
// `excludeIds`. Enter then indexed past the end of `filteredItems` and called
// `handleSelect(undefined)`, which threw.
//
// Out-of-range collapses to -1 ("nothing highlighted") rather than clamping to the
// last row. The row the user was looking at is gone either way, and -1 gives Enter
// its other, safe meaning - commit the typed text - instead of silently picking
// whichever unrelated option now sits at that index.
export function clampActiveIndex(current: number, count: number): number {
  return current >= count ? -1 : current;
}

export interface ComboboxItem {
  id: string;
  name: string;
  // Secondary text shown after the name in the dropdown list (e.g. a dive
  // site's location, a gear item's type) - purely cosmetic, doesn't affect
  // matching/filtering.
  hint?: string;
}

export interface ComboboxSearchResult {
  items: ComboboxItem[];
  // True when the server had more matches than it returned, so the menu can say
  // so instead of letting a truncated list read as "that's everything".
  hasMore?: boolean;
}

// How long to wait after the last keystroke before asking the server, in remote
// mode. Long enough that typing a site name is one request rather than ten,
// short enough not to feel laggy.
const SEARCH_DEBOUNCE_MS = 250;

// The debounce doesn't apply to the empty query the menu fires on open - there
// was no keystroke to coalesce, and waiting a quarter second before the list
// appears is exactly the lag the remote mode was meant to remove.
//
// `debounceMs` is how a picker whose backend is stricter than our own API asks
// for a longer wait: the geocoding proxy sits behind a provider-wide one request
// a second, so the trip location picker types more slowly on purpose.
export function searchDelayMs(
  query: string,
  debounceMs: number = SEARCH_DEBOUNCE_MS,
): number {
  return query ? debounceMs : 0;
}

// The options the menu actually shows.
//
// `alreadyFiltered` is set in remote mode, where the server has applied the
// query already: re-filtering here would drop the matches it found on a
// *secondary* field (a dive site's location, say) rather than the name, which
// is the whole point of searching server-side.
export function visibleItems({
  items,
  query,
  alreadyFiltered,
  excludeIds,
}: {
  items: ComboboxItem[];
  query: string;
  alreadyFiltered: boolean;
  excludeIds?: string[];
}): ComboboxItem[] {
  const needle = query.trim().toLowerCase();
  return items.filter(
    (item) =>
      !excludeIds?.includes(item.id) &&
      (alreadyFiltered || item.name.toLowerCase().includes(needle)),
  );
}

// What committing the input's text should do. Pulled out as a pure function
// because this is where a tab through the Trip field silently dropped the dive's
// trip, and the decision is much easier to pin down in a test than in a blur
// handler.
export type CommitAction =
  | { type: "keep" }
  | { type: "clear" }
  | { type: "select"; item: ComboboxItem }
  | { type: "create"; name: string };

export function commitAction({
  text,
  availableItems,
  isRemote,
  searchedQuery,
  selectedName,
  canCreate,
  createWithoutSearch = false,
}: {
  text: string;
  availableItems: ComboboxItem[];
  isRemote: boolean;
  // The query `availableItems` actually answers, in remote mode. `null` until a
  // search has resolved - which, on a field the user tabs straight through, is
  // still the case at blur.
  searchedQuery: string | null;
  // Name of the item currently selected, if any.
  selectedName?: string;
  canCreate: boolean;
  // Remote mode: whether this commit may create from a query the server has not
  // answered - because it failed, or because it is still in flight. See below.
  createWithoutSearch?: boolean;
}): CommitAction {
  const trimmed = text.trim();
  if (!trimmed) return { type: "clear" };

  const exactMatch = availableItems.find(
    (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exactMatch) return { type: "select", item: exactMatch };

  // Nothing matched - but in remote mode "nothing matched" is only *evidence* of
  // anything once the server has answered this exact query. Before that,
  // `availableItems` is an empty list that means "we haven't asked yet", and
  // treating it as "no such trip exists" is what cleared the field. A failed
  // search leaves `searchedQuery` untouched for the same reason: a 500 is not a
  // statement that the trip is gone.
  if (isRemote && searchedQuery !== trimmed) {
    // Except where there is no loaded value for a blip to clear. In an
    // append-only multi-select the only thing refusing can protect is nothing,
    // while the cost is real: the text is dropped and the field cleared, so a
    // diver whose search failed - or who simply pressed Enter inside the 450 ms
    // debounce, typing a place they already know the geocoder has never heard of
    // - loses what they typed with nothing said about it. The caller opts into
    // this, because it is only safe for a field that appends.
    if (!(createWithoutSearch && canCreate)) return { type: "keep" };
    return { type: "create", name: trimmed };
  }

  // The text still reads as whatever is selected. Nothing was edited, so there is
  // nothing to commit - and definitely nothing to clear.
  if (selectedName && trimmed.toLowerCase() === selectedName.toLowerCase()) {
    return { type: "keep" };
  }

  // Genuinely unmatched text. With an inline creator that means a new item; without
  // one, the "Add..." button is the only way to create, so the selection is dropped
  // rather than silently keeping a name the input no longer shows.
  return canCreate ? { type: "create", name: trimmed } : { type: "clear" };
}

// What an empty menu says, which is four different things and easy to get wrong
// by one branch - pulled out as a pure function because the ordering is the
// whole of it, and every ordering that has been wrong here talked a diver into
// acting on a claim the app had not checked.
//
// The length check comes first but only for a query that exists: an *empty*
// query is a real search for every remote field but the place picker (it is what
// fills the initial list), so folding it in here made opening the Trip, Dive Site
// and Gear pickers announce "No trips yet." for the whole round trip - and
// swallowed the search-is-down message if that first request failed.
export function emptyMenuLabel({
  query,
  minSearchLength,
  maxSearchLength,
  searchFailed,
  isBusy,
  noItemsLabel,
  noMatchesLabel,
  queryTooLongLabel,
  searchErrorLabel,
}: {
  // Already trimmed.
  query: string;
  minSearchLength: number;
  maxSearchLength: number;
  searchFailed: boolean;
  // Debounce or request - either way, no answer about this query yet.
  isBusy: boolean;
  noItemsLabel: string;
  noMatchesLabel?: string;
  queryTooLongLabel?: string;
  searchErrorLabel: string;
}): string {
  // Typed, but outside what the search can be asked - so it never was. The two
  // ends need different sentences even though they share a cause: "type to
  // search" is the right nudge for one character and nonsense for a pasted
  // paragraph, where the field is anything but empty.
  if (query && query.length > maxSearchLength) {
    return queryTooLongLabel ?? noItemsLabel;
  }
  if (query && query.length < minSearchLength) return noItemsLabel;
  if (searchFailed) return searchErrorLabel;
  if (isBusy) return "Searching...";
  // An answer, at last: nothing matched what was typed, or the field is empty
  // and the list itself is.
  return query ? (noMatchesLabel ?? noItemsLabel) : noItemsLabel;
}

// Stable identity for the default `items`, so the sync-from-`value` effect below
// doesn't re-run on every render of a remote-mode combobox that passes none.
const NO_ITEMS: ComboboxItem[] = [];

export interface CreatableComboboxProps extends FormControlSlotProps {
  // The full option list, filtered in the browser as the user types. Omit when
  // passing `onSearch` instead.
  items?: ComboboxItem[];
  // Remote mode: called with the typed text (debounced, and once with "" when the
  // menu opens) to fetch matching options from the server, instead of filtering
  // `items` locally. Use this wherever the full list is too big to ship to the
  // browser - see `DiveSiteMultiSelect`.
  onSearch?: (query: string) => Promise<ComboboxSearchResult>;
  // How long to wait after the last keystroke before calling `onSearch`.
  // Defaults to the 250 ms that suits our own list endpoints; raise it for a
  // search that reaches a rate-limited third party.
  searchDebounceMs?: number;
  // Ids to leave out of the menu, e.g. items a multi-select has already picked.
  // Applied after fetching/filtering rather than by the caller's `onSearch`, so
  // a pick removes its row immediately instead of waiting for the next query.
  excludeIds?: string[];
  isLoading?: boolean;
  value?: string;
  // The option behind `value`, for a remote-mode single-select. Its own results
  // only cover what the current query matched, so without this the input would
  // sit empty for a selection loaded from the form (an existing dive's trip)
  // rather than picked in this session.
  selectedItem?: ComboboxItem;
  onChange: (id: string | undefined) => void;
  // The text in the field, reported whenever it changes. For a caller that has
  // to tell "nothing chosen" apart from "half-typed": `value` alone cannot,
  // because typing clears the selection (see `handleInputChange`), so a diver
  // mid-word and a diver who chose nothing look identical from outside.
  onTextChange?: (text: string) => void;
  // When provided, shows an "Add…" footer item in the dropdown that calls this
  // instead of the inline create-on-enter flow.
  onAddNew?: () => void;
  addNewLabel?: string;
  // Legacy inline create: called when committed text doesn't match any item.
  // Omit when using onAddNew instead.
  onCreate?: (name: string) => Promise<ComboboxItem>;
  placeholder?: string;
  disabled?: boolean;
  // Shown when the menu is empty and nothing has been typed ("No dive sites
  // yet.") - i.e. the user genuinely has none.
  noItemsLabel?: string;
  // Shown when the menu is empty but a query *has* been typed. Defaults to
  // `noItemsLabel`, which reads as a lie once the list is server-filtered:
  // "no dive sites yet" and "none matching 'dahab'" are different answers.
  noMatchesLabel?: string;
  // The shortest query this field's search can actually answer. Below it the
  // menu keeps saying `noItemsLabel` ("Type to search places.") rather than
  // `noMatchesLabel`, which would be asserting a negative nobody checked: the
  // geocode endpoint refuses a one-character `q`, so `searchPlaces` answers `[]`
  // locally without asking, and "No places found" is a claim about a search that
  // never ran.
  minSearchLength?: number;
  // And the longest, which has the same short-circuit at the other end: the
  // geocode endpoint refuses a `q` over 200 characters, so a pasted paragraph is
  // answered `[]` without a request and is no more "no places found" than a
  // single letter is.
  maxSearchLength?: number;
  // Shown instead of `noItemsLabel` when the query is past `maxSearchLength`.
  // Its own sentence because the two ends of the range need opposite advice.
  queryTooLongLabel?: string;
  // Shown when the menu is empty because the search *failed*, which is a third
  // answer and not a flavour of the other two: nothing is known about the query
  // either way. Defaults to saying so generically. A field that also passes
  // `onCreate` and `keepOpenOnSelect` can still commit typed text in this state,
  // so its own label should say that.
  searchErrorLabel?: string;
  // For pickers that append to a list rather than filling a single field
  // (`DiveSiteMultiSelect`, `GearItemMultiSelect`): keep the menu up after a
  // pick and clear the typed filter, so several items can be added in a row.
  // Single-value callers leave this off - once they have their one value, the
  // menu closing and the input showing the chosen name is the right outcome.
  //
  // It also decides how `onCreate` is reached: an append-only field creates from
  // typed text on Enter only, never on blur. See `commit`.
  keepOpenOnSelect?: boolean;
}

// A generic combobox that lets the user pick an existing item by typing to
// filter, or create a new one on the fly by typing a name that doesn't match
// anything and committing it (blur / Enter). Used for both the trip and dive
// site pickers in the dive form.
export function CreatableCombobox({
  items = NO_ITEMS,
  onSearch,
  searchDebounceMs,
  excludeIds,
  isLoading = false,
  value,
  selectedItem,
  onChange,
  onTextChange,
  onCreate,
  onAddNew,
  addNewLabel = "Add new...",
  placeholder = "Select or type a new name...",
  disabled,
  noItemsLabel = "No items.",
  noMatchesLabel,
  minSearchLength = 1,
  maxSearchLength = Infinity,
  queryTooLongLabel,
  searchErrorLabel = "Search is unavailable right now.",
  keepOpenOnSelect = false,
  // Forwarded to the text input rather than the wrapper, so `FormLabel`'s
  // `htmlFor` lands on the thing that actually takes focus.
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: CreatableComboboxProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Index of the keyboard-highlighted option, or -1 for none. Counts the
  // "Add new..." entry as option 0 when present, since it's a row in the menu
  // like any other and skipping it would make it unreachable by keyboard.
  const [activeIndex, setActiveIndex] = useState(-1);
  // Remote mode only: the last page of matches the server returned, and whether
  // it held more back.
  const [remoteResult, setRemoteResult] = useState<ComboboxSearchResult>({
    items: [],
  });
  // The query `remoteResult` actually answers. Null until a search resolves, which
  // is what lets `commitAction` tell "the server says there is no such trip" apart
  // from "we never asked" - the two used to be the same empty list.
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  // The query whose search threw, or null if the last one to finish came back
  // fine. A query rather than a flag, and for the same reason `searchedQuery` is
  // one: an answer - including "we couldn't ask" - is only ever about the text
  // it was asked for. Held as a flag, a failure would still be on screen while
  // the diver typed something else, telling them the geocoder was down for a
  // query nobody had tried yet, and letting Enter file a name-only location on
  // the strength of it.
  const [failedQuery, setFailedQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Remembers what was picked, so remote mode can still show the selected item's
  // name in the input once it has dropped out of the current search results.
  const lastSelectedRef = useRef<ComboboxItem | null>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const availableItems = onSearch ? remoteResult.items : items;

  // Held in a ref so that a caller passing an inline arrow function - the
  // obvious thing to write - doesn't restart the search on every render.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });
  const isRemote = Boolean(onSearch);

  // Ask the server for matches while the menu is open, restarting the timer on
  // every keystroke. Opening the menu runs it once with an empty query, which is
  // what fills the initial (unfiltered, server-truncated) list.
  useEffect(() => {
    if (!isRemote || !isOpen) return;

    let cancelled = false;
    const query = inputValue.trim();
    const timer = setTimeout(
      async () => {
        setIsSearching(true);
        try {
          const result = await onSearchRef.current!(query);
          // A slower earlier request must not overwrite a newer one's results.
          if (!cancelled) {
            setRemoteResult(result);
            setSearchedQuery(query);
            setFailedQuery(null);
          }
        } catch (error) {
          console.error("Failed to search items:", error);
          // `searchedQuery` is deliberately *not* updated here. An empty list from a
          // failed request must not be read as "nothing matches" - that would let a
          // network blip clear the diver's trip on the next blur.
          if (!cancelled) {
            setRemoteResult({ items: [] });
            setFailedQuery(query);
          }
        } finally {
          if (!cancelled) setIsSearching(false);
        }
      },
      searchDelayMs(query, searchDebounceMs),
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isRemote, isOpen, inputValue, searchDebounceMs]);

  // Keep the displayed text in sync with the selected id whenever it changes
  // from outside (e.g. loading an existing record into the form), as long as
  // the user isn't actively editing the field.
  // The option behind `value`, wherever it can be found. In remote mode the current
  // results rarely contain it - it was picked under a different query, or never
  // appeared in one at all because it came from the form - so all three fallbacks
  // matter.
  //
  // A function rather than a value computed during render: it reads
  // `lastSelectedRef`, and refs may only be read from effects and event handlers,
  // which is exactly where its two callers live.
  const findSelected = () =>
    availableItems.find((item) => item.id === value) ??
    (selectedItem?.id === value ? selectedItem : null) ??
    (lastSelectedRef.current?.id === value ? lastSelectedRef.current : null);

  // Whether the text *currently* in the field is one the search couldn't answer,
  // which is what the empty menu says so. Derived, so a new query silently drops
  // the previous one's failure the moment it differs, without an effect to keep
  // in step - the alternative reports an outage for a query nobody has tried.
  const searchFailed =
    failedQuery !== null && failedQuery === inputValue.trim();

  // Whether the text in the field is still waiting on an answer - which covers
  // the debounce as well as the request, and `isSearching` does not: that only
  // goes up once the timer fires, so for the first 450 ms of a trip location
  // search the menu was falling through to "No places found - press Enter to add
  // as text", inviting a diver to file "Bohol" as name-only text for a place the
  // geocoder knows perfectly well. Same mistake as reporting on a query too
  // short to send, arriving one branch further along.
  const searchPending = isRemote && searchedQuery !== inputValue.trim();

  useEffect(() => {
    if (isOpen) return;
    // Deliberate sync-from-external-value pattern: `inputValue` doubles as both the
    // user's in-progress typed text (while open) and a mirror of the externally
    // selected `value` (once closed/committed), so it can't be purely derived during
    // render without losing in-progress edits.
    const match =
      availableItems.find((item) => item.id === value) ??
      (selectedItem?.id === value ? selectedItem : null) ??
      (lastSelectedRef.current?.id === value ? lastSelectedRef.current : null);
    setInputValue(match ? match.name : "");
  }, [value, availableItems, selectedItem, isOpen]);

  // One effect rather than a call beside each `setInputValue`: the field's text
  // is written from six places (typing, a picked row, a blur commit, a create, the
  // Clear button, the sync above) and a caller watching it must not miss one.
  useEffect(() => {
    onTextChange?.(inputValue);
  }, [inputValue, onTextChange]);

  const findExactMatch = (text: string) =>
    availableItems.find(
      (item) => item.name.toLowerCase() === text.trim().toLowerCase(),
    );

  const filteredItems = visibleItems({
    items: availableItems,
    query: inputValue,
    alreadyFiltered: isRemote,
    excludeIds,
  });

  // The menu's rows, in render order. `addNewOffset` is what maps a highlight
  // index onto either the "Add new..." row or an item.
  const addNewOffset = onAddNew ? 1 : 0;
  const optionCount = addNewOffset + filteredItems.length;
  // Re-clamped every render, because the list can shrink under a stationary
  // highlight - see `clampActiveIndex`. Everything below reads this, never the raw
  // state, so a stale index can't reach `filteredItems[...]`.
  const activeOption = clampActiveIndex(activeIndex, optionCount);

  const closeMenu = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const openAddNew = () => {
    closeMenu();
    onAddNew?.();
  };

  // Keep the highlighted row scrolled into view; the menu is only 15rem tall,
  // so arrowing down a long list would otherwise walk off the bottom of it.
  useEffect(() => {
    if (activeOption < 0) return;
    optionRefs.current[activeOption]?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  const handleInputChange = (text: string) => {
    setInputValue(text);
    setIsOpen(true);
    // Typing re-filters the list, so a held-over index would point at a
    // different row than the one the user was looking at.
    setActiveIndex(-1);
    // Typing is not choosing. In a single-select this is how you pick without a
    // mouse - the match fills the one field, and an edit that no longer matches
    // clears it - but in an append-only field `onChange` *appends a row*, so the
    // same line files a place the diver was still typing past: "Bohol" on the
    // way to "Bohol Sea" is added the moment the "l" lands, and stays. Rows here
    // come from a click or Enter, and from nothing else.
    if (keepOpenOnSelect) return;
    const exactMatch = findExactMatch(text);
    onChange(exactMatch?.id);
  };

  const handleSelect = (item: ComboboxItem) => {
    onChange(item.id);
    setActiveIndex(-1);
    lastSelectedRef.current = item;

    if (keepOpenOnSelect) {
      // The item has moved into the list above, so drop the typed filter and
      // leave the menu up ready for the next pick. Without this the menu closed
      // while the input kept focus - and since only a `focus` event opened it,
      // clicking the already-focused input did nothing, forcing a click-away
      // and click-back to add a second item.
      setInputValue("");
      setIsOpen(true);
      inputRef.current?.focus();
      return;
    }

    setInputValue(item.name);
    setIsOpen(false);
  };

  // Whether the commit in flight came from a deliberate Enter rather than focus
  // merely leaving. Set immediately before the Enter handler's `blur()`, which
  // dispatches synchronously, so `commit` reads it in the same tick.
  const committedByEnterRef = useRef(false);

  // Puts an append-only field back the way `handleSelect` leaves it after a
  // picked row: filter cleared, menu up, cursor in the input, ready for the next
  // place. A committed row gets here by a longer road - Enter has to blur to
  // reach `commit` at all - and without this the diver who typed one location
  // ends up with focus on `<body>`, a closed menu, and a click needed before
  // they can type the second. Tab from there restarts at the top of the dialog.
  const readyForNext = () => {
    if (!keepOpenOnSelect) return;
    setIsOpen(true);
    inputRef.current?.focus();
  };

  // Only ever reached from a blur that is allowed to commit - which for an
  // append-only field means one Enter caused. See `onBlur`.
  const commit = async () => {
    const action = commitAction({
      text: inputValue,
      availableItems,
      isRemote,
      searchedQuery,
      selectedName: findSelected()?.name,
      canCreate: Boolean(onCreate),
      // An append-only field only gets here on a deliberate Enter, and that is
      // answer enough on its own: whether the query failed or is still in
      // flight, the alternative is silently discarding what the diver typed.
      createWithoutSearch: keepOpenOnSelect,
    });

    if (action.type === "keep") return;

    if (action.type === "clear") {
      onChange(undefined);
      // Including here, which is the Enter-on-an-empty-field case: pressed out
      // of habit after adding a place, it would otherwise close the menu and
      // drop focus to `<body>` - precisely what `readyForNext` exists to stop,
      // reached by the one branch that used to return before calling it.
      readyForNext();
      return;
    }

    if (action.type === "select") {
      setInputValue(keepOpenOnSelect ? "" : action.item.name);
      onChange(action.item.id);
      readyForNext();
      return;
    }

    try {
      setIsSaving(true);
      const created = await onCreate!(action.name);
      // For a multi-select the created item has moved into the list above, so
      // the input is a filter and belongs empty - and this is the one path that
      // fills it back in behind the component's own back: closing the menu
      // clears the input synchronously, then this resolution lands a render or
      // two later and writes the name into a field the user is done with.
      setInputValue(keepOpenOnSelect ? "" : created.name);
      onChange(created.id);
      readyForNext();
    } catch (error) {
      console.error("Failed to create item:", error);
      onChange(undefined);
      // The field is still where the diver is working, failure or not - and a
      // creator that can actually fail is only a matter of time: today's one is
      // async purely to satisfy the signature.
      readyForNext();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        // Points a screen reader at the keyboard-highlighted row without moving
        // real focus off the input.
        aria-activedescendant={
          isOpen && activeOption >= 0 ? optionId(activeOption) : undefined
        }
        placeholder={placeholder}
        value={inputValue}
        disabled={disabled || isLoading}
        className={cn(value !== undefined && "pr-7")}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        // Focus alone isn't enough: a `focus` event doesn't fire on an input
        // that already has focus, so any path that closes the menu while
        // keeping focus (picking an item, Escape, a dialog restoring focus)
        // would otherwise leave it unopenable without clicking away first.
        onClick={() => setIsOpen(true)}
        onBlur={() => {
          const byEnter = committedByEnterRef.current;
          committedByEnterRef.current = false;
          closeMenu();
          // For an append-only field, leaving the field does nothing but close
          // the menu - no create, and no exact-match select either. Blur
          // committing suits a single-select, where the typed text *is* the
          // value and dropping it would lose the edit; here every row is added
          // by a deliberate act (a click, or Enter), so a diver who clicks Save
          // with a half-typed query gets what they can see, not a place they
          // never chose. `handleSelect` and Enter are the only ways in.
          if (keepOpenOnSelect && !byEnter) return;
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            // Stop the caret jumping to the start/end of the text while the
            // same keys are driving the menu.
            e.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              return;
            }
            setActiveIndex((current) =>
              nextActiveIndex(
                clampActiveIndex(current, optionCount),
                e.key === "ArrowDown" ? 1 : -1,
                optionCount,
              ),
            );
            return;
          }

          if (e.key === "Enter") {
            e.preventDefault();
            // With a row highlighted, Enter takes it. With nothing highlighted
            // Enter keeps its original meaning: commit the typed text, which is
            // what matches an exactly-typed name (or creates one via onCreate).
            if (isOpen && activeOption >= 0) {
              if (onAddNew && activeOption === 0) {
                openAddNew();
              } else {
                handleSelect(filteredItems[activeOption - addNewOffset]);
              }
              return;
            }
            committedByEnterRef.current = true;
            inputRef.current?.blur();
            return;
          }

          if (e.key === "Escape") {
            closeMenu();
            inputRef.current?.blur();
          }
        }}
      />
      {(isSaving || isSearching) && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {!isSaving &&
        !isSearching &&
        value !== undefined &&
        !disabled &&
        !isLoading && (
          <IconTooltip label="Clear">
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setInputValue("");
                onChange(undefined);
                inputRef.current?.focus();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
        )}
      {isOpen && !isLoading && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-60 overflow-auto"
        >
          {onAddNew && (
            <button
              type="button"
              id={optionId(0)}
              role="option"
              aria-selected={activeOption === 0}
              ref={(el) => {
                optionRefs.current[0] = el;
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent hover:text-accent-foreground flex items-center gap-1.5 border-b",
                activeOption === 0 && "bg-accent text-accent-foreground",
              )}
              // Prevent the input's onBlur from firing before this click is registered.
              onMouseDown={(e) => e.preventDefault()}
              // Keep the highlight under the mouse, so switching between mouse
              // and keyboard mid-list doesn't leave two rows looking active.
              onMouseEnter={() => setActiveIndex(0)}
              onClick={openAddNew}
            >
              <Plus className="h-3.5 w-3.5" />
              {addNewLabel}
            </button>
          )}
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => {
              const optionIndex = index + addNewOffset;
              return (
                <button
                  key={item.id}
                  type="button"
                  id={optionId(optionIndex)}
                  role="option"
                  aria-selected={optionIndex === activeOption}
                  ref={(el) => {
                    optionRefs.current[optionIndex] = el;
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                    item.id === value && "bg-accent/50",
                    optionIndex === activeOption &&
                      "bg-accent text-accent-foreground",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(optionIndex)}
                  onClick={() => handleSelect(item)}
                >
                  {item.name}
                  {item.hint && (
                    <span className="text-muted-foreground">, {item.hint}</span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {emptyMenuLabel({
                query: inputValue.trim(),
                minSearchLength,
                maxSearchLength,
                searchFailed,
                isBusy: isSearching || searchPending,
                noItemsLabel,
                noMatchesLabel,
                queryTooLongLabel,
                searchErrorLabel,
              })}
            </div>
          )}
          {remoteResult.hasMore && (
            // Without this a truncated page reads as "that's everything you
            // have", and the missing site looks like it was never logged.
            <div className="border-t px-3 py-2 text-xs text-muted-foreground">
              More matches than shown - keep typing to narrow.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
