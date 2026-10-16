"use client";

import { useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ListFiltersButton,
  type ListFiltersButtonProps,
} from "@/components/ui/list-filters-button";
import { SearchInput } from "@/components/ui/search-input";
import { IconTooltip } from "@/components/ui/tooltip";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { cn } from "@/lib/utils";

/**
 * A filter panel beside the box: the funnel that folds it from `sm` up, and -
 * under `sm` - the same panel opened and shut with the box by the magnifier.
 */
export type ListSearchFilters = Omit<ListFiltersButtonProps, "className">;

export interface ListSearchProps {
  id: string;
  /** The box's own name for a screen reader: what the term is matched against. */
  label: string;
  /**
   * What the button folding the box away is called, short enough for a hint:
   * `Search trips`, not `Search trips by name or location`.
   */
  toggleLabel: string;
  /** What the box holds, which a debouncing caller has not yet asked for. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** The list's filter panel, for a list that has one as well as a search. */
  filters?: ListSearchFilters;
}

// The search box a list card's header carries, and - under `sm`, where a badge
// and a 16rem field cannot share the line - the button that folds it away.
//
// One field either way, revealed by a breakpoint rather than by a second copy
// rendered for phones: a term survives a rotation, and there is one box to
// focus, clear or read back. Every part is returned bare so the header's own
// `flex-wrap` row places them - the button beside the count, the box on the
// line below once it is open.
//
// A list with filters too keeps the box out from `sm` up and folds only the
// filters, behind a funnel; under `sm` the magnifier folds both, so a phone's
// header stays one button wide. The panel's open state is the caller's, since
// the caller draws the panel: one state for both buttons, so whichever opened
// it, a resize finds box and panel in step.
export function ListSearch({
  id,
  label,
  toggleLabel,
  value,
  onChange,
  placeholder,
  filters,
}: ListSearchProps) {
  const [isOwnOpen, setOwnOpen] = useState(false);
  const isOpen = filters ? filters.isOpen : isOwnOpen;
  const setOpen = filters ? filters.onOpenChange : setOwnOpen;
  const box = useRef<HTMLInputElement>(null);
  // Only the magnifier is pressed in order to type; a funnel opens filters on a
  // box that was on screen all along.
  const focusOnOpen = useRef(false);

  // Typing is what the diver came for, and pressing a magnifier to then reach
  // for the box is a click nobody wanted. In an effect rather than at the press,
  // because the box has no layout box until this render commits and one cannot
  // take focus - and `useEffectOnChange`, because coming back to a route left
  // with the box open re-creates the effect without anybody having pressed
  // anything, and a phone answers that with its keyboard.
  useEffectOnChange(() => {
    if (isOpen && focusOnOpen.current) box.current?.focus();
    focusOnOpen.current = false;
  }, [isOpen]);

  const what = filters ? "search and filters" : "the search box";
  const isChanged = Boolean(value) || Boolean(filters?.isChanged);

  return (
    <>
      {/* Folding the box away empties it, so the open button says so. The dot
          and the hint's other half are still needed for the one shut-and-
          narrowing state this button cannot produce: a term typed from `sm` up,
          where the box stands on its own, and the window then narrowed under
          it. */}
      <IconTooltip
        label={
          !isOpen
            ? value
              ? `${toggleLabel}, narrowing the list`
              : toggleLabel
            : isChanged
              ? `Close ${what}, clearing ${filters ? "them" : "the term"}`
              : `Close ${what}`
        }
      >
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 sm:hidden"
          aria-expanded={isOpen}
          aria-controls={filters ? `${id} ${filters.controls}` : id}
          onClick={() => {
            if (isOpen) {
              onChange("");
              filters?.onClear();
            } else {
              focusOnOpen.current = true;
            }
            setOpen(!isOpen);
          }}
        >
          <span className="relative flex">
            <Search className="h-4 w-4" />
            {value && !isOpen && (
              <span
                aria-hidden
                className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-teal"
              />
            )}
          </span>
          {/* Which way the box will move, which the magnifier alone cannot say:
              a chevron pointing down at the line it is about to open on, an X
              because folding it back is also what empties it. */}
          {isOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </IconTooltip>
      <SearchInput
        id={id}
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        inputRef={box}
        // `w-full` under `sm` is what wraps it onto its own line; from `sm` up
        // it is a fixed field on the right of the count, open or not - pushed
        // there by its own margin when a funnel follows it, which the row's
        // `justify-between` would otherwise leave stranded mid-line.
        className={cn(
          "w-full sm:w-64",
          filters && "sm:ml-auto",
          !isOpen && "hidden sm:block",
        )}
      />
      {filters && <ListFiltersButton {...filters} className="max-sm:hidden" />}
    </>
  );
}
