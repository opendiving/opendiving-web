"use client";

import type { ReactNode } from "react";
import { Backpack } from "lucide-react";
import { GearItem, gearTypeLabel } from "@/lib/api/gear";
import { countOf, nextService } from "@/lib/gear-service";
import { formatDateOnly, formatDurationHoursMinutes } from "@/lib/date-time";
import { vesselFactParts } from "@/lib/gear-vessel";
import { useUnits } from "@/hooks/useUnits";
import { PlainHero, type MapHeroFigure } from "@/components/ui/map-hero";
import type { ReturnTarget } from "@/lib/return-to";

// The gear page's heading. Gear has no place, so it has no map: the same
// heading as a trip's or a site's, without the band.
export function GearItemHero({
  gearItem,
  back,
  actions,
}: {
  gearItem: GearItem;
  back: ReturnTarget;
  actions?: ReactNode;
}) {
  const subtitle = [
    gearTypeLabel(gearItem.type),
    gearItem.brand,
    gearItem.rented ? "Rented" : null,
    gearItem.is_archived ? "Archived" : null,
  ];

  const { preferences: units } = useUnits();
  const figures: MapHeroFigure[] = [];
  // The vessel's facts lead where it records any - meaningful on a cylinder, and
  // shown on whatever type carries them, as an import may leave them on an untyped
  // item.
  const vessel = vesselFactParts(gearItem, units);
  if (vessel.length > 0) {
    figures.push({ label: "Cylinder", value: vessel.join(" · ") });
  }
  figures.push(
    { label: "Dives", value: gearItem.dive_count },
    // The label the dive page gives a dive's own time, since this is those summed.
    {
      label: "Dive time",
      value: formatDurationHoursMinutes(gearItem.dive_time),
    },
  );
  const next = nextService(
    gearItem.service ?? [],
    gearItem.dive_count,
    gearItem.dive_time,
  );
  if (next) {
    figures.push({
      label: "Next service",
      value:
        next.kind === "overdue"
          ? "Overdue"
          : next.kind === "date"
            ? formatDateOnly(next.on)
            : `In ${countOf(next.remaining, next.kind === "dives" ? "dive" : "hour")}`,
    });
  }

  return (
    <PlainHero
      backHref={back.href}
      backLabel={back.label}
      icon={Backpack}
      actions={actions}
      title={gearItem.name}
      subtitle={subtitle}
      figures={figures}
    />
  );
}
