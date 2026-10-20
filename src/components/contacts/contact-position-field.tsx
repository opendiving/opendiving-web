"use client";

import { useState } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { MapPin } from "lucide-react";
import { parseCoordinatePair } from "@/lib/validations/coordinates";
import type { ContactInput } from "@/lib/validations/contact";
import { MapField } from "@/components/map/map-field";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const COORDINATE_HINT =
  "Paste a “27.8506, 34.3136” pair into either field to fill both, or place the contact on the map.";

const COORDINATES = [
  { name: "latitude", label: "Latitude", placeholder: "e.g. 27.8506" },
  { name: "longitude", label: "Longitude", placeholder: "e.g. 34.3136" },
] as const;

interface ContactPositionFieldProps {
  form: UseFormReturn<ContactInput>;
}

/**
 * Where a contact is: the latitude and longitude inputs, and the map the dive
 * site form shows, drawn only once the diver asks for it.
 *
 * Not on open, because a map on screen has the browser fetch tiles from the
 * basemap host, and this dialog opens from the dive, course, certification,
 * service-record and trip forms as well - a diver adding a dive center from a
 * dive would contact that host without having asked for a map. `/privacy` §4.4
 * says the same. The state needs no reset: the dialog's content unmounts when
 * it closes, so every opening starts with the map closed.
 *
 * No geocoding: the address is not looked up into a pin, nor a pin into an
 * address, so this field reaches no host until the map is drawn.
 */
export function ContactPositionField({ form }: ContactPositionFieldProps) {
  const [mapOpen, setMapOpen] = useState(false);
  const [latitude, longitude] = useWatch({
    control: form.control,
    name: ["latitude", "longitude"],
  });

  // The map and the paste write into the two inputs rather than holding a
  // position of their own. `shouldValidate` because a whole pair clears the
  // both-or-neither message.
  const setPosition = (position: { latitude: string; longitude: string }) => {
    const options = { shouldValidate: true, shouldDirty: true };
    form.setValue("latitude", position.latitude, options);
    form.setValue("longitude", position.longitude, options);
  };

  const handleCoordinatePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const pair = parseCoordinatePair(event.clipboardData.getData("text"));
    if (!pair) return;
    event.preventDefault();
    setPosition(pair);
  };

  return (
    <div className="space-y-4">
      {/* No `inputMode="decimal"`, for the dive site form's reason: iOS's keypad
          for it has no minus key. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {COORDINATES.map((coordinate) => (
          <FormField
            key={coordinate.name}
            control={form.control}
            name={coordinate.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{coordinate.label}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder={coordinate.placeholder}
                    onPaste={handleCoordinatePaste}
                    {...field}
                  />
                </FormControl>
                {/* Announced with each input and shown once below the pair -
                    the dive site form's arrangement, for its reason. */}
                <FormDescription className="sr-only">
                  {COORDINATE_HINT}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
      </div>

      <p className="-mt-2 text-sm text-muted-foreground" aria-hidden>
        {COORDINATE_HINT}
      </p>

      {mapOpen ? (
        <MapField
          subject="the contact"
          latitude={latitude}
          longitude={longitude}
          onPick={setPosition}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setMapOpen(true)}
        >
          <MapPin className="h-4 w-4" />
          Show map
        </Button>
      )}
    </div>
  );
}
