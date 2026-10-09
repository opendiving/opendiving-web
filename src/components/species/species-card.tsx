"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Fish } from "lucide-react";
import { speciesPhotoUrl, type SpeciesSummary } from "@/lib/api/species";
import { speciesDisplayName, speciesNameWithRank } from "@/lib/species";
import {
  BACKDROP_CARD_LINK,
  BackdropCard,
  BackdropCardFigures,
  UnplacedBackdrop,
  type BackdropCardFigure,
} from "@/components/ui/backdrop-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWithReturnTo } from "@/hooks/useReturnTo";

// Species cards inside a card of their own - a dive's, a site's - as many to a
// row as the column fits, and narrow enough that a site's side column and a
// phone take two: the life list's cards at a phone's width.
export const SPECIES_CARD_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(min(8.5rem,100%),1fr))] gap-3 max-sm:gap-2.5";

// A card's place while the life list loads, at its measured height: a backdrop
// card's, and the line under the binomial its cards carry - 254px.
export function SpeciesCardSkeleton() {
  return (
    <li aria-hidden>
      <Skeleton className="h-63.5 rounded-lg" />
    </li>
  );
}

interface SpeciesCardProps {
  species: SpeciesSummary;
  // What the page knows of this species on the diver's dives: how many there
  // were on the life list, how many were counted on a dive.
  figures?: BackdropCardFigure[];
  // A line under the names: when it was seen, or the diver's note on it.
  children?: ReactNode;
}

// One species as a card, wherever the diver's species are drawn: its photo as
// the backdrop - the map's water where it has none, as a dive card draws a dive
// with no place - and its names over the foot of it. The photo is decorative:
// the name beside it is the link's, so a screen reader hears it once.
export function SpeciesCard({
  species,
  figures = [],
  children,
}: SpeciesCardProps) {
  const withReturnTo = useWithReturnTo();
  const name = speciesDisplayName(species);
  const scientificName = speciesNameWithRank(species);
  const photo = speciesPhotoUrl(species.uuid, species.photo_sha256);

  return (
    <BackdropCard
      backdrop={(coveredBottom) =>
        photo ? (
          <div
            aria-hidden
            className="absolute inset-0 overflow-hidden rounded-[inherit]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- see SpeciesThumbnail */}
            <img src={photo} alt="" className="size-full object-cover" />
            {/* The map's fade, so the names read over a photo as over a map. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, transparent, var(--backdrop-fade))",
              }}
            />
          </div>
        ) : (
          <UnplacedBackdrop coveredBottom={coveredBottom} icon={Fish} />
        )
      }
    >
      <Link
        href={withReturnTo(`/species/${species.uuid}`)}
        className={BACKDROP_CARD_LINK}
      >
        {name}
      </Link>
      {/* Only when it says something the name doesn't - for the many species
          with no English name the two are the same string. */}
      {scientificName !== name && (
        <div className="text-xs italic">{scientificName}</div>
      )}
      {children && <div className="text-xs">{children}</div>}
      {figures.length > 0 && <BackdropCardFigures figures={figures} />}
    </BackdropCard>
  );
}
