"use client";

import { useParams } from "next/navigation";
import { Fish, ListTree } from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useResource } from "@/hooks/useResource";
import { useReturnTo } from "@/hooks/useReturnTo";
import { useSpeciesLifeListEntry } from "@/hooks/useSpeciesLifeListEntry";
import { speciesAPI, Species, speciesPhotoUrl } from "@/lib/api/species";
import {
  speciesDisplayName,
  speciesRankLabel,
  speciesSeenOn,
} from "@/lib/species";
import { cn } from "@/lib/utils";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { SpeciesPhotoCredit } from "@/components/species/species-photo-credit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpeciesBackdrop } from "@/components/species/species-card";
import {
  HERO_BODY,
  MapHero,
  MapHeroPageSkeleton,
  type MapHeroFigure,
} from "@/components/ui/map-hero";
import { NotFoundState } from "@/components/ui/not-found-state";
import { PageSpinner } from "@/components/ui/page-spinner";

// One labelled fact in the taxonomy card, rendered only when the catalog
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
 * One species: its photo across the hero and its credit in a card, what the
 * catalog knows about it, and the dives this diver saw it on.
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
export function SpeciesDetailPageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const back = useReturnTo({ href: "/species", label: "Back to marine life" });

  const { resource: species, isLoading: isLoadingSpecies } =
    useResource<Species>(speciesAPI.getSpecies, {
      enabled: !!user,
      errorMessage: "Failed to load species details. Please try again.",
      redirectTo: "/species",
    });
  useDocumentTitle(
    species ? speciesDisplayName(species) : undefined,
    "Marine Life",
  );
  // In parallel with the catalog row rather than after it: the route's id is
  // the species' uuid either way.
  const params = useParams();
  const history = useSpeciesLifeListEntry(
    user ? (params.id as string) : undefined,
  );

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingSpecies || history.isLoading) {
    return (
      <MapHeroPageSkeleton
        backHref={back.href}
        backLabel={back.label}
        icon={Fish}
      />
    );
  }

  if (!species) {
    return (
      <div className="max-w-6xl mx-auto px-2.5 sm:px-6 lg:px-8 pt-8 pb-6">
        <NotFoundState
          message="Species not found."
          backHref={back.href}
          backLabel={back.label}
        />
      </div>
    );
  }

  const displayName = speciesDisplayName(species);
  const rank = speciesRankLabel(species.rank);
  const photoSrc = speciesPhotoUrl(species.uuid, species.photo_sha256);
  // The scientific name with its authority, as a citation writes it - the
  // authority alone where the title already is the name.
  const scientificName = species.common_name ? (
    <>
      <span className="italic">{species.scientific_name}</span>
      {species.authority && ` ${species.authority}`}
    </>
  ) : (
    species.authority
  );

  // Zeroes for a species none of the diver's dives records, since that is what
  // the API's 404 says; nothing when the lookup failed, rather than zeroes it
  // cannot vouch for.
  const figures: MapHeroFigure[] = [];
  if (!history.failed) {
    figures.push(
      { label: "Dives", value: history.entry?.dive_count ?? 0 },
      { label: "Dive sites", value: history.entry?.dive_site_count ?? 0 },
    );
  }
  if (history.entry) {
    figures.push({
      label: "Last seen",
      value: speciesSeenOn(history.entry.last_seen),
    });
  }

  return (
    <div>
      <MapHero
        backHref={back.href}
        backLabel={back.label}
        icon={Fish}
        // The photo across the band, as a site's map is; its credit is the
        // body's first card, where it reads as text rather than over a photo.
        backdrop={({ covered }) => (
          <SpeciesBackdrop
            hero
            photo={photoSrc}
            coveredBottom={covered.bottom}
            coveredTop={covered.top}
          />
        )}
        title={displayName}
        subtitle={
          (scientificName || rank) && (
            <>
              {scientificName}
              {scientificName && rank && " · "}
              {rank}
            </>
          )
        }
        figures={figures}
      />

      <div
        className={cn(
          HERO_BODY,
          "grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-[auto_1fr] gap-6 max-sm:gap-2.5",
        )}
      >
        {/* The hero's photo's credit, first in the body so that where the
            columns stack it sits under the photo rather than after every dive,
            and at the head of the side column where they don't. Visible without
            hovering, and it must stay that way at every width - see the
            component's own docs for why a tooltip does not satisfy the
            licence. */}
        {photoSrc && (
          <Card className="lg:col-start-3 lg:row-start-1">
            <CardContent className="pt-(--card-pad)">
              <SpeciesPhotoCredit species={species} />
            </CardContent>
          </Card>
        )}

        <div className="lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1 space-y-6 max-sm:space-y-2.5">
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

        <div className="lg:col-start-3 space-y-6 max-sm:space-y-2.5">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <ListTree className="h-5 w-5" />
                Taxonomy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  carries it too. Underlined as the credit's links are, so the one
                  value in the card that is also a destination says so. */}
              <InfoRow label="WoRMS AphiaID">
                <a
                  href={`https://www.marinespecies.org/aphia.php?p=taxdetails&id=${species.aphia_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-muted-foreground"
                >
                  {species.aphia_id}
                </a>
              </InfoRow>
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
