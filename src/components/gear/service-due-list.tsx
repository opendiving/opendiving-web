"use client";

import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import {
  scheduleFromDueEntry,
  serviceKindAndLabel,
  serviceKindLabel,
  type GearServiceDueEntry,
} from "@/lib/api/gear-service";
import { formatServiceDue, serviceStatus } from "@/lib/gear-service";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { TruncatedNote } from "@/components/ui/truncated-note";
import { ServiceStatusBadge } from "@/components/gear/service-status-badge";

// How a row names its gear item: brand and model where there is a brand. Unlike the gear
// detail card, this list spans every item a diver owns, so the item is what tells one row
// from the next - and the kind is only what separates two rows of the same item.
export function gearItemLabel(entry: GearServiceDueEntry): string {
  return entry.gear_item_brand
    ? `${entry.gear_item_brand} ${entry.gear_item_name}`
    : entry.gear_item_name;
}

interface ServiceDueListProps {
  // Only the schedules worth saying something about - due soon or overdue.
  entries: GearServiceDueEntry[];
  truncated: boolean;
  // Called as a row's link is followed, so whatever holds the list can close.
  onNavigate: () => void;
  // The row's log-service button. The dialog is the caller's to mount: this list sits in
  // a popover that is gone by the time the dialog is filled in.
  onLogService: (entry: GearServiceDueEntry) => void;
}

// Gear that needs attention, one row per schedule, each logging its service in place.
export function ServiceDueList({
  entries,
  truncated,
  onNavigate,
  onLogService,
}: ServiceDueListProps) {
  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const schedule = scheduleFromDueEntry(entry);
        const status = serviceStatus(schedule, entry.gear_item_dive_count);
        const itemLabel = gearItemLabel(entry);

        return (
          // The link and the button are siblings rather than nested: a button inside
          // an anchor is invalid, and a click on it would navigate as well as open
          // the dialog. The chip keeps to the link's right edge, so the chips line up
          // down the list - one button width in from the edge - and `ml-auto` holds it
          // there on the second line the panel's width usually wraps it onto.
          //
          // `items-start` matches the gear detail card's schedule rows, and only
          // shows where the link wraps its badge onto a second line: the action then
          // sits level with the item name rather than floating between the two lines.
          <div key={entry.schedule_uuid} className="flex items-start gap-2">
            <Link
              href={`/gear/${entry.gear_item_uuid}`}
              onClick={onNavigate}
              className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 hover:underline"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{itemLabel}</div>
                <div className="text-xs text-muted-foreground">
                  {serviceKindLabel(entry.kind)}
                  {entry.label ? ` (${entry.label})` : ""}
                </div>
              </div>
              <div className="ml-auto">
                <ServiceStatusBadge
                  status={status}
                  detail={formatServiceDue(
                    schedule,
                    entry.gear_item_dive_count,
                  )}
                  detailFirst
                />
              </div>
            </Link>
            {/* Named after the item as well as the kind, because this list spans
                items: the gear detail card's `Log service for Service (First stage)`
                is unique on a page about one regulator and says nothing here. */}
            <IconTooltip
              label={`Log service for ${serviceKindAndLabel(entry)} on ${itemLabel}`}
            >
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => onLogService(entry)}
              >
                <ClipboardCheck className="h-4 w-4" />
              </Button>
            </IconTooltip>
          </div>
        );
      })}
      {truncated && <TruncatedNote where="your gear" />}
    </div>
  );
}
