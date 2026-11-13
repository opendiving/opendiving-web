"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import * as units from "@/lib/units";

/** Account units and formatters that follow the diver's measurement preferences. */
export function useUnits() {
  const { user } = useAuth();
  const system = user?.units ?? "metric";
  const overrides = user?.unit_preferences;
  return useMemo(() => {
    const preferences = units.resolveUnitPreferences(system, overrides);
    return {
      preferences,
      unitSystemFor: (dimension: units.Dimension | "volume") =>
        units.unitSystemFor(dimension, preferences),
      unitLabel: (dimension: units.Dimension) =>
        units.unitLabel(dimension, preferences),
      unitWord: (dimension: units.Dimension) =>
        units.unitWord(dimension, preferences),
      toDisplayUnits: (metric: number, dimension: units.Dimension) =>
        units.toDisplayUnits(metric, dimension, preferences),
      toMetricUnits: (display: number, dimension: units.Dimension) =>
        units.toMetricUnits(display, dimension, preferences),
      displayNumber: (
        metric: number,
        dimension: units.Dimension,
        options?: units.FormatOptions,
      ) => units.displayNumber(metric, dimension, preferences, options),
      formatDepth: (meters: number, options?: units.FormatOptions) =>
        units.formatDepth(meters, preferences, options),
      formatComparableDepth: (
        meters: number,
        options?: Parameters<typeof units.formatComparableDepth>[2],
      ) => units.formatComparableDepth(meters, preferences, options),
      formatTemperature: (celsius: number, options?: units.FormatOptions) =>
        units.formatTemperature(celsius, preferences, options),
      formatWeight: (kg: number, options?: units.FormatOptions) =>
        units.formatWeight(kg, preferences, options),
      formatPressure: (bar: number, options?: units.FormatOptions) =>
        units.formatPressure(bar, preferences, options),
      formatVisibility: (meters: number) =>
        units.formatVisibility(meters, preferences),
      formatAltitude: (meters: number) =>
        units.formatAltitude(meters, preferences),
      formatSac: (barPerMinute: number, options?: units.FormatOptions) =>
        units.formatSac(barPerMinute, preferences, options),
      formatRmv: (litersPerMinute: number, options?: units.FormatOptions) =>
        units.formatRmv(litersPerMinute, preferences, options),
      formatGasVolume: (liters: number, options?: units.FormatOptions) =>
        units.formatGasVolume(liters, preferences, options),
      formatWindSpeed: (metersPerSecond: number) =>
        units.formatWindSpeed(metersPerSecond, preferences),
    };
  }, [system, overrides]);
}
