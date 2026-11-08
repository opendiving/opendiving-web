"use client";

import { useCallback, useState } from "react";
import { IconTooltip } from "@/components/ui/tooltip";
import { AlertTriangle, GripVertical, MapPinned, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormControlA11yProps } from "@/components/ui/form";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { DiveSiteSummary } from "@/lib/api/dives";
import type { LatLon } from "@/lib/basemap";
import { SiteFinderDialog } from "@/components/sites/finder/site-finder-dialog";
import { SiteProposalFlow } from "@/components/sites/site-proposal-flow";
import { useDiveFormFinderOpening } from "@/hooks/useDiveFormFinderOpening";
import { moveItem, useDragSort } from "@/hooks/useDragSort";
import { useLookupLabels } from "@/hooks/useLookupLabels";
import { useUnits } from "@/hooks/useUnits";
import { diveSiteMismatches } from "@/lib/dive-site-mismatches";
import { cn } from "@/lib/utils";

const lookupDiveSites = (uuids: string[]) =>
  diveSitesAPI.lookupDiveSitesByUuid(uuids);

export interface DiveSitesFieldProps extends FormControlA11yProps {
  // Ordered list of selected dive site uuids - the first entry is the primary
  // site (e.g. shown as "Site Name +2" wherever only one site fits).
  value: string[];
  // Names for the sites already in `value`, when the caller has them (the edit
  // form does: `Dive.dive_sites` carries them). Purely an optimization - any
  // uuid not covered here is fetched individually - but it saves a request per
  // site on the form that always has selections.
  knownSites?: DiveSiteSummary[];
  onChange: (diveSiteUuids: string[]) => void;
  // The dive's start time, as the form holds it - see `TripCombobox.until`.
  until?: string;
  // The dive's GPS fix - an attached file's, or the one a saved dive carries -
  // and its trip: where the finder opens when no chosen site has a pin.
  diveFix?: LatLon | null;
  tripUuid?: string | null;
  disabled?: boolean;
}

// The dive's sites, in the order they were visited - which matters beyond
// presentation: the first entry is the dive's primary site. A drag-sortable list
// of the sites added, and a button that opens the site finder to add another,
// whose search is the field's only typing path. A pick names a Commons record as
// it stands: the API saves one for the diver when the dive is saved. The names of
// the *selected* sites are tracked here, in `records`, since the finder's rows
// are gone once it closes.
export function DiveSitesField({
  value,
  knownSites,
  onChange,
  until,
  diveFix,
  tripUuid,
  disabled,
  // Forwarded to the button that opens the finder - the field's one control the
  // label names. The selected-sites list above it is a `<ul>` of remove buttons,
  // which the label has nothing to say about.
  ...slotProps
}: DiveSitesFieldProps) {
  // Lookup rows, which label the selection and carry the water type and altitude
  // a dive's embedded summary does not. A site `knownSites` already names is read
  // only once there is a second site to compare the first with; any other -
  // pre-selected by uuid alone (`/dives/new?dive_site_uuid=...`) - is read so a
  // selection never renders nameless. One lookup narrowed to those uuids.
  const {
    records,
    remember: rememberRecord,
    unresolved,
  } = useLookupLabels(
    lookupDiveSites,
    value.filter(
      (uuid) =>
        value.length > 1 || !knownSites?.some((site) => site.uuid === uuid),
    ),
  );
  const units = useUnits();
  const [isFinding, setFinding] = useState(false);
  const [proposing, setProposing] = useState<DiveSite | null>(null);
  // Read through the `knownSites` prop rather than copied into `records`: the copy
  // wouldn't have landed yet on the render that first sees a selection.
  const labelFor = (uuid: string): DiveSiteSummary | undefined =>
    records[uuid] ?? knownSites?.find((site) => site.uuid === uuid);

  // A site whose read came back empty is one with no pin to open on.
  const opening = useDiveFormFinderOpening({
    active: isFinding,
    sites: value.map((uuid) => (unresolved.has(uuid) ? {} : labelFor(uuid))),
    fix: diveFix,
    tripUuid,
    startTime: until,
  });

  // Nothing until every site is read: the first site recording a water type may
  // be one still on its way.
  const siteRecords = value.map((uuid) => records[uuid]);
  const mismatches =
    value.length > 1 && siteRecords.every(Boolean)
      ? diveSiteMismatches(siteRecords, units)
      : [];

  const addSite = (id: string) => {
    if (value.includes(id)) return;
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

  const handleCreated = (newDiveSite: DiveSite, proposes: boolean) => {
    rememberRecord(newDiveSite);
    addSite(newDiveSite.uuid);
    if (proposes) setProposing(newDiveSite);
  };

  // The record takes the retired site's place in the order, or the site simply
  // goes where the dive already names the record.
  const swapSite = (retired: string, record: DiveSite) => {
    rememberRecord(record);
    onChange(
      value.includes(record.uuid)
        ? value.filter((id) => id !== retired)
        : value.map((id) => (id === retired ? record.uuid : id)),
    );
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
                  "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-background px-2 py-1.5 text-sm touch:min-h-11",
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
                      className="relative shrink-0 cursor-grab rounded text-muted-foreground touch:tap-target hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="relative shrink-0 text-muted-foreground hover:text-foreground touch:tap-target"
                    onClick={() => removeSite(id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </IconTooltip>
                {/* Under the name, past the handle - only a list of two or more
                    has warnings, and only such a list has handles. */}
                {mismatches[index]?.map((mismatch) => (
                  <p
                    key={mismatch}
                    className="flex basis-full items-start gap-1.5 pl-6 text-xs text-warning"
                  >
                    <AlertTriangle
                      className="mt-px h-3.5 w-3.5 shrink-0"
                      aria-hidden
                    />
                    <span>{mismatch}</span>
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      <Button
        {...slotProps}
        type="button"
        variant="outline"
        disabled={disabled}
        className="w-full justify-start font-normal text-muted-foreground"
        onClick={() => setFinding(true)}
      >
        <MapPinned className="mr-2 h-4 w-4" />
        {value.length ? "Add another dive site..." : "Select a dive site..."}
      </Button>

      {/* Its rows wait on `isFinding`: shut, it asks nothing and reads no trip. */}
      <SiteFinderDialog
        open={isFinding}
        onOpenChange={setFinding}
        opening={opening}
        until={until}
        chosen={value}
        onPick={(uuid, row) => {
          if (row) rememberRecord(row);
          addSite(uuid);
        }}
        onCreated={handleCreated}
      />

      <SiteProposalFlow
        site={proposing}
        onClose={() => setProposing(null)}
        onSaved={(saved) => {
          rememberRecord(saved);
          setProposing(saved);
        }}
        onReplaced={(record) => {
          if (proposing) swapSite(proposing.uuid, record);
        }}
      />
    </div>
  );
}
