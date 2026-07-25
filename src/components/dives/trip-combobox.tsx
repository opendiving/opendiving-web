"use client";

import { useEffect, useState } from "react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { tripsAPI, Trip } from "@/lib/api/trips";

export interface TripComboboxProps {
  username: string;
  value?: number;
  onChange: (tripId: number | undefined) => void;
  disabled?: boolean;
}

// A combobox for picking (or creating) a trip to associate with a dive.
// Typing filters the user's existing trips; selecting one or typing its
// exact name sets the dive's trip_id. Typing a name that doesn't match any
// existing trip creates a new one via the API once the field is committed
// (blur / Enter).
export function TripCombobox({ username, value, onChange, disabled }: TripComboboxProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);

  // Fetch the user's trips once on mount.
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

  return (
    <CreatableCombobox
      items={trips}
      isLoading={isLoadingTrips}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder="Select or type a new trip name..."
      noItemsLabel="No trips yet. Start typing to create one."
      onCreate={async (name) => {
        const newTrip = await tripsAPI.createTrip(username, { name });
        setTrips((prev) => [...prev, newTrip]);
        return newTrip;
      }}
    />
  );
}
