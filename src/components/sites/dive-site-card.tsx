"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Edit, MapPin, Mountain } from "lucide-react";
import type { DiveSite } from "@/lib/api/dive-sites";
import { ENTRY_TYPE_LABELS, vocabularyLabel } from "@/lib/api/dives";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteMenuItem } from "@/components/ui/item-actions-menu";
import {
  BACKDROP_CARD_LINK,
  BackdropCard,
  BackdropCardFigures,
  UnplacedBackdrop,
  type BackdropCardFigure,
} from "@/components/ui/backdrop-card";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { useUnits } from "@/hooks/useUnits";
import { formatAltitude, formatDepth } from "@/lib/units";

interface DiveSiteCardProps {
  site: DiveSite;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

// One dive site as a card, on /sites: its pin on a map as the backdrop - the
// map's water for a site with none, as a dive card draws one - where it is, how
// high and how divers get in, and what the diver's own dives there add up to.
export function DiveSiteCard({
  site,
  onEdit,
  onDelete,
  isDeleting,
}: DiveSiteCardProps) {
  const units = useUnits();
  // The pin alone, as the site's page maps it: the locality's centre is the
  // town the geocoder resolved, not the site.
  const isPlaced = site.latitude != null && site.longitude != null;
  const facts: ReactNode[] = [
    site.location?.name,
    site.altitude != null && (
      // The icon glows as the text does, through the actions menu's filter:
      // `text-shadow` stops at an SVG.
      <span className="whitespace-nowrap">
        <Mountain
          aria-hidden
          className="mr-0.5 inline-block size-3 align-[-0.125em] [filter:drop-shadow(0_0_2px_var(--backdrop-card))_drop-shadow(0_0_5px_var(--backdrop-card))]"
        />
        <span className="sr-only">Altitude </span>
        {formatAltitude(site.altitude, units)}
      </span>
    ),
    site.entry_types
      ?.map((entry) => vocabularyLabel(ENTRY_TYPE_LABELS, entry))
      .join(", "),
  ].filter(Boolean);
  const figures: BackdropCardFigure[] = [
    { label: "Dives", value: site.dive_count ?? 0 },
    {
      label: "Deepest",
      // Whole units, as a dive card rounds its depths.
      value:
        site.max_dive_depth != null
          ? formatDepth(site.max_dive_depth, units, { decimals: 0 })
          : "-",
    },
  ];
  if (site.species_count) {
    figures.push({ label: "Species Seen", value: site.species_count });
  }

  return (
    <BackdropCard
      actionsLabel={`Actions for ${site.name}`}
      actions={
        <>
          <DropdownMenuItem onSelect={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DeleteMenuItem onSelect={onDelete} disabled={isDeleting} />
        </>
      }
      backdrop={(coveredBottom) =>
        isPlaced ? (
          <LocationsMap
            locations={[
              {
                name: site.name,
                latitude: site.latitude,
                longitude: site.longitude,
              },
            ]}
            subject={`the location of ${site.name}`}
            className="h-full rounded-[inherit] border-0 sm:h-full"
            backdrop
            coveredBottom={coveredBottom}
            snapshot
          />
        ) : (
          <UnplacedBackdrop coveredBottom={coveredBottom} icon={MapPin} />
        )
      }
    >
      <Link href={`/sites/${site.uuid}`} className={BACKDROP_CARD_LINK}>
        {site.name}
      </Link>
      {facts.length > 0 && (
        <div className="text-xs">
          {facts.map((fact, index) => (
            <Fragment key={index}>
              {index > 0 && " · "}
              {fact}
            </Fragment>
          ))}
        </div>
      )}
      <BackdropCardFigures figures={figures} />
    </BackdropCard>
  );
}
