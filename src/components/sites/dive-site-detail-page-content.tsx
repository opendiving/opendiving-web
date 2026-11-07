"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { useReturnTo, useWithReturnTo } from "@/hooks/useReturnTo";
import { useProposeOnArrival } from "@/contexts/ProposeOnArrivalContext";
import {
  diveSitesAPI,
  DiveSite,
  isCommonsSite,
  type DiveSiteCommonsMatchName,
} from "@/lib/api/dive-sites";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { ButtonLink } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  DeleteMenuItem,
  ItemActionsMenu,
} from "@/components/ui/item-actions-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { CommonsCredit } from "@/components/sites/commons-site";
import { CommonsSiteDialog } from "@/components/sites/commons-site-dialog";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { DiveSiteInfoCard } from "@/components/sites/dive-site-info-card";
import { DiveSiteSpeciesCard } from "@/components/sites/dive-site-species-card";
import { DiveSiteHero } from "@/components/sites/dive-site-hero";
import { DiveSiteInfoDialog } from "@/components/sites/dive-site-info-dialog";
import { ProposeChangeDialog } from "@/components/sites/propose-change-dialog";
import { ReplaceWithCommonsDialog } from "@/components/sites/replace-with-commons-dialog";
import {
  SiteCommonsMatchNotice,
  SiteProposalNotice,
} from "@/components/sites/site-commons-notices";
import { SiteProposalFlow } from "@/components/sites/site-proposal-flow";
import {
  HERO_BODY,
  HERO_CONTROL,
  MapHeroPageSkeleton,
  PAGE_COLUMN,
} from "@/components/ui/map-hero";
import { NotFoundState } from "@/components/ui/not-found-state";
import { Bookmark, Edit, FileText, Landmark, Plus } from "lucide-react";
import { DiveSiteIcon } from "@/components/icons/dive-site-icon";
import { PageSpinner } from "@/components/ui/page-spinner";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Blue Hole" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Dive site deleted successfully.";
const REMOVED_MESSAGE = "Removed from your sites.";

export function DiveSiteDetailPageContent() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isProposeOpen, setIsProposeOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] =
    useState<DiveSiteCommonsMatchName | null>(null);
  const { config } = useInstanceConfig();
  // Counted rather than the site itself, which a return to the page re-reads
  // into a new object: only an edit made here moves what the dive cards show.
  const [saves, setSaves] = useState(0);
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

  const proposeOnArrival = useProposeOnArrival();
  useEffectOnChange(() => {
    if (diveSite && proposeOnArrival(diveSite.uuid)) setIsProposeOpen(true);
  }, [diveSite?.uuid, proposeOnArrival]);

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
      <div className={PAGE_COLUMN}>
        <NotFoundState
          message="Dive site not found."
          backHref={back.href}
          backLabel={back.label}
        />
      </div>
    );
  }

  const inCommons = isCommonsSite(diveSite);
  const canPropose =
    config?.commons_primary === true && diveSite.proposal?.status !== "waiting";
  const removedMessage = inCommons ? REMOVED_MESSAGE : DELETED_MESSAGE;
  const applySaved = (saved: DiveSite) => {
    setDiveSite(saved);
    setSaves((count) => count + 1);
  };

  return (
    <div>
      <DiveSiteHero
        site={diveSite}
        back={back}
        actions={
          <>
            <ButtonLink
              variant="ghost"
              size="sm"
              className={HERO_CONTROL}
              href={withReturnTo(`/dives/new?dive_site_uuid=${diveSite.uuid}`)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Log a dive
            </ButtonLink>
            <DiveSiteInfoDialog site={diveSite} />
            <ItemActionsMenu variant="ghost" size="sm" className={HERO_CONTROL}>
              {canPropose && (
                <DropdownMenuItem onClick={() => setIsProposeOpen(true)}>
                  <Landmark className="h-4 w-4 mr-2" />
                  {inCommons
                    ? "Propose a change"
                    : "Propose for OpenDiving Commons"}
                </DropdownMenuItem>
              )}
              {inCommons && !diveSite.saved ? (
                <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                  <Bookmark className="h-4 w-4 mr-2" />
                  Save to your sites
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    {inCommons ? "Edit notes and tags" : "Edit"}
                  </DropdownMenuItem>
                  <DeleteMenuItem
                    onSelect={() => del.requestDelete(diveSite.uuid)}
                    disabled={isDeleting}
                    label={inCommons ? "Remove from your sites" : undefined}
                  />
                </>
              )}
            </ItemActionsMenu>
          </>
        }
      />

      {inCommons ? (
        <CommonsSiteDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          site={diveSite}
          onSaved={applySaved}
        />
      ) : (
        <DiveSiteDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          diveSite={diveSite}
          onSaved={(saved, proposes) => {
            applySaved(saved);
            if (proposes) setIsProposeOpen(true);
          }}
        />
      )}

      {inCommons ? (
        <ProposeChangeDialog
          open={isProposeOpen}
          onOpenChange={setIsProposeOpen}
          site={diveSite}
          onProposed={(proposal) => setDiveSite({ ...diveSite, proposal })}
        />
      ) : (
        <SiteProposalFlow
          site={isProposeOpen ? diveSite : null}
          onClose={() => setIsProposeOpen(false)}
          onSaved={applySaved}
          onProposed={(proposal) => setDiveSite({ ...diveSite, proposal })}
          onReplaced={(record) => router.replace(`/sites/${record.uuid}`)}
        />
      )}

      <ReplaceWithCommonsDialog
        site={diveSite}
        target={replaceTarget}
        onCancel={() => setReplaceTarget(null)}
        onReplaced={(record) => router.replace(`/sites/${record.uuid}`)}
      />

      <DeleteWithReassignDialog
        kind={inCommons ? "saved-commons-site" : "dive-site"}
        targetId={del.pendingId}
        isDeleting={isDeleting}
        onCancel={del.cancelDelete}
        onConfirm={(moveDivesTo, name) =>
          del.confirmDelete(
            moveDivesTo,
            name
              ? `${removedMessage} Its dives moved to ${name}.`
              : removedMessage,
          )
        }
      />

      <div className={HERO_BODY}>
        <SiteProposalNotice
          site={diveSite}
          onWithdrawn={() => setDiveSite({ ...diveSite, proposal: null })}
        />
        <SiteCommonsMatchNotice
          site={diveSite}
          onReplace={() => setReplaceTarget(diveSite.commons_match ?? null)}
        />
        <CommonsCredit
          attribution={diveSite.attribution}
          className="mb-2 text-right"
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-sm:gap-2.5">
          <div className="lg:col-span-2">
            <RecentDivesCard
              complete
              enabled={!!user}
              diveSiteId={diveSite.uuid}
              refreshOn={saves}
              title="Dives at This Site"
              description="All dives logged at this dive site"
              viewAllHref={null}
              emptyTitle="No dives logged at this site yet"
              emptyDescription="Log a dive and assign it to this dive site to see it here."
              newDiveHref={`/dives/new?dive_site_uuid=${diveSite.uuid}`}
              newDiveLabel="Log a dive at this site"
            />
          </div>

          <div className="space-y-6 max-sm:space-y-2.5">
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
