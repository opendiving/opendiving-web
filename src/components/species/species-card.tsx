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
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { HERO_CANVAS_WIDTH, SIDE_FADE_WIDTH } from "@/lib/map-frame";
import { cn } from "@/lib/utils";

// Species cards in whatever column holds them - the life list's, a dive's, a
// site's side column - as many to a row as fit at a width that keeps a card
// wider than it is tall: up to three on the life list, two on a dive, one
// beside a site and on a phone. 20rem is the life list's three figures with a
// date the last of them: `BackdropCardFigures`' columns are 5rem, and a date
// is wider than its column and never wraps.
export const SPECIES_CARD_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-3 max-sm:gap-2.5";

// A species' photo behind its names, on its card and across its page's hero -
// the map's water and a fish where it has none, as a dive with no place is
// drawn. Faded as a map is, into the colour the names glow in, so they read
// over a photo as over a map. On a hero it is as wide as a hero's map at most
// and narrows with the window rather than cropping, its sides dissolving into
// the page by as much as a map's do at that width - a quarter of its width at
// its widest, and nothing once a map's fades would lie past the window's edges.
// Decorative: the name over it says what it is.
export function SpeciesBackdrop({
  photo,
  coveredBottom,
  coveredTop,
  hero = false,
}: {
  photo: string | null;
  coveredBottom: number;
  coveredTop?: number;
  hero?: boolean;
}) {
  if (!photo) {
    return (
      <UnplacedBackdrop
        coveredBottom={coveredBottom}
        coveredTop={coveredTop}
        icon={Fish}
      />
    );
  }
  const fade = (direction: string, stops: string) => (
    <div
      className="absolute inset-0"
      style={{
        background: `linear-gradient(${direction}, ${stops})`,
      }}
    />
  );
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      <div
        className={cn(
          "absolute inset-y-0",
          hero ? "left-1/2 -translate-x-1/2" : "inset-x-0",
        )}
        style={
          hero ? { width: `min(${HERO_CANVAS_WIDTH}px, 100%)` } : undefined
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- see SpeciesThumbnail */}
        <img src={photo} alt="" className="size-full object-cover" />
        {hero &&
          fade(
            "to right",
            `var(--backdrop-fade), transparent max(0px, 50% - ${HERO_CANVAS_WIDTH / 2 - SIDE_FADE_WIDTH}px), transparent min(100%, 50% + ${HERO_CANVAS_WIDTH / 2 - SIDE_FADE_WIDTH}px), var(--backdrop-fade)`,
          )}
      </div>
      {fade("to bottom", "transparent, var(--backdrop-fade)")}
    </div>
  );
}

interface SpeciesCardProps {
  species: SpeciesSummary;
  // What the page knows of this species on the diver's dives: how many there
  // were and when it was last seen on a list of them, how many were counted on
  // a dive.
  figures?: BackdropCardFigure[];
  // A line under the names: the diver's note on it, on a dive.
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
      backdrop={(coveredBottom) => (
        <SpeciesBackdrop photo={photo} coveredBottom={coveredBottom} />
      )}
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
