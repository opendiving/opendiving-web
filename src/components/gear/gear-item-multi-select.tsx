"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import {
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { moveItem, useDragSort } from "@/hooks/useDragSort";
import { cn } from "@/lib/utils";
import {
  gearAPI,
  GearItem,
  GearItemSummary,
  gearItemLabel,
  gearTypeLabel,
} from "@/lib/api/gear";
import { GearItemDialog } from "@/components/gear/gear-item-dialog";

// How much gear the dropdown asks for at a time. Enough to scroll through
// before typing, far short of the API's 100 cap.
const GEAR_PER_SEARCH = 25;

export interface GearItemMultiSelectProps extends FormControlSlotProps {
  userId: string;
  // Selected gear item uuids, in the order they were added.
  value: string[];
  // Details for the items already in `value`, when the caller has them (the dive
  // form does: `Dive.gear_items` carries exactly the fields a row renders).
  // Purely an optimization - anything not covered here is fetched individually.
  knownItems?: GearItemSummary[];
  onChange: (gearItemUuids: string[]) => void;
  disabled?: boolean;
  // Called whenever the user adds or removes an item by hand, as opposed to the
  // whole list being swapped out programmatically (e.g. by loading a gear set).
  // The dive form uses this to drop its "loaded from <set>" hint once the list
  // no longer matches the set.
  onManualChange?: () => void;
}

// Lets the user pick the gear items used on a dive (or the members of a gear
// set). Wraps the generic `CreatableCombobox` for the "add an item" input, plus
// the list of items already added.
export function GearItemMultiSelect({
  userId,
  value,
  knownItems,
  onChange,
  disabled,
  onManualChange,
  ...slotProps
}: GearItemMultiSelectProps) {
  // Every gear item this picker has seen, keyed by uuid - its own search
  // results, whatever it created, and lookups for selections that arrived from
  // the form. Rows show a type plus "Rented"/"Archived" badges, so this keeps
  // the whole summary rather than just a name.
  const [known, setKnown] = useState<Record<string, GearItemSummary>>({});
  const [showNewDialog, setShowNewDialog] = useState(false);
  // Fired-for uuids, so a failed lookup isn't retried on every render.
  const requestedRef = useRef<Set<string>>(new Set());

  const remember = useCallback(
    (item: GearItemSummary) =>
      setKnown((prev) => ({ ...prev, [item.uuid]: item })),
    [],
  );

  // Read through the `knownItems` prop rather than copying it in via an effect:
  // the copy wouldn't have landed on the render that first sees a selection, so
  // the lookup below would fire for items the caller had already handed over.
  const itemFor = (uuid: string): GearItemSummary | undefined =>
    known[uuid] ?? knownItems?.find((item) => item.uuid === uuid);

  // Resolve any selection whose record isn't known yet. This is also what keeps
  // *archived* gear rendering properly: an older dive can legitimately reference
  // retired kit, which the dropdown deliberately never offers, so it can only
  // ever arrive here by uuid.
  useEffect(() => {
    const unresolved = value.filter(
      (uuid) =>
        !known[uuid] &&
        !knownItems?.some((item) => item.uuid === uuid) &&
        !requestedRef.current.has(uuid),
    );
    if (unresolved.length === 0) return;

    // Marked before the request, so a failure isn't retried on every render -
    // and, for the same reason as `DiveSiteMultiSelect`, why there's no
    // cancellation flag: each uuid is fetched exactly once, so discarding a
    // late result on cleanup would lose it for good.
    unresolved.forEach((uuid) => requestedRef.current.add(uuid));

    unresolved.forEach(async (uuid) => {
      try {
        remember(await gearAPI.getGearItem(uuid));
      } catch (error) {
        console.error("Failed to fetch gear item:", error);
      }
    });
  }, [value, known, knownItems, remember]);

  const searchGear = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      // Archived gear is excluded at the source rather than filtered out here:
      // retired kit shouldn't be offered for a new dive, and leaving it in would
      // eat into the page of matches the user can actually pick from.
      const response = await gearAPI.getGearItems(
        userId,
        1,
        GEAR_PER_SEARCH,
        false,
        query,
      );
      response.data.forEach(remember);
      return {
        items: response.data.map((item) => ({
          id: item.uuid,
          name: gearItemLabel(item),
          // Kit often has cryptic model names ("MK25 EVO"), so the category
          // makes the dropdown scannable.
          hint: gearTypeLabel(item.type) ?? undefined,
        })),
        hasMore: response.has_more,
      };
    },
    [userId, remember],
  );

  const addItem = (id: string | undefined) => {
    if (id === undefined || value.includes(id)) return;
    onChange([...value, id]);
    onManualChange?.();
  };

  const removeItem = (id: string) => {
    onChange(value.filter((v) => v !== id));
    onManualChange?.();
  };

  // Reordering is a manual edit like any other, so it detaches the list from
  // whatever gear set it was loaded from (see `DiveGearField`).
  const reorder = useCallback(
    (from: number, to: number) => {
      onChange(moveItem(value, from, to));
      onManualChange?.();
    },
    [value, onChange, onManualChange],
  );

  const { draggingIndex, dragOffset, setItemRef, handleProps } = useDragSort({
    itemCount: value.length,
    onReorder: reorder,
    disabled,
  });

  const handleCreated = (newItem: GearItem) => {
    remember(newItem);
    addItem(newItem.uuid);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        // Text selection would otherwise sweep across the rows mid-drag.
        <ul
          className={cn("space-y-1", draggingIndex !== null && "select-none")}
        >
          {value.map((id, index) => {
            const item = itemFor(id);
            const typeLabel = gearTypeLabel(item?.type);
            // The fallback is only ever visible for the moment between an item
            // being selected and its record being resolved.
            const label = item ? gearItemLabel(item) : "Gear item...";
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
                    aria-label={`Reorder ${label}. Use arrow up and arrow down to move it.`}
                    disabled={disabled}
                    // `touch-action: none` comes from `handleProps`, so every
                    // consumer of the hook gets it rather than having to
                    // remember the class.
                    className="shrink-0 cursor-grab rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                    {...handleProps(index)}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                )}
                <span className="flex-1 truncate">
                  {label}
                  {/* Same muted ", Type" suffix the dropdown uses, so an item
                      reads identically before and after it's picked. */}
                  {typeLabel && (
                    <span className="text-muted-foreground">, {typeLabel}</span>
                  )}
                </span>
                {item?.rented && (
                  <Badge variant="secondary" className="shrink-0">
                    Rented
                  </Badge>
                )}
                {item?.is_archived && (
                  <Badge variant="outline" className="shrink-0">
                    Archived
                  </Badge>
                )}
                <button
                  type="button"
                  aria-label="Remove"
                  disabled={disabled}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => removeItem(id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <CreatableCombobox
        {...slotProps}
        onSearch={searchGear}
        // Already-selected items are hidden so the same item can't be added twice.
        excludeIds={value}
        value={undefined}
        onChange={addItem}
        disabled={disabled}
        placeholder={value.length ? "Add more gear..." : "Add gear..."}
        noItemsLabel="No gear yet."
        noMatchesLabel="No gear matches."
        addNewLabel="New gear item..."
        keepOpenOnSelect
        onAddNew={() => setShowNewDialog(true)}
      />

      <GearItemDialog
        userId={userId}
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSaved={handleCreated}
      />
    </div>
  );
}
