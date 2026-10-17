"use client";

import { useCallback, useState } from "react";
import {
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { useLookupLabels } from "@/hooks/useLookupLabels";
import { TripDialog } from "@/components/trips/trip-dialog";

// How many trips the dropdown asks for at a time. Enough to scroll through
// before typing, far short of the API's 100 cap.
const TRIPS_PER_SEARCH = 25;

const lookupTrips = (uuids: string[]) => tripsAPI.lookupTripsByUuid(uuids);

export interface TripComboboxProps extends FormControlSlotProps {
  value?: string | null;
  // `null`, not `undefined`, for "no trip" - and the distinction is load-bearing
  // on the edit form, which builds its PATCH body by skipping fields that are
  // `undefined`. Clearing the picker has to be a value the diver *chose*, not an
  // absent one, or the trip is dropped from the request and silently survives
  // the save. `CreatableCombobox` speaks `undefined`, so it's normalized here
  // rather than changing that shared component for its other consumers.
  onChange: (tripId: string | null) => void;
  // The date of the record being edited, as its form holds it - the lookup ranks
  // trips by their last dive at or before it. Left off, every dive counts.
  until?: string;
  disabled?: boolean;
}

// The dropdown searches the trip lookup server-side rather than fetching the
// user's whole trip list - see DECISIONS.md.
export function TripCombobox({
  value,
  onChange,
  until,
  disabled,
  ...slotProps
}: TripComboboxProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  // Without a lookup for a `value` that arrived from the form, the input would sit
  // empty on a dive that already has a trip.
  const { records: trips, remember } = useLookupLabels(lookupTrips, [value]);

  const searchTrips = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const response = await tripsAPI.lookupTrips(1, TRIPS_PER_SEARCH, {
        search: query,
        until,
      });
      remember(...response.data);
      return {
        items: response.data.map((trip) => ({
          id: trip.uuid,
          name: trip.name,
        })),
        hasMore: response.has_more,
      };
    },
    [remember, until],
  );

  const handleCreated = (newTrip: Trip) => {
    remember(newTrip);
    onChange(newTrip.uuid);
  };

  return (
    <>
      <CreatableCombobox
        {...slotProps}
        onSearch={searchTrips}
        value={value ?? undefined}
        selectedItem={
          value && trips[value]
            ? { id: value, name: trips[value].name }
            : undefined
        }
        onChange={(tripId) => onChange(tripId ?? null)}
        disabled={disabled}
        placeholder="Select a trip..."
        noItemsLabel="No trips yet."
        noMatchesLabel="No trips match."
        addNewLabel="Add trip..."
        onAddNew={() => setShowNewDialog(true)}
      />

      <TripDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSaved={handleCreated}
      />
    </>
  );
}
