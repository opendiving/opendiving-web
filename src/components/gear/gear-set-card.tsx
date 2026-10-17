"use client";

import { Copy, Edit } from "lucide-react";
import { GearSet, gearItemLabel } from "@/lib/api/gear";
import { formatWeight } from "@/lib/units";
import { useUnits } from "@/hooks/useUnits";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteMenuItem } from "@/components/ui/item-actions-menu";
import { FactsLine } from "@/components/ui/icon-fact";
import { PlainCard } from "@/components/ui/plain-card";
import { CardFigure, CardFigures } from "@/components/dives/card-figure";

interface GearSetCardProps {
  set: GearSet;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

// One gear set as a card, on /gear: the kit it loads into a dive under its
// name, and the ballast it brings. A set has no page of its own, so the card
// links nowhere; it is edited from its menu.
export function GearSetCard({
  set,
  onEdit,
  onDuplicate,
  onDelete,
  isDeleting,
}: GearSetCardProps) {
  const units = useUnits();

  return (
    <PlainCard
      title={set.name}
      // Said rather than left blank: an empty set is one a diver made and is
      // about to fill, not a broken card.
      line={
        set.gear_items.length === 0 ? (
          <span className="text-muted-foreground">Empty</span>
        ) : (
          <FactsLine facts={set.gear_items.map(gearItemLabel)} />
        )
      }
      actionsLabel={`Actions for ${set.name}`}
      actions={
        <>
          <DropdownMenuItem onSelect={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </DropdownMenuItem>
          <DeleteMenuItem onSelect={onDelete} disabled={isDeleting} />
        </>
      }
    >
      <CardFigures>
        <CardFigure label="Items" value={set.gear_items.length} />
        <CardFigure
          label="Weight"
          value={set.weight != null ? formatWeight(set.weight, units) : null}
        />
      </CardFigures>
    </PlainCard>
  );
}
