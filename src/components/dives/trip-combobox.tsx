"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { TripDialog } from "@/components/trips/trip-dialog";

// How many trips the dropdown asks for at a time. Enough to scroll through
// before typing, far short of the API's 100 cap.
const TRIPS_PER_SEARCH = 25;

export interface TripComboboxProps extends FormControlSlotProps {
  value?: string | null;
  // `null`, not `undefined`, for "no trip" - and the distinction is load-bearing
  // on the edit form, which builds its PATCH body by skipping fields that are
  // `undefined`. Clearing the picker has to be a value the diver *chose*, not an
  // absent one, or the trip is dropped from the request and silently survives
  // the save. `CreatableCombobox` speaks `undefined`, so it's normalized here
  // rather than changing that shared component for its other consumers.
  onChange: (tripId: string | null) => void;
  disabled?: boolean;
}

// The dropdown searches server-side rather than fetching the user's whole trip
// list - see DECISIONS.md. It used to request a single page of 100 and drop the
// rest silently, so a 101st trip simply couldn't be selected.
export function TripCombobox({
  value,
  onChange,
  disabled,
  ...slotProps
}: TripComboboxProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  // Names for every trip this picker has seen - its own search results, whatever
  // it created, and a lookup for a `value` that arrived from the form. Without
  // it the input would sit empty on a dive that already has a trip, since the
  // browser no longer holds the full list to look the name up in.
  const [names, setNames] = useState<Record<string, string>>({});
  // Fired-for uuids, so a failed lookup isn't retried on every render.
  const requestedRef = useRef<Set<string>>(new Set());

  const remember = useCallback(
    (trip: Pick<Trip, "uuid" | "name">) =>
      setNames((prev) => ({ ...prev, [trip.uuid]: trip.name })),
    [],
  );

  // No cancellation flag on this one, deliberately. `requestedRef` means the
  // request fires exactly once per uuid, so under StrictMode's mount/unmount/
  // remount the *only* in-flight lookup belongs to the discarded first mount -
  // ignoring its result on cleanup would drop the name for good. Writing to a
  // uuid-keyed map is idempotent, so a late arrival is always safe to apply.
  useEffect(() => {
    if (!value || names[value] || requestedRef.current.has(value)) return;
    requestedRef.current.add(value);

    tripsAPI
      .getTrip(value)
      .then(remember)
      .catch((error) => console.error("Failed to fetch trip:", error));
  }, [value, names, remember]);

  const searchTrips = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const response = await tripsAPI.getTrips(1, TRIPS_PER_SEARCH, query);
      response.data.forEach(remember);
      return {
        // Trips have `locations` too, but unlike dive sites they aren't shown
        // here - mapped to a bare `{id, name}` so the hint slot stays empty.
        items: response.data.map((trip) => ({
          id: trip.uuid,
          name: trip.name,
        })),
        hasMore: response.has_more,
      };
    },
    [remember],
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
          value && names[value] ? { id: value, name: names[value] } : undefined
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
