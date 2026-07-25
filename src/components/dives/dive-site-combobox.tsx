"use client";

import { useEffect, useState } from "react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";

export interface DiveSiteComboboxProps {
  username: string;
  value?: number;
  onChange: (diveSiteId: number | undefined) => void;
  disabled?: boolean;
}

// A combobox for picking (or creating) the dive site a dive was made at.
// Typing filters the user's existing dive sites; selecting one or typing its
// exact name sets the dive's dive_site_id. Typing a name that doesn't match
// any existing dive site creates a new one via the API once the field is
// committed (blur / Enter).
export function DiveSiteCombobox({ username, value, onChange, disabled }: DiveSiteComboboxProps) {
  const [diveSites, setDiveSites] = useState<DiveSite[]>([]);
  const [isLoadingDiveSites, setIsLoadingDiveSites] = useState(true);

  // Fetch the user's dive sites once on mount.
  useEffect(() => {
    let cancelled = false;

    const fetchDiveSites = async () => {
      try {
        setIsLoadingDiveSites(true);
        const response = await diveSitesAPI.getDiveSites(username, 1, 100);
        if (!cancelled) setDiveSites(response.data);
      } catch (error) {
        console.error("Failed to fetch dive sites:", error);
      } finally {
        if (!cancelled) setIsLoadingDiveSites(false);
      }
    };

    if (username) fetchDiveSites();

    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <CreatableCombobox
      items={diveSites}
      isLoading={isLoadingDiveSites}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder="Select or type a new dive site name..."
      noItemsLabel="No dive sites yet. Start typing to create one."
      onCreate={async (name) => {
        const newDiveSite = await diveSitesAPI.createDiveSite(username, { name });
        setDiveSites((prev) => [...prev, newDiveSite]);
        return newDiveSite;
      }}
    />
  );
}
