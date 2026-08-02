"use client";

import { useEffect, useState } from "react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { NewTripDialog } from "@/components/dives/new-trip-dialog";

export interface TripComboboxProps {
  username: string;
  value?: number;
  onChange: (tripId: number | undefined) => void;
  disabled?: boolean;
}

export function TripCombobox({ username, value, onChange, disabled }: TripComboboxProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchTrips = async () => {
      try {
        setIsLoadingTrips(true);
        const response = await tripsAPI.getTrips(username, 1, 100);
        if (!cancelled) setTrips(response.data);
      } catch (error) {
        console.error("Failed to fetch trips:", error);
      } finally {
        if (!cancelled) setIsLoadingTrips(false);
      }
    };

    if (username) fetchTrips();

    return () => {
      cancelled = true;
    };
  }, [username]);

  const handleCreated = (newTrip: Trip) => {
    setTrips((prev) => [...prev, newTrip]);
    onChange(newTrip.id);
  };

  return (
    <>
      <CreatableCombobox
        items={trips}
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
        username={username}
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={handleCreated}
      />
    </>
  );
}
