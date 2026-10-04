"use client";

import { useEffect, useRef } from "react";
import { useWatch, type Control } from "react-hook-form";
import { diveSitesAPI, type DiveSite } from "@/lib/api/dive-sites";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";
import { siteEntryTypes, siteWaterType } from "@/lib/validations/dive-site";
import type { DiveCreateInput } from "@/lib/validations/dive";

export interface UseDiveSitePrefillOptions {
  control: Control<DiveCreateInput>;
  visibility: Pick<DiveFormVisibility, "autofill">;
  /**
   * Whether the last-dive prefill has settled - landed, given up or failed. Until
   * then nothing is written: that prefill gives up on a dirty form, and a site's
   * values landing first would cost the dive the last one's trip, gear and
   * cylinders.
   */
  enabled: boolean;
}

/**
 * Gives the new-dive form the primary site's water type, altitude and entry type,
 * each where the diver has not typed one - the entry only where the site names
 * exactly one. Whenever another site becomes primary - picked, reordered, or
 * arriving in the URL - it replaces what it has a value for. A field it gives
 * nothing keeps what it holds, and so does every field when the last site goes.
 *
 * Through the visibility layer's `autofill`, so each write is the layer's own and
 * the next site may replace it, and a hidden field the site gives a value is put
 * on screen for this form and saved. The boat name follows a shore entry, or a
 * shore site picked after a boat dive would save the last boat's name.
 *
 * The new form only: the edit form never changes a stored value on a pick.
 */
export function useDiveSitePrefill({
  control,
  visibility,
  enabled,
}: UseDiveSitePrefillOptions): void {
  const siteUuids = useWatch({ control, name: "dive_site_uuids" });
  const primary = siteUuids?.[0] ?? null;

  // The primary site whose values the form holds, and the latest lookup asked for:
  // a reply to any earlier one is for a site that is no longer first.
  const appliedRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const visibilityRef = useRef(visibility);
  useEffect(() => {
    visibilityRef.current = visibility;
  });

  useEffect(() => {
    if (!enabled) return;
    const request = ++requestRef.current;
    // Back to the site the form already holds, with another one's reply still on
    // its way: the bump above is what stops that reply landing.
    if (primary === appliedRef.current) return;

    if (primary === null) {
      appliedRef.current = null;
      return;
    }

    const apply = (site: DiveSite) => {
      if (request !== requestRef.current) return;
      appliedRef.current = primary;
      const { autofill } = visibilityRef.current;

      const water = siteWaterType(site);
      if (water) autofill("water_type", water);
      if (site.altitude != null) autofill("altitude", site.altitude);

      const entries = siteEntryTypes(site);
      if (entries.length !== 1) return;
      const entry = entries[0];
      if (autofill("entry_type", entry) && entry !== "boat") {
        autofill("boat_name", "");
      }
    };

    diveSitesAPI.getDiveSite(primary).then(apply, (error) => {
      console.error("Failed to read the dive site for the prefill:", error);
    });
  }, [enabled, primary]);
}
