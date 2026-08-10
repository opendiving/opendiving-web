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
}

// The one place service status turns into pixels, shared by the gear list, the gear
// detail card and the dashboard so the three can't drift apart.
export function ServiceStatusBadge({
  status,
  detail,
}: ServiceStatusBadgeProps) {
  if (status === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={serviceStatusBadgeVariant(status)}>
        {serviceStatusLabel(status)}
      </Badge>
      {detail && (
        <span className="text-xs text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}
