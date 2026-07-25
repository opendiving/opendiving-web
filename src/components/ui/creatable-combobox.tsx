"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  id: number;
  name: string;
}

export interface CreatableComboboxProps {
  items: ComboboxItem[];
  isLoading?: boolean;
  value?: number;
  onChange: (id: number | undefined) => void;
  // Called when the committed text doesn't match any existing item. Should
  // create the item via the API and return it; the returned item is then
  // selected automatically.
  onCreate: (name: string) => Promise<ComboboxItem>;
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
  placeholder = "Select or type a new name...",
  disabled,
  noItemsLabel = "No items yet. Start typing to create one.",
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
    const match = items.find((item) => item.id === value);
    setInputValue(match ? match.name : "");
  }, [value, items, isOpen]);

  const findExactMatch = (text: string) =>
    items.find((item) => item.name.toLowerCase() === text.trim().toLowerCase());

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(inputValue.trim().toLowerCase())
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
      {isOpen && !isLoading && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-60 overflow-auto">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                  item.id === value && "bg-accent/50"
                )}
                // Prevent the input's onBlur from firing before this click is registered.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(item)}
              >
                {item.name}
              </button>
            ))
          ) : inputValue.trim() ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Press Enter to create &quot;{inputValue.trim()}&quot;
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">{noItemsLabel}</div>
          )}
        </div>
      )}
    </div>
  );
}
