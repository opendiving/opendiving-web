"use client";

import Link from "next/link";
import { Edit, MapPin } from "lucide-react";
import type { DiveSite } from "@/lib/api/dive-sites";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteMenuItem } from "@/components/ui/item-actions-menu";
import {
  BACKDROP_CARD_LINK,
  BackdropCard,
  BackdropCardFigures,
  BackdropCardHeading,
  UnplacedBackdrop,
  type BackdropCardFigure,
} from "@/components/ui/backdrop-card";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import {
  DiveSiteFacts,
  diveSiteFacts,
} from "@/components/sites/dive-site-facts";
import { useUnits } from "@/hooks/useUnits";
import { formatDepth } from "@/lib/units";

interface DiveSiteCardProps {
  site: DiveSite;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

// One dive site as a card, on /sites: its pin on a map as the backdrop - the
// map's water for a site with none, as a dive card draws one - its line of facts,
// and what the diver's own dives there add up to.
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
  const facts = diveSiteFacts(site, units);
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
    figures.push({ label: "Species seen", value: site.species_count });
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
      <BackdropCardHeading icon={MapPin}>
        <Link href={`/sites/${site.uuid}`} className={BACKDROP_CARD_LINK}>
          {site.name}
        </Link>
        {facts.length > 0 && (
          <div className="text-xs">
            <DiveSiteFacts facts={facts} />
          </div>
        )}
      </BackdropCardHeading>
      <BackdropCardFigures figures={figures} />
    </BackdropCard>
  );
}
