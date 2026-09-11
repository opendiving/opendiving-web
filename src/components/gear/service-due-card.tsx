"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Wrench } from "lucide-react";
import {
  gearServiceAPI,
  scheduleFromDueEntry,
  serviceKindAndLabel,
  serviceKindLabel,
  type GearServiceDueEntry,
} from "@/lib/api/gear-service";
import { formatServiceDue, serviceStatus } from "@/lib/gear-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTooltip } from "@/components/ui/tooltip";
import { TruncatedNote } from "@/components/ui/truncated-note";
import { ServiceStatusBadge } from "@/components/gear/service-status-badge";
import { GearServiceRecordDialog } from "@/components/gear/gear-service-record-dialog";

interface ServiceDueCardProps {
  userId: string;
}

// How a row names its gear item: brand and model where there is a brand. Unlike the gear
// detail card, this list spans every item a diver owns, so the item is what tells one row
// from the next - and the kind is only what separates two rows of the same item.
function gearItemLabel(entry: GearServiceDueEntry): string {
  return entry.gear_item_brand
    ? `${entry.gear_item_brand} ${entry.gear_item_name}`
    : entry.gear_item_name;
}

// Dashboard card listing gear that needs attention.
//
// Renders **nothing at all** when nothing is due (or when the fetch fails): a permanent
// "all your gear is fine" tile is dashboard noise that trains people to stop reading
// the dashboard. It appears only when there is something to act on.
//
// The API returns every active schedule with no date horizon - a server-side "due within
// N days" filter would bake today's date into a cached response and go wrong at
// midnight - so the bucketing happens here.
export function ServiceDueCard({ userId }: ServiceDueCardProps) {
  const [due, setDue] = useState<GearServiceDueEntry[]>([]);
  // The API caps how many schedules it returns. Without surfacing that, a diver past
  // the cap sees a card that looks complete while some overdue kit isn't in it.
  const [truncated, setTruncated] = useState(false);
  // The row whose service is being logged, or `null` for "no dialog". The whole entry
  // rather than its uuid: the dialog needs the item to post against and the schedule to
  // prefill from, and both travel on the row that was clicked.
  const [loggingFor, setLoggingFor] = useState<GearServiceDueEntry | null>(
    null,
  );

  // `isCancelled` is supplied by the mount effect alone, the same way `GearServiceCard`
  // passes its `AbortSignal`. The refetch after a logged service leaves it at the
  // default: it answers a save the diver is watching for, so there is nothing to
  // cancel it against.
  //
  // A `.then()` chain rather than `async`/`await`, which is what the effect below needs:
  // `react-hooks/set-state-in-effect` reads an awaited call as a synchronous `setState`
  // in the effect body, and these updates happen in a promise callback.
  const load = useCallback(
    (isCancelled: () => boolean = () => false) =>
      gearServiceAPI
        .getDue(userId)
        .then((response) => {
          if (isCancelled()) return;
          setDue(
            response.data.filter(
              (entry) =>
                serviceStatus(
                  scheduleFromDueEntry(entry),
                  entry.gear_item_dive_count,
                ) !== "ok",
            ),
          );
          setTruncated(response.truncated === true);
        })
        // Swallowed on purpose: this is a supplementary card, and a failed fetch should
        // leave the dashboard looking normal rather than showing an error tile.
        .catch((error) => console.error("Failed to load service due:", error)),
    [userId],
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void load(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [userId, load]);

  // Memoised because the dialog resets its form whenever this prop's identity changes:
  // a fresh view built during render would wipe half-typed notes on the card's next
  // render. Derived rather than stored, so the two can't disagree.
  const loggingSchedule = useMemo(
    () => (loggingFor ? scheduleFromDueEntry(loggingFor) : null),
    [loggingFor],
  );

  if (due.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" />
          Service due
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {due.map((entry) => {
          const schedule = scheduleFromDueEntry(entry);
          const status = serviceStatus(schedule, entry.gear_item_dive_count);
          const itemLabel = gearItemLabel(entry);

          return (
            // The link and the button are siblings rather than nested: a button inside
            // an anchor is invalid, and a click on it would navigate as well as open
            // the dialog. The link keeps the row's own `justify-between`, so the chips
            // still line up down the card - one button width in from the edge now.
            <div key={entry.schedule_uuid} className="flex items-center gap-2">
              <Link
                href={`/gear/${entry.gear_item_uuid}`}
                className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 hover:underline"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{itemLabel}</div>
                  <div className="text-xs text-muted-foreground">
                    {serviceKindLabel(entry.kind)}
                    {entry.label ? ` (${entry.label})` : ""}
                  </div>
                </div>
                <ServiceStatusBadge
                  status={status}
                  detail={formatServiceDue(
                    schedule,
                    entry.gear_item_dive_count,
                  )}
                  detailFirst
                />
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
                  onClick={() => setLoggingFor(entry)}
                >
                  <ClipboardCheck className="h-4 w-4" />
                </Button>
              </IconTooltip>
            </div>
          );
        })}
        {truncated && <TruncatedNote where="your gear" />}
      </CardContent>

      {/* Mounted only while a row is being logged, unlike the gear detail card's copy:
          that card is about one item and can hold a closed dialog open-ready, this one
          has no subject at all until a row is picked. */}
      {loggingFor && (
        <GearServiceRecordDialog
          gearItemUuid={loggingFor.gear_item_uuid}
          gearItemLabel={gearItemLabel(loggingFor)}
          open
          onOpenChange={(open) => !open && setLoggingFor(null)}
          schedule={loggingSchedule}
          // The logged service resets the schedule's due date, so the row this was
          // opened from usually leaves the list - and the card with it, when it was the
          // last one.
          onSaved={() => void load()}
        />
      )}
    </Card>
  );
}
