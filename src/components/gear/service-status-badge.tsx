"use client";

import { Badge } from "@/components/ui/badge";
import {
  serviceStatusBadgeVariant,
  serviceStatusLabel,
  type ServiceStatus,
} from "@/lib/gear-service";

interface ServiceStatusBadgeProps {
  // `null` means the item has no service schedules at all. Rendered as a muted dash
  // rather than a reassuring "In service" badge: nothing is being tracked, which isn't
  // the same as everything being fine.
  status: ServiceStatus | null;
  // Optional extra context shown beside the badge, e.g. "Due in 10 days".
  detail?: string;
  // Puts the detail first and the badge after it. For the dashboard's service-due
  // card, whose rows are `justify-between`: badge-first leaves the chip stranded in
  // the middle of the row, and the eye-catching thing wants to be at the edge the
  // rows align on. Everywhere else the badge leads, because it is the column header's
  // subject and nothing right of it lines up.
  detailFirst?: boolean;
}

// The one place service status turns into pixels, shared by the gear list, the gear
// detail card and the dashboard so the three can't drift apart.
export function ServiceStatusBadge({
  status,
  detail,
  detailFirst = false,
}: ServiceStatusBadgeProps) {
  if (status === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  const badge = (
    <Badge variant={serviceStatusBadgeVariant(status)}>
      {serviceStatusLabel(status)}
    </Badge>
  );
  const detailText = detail ? (
    <span className="text-xs text-muted-foreground">{detail}</span>
  ) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {detailFirst ? (
        <>
          {detailText}
          {badge}
        </>
      ) : (
        <>
          {badge}
          {detailText}
        </>
      )}
    </div>
  );
}
