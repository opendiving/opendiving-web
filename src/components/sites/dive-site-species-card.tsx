"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Fish } from "lucide-react";
import { fetchAllPages, isAbortError } from "@/lib/api/client";
import { speciesAPI, type SpeciesLifeListEntry } from "@/lib/api/species";
import { speciesDisplayName, speciesSecondaryName } from "@/lib/species";
import { SpeciesThumbnail } from "@/components/species/species-thumbnail";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const diveCount = (count: number) =>
  count === 1 ? "1 dive" : `${count} dives`;

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
  const withReturnTo = useWithReturnTo();

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
          <ul className="space-y-2">
            {species.map((entry) => {
              const secondary = speciesSecondaryName(entry);
              return (
                <li key={entry.uuid}>
                  <Link
                    href={withReturnTo(`/species/${entry.uuid}`)}
                    className="flex items-center gap-3 rounded-md text-sm hover:underline touch:min-h-11"
                  >
                    <SpeciesThumbnail
                      uuid={entry.uuid}
                      photoSha256={entry.photo_sha256}
                      className="h-10 w-10 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {speciesDisplayName(entry)}
                      </span>
                      {secondary && (
                        <span className="block truncate text-xs italic text-muted-foreground">
                          {secondary}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {diveCount(entry.dive_count)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
