"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { GearSet, fetchAllGearSets } from "@/lib/api/gear";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GearItemMultiSelect } from "@/components/gear/gear-item-multi-select";
import { GearSetDialog } from "@/components/gear/gear-set-dialog";

export interface DiveGearFieldProps {
  userId: string;
  // Selected gear item uuids for this dive.
  value: string[];
  onChange: (gearItemUuids: string[]) => void;
  // The dive's `weight` field, owned by the dive form and rendered just below
  // this component. It's passed in because loading a gear set fills it in too -
  // weight is part of the configuration a set describes, even though the input
  // itself doesn't live here.
  weight?: number | null;
  onWeightChange?: (weight: number | null) => void;
  disabled?: boolean;
}

// The dive form's gear section: a gear set switcher, the list of items on the
// dive, and a "Save as set" shortcut.
//
// Loading a set replaces the dive's gear with the set's items (and its weight,
// if the set records one); from then on the two are independent - adding or
// removing an item here never writes back to the stored set, and the dive itself
// records only the resulting items and weight (it holds no reference to the set
// at all).
export function DiveGearField({
  userId,
  value,
  onChange,
  weight,
  onWeightChange,
  disabled,
}: DiveGearFieldProps) {
  const [gearSets, setGearSets] = useState<GearSet[]>([]);
  // The set whose contents the list currently matches, if any. Cleared as soon
  // as the user edits the list by hand, so the label never claims the dive's
  // gear is a set it no longer matches.
  const [loadedSetUuid, setLoadedSetUuid] = useState<string | undefined>(
    undefined,
  );
  // Set the user picked while the list already had items in it - held here until
  // they confirm the replacement.
  const [pendingSet, setPendingSet] = useState<GearSet | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchSets = async () => {
      try {
        const sets = await fetchAllGearSets(userId);
        if (!cancelled) setGearSets(sets);
      } catch (error) {
        console.error("Failed to fetch gear sets:", error);
      }
    };

    if (userId) fetchSets();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const applySet = (set: GearSet) => {
    onChange(set.gear_items.map((item) => item.uuid));
    // A set with no weight of its own makes no claim about how much lead to
    // carry, so it leaves whatever's on the dive alone rather than clearing it.
    if (set.weight != null) onWeightChange?.(set.weight);
    setLoadedSetUuid(set.uuid);
  };

  const handleSetSelected = (uuid: string) => {
    const set = gearSets.find((s) => s.uuid === uuid);
    if (!set) return;

    // Replacing a non-empty list throws away whatever the diver already picked
    // (or a previous set), so it's worth one confirmation. Loading into an empty
    // list - the common case - stays a single click. The set's weight rides
    // along with the items and isn't separately guarded: it's one visible number
    // that's trivial to retype, unlike a hand-built list of kit.
    if (value.length > 0) {
      setPendingSet(set);
      return;
    }
    applySet(set);
  };

  const handleSetSaved = (set: GearSet) => {
    setGearSets((prev) => {
      const without = prev.filter((s) => s.uuid !== set.uuid);
      return [...without, set].sort((a, b) => a.name.localeCompare(b.name));
    });
    // What's on the dive is exactly what was just saved, so the set is "loaded".
    setLoadedSetUuid(set.uuid);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1">
          <Select value={loadedSetUuid ?? ""} onValueChange={handleSetSelected}>
            <SelectTrigger aria-label="Load a gear set">
              <SelectValue placeholder="Load a gear set..." />
            </SelectTrigger>
            <SelectContent>
              {gearSets.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No gear sets yet.
                </div>
              ) : (
                gearSets.map((set) => (
                  <SelectItem key={set.uuid} value={set.uuid}>
                    {set.name}
                    <span className="text-muted-foreground">
                      {" "}
                      ({set.gear_items.length})
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || value.length === 0}
          onClick={() => setShowSaveDialog(true)}
        >
          <BookmarkPlus className="h-4 w-4 mr-2" />
          Save as set
        </Button>
      </div>

      <GearItemMultiSelect
        userId={userId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        onManualChange={() => setLoadedSetUuid(undefined)}
      />

      <ConfirmDialog
        open={pendingSet !== null}
        onOpenChange={(open) => !open && setPendingSet(null)}
        title="Replace this dive's gear?"
        description={`Loading "${pendingSet?.name}" replaces the ${value.length} item${
          value.length === 1 ? "" : "s"
        } currently on this dive.`}
        confirmText="Replace"
        variant="default"
        onConfirm={() => {
          if (pendingSet) applySet(pendingSet);
          setPendingSet(null);
        }}
      />

      <GearSetDialog
        userId={userId}
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        initialItemUuids={value}
        initialWeight={weight}
        allowChoosingTarget
        onSaved={handleSetSaved}
      />
    </div>
  );
}
