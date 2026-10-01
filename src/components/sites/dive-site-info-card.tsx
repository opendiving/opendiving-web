"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import type { DiveSite } from "@/lib/api/dive-sites";
import { useUnits } from "@/hooks/useUnits";
import { formatDepth, type UnitSystem } from "@/lib/units";
import { formatCoordinates } from "@/lib/validations/dive-site";
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
 * What the site records about itself beyond the line in its page's hero, in the
 * sidebar: what else it is called, where exactly it is, the place's own depths,
 * the diver's tags, and its entries in other registries. A member the site lacks
 * draws nothing.
 */
export function DiveSiteInfoCard({ site }: { site: DiveSite }) {
  const units = useUnits();
  const coordinates = formatCoordinates(site.latitude, site.longitude);
  const depths = depthRange(site, units);
  const otherNames = site.other_names ?? [];
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
        {otherNames.length > 0 && (
          <InfoRow label="Also known as">{otherNames.join(", ")}</InfoRow>
        )}
        {coordinates && (
          <InfoRow label="Coordinates">
            <span className="tabular-nums">{coordinates}</span>
          </InfoRow>
        )}
        {depths && <InfoRow label="Depth">{depths}</InfoRow>}
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
