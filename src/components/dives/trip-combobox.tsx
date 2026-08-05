"use client";

import { useEffect, useState } from "react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { NewTripDialog } from "@/components/dives/new-trip-dialog";

export interface TripComboboxProps {
  userId: string;
  value?: string;
  onChange: (tripId: string | undefined) => void;
  disabled?: boolean;
}

export function TripCombobox({
  userId,
  value,
  onChange,
  disabled,
}: TripComboboxProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchTrips = async () => {
      try {
        setIsLoadingTrips(true);
        const response = await tripsAPI.getTrips(userId, 1, 100);
        if (!cancelled) setTrips(response.data);
      } catch (error) {
        console.error("Failed to fetch trips:", error);
      } finally {
        if (!cancelled) setIsLoadingTrips(false);
      }
    };

    if (userId) fetchTrips();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleCreated = (newTrip: Trip) => {
    setTrips((prev) => [...prev, newTrip]);
    onChange(newTrip.uuid);
  };

  // Trips have a `location` field too, but unlike dive sites it's not shown
  // in this dropdown - map to bare `{id, name}` so `CreatableCombobox`'s
  // optional location display (added for dive sites) doesn't pick it up.
  const items = trips.map((trip) => ({ id: trip.uuid, name: trip.name }));

  return (
    <>
      <CreatableCombobox
        items={items}
        isLoading={isLoadingTrips}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder="Select a trip..."
        noItemsLabel="No trips yet."
        addNewLabel="Add trip..."
        onAddNew={() => setShowNewDialog(true)}
      />

      <NewTripDialog
        userId={userId}
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={handleCreated}
      />
    </>
  );
}
