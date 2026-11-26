"use client";

import { gearTypeLabel, type GearItem } from "@/lib/api/gear";
import { vesselFactParts } from "@/lib/gear-vessel";
import { useUnits } from "@/hooks/useUnits";
import {
  customPropertiesSections,
  RecordInfoDialog,
  type RecordInfoSection,
} from "@/components/ui/record-info-dialog";

// The item's own fields in the gear form's order, then its custom properties.
// Its service schedule and the dives it was used on are the page's cards.
export function GearItemInfoDialog({ gearItem }: { gearItem: GearItem }) {
  const units = useUnits();
  const vessel = vesselFactParts(gearItem, units);
  const sections: RecordInfoSection[] = [
    {
      facts: [
        { label: "Name", value: gearItem.name },
        { label: "Brand", value: gearItem.brand },
        { label: "Type", value: gearTypeLabel(gearItem.type) },
        // A vessel's facts only where it is one, as the form shows them.
        ...(vessel.length > 0
          ? [{ label: "Cylinder", value: vessel.join(" · ") }]
          : []),
        { label: "Rented", value: gearItem.rented ? "Yes" : "No" },
        { label: "Notes", value: gearItem.notes, wide: true },
      ],
    },
    ...customPropertiesSections(gearItem.custom_properties),
  ];

  return <RecordInfoDialog title="Gear information" sections={sections} />;
}
