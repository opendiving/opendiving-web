"use client";

import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import type { DiveSite } from "@/lib/api/dive-sites";
import { formatCoordinates } from "@/lib/validations/dive-site";
import { ExternalIdLink } from "@/components/sites/external-id-link";
import { Badge } from "@/components/ui/badge";
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

/**
 * What the site records about itself beyond the line in its page's hero, in the
 * sidebar: what else it is called, where exactly it is, the diver's tags, and
 * its entries in other registries. A member the site lacks draws nothing, and a
 * site that records none of them draws no card.
 */
export function DiveSiteInfoCard({ site }: { site: DiveSite }) {
  const coordinates = formatCoordinates(site.latitude, site.longitude);
  const otherNames = site.other_names ?? [];
  const tags = site.tags ?? [];
  const externalIds = site.external_ids ?? [];
  if (
    !coordinates &&
    otherNames.length === 0 &&
    tags.length === 0 &&
    externalIds.length === 0
  ) {
    return null;
  }

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
      </CardContent>
    </Card>
  );
}
