"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  // Puts the detail first and the badge after it. For the notifications bell's
  // service-due list, whose rows are `justify-between`: badge-first leaves the chip
  // stranded in the middle of the row, and the eye-catching thing wants to be at the
  // edge the rows align on - which is also where it goes when the pair wraps. Everywhere else the badge leads, because it is the column header's
  // subject and nothing right of it lines up.
  detailFirst?: boolean;
}

// The one place service status turns into pixels, shared by the gear list, the gear
// detail card and the notifications bell so the three can't drift apart.
export function ServiceStatusBadge({
  status,
  detail,
  detailFirst = false,
}: ServiceStatusBadgeProps) {
  if (status === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  // One width for all three, so a column of them reads as a scale rather than as
  // three differently-sized chips: "In service" is the widest at ~79px, and 6rem
  // clears it with room for a fallback font. `justify-center` is what the extra
  // width is spent on - `Badge` is `inline-flex items-center` and would otherwise
  // leave the label hard against the left padding.
  //
  // `whitespace-nowrap` guards that headroom rather than fixing anything visible
  // today: the labels fit inside 6rem in Inter, and a two-line pill is the one way
  // this fails once they don't - a fallback font while Inter loads, a browser
  // minimum-font-size, or a longer label added later. A chip that overflows is
  // obvious; one that silently grows to two lines is not.
  const badge = (
    <Badge
      variant={serviceStatusBadgeVariant(status)}
      className="min-w-24 justify-center whitespace-nowrap"
    >
      {serviceStatusLabel(status)}
    </Badge>
  );
  const detailText = detail ? (
    <span className="text-xs text-muted-foreground">{detail}</span>
  ) : null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        detailFirst && "justify-end",
      )}
    >
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
