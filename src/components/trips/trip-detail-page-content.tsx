"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useReturnTo, useWithReturnTo } from "@/hooks/useReturnTo";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { divesAPI, Dive } from "@/lib/api/dives";
import { fetchAllPages, isAbortError } from "@/lib/api/client";
import { distinctContactUuids } from "@/lib/contact";
import { useContactsByUuid } from "@/hooks/useContactsByUuid";
import { usePeopleByUuid } from "@/hooks/usePeopleByUuid";
import { formatTripDateRange } from "@/lib/date-time";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  DeleteMenuItem,
  ItemActionsMenu,
} from "@/components/ui/item-actions-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { TripDialog } from "@/components/trips/trip-dialog";
import { TripHero } from "@/components/trips/trip-hero";
import { TripDiveSections } from "@/components/trips/trip-dive-sections";
import { useToast } from "@/components/ui/use-toast";
import {
  HERO_BODY,
  HERO_CONTROL,
  MapHeroPageSkeleton,
} from "@/components/ui/map-hero";
import { PeopleList } from "@/components/people/people-list";
import { NotFoundState } from "@/components/ui/not-found-state";
import { BedDouble, Edit, Plus, Calendar, Luggage, MapPin } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Cebu 2026" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Trip deleted successfully.";

export function TripDetailPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const back = useReturnTo({ href: "/trips", label: "Back to trips" });
  const withReturnTo = useWithReturnTo();

  const {
    resource: trip,
    setResource: setTrip,
    isLoading: isLoadingTrip,
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

  // Every dive of the trip, read once and keyed on the trip it was read for:
  // the dives column groups them under the parts they were made on, which needs
  // all of them at once, and the dive centers line is read off them - derived
  // rather than stored on the trip, so it can never disagree with them; a week
  // split between two shops lists both.
  const tripUuid = trip?.uuid;
  const [tripDives, setTripDives] = useState<{
    tripUuid: string;
    dives: Dive[] | null;
  } | null>(null);
  useEffect(() => {
    if (!tripUuid) return;
    const controller = new AbortController();
    fetchAllPages(
      (page, perPage) => divesAPI.getDives(page, perPage, { tripUuid }),
      {
        signal: controller.signal,
        label: "the trip's dives",
        keyOf: (dive) => dive.uuid,
      },
    )
      .then((dives) => setTripDives({ tripUuid, dives }))
      .catch((error) => {
        if (isAbortError(error)) return;
        console.error("Failed to fetch the trip's dives:", error);
        setTripDives({ tripUuid, dives: null });
        toast({
          title: "Error",
          description: "Failed to load dives. Please try again.",
          variant: "destructive",
        });
      });
    return () => controller.abort();
  }, [tripUuid, toast]);
  const isCurrentTripDives = !!tripDives && tripDives.tripUuid === tripUuid;
  const dives = isCurrentTripDives ? tripDives.dives : null;
  const divesFailed = isCurrentTripDives && tripDives.dives === null;
  const diveCenterUuids = useMemo(
    () => (dives ? distinctContactUuids(dives) : []),
    [dives],
  );

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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
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
            <Button variant="ghost" size="sm" className={HERO_CONTROL} asChild>
              <Link href={withReturnTo(`/dives/new?trip_uuid=${trip.uuid}`)}>
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
        onSaved={setTrip}
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

      <div className={HERO_BODY}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TripDiveSections
              dives={dives}
              loadFailed={divesFailed}
              parts={tripParts}
              newDiveHref={`/dives/new?trip_uuid=${trip.uuid}`}
            />
          </div>

          {/* The trip's dates are on the hero's line. A trip with nothing more
              to say draws no card - there would be nothing in it but its
              heading. */}
          <div className="space-y-6">
            {(tripParts.length > 0 ||
              hasPeople ||
              diveCenterNames.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle as="h2" className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Trip Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {tripParts.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        {tripParts.length > 1 ? "Parts" : "Part"}
                      </div>
                      {/* One row per part, in the order the diver arranged them,
                      rather than the capped joined line the header and the trip
                      cards show: this is the one surface with room to name every
                      place and put the part's own dates beneath each. A part
                      with no place is still a row - it is a stretch of the trip,
                      and dropping it would renumber the rest. */}
                      <ul className="space-y-1.5">
                        {tripParts.map((part, index) => {
                          const dates = formatTripDateRange(
                            part.start_date ?? undefined,
                            part.end_date ?? undefined,
                          );
                          const accommodation = part.accommodation_uuid
                            ? contacts[part.accommodation_uuid]
                            : undefined;
                          return (
                            <li
                              key={index}
                              className="flex items-start gap-2 text-sm"
                            >
                              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                              <span className="min-w-0">
                                <span className="block">
                                  {part.location?.name ?? (
                                    <span className="text-muted-foreground">
                                      No place recorded
                                    </span>
                                  )}
                                </span>
                                {accommodation && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <BedDouble className="h-3.5 w-3.5 shrink-0" />
                                    <span className="sr-only">Stayed at </span>
                                    {accommodation.name}
                                  </span>
                                )}
                                {dates && (
                                  <span className="block text-xs text-muted-foreground">
                                    {dates}
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {hasPeople && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        People
                      </div>
                      <PeopleList people={tripPeople} resolved={people} />
                    </div>
                  )}

                  {/* What the contacts here are, and not who the diver was with:
                  that is the People list above. */}
                  {diveCenterNames.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Dive centers
                      </div>
                      <div className="text-sm">
                        {diveCenterNames.join(", ")}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
