"use client";

import { useEffect, useState } from "react";
import { Fish } from "lucide-react";
import { fetchAllPages, isAbortError } from "@/lib/api/client";
import { speciesAPI, type SpeciesLifeListEntry } from "@/lib/api/species";
import { speciesSeenRange } from "@/lib/species";
import {
  SPECIES_CARD_GRID,
  SpeciesCard,
} from "@/components/species/species-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The species sighted on the diver's dives at a site, each linking to its own
 * page: the life list, narrowed to the dives naming this site at any position -
 * the same dives the hero's species count is taken over, so the two agree.
 *
 * Read whole, as the Tags card reads the tags: a site's species are a list worth
 * seeing entire, and `fetchAllPages` stops at its ceiling with a warning. Nothing
 * is asked for, and nothing drawn, while the hero counts none.
 */
export function DiveSiteSpeciesCard({
  siteUuid,
  speciesCount,
}: {
  siteUuid: string;
  speciesCount: number;
}) {
  const [species, setSpecies] = useState<SpeciesLifeListEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (speciesCount === 0) return;
    const controller = new AbortController();
    fetchAllPages(
      (page, perPage) =>
        speciesAPI.getLifeList(page, perPage, { diveSiteUuid: siteUuid }),
      {
        signal: controller.signal,
        label: "species",
        keyOf: (entry) => entry.uuid,
      },
    )
      .then((all) => {
        setSpecies(all);
        setLoadFailed(false);
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        console.error("Failed to read the site's species:", error);
        setLoadFailed(true);
      });
    return () => controller.abort();
  }, [siteUuid, speciesCount]);

  if (speciesCount === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Fish className="h-5 w-5" />
          Species Seen Here
        </CardTitle>
      </CardHeader>
      <CardContent>
        {species === null ? (
          <p className="text-sm text-muted-foreground">
            {loadFailed
              ? "The species could not be loaded."
              : "Loading species..."}
          </p>
        ) : (
          <ul className={SPECIES_CARD_GRID}>
            {species.map((entry) => (
              <SpeciesCard
                key={entry.uuid}
                species={entry}
                figures={[{ label: "Dives", value: entry.dive_count }]}
              >
                {speciesSeenRange(entry.first_seen, entry.last_seen)}
              </SpeciesCard>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
