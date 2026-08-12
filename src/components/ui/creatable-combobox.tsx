"use client";

import { useEffect, useId, useRef, useState } from "react";
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
export function searchDelayMs(query: string): number {
  return query ? SEARCH_DEBOUNCE_MS : 0;
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
  if (isRemote && searchedQuery !== trimmed) return { type: "keep" };

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
  // For pickers that append to a list rather than filling a single field
  // (`DiveSiteMultiSelect`, `GearItemMultiSelect`): keep the menu up after a
  // pick and clear the typed filter, so several items can be added in a row.
  // Single-value callers leave this off - once they have their one value, the
  // menu closing and the input showing the chosen name is the right outcome.
  keepOpenOnSelect?: boolean;
}

// A generic combobox that lets the user pick an existing item by typing to
// filter, or create a new one on the fly by typing a name that doesn't match
// anything and committing it (blur / Enter). Used for both the trip and dive
// site pickers in the dive form.
export function CreatableCombobox({
  items = NO_ITEMS,
  onSearch,
  excludeIds,
  isLoading = false,
  value,
  selectedItem,
  onChange,
  onCreate,
  onAddNew,
  addNewLabel = "Add new...",
  placeholder = "Select or type a new name...",
  disabled,
  noItemsLabel = "No items.",
  noMatchesLabel,
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
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await onSearchRef.current!(query);
        // A slower earlier request must not overwrite a newer one's results.
        if (!cancelled) {
          setRemoteResult(result);
          setSearchedQuery(query);
        }
      } catch (error) {
        console.error("Failed to search items:", error);
        // `searchedQuery` is deliberately *not* updated here. An empty list from a
        // failed request must not be read as "nothing matches" - that would let a
        // network blip clear the diver's trip on the next blur.
        if (!cancelled) setRemoteResult({ items: [] });
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, searchDelayMs(query));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isRemote, isOpen, inputValue]);

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

  const commit = async () => {
    const action = commitAction({
      text: inputValue,
      availableItems,
      isRemote,
      searchedQuery,
      selectedName: findSelected()?.name,
      canCreate: Boolean(onCreate),
    });

    if (action.type === "keep") return;

    if (action.type === "clear") {
      onChange(undefined);
      return;
    }

    if (action.type === "select") {
      setInputValue(action.item.name);
      onChange(action.item.id);
      return;
    }

    try {
      setIsSaving(true);
      const created = await onCreate!(action.name);
      setInputValue(created.name);
      onChange(created.id);
    } catch (error) {
      console.error("Failed to create item:", error);
      onChange(undefined);
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
          closeMenu();
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
          <button
            type="button"
            aria-label="Clear"
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
              {isSearching
                ? "Searching..."
                : inputValue.trim()
                  ? (noMatchesLabel ?? noItemsLabel)
                  : noItemsLabel}
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
