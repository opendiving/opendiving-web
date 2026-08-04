"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  id: string;
  name: string;
  // Shown alongside the name in the dropdown list (e.g. a dive site's
  // location) - purely cosmetic, doesn't affect matching/filtering.
  location?: string;
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
}: CreatableComboboxProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleInputChange = (text: string) => {
    setInputValue(text);
    setIsOpen(true);
    onChange(findExactMatch(text)?.id);
  };

  const handleSelect = (item: ComboboxItem) => {
    setInputValue(item.name);
    onChange(item.id);
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
        placeholder={placeholder}
        value={inputValue}
        disabled={disabled || isLoading}
        className={cn(value !== undefined && "pr-7")}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          setIsOpen(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
          }
          if (e.key === "Escape") {
            setIsOpen(false);
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
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-60 overflow-auto">
          {onAddNew && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent hover:text-accent-foreground flex items-center gap-1.5 border-b"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setIsOpen(false);
                onAddNew();
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {addNewLabel}
            </button>
          )}
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                  item.id === value && "bg-accent/50",
                )}
                // Prevent the input's onBlur from firing before this click is registered.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(item)}
              >
                {item.name}
                {item.location && (
                  <span className="text-muted-foreground">
                    , {item.location}
                  </span>
                )}
              </button>
            ))
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
