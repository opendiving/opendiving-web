"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wrench } from "lucide-react";
import {
  gearServiceAPI,
  scheduleFromDueEntry,
  serviceKindLabel,
  type GearServiceDueEntry,
} from "@/lib/api/gear-service";
import { formatServiceDue, serviceStatus } from "@/lib/gear-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TruncatedNote } from "@/components/ui/truncated-note";
import { ServiceStatusBadge } from "@/components/gear/service-status-badge";

interface ServiceDueCardProps {
  userId: string;
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

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    gearServiceAPI
      .getDue(userId)
      .then((response) => {
        if (cancelled) return;
        const needsAttention = response.data.filter(
          (entry) =>
            serviceStatus(
              scheduleFromDueEntry(entry),
              entry.gear_item_dive_count,
            ) !== "ok",
        );
        setDue(needsAttention);
        setTruncated(response.truncated === true);
      })
      // Swallowed on purpose: this is a supplementary card, and a failed fetch should
      // leave the dashboard looking normal rather than showing an error tile.
      .catch((error) => console.error("Failed to load service due:", error));

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (due.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" />
          Service due
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {due.map((entry) => {
          const schedule = scheduleFromDueEntry(entry);
          const status = serviceStatus(schedule, entry.gear_item_dive_count);
          const label = entry.gear_item_brand
            ? `${entry.gear_item_brand} ${entry.gear_item_name}`
            : entry.gear_item_name;

          return (
            <Link
              key={entry.schedule_uuid}
              href={`/gear/${entry.gear_item_uuid}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 hover:underline"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">
                  {serviceKindLabel(entry.kind)}
                  {entry.label ? ` (${entry.label})` : ""}
                </div>
              </div>
              <ServiceStatusBadge
                status={status}
                detail={formatServiceDue(schedule, entry.gear_item_dive_count)}
              />
            </Link>
          );
        })}
        {truncated && <TruncatedNote where="your gear" />}
      </CardContent>
    </Card>
  );
}
