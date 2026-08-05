"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { NewDiveSiteDialog } from "@/components/dives/new-dive-site-dialog";

export interface DiveSiteMultiSelectProps {
  userId: string;
  // Ordered list of selected dive site uuids - the first entry is the primary
  // site (e.g. shown as "Site Name +2" wherever only one site fits).
  value: string[];
  onChange: (diveSiteUuids: string[]) => void;
  disabled?: boolean;
}

// Lets the user pick one or more dive sites for a dive (e.g. a drift dive that
// crosses several named sites), in the order they were visited. Wraps the
// generic `CreatableCombobox` for the "add a site" input, plus a reorderable
// list of the sites already added.
export function DiveSiteMultiSelect({
  userId,
  value,
  onChange,
  disabled,
}: DiveSiteMultiSelectProps) {
  const [diveSites, setDiveSites] = useState<DiveSite[]>([]);
  const [isLoadingDiveSites, setIsLoadingDiveSites] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchDiveSites = async () => {
      try {
        setIsLoadingDiveSites(true);
        // Fetch every page - this is a client-side-filtered picker, not a
        // paginated list view, so it needs the user's full set of dive sites
        // (some users have well over one page's worth) or sites past the
        // first page would show up as "Dive site #123" instead of their name.
        const allSites: DiveSite[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const response = await diveSitesAPI.getDiveSites(userId, page, 100);
          allSites.push(...response.data);
          hasMore = response.has_more;
          page += 1;
        }
        if (!cancelled) setDiveSites(allSites);
      } catch (error) {
        console.error("Failed to fetch dive sites:", error);
      } finally {
        if (!cancelled) setIsLoadingDiveSites(false);
      }
    };

    if (userId) fetchDiveSites();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const addSite = (id: string | undefined) => {
    if (id === undefined || value.includes(id)) return;
    onChange([...value, id]);
  };

  const removeSite = (id: string) => onChange(value.filter((v) => v !== id));

  const moveSite = (index: number, direction: -1 | 1) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= value.length) return;
    const next = [...value];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    onChange(next);
  };

  const handleCreated = (newDiveSite: DiveSite) => {
    setDiveSites((prev) => [...prev, newDiveSite]);
    addSite(newDiveSite.uuid);
  };

  // Already-selected sites are hidden from the "add a site" dropdown so the
  // same site can't be added twice.
  const selectableDiveSites = diveSites.filter(
    (site) => !value.includes(site.uuid),
  );

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((id, index) => {
            const site = diveSites.find((s) => s.uuid === id);
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
              >
                <span className="flex-1 truncate">
                  {site ? site.name : `Dive site #${id}`}
                  {site?.location && (
                    <span className="text-muted-foreground">
                      , {site.location}
                    </span>
                  )}
                </span>
                {value.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={disabled || index === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      onClick={() => moveSite(index, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={disabled || index === value.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      onClick={() => moveSite(index, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  aria-label="Remove"
                  disabled={disabled}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => removeSite(id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <CreatableCombobox
        items={selectableDiveSites.map((site) => ({
          id: site.uuid,
          name: site.name,
          location: site.location,
        }))}
        isLoading={isLoadingDiveSites}
        value={undefined}
        onChange={addSite}
        disabled={disabled}
        placeholder={
          value.length ? "Add another dive site..." : "Select a dive site..."
        }
        noItemsLabel="No dive sites yet."
        addNewLabel="Add dive site..."
        onAddNew={() => setShowNewDialog(true)}
      />

      <NewDiveSiteDialog
        userId={userId}
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={handleCreated}
      />
    </div>
  );
}
