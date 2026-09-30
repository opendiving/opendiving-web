"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dive } from "@/lib/api/dives";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteMenuItem } from "@/components/ui/item-actions-menu";
import {
  BACKDROP_CARD_LINK,
  BackdropCard,
  BackdropCardFigures,
} from "@/components/ui/backdrop-card";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { DiveTitle } from "@/components/dives/dive-title";
import {
  diveMapLocations,
  hasMapPosition,
} from "@/components/dives/dive-map-locations";
import { DiveIcon } from "@/components/logo";
import {
  formatDiveDateTime,
  formatDurationHoursMinutes,
} from "@/lib/date-time";
import { useUnits } from "@/hooks/useUnits";
import { formatDepth } from "@/lib/units";
import { Edit } from "lucide-react";

// A dive with nowhere on a map yet: teal where a trip would show the whole
// world, since a dive is at one spot and the world says nothing about which.
// Faded as a map is, and the bubbles centred in what the details leave of it.
function UnplacedBackdrop({ coveredBottom }: { coveredBottom: number }) {
  return (
    <div aria-hidden className="absolute inset-0 rounded-[inherit] bg-teal">
      {/* The map's own fade, in the same colour space as its. */}
      <div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background:
            "linear-gradient(to bottom, transparent, var(--backdrop-fade))",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-center"
        style={{ bottom: coveredBottom }}
      >
        <DiveIcon className="h-10 w-10 text-teal-foreground" />
      </div>
    </div>
  );
}

interface DiveCardProps {
  dive: Dive;
  // Offers Delete beside Edit. Left out where the list has no delete of its own
  // to run.
  onDelete?: () => void;
  isDeleting?: boolean;
}

// One dive as a card, in every list of dives: its sites and fixes on a map as
// the backdrop, and its duration and depths as the dive page shows them.
export function DiveCard({ dive, onDelete, isDeleting }: DiveCardProps) {
  const units = useUnits();
  // The edit page returns to wherever the card was opened from.
  const pathname = usePathname();
  const locations = diveMapLocations(dive);
  const isPlaced = hasMapPosition(locations);
  // The title names the site; this says where it is.
  const placeName = dive.dive_sites[0]?.location?.name;
  // Whole units, unlike the dive page's two decimals: it is a list to scan,
  // and the second decimal of a depth is not what anyone is scanning for.
  const depth = (meters?: number) =>
    meters ? formatDepth(meters, units, { decimals: 0 }) : "-";

  return (
    <BackdropCard
      actionsLabel={`Actions for dive #${dive.dive_number}`}
      actions={
        <>
          <DropdownMenuItem asChild>
            <Link
              href={`/dives/${dive.uuid}/edit?from=${encodeURIComponent(pathname)}`}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </DropdownMenuItem>
          {onDelete && (
            <DeleteMenuItem onSelect={onDelete} disabled={isDeleting} />
          )}
        </>
      }
      backdrop={(coveredBottom) =>
        isPlaced ? (
          <LocationsMap
            locations={locations}
            subject={`the location of dive #${dive.dive_number}`}
            className="h-full rounded-[inherit] border-0 sm:h-full"
            backdrop
            coveredBottom={coveredBottom}
            snapshot
          />
        ) : (
          <UnplacedBackdrop coveredBottom={coveredBottom} />
        )
      }
    >
      <Link href={`/dives/${dive.uuid}`} className={BACKDROP_CARD_LINK}>
        <DiveTitle diveNumber={dive.dive_number} sites={dive.dive_sites} />
      </Link>
      <div className="text-xs">
        {formatDiveDateTime(dive.start_time)}
        {placeName && ` · ${placeName}`}
      </div>
      <BackdropCardFigures
        figures={[
          {
            label: "Duration",
            value: formatDurationHoursMinutes(dive.duration),
          },
          { label: "Maximum Depth", value: depth(dive.max_depth) },
          { label: "Average Depth", value: depth(dive.avg_depth) },
        ]}
      />
    </BackdropCard>
  );
}
