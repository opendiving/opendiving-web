"use client";

import { useCallback, useEffect, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { Badge } from "@/components/ui/badge";
import { moveItem, useDragSort } from "@/hooks/useDragSort";
import { cn } from "@/lib/utils";
import {
  GearItem,
  fetchAllGearItems,
  gearItemLabel,
  gearTypeLabel,
} from "@/lib/api/gear";
import { GearItemDialog } from "@/components/gear/gear-item-dialog";

export interface GearItemMultiSelectProps {
  userId: string;
  // Selected gear item uuids, in the order they were added.
  value: string[];
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
  onChange,
  disabled,
  onManualChange,
}: GearItemMultiSelectProps) {
  const [gearItems, setGearItems] = useState<GearItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchGear = async () => {
      try {
        setIsLoading(true);
        // Archived gear is fetched too, but only so already-selected archived
        // items (on an older dive, or in a set built before they were retired)
        // still render with their real name instead of a bare uuid. The
        // dropdown below filters them back out, so they can't be *newly* added.
        const items = await fetchAllGearItems(userId, true);
        if (!cancelled) setGearItems(items);
      } catch (error) {
        console.error("Failed to fetch gear:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    if (userId) fetchGear();

    return () => {
      cancelled = true;
    };
  }, [userId]);

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
    setGearItems((prev) => [...prev, newItem]);
    addItem(newItem.uuid);
  };

  // Already-selected items are hidden from the dropdown so the same item can't
  // be added twice, and so are archived ones (retired gear shouldn't show up
  // when logging a new dive).
  const selectableItems = gearItems.filter(
    (item) => !item.is_archived && !value.includes(item.uuid),
  );

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        // Text selection would otherwise sweep across the rows mid-drag.
        <ul
          className={cn("space-y-1", draggingIndex !== null && "select-none")}
        >
          {value.map((id, index) => {
            const item = gearItems.find((g) => g.uuid === id);
            const typeLabel = gearTypeLabel(item?.type);
            const label = item ? gearItemLabel(item) : `Gear #${id}`;
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
        items={selectableItems.map((item) => ({
          id: item.uuid,
          name: gearItemLabel(item),
          // Kit often has cryptic model names ("MK25 EVO"), so the category
          // makes the dropdown scannable.
          hint: gearTypeLabel(item.type) ?? undefined,
        }))}
        isLoading={isLoading}
        value={undefined}
        onChange={addItem}
        disabled={disabled}
        placeholder={value.length ? "Add more gear..." : "Add gear..."}
        noItemsLabel="No gear yet."
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
