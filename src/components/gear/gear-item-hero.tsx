"use client";

import type { ReactNode } from "react";
import { Backpack } from "lucide-react";
import { GearItem, gearTypeLabel } from "@/lib/api/gear";
import { nextService } from "@/lib/gear-service";
import { formatDateOnly } from "@/lib/date-time";
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
  ]
    .filter(Boolean)
    .join(" · ");

  const figures: MapHeroFigure[] = [
    { label: "Dives", value: gearItem.dive_count },
  ];
  const next = nextService(gearItem.service ?? [], gearItem.dive_count);
  if (next) {
    figures.push({
      label: "Next service",
      value:
        next.kind === "overdue"
          ? "Overdue"
          : next.kind === "date"
            ? formatDateOnly(next.on)
            : `In ${next.remaining} dive${next.remaining === 1 ? "" : "s"}`,
    });
  }

  return (
    <PlainHero
      backHref={back.href}
      backLabel={back.label}
      icon={Backpack}
      actions={actions}
      title={gearItem.name}
      subtitle={subtitle || undefined}
      figures={figures}
    />
  );
}
