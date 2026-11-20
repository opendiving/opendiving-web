"use client";

import { Check, Ruler } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormApiError } from "@/components/ui/form-api-error";
import { cn } from "@/lib/utils";
import { type UnitPreferenceDimension, type UnitSystem } from "@/lib/units";

const PRESETS = [
  { value: "metric", label: "Metric", summary: "m · bar · L · kg · °C" },
  { value: "imperial", label: "Imperial", summary: "ft · psi · ft³ · lb · °F" },
] satisfies { value: UnitSystem; label: string; summary: string }[];

const FAMILIES = [
  {
    dimension: "depth",
    label: "Depth and distance",
    metric: "Meters",
    imperial: "Feet",
  },
  { dimension: "pressure", label: "Pressure", metric: "Bar", imperial: "PSI" },
  {
    dimension: "volume",
    label: "Gas volume",
    metric: "Liters",
    imperial: "Cu ft",
  },
  {
    dimension: "weight",
    label: "Weight",
    metric: "Kilograms",
    imperial: "Pounds",
  },
  {
    dimension: "temperature",
    label: "Temperature",
    metric: "°C",
    imperial: "°F",
  },
] satisfies {
  dimension: UnitPreferenceDimension;
  label: string;
  metric: string;
  imperial: string;
}[];

// Presets and independent measurement families share the account's preference hook.
export function UnitsCard() {
  const { user } = useAuth();
  const { preferences, preset, isSaving, error, setUnitPreset, setUnit } =
    useUserPreferences();
  const disabled = !user || isSaving;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Ruler className="h-5 w-5" aria-hidden="true" />
          Units
        </CardTitle>
        <CardDescription>
          Choose a preset, then fine tune each measurement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5" aria-busy={isSaving}>
        <fieldset disabled={disabled}>
          <legend className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quick preset
            {preset === "custom" && (
              <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] normal-case tracking-normal">
                Custom
              </span>
            )}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                aria-pressed={preset === option.value}
                onClick={() => void setUnitPreset(option.value)}
                className={cn(
                  "h-auto min-w-0 flex-col items-stretch gap-1 whitespace-normal rounded-xl p-3 text-left",
                  preset === option.value &&
                    "border-primary bg-primary/5 text-primary ring-1 ring-primary/30",
                )}
              >
                <span className="flex items-center justify-between gap-1 font-semibold">
                  {option.label}
                  {preset === option.value && (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {option.summary}
                </span>
              </Button>
            ))}
          </div>
        </fieldset>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fine tune
          </p>
          <div className="divide-y rounded-xl border px-3">
            {FAMILIES.map((family) => (
              <fieldset
                key={family.dimension}
                disabled={disabled}
                aria-label={family.label}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3"
              >
                <legend className="sr-only">{family.label}</legend>
                <span className="text-sm font-medium" aria-hidden="true">
                  {family.label}
                </span>
                <div className="grid w-44 grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                  {PRESETS.map(({ value }) => (
                    <Button
                      key={value}
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-pressed={preferences[family.dimension] === value}
                      onClick={() => void setUnit(family.dimension, value)}
                      className={cn(
                        "h-8 px-2",
                        preferences[family.dimension] === value &&
                          "bg-background shadow-sm hover:bg-background",
                      )}
                    >
                      {family[value]}
                    </Button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Applies throughout the app, on every device you sign in from. Depth
          also controls visibility, altitude, distance and wind speed. Gas
          volume controls gas totals and breathing rates.
        </p>
        <p className="text-sm text-muted-foreground">
          Your dives and exports stay in metric. Cylinder water capacity stays
          in liters; cubic-foot cylinder ratings need a working pressure.
          Individual field switches while logging a dive remain separate and are
          remembered on this device.
        </p>
        <FormApiError error={error} />
      </CardContent>
    </Card>
  );
}
