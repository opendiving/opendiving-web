"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
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

export interface ComboboxItem {
  id: string;
  name: string;
  // Secondary text shown after the name in the dropdown list (e.g. a dive
  // site's location, a gear item's type) - purely cosmetic, doesn't affect
  // matching/filtering.
  hint?: string;
}

export interface CreatableComboboxProps {
  items: ComboboxItem[];
  isLoading?: boolean;
  value?: string;
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
  noItemsLabel?: string;
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
  items,
  isLoading = false,
  value,
  onChange,
  onCreate,
  onAddNew,
  addNewLabel = "Add new...",
  placeholder = "Select or type a new name...",
  disabled,
  noItemsLabel = "No items.",
  keepOpenOnSelect = false,
}: CreatableComboboxProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Index of the keyboard-highlighted option, or -1 for none. Counts the
  // "Add new..." entry as option 0 when present, since it's a row in the menu
  // like any other and skipping it would make it unreachable by keyboard.
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  // Keep the displayed text in sync with the selected id whenever it changes
  // from outside (e.g. loading an existing record into the form), as long as
  // the user isn't actively editing the field.
  useEffect(() => {
    if (isOpen) return;
    // Deliberate sync-from-external-value pattern: `inputValue` doubles as both the
    // user's in-progress typed text (while open) and a mirror of the externally
    // selected `value` (once closed/committed), so it can't be purely derived during
    // render without losing in-progress edits.
    const match = items.find((item) => item.id === value);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputValue(match ? match.name : "");
  }, [value, items, isOpen]);

  const findExactMatch = (text: string) =>
    items.find((item) => item.name.toLowerCase() === text.trim().toLowerCase());

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(inputValue.trim().toLowerCase()),
  );

  // The menu's rows, in render order. `addNewOffset` is what maps a highlight
  // index onto either the "Add new..." row or an item.
  const addNewOffset = onAddNew ? 1 : 0;
  const optionCount = addNewOffset + filteredItems.length;

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
    if (activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleInputChange = (text: string) => {
    setInputValue(text);
    setIsOpen(true);
    // Typing re-filters the list, so a held-over index would point at a
    // different row than the one the user was looking at.
    setActiveIndex(-1);
    onChange(findExactMatch(text)?.id);
  };

  const handleSelect = (item: ComboboxItem) => {
    onChange(item.id);
    setActiveIndex(-1);

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
    const text = inputValue.trim();

    if (!text) {
      onChange(undefined);
      return;
    }

    const exactMatch = findExactMatch(text);
    if (exactMatch) {
      setInputValue(exactMatch.name);
      onChange(exactMatch.id);
      return;
    }

    if (!onCreate) {
      // No inline creator — leave the selection unchanged and let the
      // "Add…" button be the only way to create a new item.
      onChange(undefined);
      return;
    }

    try {
      setIsSaving(true);
      const created = await onCreate(text);
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
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        // Points a screen reader at the keyboard-highlighted row without moving
        // real focus off the input.
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined
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
                current,
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
            if (isOpen && activeIndex >= 0) {
              if (onAddNew && activeIndex === 0) {
                openAddNew();
              } else {
                handleSelect(filteredItems[activeIndex - addNewOffset]);
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
      {isSaving && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {!isSaving && value !== undefined && !disabled && !isLoading && (
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
              aria-selected={activeIndex === 0}
              ref={(el) => {
                optionRefs.current[0] = el;
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent hover:text-accent-foreground flex items-center gap-1.5 border-b",
                activeIndex === 0 && "bg-accent text-accent-foreground",
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
                  aria-selected={optionIndex === activeIndex}
                  ref={(el) => {
                    optionRefs.current[optionIndex] = el;
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                    item.id === value && "bg-accent/50",
                    optionIndex === activeIndex &&
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
              {noItemsLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
