"use client";

import {
  scheduleFromDueEntry,
  serviceKindAndLabel,
  serviceKindLabel,
  type GearServiceDueEntry,
} from "@/lib/api/gear-service";
import { formatServiceDueQualifier, serviceStatus } from "@/lib/gear-service";
import { TruncatedNote } from "@/components/ui/truncated-note";
import { ServiceStatusBadge } from "@/components/gear/service-status-badge";
import { NotificationRow } from "@/components/layout/notification-row";

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
  // Called as a row's title link is followed, so whatever holds the list can close.
  onNavigate: () => void;
  // A click on the row. The dialog is the caller's to mount: this list sits in a
  // popover that is gone by the time the dialog is filled in.
  onLogService: (entry: GearServiceDueEntry) => void;
}

// Gear that needs attention, one row per schedule. The item's name goes to its page;
// the rest of the row logs the service.
export function ServiceDueList({
  entries,
  truncated,
  onNavigate,
  onLogService,
}: ServiceDueListProps) {
  return (
    <div className="space-y-1">
      {entries.map((entry) => {
        const schedule = scheduleFromDueEntry(entry);
        const itemLabel = gearItemLabel(entry);

        return (
          <NotificationRow
            key={entry.schedule_uuid}
            title={itemLabel}
            href={`/gear/${entry.gear_item_uuid}`}
            subtitle={`${serviceKindLabel(entry.kind)}${entry.label ? ` (${entry.label})` : ""}`}
            badge={
              <ServiceStatusBadge
                status={serviceStatus(schedule, entry.gear_item_dive_count)}
              />
            }
            qualifier={formatServiceDueQualifier(
              schedule,
              entry.gear_item_dive_count,
            )}
            // Named after the item as well as the kind, because this list spans items:
            // the gear detail card's `Log service for Service (First stage)` is unique
            // on a page about one regulator and says nothing here.
            actionLabel={`Log service for ${serviceKindAndLabel(entry)} on ${itemLabel}`}
            onAction={() => onLogService(entry)}
            onNavigate={onNavigate}
          />
        );
      })}
      {truncated && <TruncatedNote where="your gear" />}
    </div>
  );
}
