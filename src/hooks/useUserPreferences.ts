"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUnits } from "@/hooks/useUnits";
import { authAPI, type UpdateProfileData } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  getUnitPreset,
  type UnitPreferenceDimension,
  type UnitSystem,
} from "@/lib/units";

/** Reads unit preferences and saves presets or individual families to the account. */
export function useUserPreferences() {
  const { user, refreshUser } = useAuth();
  const { preferences } = useUnits();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);

  const save = async (patch: UpdateProfileData) => {
    if (!user || saving.current) return;
    saving.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await authAPI.updateProfile(patch);
      await refreshUser();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to save. Please try again."));
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  return {
    preferences,
    preset: getUnitPreset(preferences),
    isSaving,
    error,
    setUnitPreset: (system: UnitSystem) =>
      save({ units: system, unit_preferences: {} }),
    setUnit: (dimension: UnitPreferenceDimension, system: UnitSystem) =>
      save({ unit_preferences: { ...preferences, [dimension]: system } }),
  };
}
