"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Keep the displayed text in sync with the selected trip_id whenever it
  // changes from outside (e.g. loading an existing dive into the form), as
  // long as the user isn't actively editing the field.
  useEffect(() => {
    if (isOpen) return;
    const match = trips.find((trip) => trip.id === value);
    setInputValue(match ? match.name : "");
  }, [value, trips, isOpen]);

  const findExactMatch = (text: string) =>
    trips.find((trip) => trip.name.toLowerCase() === text.trim().toLowerCase());

  const filteredTrips = trips.filter((trip) =>
    trip.name.toLowerCase().includes(inputValue.trim().toLowerCase())
  );

  const handleInputChange = (text: string) => {
    setInputValue(text);
    setIsOpen(true);
    onChange(findExactMatch(text)?.id);
  };

  const handleSelect = (trip: Trip) => {
    setInputValue(trip.name);
    onChange(trip.id);
    setIsOpen(false);
  };

  const commit = async () => {
    const text = inputValue.trim();

    if (!text) {
      onChange(undefined);
      return;
    }

    const exactMatch = findExactMatch(text);
    if (exactMatch) {
      setInputValue(exactMatch.name);
      onChange(exactMatch.id);
      return;
    }

    try {
      setIsSaving(true);
      const newTrip = await tripsAPI.createTrip(username, { name: text });
      setTrips((prev) => [...prev, newTrip]);
      setInputValue(newTrip.name);
      onChange(newTrip.id);
    } catch (error) {
      console.error("Failed to create trip:", error);
      onChange(undefined);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        placeholder="Select or type a new trip name..."
        value={inputValue}
        disabled={disabled || isLoadingTrips}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          setIsOpen(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
          }
          if (e.key === "Escape") {
            setIsOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      {isSaving && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {isOpen && !isLoadingTrips && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-60 overflow-auto">
          {filteredTrips.length > 0 ? (
            filteredTrips.map((trip) => (
              <button
                key={trip.id}
                type="button"
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                  trip.id === value && "bg-accent/50"
                )}
                // Prevent the input's onBlur from firing before this click is registered.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(trip)}
              >
                {trip.name}
              </button>
            ))
          ) : inputValue.trim() ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Press Enter to create trip &quot;{inputValue.trim()}&quot;
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No trips yet. Start typing to create one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
