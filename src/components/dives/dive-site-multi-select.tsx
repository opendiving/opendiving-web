"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconTooltip } from "@/components/ui/tooltip";
import { GripVertical, X } from "lucide-react";
import {
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { DiveSiteSummary } from "@/lib/api/dives";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { moveItem, useDragSort } from "@/hooks/useDragSort";
import { cn } from "@/lib/utils";

// How many sites the dropdown asks for at a time. Enough to scroll through
// before typing, far short of the API's 100 cap.
const SITES_PER_SEARCH = 25;

export interface DiveSiteMultiSelectProps extends FormControlSlotProps {
  // Ordered list of selected dive site uuids - the first entry is the primary
  // site (e.g. shown as "Site Name +2" wherever only one site fits).
  value: string[];
  // Names for the sites already in `value`, when the caller has them (the edit
  // form does: `Dive.dive_sites` carries them). Purely an optimization - any
  // uuid not covered here is fetched individually - but it saves a request per
  // site on the form that always has selections.
  knownSites?: DiveSiteSummary[];
  onChange: (diveSiteUuids: string[]) => void;
  disabled?: boolean;
}

// Lets the user pick one or more dive sites for a dive (e.g. a drift dive that
// crosses several named sites), in the order they were visited - which matters
// here beyond presentation: the first entry is the dive's primary site. Wraps
// the generic `CreatableCombobox` for the "add a site" input, plus a
// drag-sortable list of the sites already added.
//
// The dropdown searches server-side (`CreatableCombobox`'s `onSearch`) rather
// than fetching the user's whole catalogue up front - see DECISIONS.md. The
// names of *selected* sites are therefore tracked separately, in `labels`,
// since a picked site drops out of the results as soon as the query changes.
export function DiveSiteMultiSelect({
  value,
  knownSites,
  onChange,
  disabled,
  // Forwarded to the "add a site" combobox - the field's one focusable control.
  // The selected-sites list above it is a `<ul>` of remove buttons, which the
  // label has nothing to say about.
  ...slotProps
}: DiveSiteMultiSelectProps) {
  const [labels, setLabels] = useState<Record<string, DiveSiteSummary>>({});
  const [showNewDialog, setShowNewDialog] = useState(false);
  // Every uuid a single-site lookup has already been fired for, successful or not.
  const requestedRef = useRef<Set<string>>(new Set());

  const rememberLabel = useCallback(
    (site: DiveSiteSummary) =>
      setLabels((prev) => ({ ...prev, [site.uuid]: site })),
    [],
  );

  // Read through the `knownSites` prop rather than copying it into `labels` via
  // an effect: the copy wouldn't have landed yet on the render that first sees a
  // selection, so the lookup below would fire for sites the caller had already
  // handed over.
  const labelFor = (uuid: string): DiveSiteSummary | undefined =>
    labels[uuid] ?? knownSites?.find((site) => site.uuid === uuid);

  // Resolve any selected site whose name isn't already known - which is how a
  // site pre-selected by uuid alone (`/dives/new?dive_site_uuid=...`) gets a
  // name, and the safety net that keeps a selection from ever rendering
  // nameless. A dive has a handful of sites at most, so these are one-off
  // single-record fetches, not a list scan.
  useEffect(() => {
    const unresolved = value.filter(
      (uuid) =>
        !labels[uuid] &&
        !knownSites?.some((site) => site.uuid === uuid) &&
        !requestedRef.current.has(uuid),
    );
    if (unresolved.length === 0) return;

    // Marked before the request, not after: a failed lookup must not be retried
    // on every subsequent render, and this effect re-runs whenever `labels`
    // changes - i.e. after each sibling lookup that did succeed.
    //
    // That same guard is why there's no cancellation flag here: it makes each
    // uuid fetch exactly once, so under StrictMode's mount/unmount/remount the
    // only in-flight lookup belongs to the discarded first mount, and ignoring
    // its result would drop the name for good. Writing to a uuid-keyed map is
    // idempotent, so a late arrival is always safe to apply.
    unresolved.forEach((uuid) => requestedRef.current.add(uuid));

    unresolved.forEach(async (uuid) => {
      try {
        rememberLabel(await diveSitesAPI.getDiveSite(uuid));
      } catch (error) {
        console.error("Failed to fetch dive site:", error);
      }
    });
  }, [value, labels, knownSites, rememberLabel]);

  const searchDiveSites = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const response = await diveSitesAPI.getDiveSites(
        1,
        SITES_PER_SEARCH,
        query,
      );
      // Every site the dropdown shows is remembered, so picking one never needs
      // the record fetched straight back just to label its row.
      response.data.forEach(rememberLabel);
      return {
        items: response.data.map((site) => ({
          id: site.uuid,
          name: site.name,
          hint: site.location?.name,
        })),
        hasMore: response.has_more,
      };
    },
    [rememberLabel],
  );

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
    rememberLabel(newDiveSite);
    addSite(newDiveSite.uuid);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        // Text selection would otherwise sweep across the rows mid-drag.
        <ul
          className={cn("space-y-1", draggingIndex !== null && "select-none")}
        >
          {value.map((id, index) => {
            const site = labelFor(id);
            // The fallback is only ever visible for the moment between a site
            // being selected and its name being resolved.
            const label = site ? site.name : "Dive site...";
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
                {/* The gesture's keyboard equivalent lives on this button
                    (Up/Down), so the label has to say so - "drag to reorder"
                    alone would be a dead end for keyboard users. Order is
                    meaningful here, so the label names the primary slot too.
                    It is a long thing to read off a hover chip, and it is still
                    the right text: the hint has to show what the button is
                    called, and this is what it is called. */}
                {value.length > 1 && (
                  <IconTooltip
                    label={`Reorder ${label}, position ${index + 1} of ${value.length}${
                      index === 0 ? " (primary site)" : ""
                    }. Use arrow up and arrow down to move it.`}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      className="shrink-0 cursor-grab rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                      {...handleProps(index)}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </IconTooltip>
                )}
                <span className="flex-1 truncate">
                  {label}
                  {site?.location?.name && (
                    <span className="text-muted-foreground">
                      , {site.location.name}
                    </span>
                  )}
                </span>
                <IconTooltip label={`Remove ${label}`}>
                  <button
                    type="button"
                    disabled={disabled}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => removeSite(id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </IconTooltip>
              </li>
            );
          })}
        </ul>
      )}

      <CreatableCombobox
        {...slotProps}
        onSearch={searchDiveSites}
        // Already-selected sites are hidden from the "add a site" dropdown so
        // the same site can't be added twice. Excluded here rather than in the
        // query, which would silently shrink the page and change what
        // `has_more` means.
        excludeIds={value}
        value={undefined}
        onChange={addSite}
        disabled={disabled}
        placeholder={
          value.length ? "Add another dive site..." : "Select a dive site..."
        }
        noItemsLabel="No dive sites yet."
        noMatchesLabel="No dive sites match."
        addNewLabel="Add dive site..."
        keepOpenOnSelect
        onAddNew={() => setShowNewDialog(true)}
      />

      <DiveSiteDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSaved={handleCreated}
      />
    </div>
  );
}
