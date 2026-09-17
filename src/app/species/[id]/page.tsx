"use client";

import { Fish } from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { speciesAPI, Species, speciesPhotoUrl } from "@/lib/api/species";
import {
  speciesDisplayName,
  speciesNameWithRank,
  speciesRankLabel,
} from "@/lib/species";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { SpeciesPhotoCredit } from "@/components/species/species-photo-credit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { NotFoundState } from "@/components/ui/not-found-state";
import { PageSpinner } from "@/components/ui/page-spinner";

// One labelled fact in the classification card, rendered only when the catalog
// records it - the same shape the course and dive sidebars use.
function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
 * One species: its photo and credit, what the catalog knows about it, and the
 * dives this diver saw it on.
 *
 * **This page is what makes the photos licence-clean**, and that is its reason
 * for existing as much as the dive list is. A grid of fifty thumbnails cannot
 * carry fifty credit lines, and both generations of the Creative Commons
 * licences accept a credit one click away - so every thumbnail in the app links
 * here, and the credit here is plain visible text rather than a tooltip.
 *
 * It is also why a life-list row leads to a page rather than to a filtered
 * `/dives`: this app has no URL-param filter on that list, every scoped dive
 * list in it is an embedded `RecentDivesCard` on a detail page, and building the
 * first one would have left attribution unsolved besides.
 *
 * The route directory is `[id]` rather than `[uuid]` to match every other detail
 * route here, and because `useResource` reads `params.id`. The URL a diver sees
 * is `/species/<uuid>` either way.
 */
export default function SpeciesDetailPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();

  const { resource: species, isLoading: isLoadingSpecies } =
    useResource<Species>(speciesAPI.getSpecies, {
      enabled: !!user,
      errorMessage: "Failed to load species details. Please try again.",
      redirectTo: "/species",
    });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingSpecies) {
    return (
      <DetailPageSkeleton backHref="/species" backLabel="Back to species" />
    );
  }

  if (!species) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotFoundState
          message="Species not found."
          backHref="/species"
          backLabel="Back to species"
        />
      </div>
    );
  }

  const displayName = speciesDisplayName(species);
  const secondary = speciesNameWithRank(species);
  const rank = speciesRankLabel(species.rank);
  const photoSrc = speciesPhotoUrl(species.uuid, species.photo_sha256);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        backHref="/species"
        backLabel="Back to species"
        title={displayName}
        subtitle={secondary !== displayName ? secondary : undefined}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Scoped to this species by the filter `getDives` gained for it -
              the same shape the trip, site, gear and course pages use, which is
              what a life-list row leads to instead of a filtered /dives. */}
          <RecentDivesCard
            complete
            enabled={!!user}
            speciesId={species.uuid}
            title={`Dives with ${displayName}`}
            description="Every dive you logged this species on"
            viewAllHref={null}
            emptyTitle="No dives with this species yet"
            emptyDescription="Record it on a dive and it will appear here."
            newDiveHref="/dives/new"
            newDiveLabel="Log a dive"
          />
        </div>

        <div className="space-y-6">
          {photoSrc && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                {/* At its stored size rather than a thumbnail: this is the one
                    place the photo is the subject rather than a label. A real
                    alt, unlike the thumbnails elsewhere - here the picture is
                    the content of its own card rather than a decoration beside
                    the name it repeats. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoSrc}
                  alt={displayName}
                  className="w-full rounded-md"
                />
                {/* Visible without hovering, and it must stay that way at every
                    width - see the component's own docs for why a tooltip does
                    not satisfy the licence. */}
                <SpeciesPhotoCredit species={species} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Fish className="h-5 w-5" />
                Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow label="Scientific name">
                <span className="italic">{species.scientific_name}</span>
                {species.authority && (
                  <span className="text-muted-foreground">
                    {" "}
                    {species.authority}
                  </span>
                )}
              </InfoRow>
              {rank && <InfoRow label="Rank">{rank}</InfoRow>}
              {species.kingdom && (
                <InfoRow label="Kingdom">{species.kingdom}</InfoRow>
              )}
              {species.phylum && (
                <InfoRow label="Phylum">{species.phylum}</InfoRow>
              )}
              {species.class_name && (
                <InfoRow label="Class">{species.class_name}</InfoRow>
              )}
              {species.order_name && (
                <InfoRow label="Order">{species.order_name}</InfoRow>
              )}
              {species.family && (
                <InfoRow label="Family">{species.family}</InfoRow>
              )}
              {species.genus && (
                <InfoRow label="Genus">{species.genus}</InfoRow>
              )}
              {/* The identity the catalog is keyed on, and the one number that
                  means anything outside this database - which is why the export
                  carries it too. Still plain text, but no longer because a link
                  out to WoRMS is off the table: it is the credit below that
                  carries the link now, and this number is the wrong element to
                  hang it on - following it wants a per-taxon URL, and the row
                  would then be the only value in the card that is also a
                  destination. */}
              <InfoRow label="WoRMS AphiaID">{species.aphia_id}</InfoRow>
              {/* The classification in this card is WoRMS's - every catalog row
                  is keyed on an AphiaID, and the API credits every one of them
                  to WoRMS - and WoRMS's text content is CC BY, a licence that
                  asks to be credited where the work is shown. This card is
                  where it is shown, and it carried no credit at all until the
                  API's own credit string learned to link, in the same change
                  this line arrived with.

                  Composed out of anchors rather than rendered through
                  `Attribution`, which takes one string and so can carry one
                  link: this needs two, the source and the licence, which is the
                  same reason `SpeciesPhotoCredit` composes rather than parses.
                  The common names are Wikidata's and are CC0, which asks for
                  nothing - so there is one credit here and two under the
                  picker, whose second one belongs to upstream rows the catalog
                  never stored. */}
              <p className="text-xs text-muted-foreground">
                Taxonomy:{" "}
                <a
                  href="https://www.marinespecies.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  World Register of Marine Species
                </a>
                ,{" "}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noopener noreferrer license"
                  className="underline hover:text-foreground"
                >
                  CC BY
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
