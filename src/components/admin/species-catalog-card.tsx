"use client";

import Link from "next/link";
import { EyeOff, ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { SPECIES_PHOTO_FLOOR, type AdminSpecies } from "@/lib/api/admin";
import { externalIdHref } from "@/lib/external-ids";
import { formatDateTime } from "@/lib/date-time";
import { speciesDisplayName, speciesNameWithRank } from "@/lib/species";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpeciesThumbnail } from "@/components/species/species-thumbnail";

export type SpeciesPhotoAction = "hide" | "replace" | "refetch";

interface SpeciesCatalogCardProps {
  species: AdminSpecies;
  /** The action in flight on this row, if any. */
  busy: SpeciesPhotoAction | null;
  onAction: (species: AdminSpecies, action: SpeciesPhotoAction) => void;
}

// What the operator has to know about the photo at a glance. A pinned photo under
// the floor carries both, since that is the one row the narrow chip is for.
function photoBadges(species: AdminSpecies): string[] {
  if (species.photo_curation === "hidden") return ["Hidden"];
  const badges: string[] = [];
  if (species.photo_curation === "pinned") badges.push("Pinned");
  if (!species.photo_sha256) badges.push("No photo");
  else if (
    species.photo_width !== null &&
    species.photo_width < SPECIES_PHOTO_FLOOR
  ) {
    badges.push(`Below ${SPECIES_PHOTO_FLOOR} px`);
  }
  return badges;
}

const LINK = "underline hover:text-foreground";

// One catalog row: its photo in a box reserved at the stored bytes' own aspect, so
// the grid does not move as the images arrive, and the three things an operator
// can do to that photo.
export function SpeciesCatalogCard({
  species,
  busy,
  onAction,
}: SpeciesCatalogCardProps) {
  const name = speciesDisplayName(species);
  const secondary = speciesNameWithRank(species);
  const wikidata = species.wikidata_qid
    ? externalIdHref({ registry: "wikidata", identifier: species.wikidata_qid })
    : null;
  const hasSize =
    species.photo_sha256 && species.photo_width && species.photo_height;

  return (
    <article
      className="flex flex-col rounded-lg border bg-card overflow-hidden"
      aria-label={name}
    >
      <div
        className="w-full max-h-60 aspect-[4/3]"
        style={
          hasSize
            ? {
                aspectRatio: `${species.photo_width} / ${species.photo_height}`,
              }
            : undefined
        }
      >
        <SpeciesThumbnail
          uuid={species.uuid}
          photoSha256={species.photo_sha256}
          className="h-full w-full rounded-none bg-muted"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link
          href={`/species/${species.uuid}`}
          className="font-medium leading-tight hover:underline break-words"
        >
          {name}
        </Link>
        {secondary !== name && (
          <div className="text-sm italic text-muted-foreground leading-tight break-words">
            {secondary}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          Added {formatDateTime(species.created_at)}
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {photoBadges(species).map((badge) => (
            <Badge key={badge} variant="outline">
              {badge}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {wikidata && (
            <a
              href={wikidata}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              Wikidata
            </a>
          )}
          {species.photo_source_url && (
            <a
              href={species.photo_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
              title={species.photo_file ?? undefined}
            >
              Commons
            </a>
          )}
        </div>
        <div className="mt-auto flex flex-wrap gap-1 pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || species.photo_curation === "hidden"}
            onClick={() => onAction(species, "hide")}
          >
            <EyeOff className="h-4 w-4 mr-1" aria-hidden />
            Hide
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => onAction(species, "replace")}
          >
            <ImagePlus className="h-4 w-4 mr-1" aria-hidden />
            Replace
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => onAction(species, "refetch")}
          >
            {busy === "refetch" ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" aria-hidden />
            )}
            Re-fetch
          </Button>
        </div>
      </div>
    </article>
  );
}
