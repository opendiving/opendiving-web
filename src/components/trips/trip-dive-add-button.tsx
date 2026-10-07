"use client";

import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** How much of the trip's candidates an add takes, from one dive outwards. */
export type TripDiveAddExtent = "dive" | "part" | "trip";

interface TripDiveAddButtonProps {
  diveNumber: number;
  // The candidates in the part this dive's card sits in, and in the whole trip,
  // as the trip read counts them - not as many as the page has loaded.
  partCount: number;
  tripCount: number;
  disabled: boolean;
  onAdd: (extent: TripDiveAddExtent) => void;
}

// A candidate's one control, in its card's corner. A menu when there is more
// than the one dive to add, and never two items that add the same dives: the
// part's needs more than this dive in the part, the trip's more than the part
// holds. With only "Add this dive" left, the button adds at once.
export function TripDiveAddButton({
  diveNumber,
  partCount,
  tripCount,
  disabled,
  onAdd,
}: TripDiveAddButtonProps) {
  const offersPart = partCount > 1;
  const offersTrip = tripCount > Math.max(partCount, 1);
  // Starts with the visible text, as WCAG's Label in Name asks, and names the
  // dive as the menu it replaces does.
  const label = `Add to trip: dive #${diveNumber}`;
  // Opaque, unlike the menu's ghost button, so its text keeps its contrast over
  // whatever the map draws in the corner.
  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1 bg-background px-2.5"
      aria-label={label}
      disabled={disabled}
      onClick={offersPart || offersTrip ? undefined : () => onAdd("dive")}
    >
      <Plus className="h-4 w-4" aria-hidden />
      Add to trip
      {(offersPart || offersTrip) && (
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      )}
    </Button>
  );
  if (!offersPart && !offersTrip) return button;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onAdd("dive")}>
          Add this dive
        </DropdownMenuItem>
        {offersPart && (
          <DropdownMenuItem onSelect={() => onAdd("part")}>
            Add all {partCount} dives from this part
          </DropdownMenuItem>
        )}
        {offersTrip && (
          <DropdownMenuItem onSelect={() => onAdd("trip")}>
            Add all {tripCount} unassigned dives
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
