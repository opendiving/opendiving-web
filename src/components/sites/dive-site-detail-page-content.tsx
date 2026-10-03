"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useReturnTo, useWithReturnTo } from "@/hooks/useReturnTo";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  DeleteMenuItem,
  ItemActionsMenu,
} from "@/components/ui/item-actions-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { DiveSiteInfoCard } from "@/components/sites/dive-site-info-card";
import { DiveSiteSpeciesCard } from "@/components/sites/dive-site-species-card";
import { DiveSiteHero } from "@/components/sites/dive-site-hero";
import {
  HERO_BODY,
  HERO_CONTROL,
  MapHeroPageSkeleton,
} from "@/components/ui/map-hero";
import { NotFoundState } from "@/components/ui/not-found-state";
import { Edit, FileText, Plus } from "lucide-react";
import { DiveSiteIcon } from "@/components/icons/dive-site-icon";
import { PageSpinner } from "@/components/ui/page-spinner";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Blue Hole" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Dive site deleted successfully.";

export function DiveSiteDetailPageContent() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const back = useReturnTo({ href: "/sites", label: "Back to dive sites" });
  const withReturnTo = useWithReturnTo();

  const {
    resource: diveSite,
    setResource: setDiveSite,
    isLoading: isLoadingDiveSite,
  } = useResource<DiveSite>(diveSitesAPI.getDiveSite, {
    enabled: !!user,
    errorMessage: "Failed to load dive site details. Please try again.",
    redirectTo: "/sites",
  });
  useDocumentTitle(diveSite?.name, "Dive Sites");

  const del = useDeleteResource(diveSitesAPI.deleteDiveSite, {
    successMessage: DELETED_MESSAGE,
    errorMessage: "Failed to delete dive site. Please try again.",
    onDeleted: () => router.push(back.href),
  });
  const isDeleting = del.deletingId !== null;

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }
  if (isLoadingDiveSite) {
    return (
      <MapHeroPageSkeleton
        backHref={back.href}
        backLabel={back.label}
        icon={DiveSiteIcon}
      />
    );
  }

  if (!diveSite) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
        <NotFoundState
          message="Dive site not found."
          backHref={back.href}
          backLabel={back.label}
        />
      </div>
    );
  }

  return (
    <div>
      <DiveSiteHero
        site={diveSite}
        back={back}
        actions={
          <>
            <Button variant="ghost" size="sm" className={HERO_CONTROL} asChild>
              <Link
                href={withReturnTo(
                  `/dives/new?dive_site_uuid=${diveSite.uuid}`,
                )}
              >
                <Plus className="h-4 w-4 mr-2" />
                Log a dive
              </Link>
            </Button>
            <ItemActionsMenu variant="ghost" size="sm" className={HERO_CONTROL}>
              <DropdownMenuItem onSelect={() => setIsEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DeleteMenuItem
                onSelect={() => del.requestDelete(diveSite.uuid)}
                disabled={isDeleting}
              />
            </ItemActionsMenu>
          </>
        }
      />

      <DiveSiteDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        diveSite={diveSite}
        onSaved={setDiveSite}
      />

      <DeleteWithReassignDialog
        kind="dive-site"
        targetId={del.pendingId}
        isDeleting={isDeleting}
        onCancel={del.cancelDelete}
        onConfirm={(moveDivesTo, name) =>
          del.confirmDelete(
            moveDivesTo,
            name ? `${DELETED_MESSAGE} Its dives moved to ${name}.` : undefined,
          )
        }
      />

      <div className={HERO_BODY}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RecentDivesCard
              complete
              enabled={!!user}
              diveSiteId={diveSite.uuid}
              title="Dives at This Site"
              description="All dives logged at this dive site"
              viewAllHref={null}
              emptyTitle="No dives logged at this site yet"
              emptyDescription="Log a dive and assign it to this dive site to see it here."
              newDiveHref={`/dives/new?dive_site_uuid=${diveSite.uuid}`}
              newDiveLabel="Log a dive at this site"
            />
          </div>

          <div className="space-y-6">
            <DiveSiteInfoCard site={diveSite} />

            {diveSite.notes && (
              <Card>
                <CardHeader>
                  <CardTitle as="h2" className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                    {diveSite.notes}
                  </p>
                </CardContent>
              </Card>
            )}

            <DiveSiteSpeciesCard
              siteUuid={diveSite.uuid}
              speciesCount={diveSite.species_count ?? 0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
