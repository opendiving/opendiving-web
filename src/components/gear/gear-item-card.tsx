"use client";

import { Archive, ArchiveRestore, Edit } from "lucide-react";
import { GearItem, gearItemLabel, gearTypeLabel } from "@/lib/api/gear";
import { worstServiceStatus } from "@/lib/gear-service";
import { vesselFactParts } from "@/lib/gear-vessel";
import { formatDurationHoursMinutes } from "@/lib/date-time";
import { useUnits } from "@/hooks/useUnits";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteMenuItem } from "@/components/ui/item-actions-menu";
import { FactsLine } from "@/components/ui/icon-fact";
import { PlainCard } from "@/components/ui/plain-card";
import { CardFigure, CardFigures } from "@/components/dives/card-figure";
import { ServiceStatusBadge } from "@/components/gear/service-status-badge";

interface GearItemCardProps {
  item: GearItem;
  onEdit: () => void;
  onArchiveToggle: () => void;
  isArchiving: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}

// One piece of gear as a card, on /gear: what its page's hero says of it - its
// type and brand under its name, and the cylinder's own facts where it records
// them - with its service status beside the name and what it has been dived.
export function GearItemCard({
  item,
  onEdit,
  onArchiveToggle,
  isArchiving,
  onDelete,
  isDeleting,
}: GearItemCardProps) {
  const units = useUnits();
  const label = gearItemLabel(item);
  const facts = [
    gearTypeLabel(item.type),
    item.brand,
    ...vesselFactParts(item, units),
  ].filter(Boolean);
  // No extra fetch - the API embeds each item's schedules, and the status is
  // derived from them in the browser.
  const service = worstServiceStatus(
    item.service ?? [],
    item.dive_count,
    item.dive_time,
  );

  return (
    <PlainCard
      title={item.name}
      href={`/gear/${item.uuid}`}
      badges={
        <>
          {/* Outlined, as Archived is: on a list card's grey a `secondary`
              chip's fill is a lightness point off it in light. */}
          {item.rented && <Badge variant="outline">Rented</Badge>}
          {item.is_archived && <Badge variant="outline">Archived</Badge>}
          {/* An item with no schedules gets no chip: nothing tracked is not
              everything fine. */}
          {service && <ServiceStatusBadge status={service} />}
        </>
      }
      line={facts.length > 0 && <FactsLine facts={facts} />}
      // Brand and name, as the delete and archive confirmations name it - see
      // DECISIONS.md, "Ten rows of 'Edit' name nothing".
      actionsLabel={`Actions for ${label}`}
      actions={
        <>
          <DropdownMenuItem onSelect={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onArchiveToggle} disabled={isArchiving}>
            {item.is_archived ? (
              <ArchiveRestore className="h-4 w-4 mr-2" />
            ) : (
              <Archive className="h-4 w-4 mr-2" />
            )}
            {item.is_archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DeleteMenuItem onSelect={onDelete} disabled={isDeleting} />
        </>
      }
    >
      <CardFigures>
        <CardFigure label="Dives" value={item.dive_count} />
        {/* The label the dive page gives a dive's own time, since this is
            those summed. */}
        <CardFigure
          label="Dive time"
          value={formatDurationHoursMinutes(item.dive_time)}
        />
      </CardFigures>
    </PlainCard>
  );
}
