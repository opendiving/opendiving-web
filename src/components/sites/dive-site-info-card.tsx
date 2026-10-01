"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import type { DiveSite } from "@/lib/api/dive-sites";
import {
  ENTRY_TYPE_LABELS,
  vocabularyLabel,
  WATER_TYPE_LABELS,
} from "@/lib/api/dives";
import { useUnits } from "@/hooks/useUnits";
import { formatDateTime } from "@/lib/date-time";
import { formatAltitude, formatDepth, type UnitSystem } from "@/lib/units";
import { formatCoordinates } from "@/lib/validations/dive-site";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { ExternalIdLink } from "@/components/sites/external-id-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// One labelled fact, rendered only where the site records it.
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

// "5 – 30 m", or the one end the site records.
function depthRange(site: DiveSite, units: UnitSystem): string | null {
  const from = site.depth_from;
  const to = site.depth_to;
  if (from != null && to != null) {
    return `${formatDepth(from, units)} – ${formatDepth(to, units)}`;
  }
  if (from != null) return `From ${formatDepth(from, units)}`;
  if (to != null) return `To ${formatDepth(to, units)}`;
  return null;
}

/**
 * Everything the site records about itself, in the sidebar of its page: where it
 * is, what else it is called, the place's own depths, water, altitude and entry,
 * the diver's tags, and its entries in other registries. A member the site lacks
 * draws nothing.
 */
export function DiveSiteInfoCard({ site }: { site: DiveSite }) {
  const units = useUnits();
  const coordinates = formatCoordinates(site.latitude, site.longitude);
  const depths = depthRange(site, units);
  const otherNames = site.other_names ?? [];
  const entryTypes = site.entry_types ?? [];
  const tags = site.tags ?? [];
  const externalIds = site.external_ids ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Dive Site Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {site.location?.name && (
          <InfoRow label="Location">{site.location.name}</InfoRow>
        )}
        {otherNames.length > 0 && (
          <InfoRow label="Also known as">{otherNames.join(", ")}</InfoRow>
        )}
        {coordinates && (
          <InfoRow label="Coordinates">
            <span className="tabular-nums">{coordinates}</span>
          </InfoRow>
        )}

        {/* Gated on the same both-or-neither pair the coordinates line is, so a
            site with no position costs nothing - not even the map's chunk. The
            map itself would draw nothing either way. */}
        {coordinates && (
          <LocationsMap
            locations={[
              {
                name: site.name,
                latitude: site.latitude,
                longitude: site.longitude,
              },
            ]}
            subject="the dive site"
          />
        )}

        {depths && <InfoRow label="Depth">{depths}</InfoRow>}
        {site.water_type && (
          <InfoRow label="Water type">
            {vocabularyLabel(WATER_TYPE_LABELS, site.water_type)}
          </InfoRow>
        )}
        {site.altitude != null && (
          <InfoRow label="Altitude">
            {formatAltitude(site.altitude, units)}
          </InfoRow>
        )}
        {entryTypes.length > 0 && (
          <InfoRow label={entryTypes.length > 1 ? "Entry types" : "Entry type"}>
            {entryTypes
              .map((entry) => vocabularyLabel(ENTRY_TYPE_LABELS, entry))
              .join(", ")}
          </InfoRow>
        )}
        {tags.length > 0 && (
          <InfoRow label="Tags">
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag}>
                  <Badge variant="outline" className="font-medium">
                    {tag}
                  </Badge>
                </li>
              ))}
            </ul>
          </InfoRow>
        )}
        {externalIds.length > 0 && (
          <InfoRow label="In other registries">
            <ul className="space-y-1">
              {externalIds.map((entry) => (
                <li key={`${entry.registry}:${entry.identifier}`}>
                  <ExternalIdLink entry={entry} />
                </li>
              ))}
            </ul>
          </InfoRow>
        )}

        <InfoRow label="Added on">
          {formatDateTime(site.created_at, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </InfoRow>
        <Button className="w-full" asChild>
          <Link href={`/dives/new?dive_site_uuid=${site.uuid}`}>
            <Plus className="h-4 w-4 mr-2" />
            Log a dive
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
