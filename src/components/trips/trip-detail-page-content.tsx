"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useResource } from "@/hooks/useResource";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useReturnTo, useWithReturnTo } from "@/hooks/useReturnTo";
import { tripsAPI, Trip, type TripDiveAddScope } from "@/lib/api/trips";
import type { Dive } from "@/lib/api/dives";
import { useContactsByUuid } from "@/hooks/useContactsByUuid";
import { usePeopleByUuid } from "@/hooks/usePeopleByUuid";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  DeleteMenuItem,
  ItemActionsMenu,
} from "@/components/ui/item-actions-menu";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { TripDialog } from "@/components/trips/trip-dialog";
import { TripHero } from "@/components/trips/trip-hero";
import { TripDiveSections } from "@/components/trips/trip-dive-sections";
import { TripInformationCard } from "@/components/trips/trip-information-card";
import {
  SectionIndexNav,
  SectionIndexProvider,
  useSectionIndex,
} from "@/components/ui/section-index";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { useToast } from "@/components/ui/use-toast";
import {
  HERO_BODY,
  HERO_CONTROL,
  MapHeroPageSkeleton,
  PAGE_COLUMN,
} from "@/components/ui/map-hero";
import { NotFoundState } from "@/components/ui/not-found-state";
import { Edit, Plus, Luggage } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";
import { getApiErrorStatus } from "@/lib/api/error";
import { countNoun } from "@/lib/format";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Cebu 2026" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Trip deleted successfully.";

// What an add that came back `added` of `expected` says. Short means the rest
// stopped being candidates between the page's read and the add.
function addedMessage(added: number, expected: number): string {
  if (added >= expected)
    return `${countNoun(added, "dive")} added to the trip.`;
  const rest = "moved to another trip or deleted since the page loaded";
  return added === 0
    ? `No dives added: they were ${rest}.`
    : `${countNoun(added, "dive")} of ${expected} added to the trip. The rest were ${rest}.`;
}

export function TripDetailPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const back = useReturnTo({ href: "/trips", label: "Back to trips" });
  const withReturnTo = useWithReturnTo();
  const sectionIndex = useSectionIndex();

  const {
    resource: trip,
    setResource: setTrip,
    isLoading: isLoadingTrip,
    refetch: refetchTrip,
  } = useResource<Trip>(tripsAPI.getTrip, {
    enabled: !!user,
    errorMessage: "Failed to load trip details. Please try again.",
    redirectTo: "/trips",
  });
  useDocumentTitle(trip?.name, "Trips");

  const del = useDeleteResource(tripsAPI.deleteTrip, {
    successMessage: DELETED_MESSAGE,
    errorMessage: "Failed to delete trip. Please try again.",
    onDeleted: () => router.push(back.href),
  });
  const isDeleting = del.deletingId !== null;

  // The trip's dives with its candidates in among them, a page at a time as
  // /dives reads its list. Keyed on the trip's uuid alone, never on the trip:
  // an add and a save both replace that object, and a fetcher that changed with
  // it would throw away every page the diver has scrolled through.
  const tripUuid = trip?.uuid;
  const fetchTripDives = useCallback(
    (page: number, perPage: number) =>
      tripsAPI.getTripDives(tripUuid!, page, perPage),
    [tripUuid],
  );
  const {
    items: tripDives,
    isLoading: isLoadingDives,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    reload,
    revalidate,
  } = useInfiniteResource<Dive>(fetchTripDives, {
    enabled: !!tripUuid,
    errorMessage: "Failed to load dives. Please try again.",
    keyOf: (dive) => dive.uuid,
  });

  // An add keeps the list as long as it was - a candidate that joins the trip
  // is still in it - so the loaded rows are re-read in place rather than from
  // the first page, and the trip with them for its figures and its counts.
  const addDives = useCallback(
    async (scope: TripDiveAddScope, expected: number) => {
      if (!tripUuid) return false;
      try {
        const { added } = await tripsAPI.addTripDives(tripUuid, scope);
        await Promise.all([revalidate(), refetchTrip()]);
        toast({ description: addedMessage(added, expected) });
        return added > 0;
      } catch (error) {
        const status = getApiErrorStatus(error);
        if (status === 422) {
          // A part named by dates the trip no longer carries: it was edited
          // somewhere else since this page read it.
          await Promise.all([revalidate(), refetchTrip()]);
          toast({
            title: "This trip has changed",
            description:
              "Its parts were edited since the page loaded, so nothing was added. The page now shows them as they are.",
          });
          return false;
        }
        console.error("Failed to add dives to the trip:", error);
        toast({
          title: "Error",
          description: "Failed to add dives to the trip. Please try again.",
          variant: "destructive",
        });
        return false;
      }
    },
    [tripUuid, revalidate, refetchTrip, toast],
  );

  // Read off the trip's own dives by the API, not off the list here, which
  // holds candidates and only the pages loaded so far.
  const diveCenterUuids = trip?.contact_uuids ?? [];

  const contacts = useContactsByUuid([
    ...(trip?.parts ?? []).map((part) => part.accommodation_uuid),
    ...diveCenterUuids,
  ]);
  const diveCenterNames = diveCenterUuids
    .map((uuid) => contacts[uuid]?.name)
    .filter((name): name is string => !!name);

  // Who came on the trip, which the trip itself records - unlike the dive
  // centers, which are read off its dives.
  const tripPeople = trip?.people ?? [];
  const people = usePeopleByUuid(
    tripPeople.map((reference) => reference.person_uuid),
  );

  const tripParts = trip?.parts ?? [];
  const hasPeople = tripPeople.some(
    (reference) => people[reference.person_uuid],
  );

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }
  if (isLoadingTrip) {
    return (
      <MapHeroPageSkeleton
        backHref={back.href}
        backLabel={back.label}
        icon={Luggage}
      />
    );
  }

  if (!trip) {
    return (
      <div className={PAGE_COLUMN}>
        <NotFoundState
          message="Trip not found."
          backHref={back.href}
          backLabel={back.label}
        />
      </div>
    );
  }

  return (
    <div>
      <TripHero
        trip={trip}
        back={back}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className={HERO_CONTROL}
              render={
                <Link
                  href={withReturnTo(`/dives/new?trip_uuid=${trip.uuid}`)}
                />
              }
              nativeButton={false}
              role="link"
            >
              <Plus className="h-4 w-4 mr-2" />
              Log a dive
            </Button>
            <ItemActionsMenu variant="ghost" size="sm" className={HERO_CONTROL}>
              <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DeleteMenuItem
                onSelect={() => del.requestDelete(trip.uuid)}
                disabled={isDeleting}
              />
            </ItemActionsMenu>
          </>
        }
      />

      <TripDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        trip={trip}
        // A part's dates decide which dives are candidates, so the list starts
        // again; and the trip is read again for the counts the form's parts
        // do not carry.
        onSaved={(saved) => {
          setTrip(saved);
          void reload();
          void refetchTrip();
        }}
      />

      <DeleteWithReassignDialog
        kind="trip"
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

      <SectionIndexProvider index={sectionIndex}>
        <div className={HERO_BODY}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-sm:gap-2.5">
            <div className="lg:col-span-2">
              <TripDiveSections
                dives={
                  isLoadingDives && tripDives.length === 0 ? null : tripDives
                }
                hasMore={hasMore}
                onLoadMore={loadMore}
                // Once a row is on screen, a failed page is the trigger's to
                // retry rather than the whole column's to replace.
                loadFailed={loadFailed && tripDives.length === 0}
                parts={tripParts}
                contacts={contacts}
                candidateCount={trip.candidate_count}
                newDiveHref={`/dives/new?trip_uuid=${trip.uuid}`}
                onAdd={addDives}
              />
              <LoadMoreTrigger
                hasMore={hasMore}
                isLoading={isLoadingMore}
                hasFailed={loadFailed}
                loadedCount={tripDives.length}
                totalCount={totalCount}
                itemsPerPage={itemsPerPage}
                itemLabel="dives"
                onLoadMore={loadMore}
              />
            </div>

            {/* From `lg` up the index of the trip's cards and its information
                card stay beside the dives together, held to the viewport's height
                and scrolling on their own past it - with a few pixels to spare for
                the card's shadow, which the scroll box would otherwise clip. Below
                that the stuck headings carry the index. The trip's dates are on
                the hero's line, and a trip with nothing more to say draws no
                information card: there would be nothing in it but its heading. */}
            <div>
              <div className="space-y-6 max-sm:space-y-2.5 lg:sticky lg:top-[calc(var(--header-height)+--spacing(5))] lg:-m-1 lg:max-h-[calc(100dvh-var(--header-height)-3rem)] lg:overflow-y-auto lg:p-1">
                <SectionIndexNav className="hidden lg:block" />
                {(hasPeople || diveCenterNames.length > 0 || trip.notes) && (
                  <TripInformationCard
                    people={tripPeople}
                    resolvedPeople={people}
                    diveCenterNames={diveCenterNames}
                    notes={trip.notes}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </SectionIndexProvider>
    </div>
  );
}
