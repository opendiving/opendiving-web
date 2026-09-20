"use client";

import { useRef, type RefObject } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface SearchInputProps {
  id: string;
  /**
   * What the box is called for a screen reader. The magnifier inside it is all
   * that says so on screen, so this carries what the term is matched against -
   * `Search trips by name or location`, not `Search`.
   */
  label: string;
  /** What the box holds, which a debouncing caller has not yet asked for. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** The wrapper's classes: how wide the box is, and where its row puts it. */
  className?: string;
  /** The box itself, for a caller that puts the cursor in it. */
  inputRef?: RefObject<HTMLInputElement | null>;
}

// A magnifier, the field, and an X once there is something to clear. One
// component so that a list's search box is the same control wherever it sits -
// in a card header beside the count, or in the courses filter row.
export function SearchInput({
  id,
  label,
  value,
  onChange,
  placeholder = "Search...",
  className,
  inputRef,
}: SearchInputProps) {
  // The caller's box when it has a use for one, otherwise its own: the clear
  // control puts the cursor back where it was, and needs a handle either way.
  const ownRef = useRef<HTMLInputElement>(null);
  const box = inputRef ?? ownRef;

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        ref={box}
        id={id}
        type="search"
        // The browser's own clear control is suppressed for the one below,
        // which is the X the rest of this app draws and is there on every
        // browser rather than on WebKit alone.
        className={cn(
          "pl-9 [&::-webkit-search-cancel-button]:appearance-none",
          value && "pr-9",
        )}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <IconTooltip label="Clear search">
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              onChange("");
              box.current?.focus();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
      )}
    </div>
  );
}
