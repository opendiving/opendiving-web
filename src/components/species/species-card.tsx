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

// Species cards in whatever column holds them - the life list's, a dive's, a
// site's side column - as many to a row as fit at a width that keeps a card
// wider than it is tall: up to three on the life list, two on a dive, one
// beside a site and on a phone. 20rem is the life list's three figures with a
// date the last of them: `BackdropCardFigures`' columns are 5rem, and a date
// is wider than its column and never wraps.
export const SPECIES_CARD_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-3 max-sm:gap-2.5";

// How far below the centre of the band above a card's details its photo's
// centre sits, and how far the photo's foot fades into what is under it.
const PHOTO_BELOW_BAND_CENTRE = 8;
const PHOTO_FOOT_FADE = 48;

// How far above the backdrop's middle the centre of the band `coveredTop` and
// `coveredBottom` leave sits, less the photo's offset below it.
const bandRaise = (coveredTop: number, coveredBottom: number) =>
  (coveredBottom - coveredTop) / 2 - PHOTO_BELOW_BAND_CENTRE;

// The sharp photo's place, centred `raise` pixels above the backdrop's middle
// and at least as tall as reaches both the backdrop's top and, with its fade,
// under the details: the larger of `-2 * raise` and `2 * (fade - coveredBottom
// + raise)` more than the backdrop.
function photoPlacement(raise: number, coveredBottom: number) {
  const reach = Math.max(
    -2 * raise,
    2 * (PHOTO_FOOT_FADE - coveredBottom + raise),
  );
  return {
    top: `calc(50% - ${raise}px)`,
    minHeight: `calc(100% + ${reach}px)`,
    maskImage: `linear-gradient(to bottom, #000 calc(100% - ${PHOTO_FOOT_FADE}px), transparent)`,
  };
}

// The sharp photo, as wide as what holds it and as tall as its shape makes it
// - or as `photoPlacement` asks, cropping its sides.
const PLACED_PHOTO =
  "absolute inset-x-0 w-full max-w-none -translate-y-1/2 object-cover";

// A species' photo behind its names, on its card and across its page's hero -
// the map's water and a fish where it has none, as a dive with no place is
// drawn. Decorative: the name over it says what it is.
//
// On a card the photo is centred on the band the details leave uncovered, a
// little below its middle, since centred on the whole card half the animal
// sits behind the glass. It is as wide as the card and as tall as its shape
// makes it, cropped where it overruns; what it leaves of the card's foot is a
// blurred copy of itself. A photo too wide to reach under the details with its
// fade is drawn taller, cropping its sides, so the fade never shows above the
// glass.
//
// On a hero it is faded as a map is, into the colour the names glow in, so
// they read over a photo as over a map. It is as wide as a hero's map at most
// and narrows with the window rather than cropping, its sides dissolving into
// the page by as much as a map's do at that width - a quarter of its width at
// its widest, and nothing once a map's fades would lie past the window's
// edges. It is raised towards the band between the top row and the details as
// far as the details' text runs across it: where the text spans the photo, as
// on a phone, it sits as on a card, and where the text leaves most of the
// photo's foot open, as on a wide window, it stays nearer the hero's middle.
// It is drawn taller only to reach the hero's top and to end its fade under
// the details. Its top is never faded and nothing is drawn under it: the hero
// has no glass to show through, and its own wash takes the photo's foot into
// the page.
export function SpeciesBackdrop({
  photo,
  coveredBottom,
  coveredTop = 0,
  detailsRight = 0,
  width = 0,
  hero = false,
}: {
  photo: string | null;
  coveredBottom: number;
  coveredTop?: number;
  // On a hero: how far from its left edge the details' text reaches, and its
  // width.
  detailsRight?: number;
  width?: number;
  hero?: boolean;
}) {
  if (!photo) {
    return (
      <UnplacedBackdrop
        coveredBottom={coveredBottom}
        coveredTop={coveredTop}
        hero={hero}
        icon={Fish}
      />
    );
  }
  if (!hero) {
    return (
      <div
        aria-hidden
        className="absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        {/* Overrunning the card by three times its blur's radius, so the
            blur's own soft edges fall outside the card. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- see SpeciesThumbnail */}
        <img
          src={photo}
          alt=""
          className="absolute -inset-21 size-[calc(100%+168px)] max-w-none object-cover blur-[28px]"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- see SpeciesThumbnail */}
        <img
          src={photo}
          alt=""
          className={PLACED_PHOTO}
          style={photoPlacement(bandRaise(0, coveredBottom), coveredBottom)}
        />
      </div>
    );
  }
  // The share of the photo's width the details' text runs across.
  const canvasWidth = Math.min(HERO_CANVAS_WIDTH, width);
  const covered = canvasWidth
    ? (detailsRight - (width - canvasWidth) / 2) / canvasWidth
    : 0;
  const heroRaise =
    bandRaise(coveredTop, coveredBottom) * Math.min(1, Math.max(0, covered));
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
        className="absolute inset-y-0 left-1/2 -translate-x-1/2"
        style={{ width: `min(${HERO_CANVAS_WIDTH}px, 100%)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- see SpeciesThumbnail */}
        <img
          src={photo}
          alt=""
          className={PLACED_PHOTO}
          style={photoPlacement(heroRaise, coveredBottom)}
        />
        {fade(
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
