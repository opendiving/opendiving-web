"use client";

import type { ReactNode } from "react";
import {
  DiveSiteHeroIcon,
  DiveSiteIcon,
} from "@/components/icons/dive-site-icon";
import type { DiveSite } from "@/lib/api/dive-sites";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { UnplacedBackdrop } from "@/components/ui/backdrop-card";
import {
  DiveSiteFacts,
  diveSiteFacts,
} from "@/components/sites/dive-site-facts";
import { MapHero, type MapHeroFigure } from "@/components/ui/map-hero";
import { useUnits } from "@/hooks/useUnits";
import { formatDateOnly } from "@/lib/date-time";
import { formatDepth } from "@/lib/units";
import type { ReturnTarget } from "@/lib/return-to";

/**
 * The site page's heading: the site's card drawn the width of the window, with
 * every figure the diver's own dives there add up to, as the API counts them -
 * every live dive naming the site at any position. Derived, never typed, so it
 * is the place for a deepest dive and an average rating rather than a member a
 * diver would have to keep up to date.
 */
export function DiveSiteHero({
  site,
  back,
  actions,
}: {
  site: DiveSite;
  back: ReturnTarget;
  actions?: ReactNode;
}) {
  const units = useUnits();
  // The pin alone, as the site's card maps it.
  const isPlaced = site.latitude != null && site.longitude != null;
  const facts = diveSiteFacts(site, units);

  const figures: MapHeroFigure[] = [
    { label: "Dives", value: site.dive_count ?? 0 },
  ];
  if (site.max_dive_depth != null) {
    figures.push({
      label: "Deepest",
      // Whole units, as the site's card and a trip's page round theirs.
      value: formatDepth(site.max_dive_depth, units, { decimals: 0 }),
    });
  }
  if (site.species_count) {
    figures.push({ label: "Species seen", value: site.species_count });
  }
  if (site.average_rating != null) {
    figures.push({
      label: "Average rating",
      value: (
        <>
          {site.average_rating.toFixed(1)}
          <span className="text-sm font-normal text-muted-foreground">
            {" "}
            of 5
          </span>
        </>
      ),
    });
  }

  // Last, as the one figure wider than the rest.
  if (site.last_dived_on) {
    figures.push({
      label: "Last dive",
      value: formatDateOnly(site.last_dived_on),
    });
  }

  return (
    <MapHero
      backHref={back.href}
      backLabel={back.label}
      icon={DiveSiteHeroIcon}
      actions={actions}
      title={site.name}
      // The line under the name, as the site's card has it.
      subtitle={facts.length > 0 && <DiveSiteFacts facts={facts} />}
      figures={figures}
      mapCredit={isPlaced}
      // The map's water for a site with no position, as its card draws one.
      backdrop={({ map, covered }) =>
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
            {...map}
          />
        ) : (
          <UnplacedBackdrop
            coveredBottom={covered.bottom}
            coveredTop={covered.top}
            icon={DiveSiteIcon}
          />
        )
      }
    />
  );
}
