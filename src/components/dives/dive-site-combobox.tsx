"use client";

import { useEffect, useState } from "react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { NewDiveSiteDialog } from "@/components/dives/new-dive-site-dialog";

export interface DiveSiteComboboxProps {
  username: string;
  value?: number;
  onChange: (diveSiteId: number | undefined) => void;
  disabled?: boolean;
}

export function DiveSiteCombobox({ username, value, onChange, disabled }: DiveSiteComboboxProps) {
  const [diveSites, setDiveSites] = useState<DiveSite[]>([]);
  const [isLoadingDiveSites, setIsLoadingDiveSites] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);

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

  const handleCreated = (newDiveSite: DiveSite) => {
    setDiveSites((prev) => [...prev, newDiveSite]);
    onChange(newDiveSite.id);
  };

  return (
    <>
      <CreatableCombobox
        items={diveSites}
        isLoading={isLoadingDiveSites}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder="Select a dive site..."
        noItemsLabel="No dive sites yet."
        addNewLabel="Add dive site..."
        onAddNew={() => setShowNewDialog(true)}
      />

      <NewDiveSiteDialog
        username={username}
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={handleCreated}
      />
    </>
  );
}
