"use client";

import { useCallback, useEffect, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { NewDiveSiteDialog } from "@/components/dives/new-dive-site-dialog";
import { moveItem, useDragSort } from "@/hooks/useDragSort";
import { cn } from "@/lib/utils";

export interface DiveSiteMultiSelectProps {
  userId: string;
  // Ordered list of selected dive site uuids - the first entry is the primary
  // site (e.g. shown as "Site Name +2" wherever only one site fits).
  value: string[];
  onChange: (diveSiteUuids: string[]) => void;
  disabled?: boolean;
}

// Lets the user pick one or more dive sites for a dive (e.g. a drift dive that
// crosses several named sites), in the order they were visited - which matters
// here beyond presentation: the first entry is the dive's primary site. Wraps
// the generic `CreatableCombobox` for the "add a site" input, plus a
// drag-sortable list of the sites already added.
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

  const reorder = useCallback(
    (from: number, to: number) => onChange(moveItem(value, from, to)),
    [value, onChange],
  );

  const { draggingIndex, dragOffset, setItemRef, handleProps } = useDragSort({
    itemCount: value.length,
    onReorder: reorder,
    disabled,
  });

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
        // Text selection would otherwise sweep across the rows mid-drag.
        <ul
          className={cn("space-y-1", draggingIndex !== null && "select-none")}
        >
          {value.map((id, index) => {
            const site = diveSites.find((s) => s.uuid === id);
            const label = site ? site.name : `Dive site #${id}`;
            const isDragging = draggingIndex === index;
            return (
              <li
                key={id}
                ref={setItemRef(index)}
                className={cn(
                  "flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm",
                  isDragging && "relative z-10 shadow-lg ring-2 ring-ring",
                )}
                // The dragged row is translated to follow the pointer; the rest
                // stay put and are simply re-ordered around it by React.
                style={
                  isDragging
                    ? { transform: `translateY(${dragOffset}px)` }
                    : undefined
                }
              >
                {value.length > 1 && (
                  <button
                    type="button"
                    // The gesture's keyboard equivalent lives on this button
                    // (Up/Down), so the label has to say so - "drag to reorder"
                    // alone would be a dead end for keyboard users. Order is
                    // meaningful here, so the label names the primary slot too.
                    aria-label={`Reorder ${label}, position ${index + 1} of ${value.length}${
                      index === 0 ? " (primary site)" : ""
                    }. Use arrow up and arrow down to move it.`}
                    disabled={disabled}
                    className="shrink-0 cursor-grab rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                    {...handleProps(index)}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                )}
                <span className="flex-1 truncate">
                  {label}
                  {site?.location && (
                    <span className="text-muted-foreground">
                      , {site.location}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label="Remove"
                  disabled={disabled}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
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
          hint: site.location,
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
        keepOpenOnSelect
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
