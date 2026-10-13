"use client";

import { useCallback, useState } from "react";
import {
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import { gearAPI, GearItem, GearItemInfo, gearItemLabel } from "@/lib/api/gear";
import { GearItemDialog } from "@/components/gear/gear-item-dialog";

// How many cylinders the dropdown asks for at a time - see `GearItemMultiSelect`.
const CYLINDERS_PER_SEARCH = 25;

// The members of a gear item a tank's link carries, off whatever shape it came in.
function asInfo(item: GearItemInfo | GearItem): GearItemInfo {
  return {
    uuid: item.uuid,
    name: item.name,
    brand: item.brand,
    type: item.type,
    rented: item.rented,
    is_archived: item.is_archived,
    volume: item.volume ?? null,
    working_pressure: item.working_pressure ?? null,
    material: item.material ?? null,
  };
}

export interface CylinderComboboxProps extends FormControlSlotProps {
  /** The linked vessel, or `null` - as the read embeds it, so no record is fetched. */
  value: GearItemInfo | null;
  /** The picked vessel, with its facts, or `null` when the link is cleared. */
  onChange: (vessel: GearItemInfo | null) => void;
  /**
   * Vessels another tank on the form already links. Left out of the menu, as the
   * reference pickers leave out what is already picked: one vessel is one gas
   * supply, and the API refuses a dive that links it twice.
   */
  excludeIds: string[];
  /** The dive's start time - see `TripCombobox.until`. */
  until?: string;
}

// Picks which of the diver's cylinders a tank is. The lookup is asked for cylinders
// only, and its rows carry the vessel's facts, so a pick hands the caller the
// capacity to copy without reading the record. A linked vessel since archived or
// retyped is still shown by the name the dive's read carries, since the lookup will
// not list it.
export function CylinderCombobox({
  value,
  onChange,
  excludeIds,
  until,
  ...slotProps
}: CylinderComboboxProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  // Every row this picker has been shown, so a pick resolves to the whole item.
  const [known, setKnown] = useState<Record<string, GearItemInfo>>({});

  const searchCylinders = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const response = await gearAPI.lookupGearItems(1, CYLINDERS_PER_SEARCH, {
        search: query,
        until,
        type: "cylinder",
      });
      setKnown((prev) => ({
        ...prev,
        ...Object.fromEntries(response.data.map((row) => [row.uuid, row])),
      }));
      return {
        items: response.data.map((row) => ({
          id: row.uuid,
          name: gearItemLabel(row),
          // The capacity tells two cylinders of one name apart.
          hint: row.volume != null ? `${row.volume} L` : undefined,
        })),
        hasMore: response.has_more,
      };
    },
    [until],
  );

  const handleChange = (id: string | undefined) => {
    if (!id) {
      onChange(null);
      return;
    }
    if (id === value?.uuid) return;
    const picked = known[id];
    if (picked) onChange(asInfo(picked));
  };

  const handleCreated = (created: GearItem) => {
    // The dialog opens as a cylinder; one the diver retyped there is not this
    // tank's vessel, and the API would refuse the link.
    if (created.type && created.type !== "cylinder") return;
    onChange(asInfo(created));
  };

  return (
    <>
      <CreatableCombobox
        {...slotProps}
        onSearch={searchCylinders}
        excludeIds={excludeIds}
        value={value?.uuid}
        selectedItem={
          value ? { id: value.uuid, name: gearItemLabel(value) } : undefined
        }
        onChange={handleChange}
        placeholder="Not linked to your gear"
        noItemsLabel="No cylinders in your gear yet."
        noMatchesLabel="No cylinders match."
        addNewLabel="New gear item..."
        onAddNew={() => setShowNewDialog(true)}
      />

      <GearItemDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSaved={handleCreated}
        initialType="cylinder"
      />
    </>
  );
}
