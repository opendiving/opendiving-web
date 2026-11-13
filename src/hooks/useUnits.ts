"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveUnitPreferences, type UnitPreferences } from "@/lib/units";

/** Account preferences for every display; legacy accounts retain their existing preset. */
export function useUnits(): UnitPreferences {
  const { user } = useAuth();
  const system = user?.units ?? "metric";
  const overrides = user?.unit_preferences;
  return useMemo(
    () => resolveUnitPreferences(system, overrides),
    [system, overrides],
  );
}
