"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { divesAPI, Dive } from "@/lib/api/dives";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";
import { DiveSourceFileCard } from "@/components/dives/dive-source-file-card";
import { DiveProfileCard } from "@/components/dives/dive-profile-card";
import { gearItemLabel } from "@/lib/api/gear";
import { gasUseUnavailableReason } from "@/lib/dive-gas";
import { Badge } from "@/components/ui/badge";
import {
  formatDateTime,
  formatDiveDateTime,
  formatDiveTimeOnly,
  formatDurationHoursMinutes,
  formatUtcOffset,
  parseUtcOffsetMinutes,
} from "@/lib/date-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { NotFoundState } from "@/components/ui/not-found-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Edit,
  Trash2,
  Calendar,
  Clock,
  Gauge,
  Thermometer,
  Eye,
  Wind,
  Luggage,
  MapPin,
  FileText,
  Backpack,
  Weight,
  Activity,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

export default function DiveDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const { toast } = useToast();
  const [dive, setDive] = useState<Dive | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [isLoadingDive, setIsLoadingDive] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const diveId = params.id as string;

  // Fetch dive details
  useEffect(() => {
    const fetchDive = async () => {
      if (!user || !diveId) return;

      try {
        setIsLoadingDive(true);
        const diveData = await divesAPI.getDive(diveId);
        setDive(diveData);
      } catch (error) {
        console.error("Failed to fetch dive:", error);
        toast({
          title: "Error",
          description: "Failed to load dive details. Please try again.",
          variant: "destructive",
        });
        router.push("/dives");
      } finally {
        setIsLoadingDive(false);
      }
    };

    if (user) {
      fetchDive();
    }
  }, [user, diveId, toast, router]);

  // Re-read the dive after something on the page changes it - currently only
  // deleting the imported file, which the dive embeds as `source_file`.
  //
  // Deliberately *not* the initial fetch above: this one leaves
  // `isLoadingDive` alone, so refreshing after a delete swaps the one card
  // that changed instead of blanking the whole page into a spinner. A failure
  // is non-fatal here (the delete already succeeded), so it doesn't redirect.
  const refreshDive = useCallback(async () => {
    if (!diveId) return;

    try {
      setDive(await divesAPI.getDive(diveId));
    } catch (error) {
      console.error("Failed to refresh dive:", error);
    }
  }, [diveId]);

  // Once the dive has loaded, resolve its trip's name (the dive itself only
  // stores the trip's ID; its dive site(s) come embedded on the dive already).
  // Failures here are non-fatal - the dive page still works, it just won't
  // show the trip link.
  useEffect(() => {
    const fetchTrip = async () => {
      if (!user || !dive?.trip_uuid) {
        setTrip(null);
        return;
      }

      try {
        const tripData = await tripsAPI.getTrip(dive.trip_uuid);
        setTrip(tripData);
      } catch (error) {
        console.error("Failed to fetch trip:", error);
        setTrip(null);
      }
    };

    fetchTrip();
  }, [user, dive?.trip_uuid]);

  // Handle dive deletion
  const handleDeleteDive = async () => {
    if (!user || !dive?.uuid) return;

    try {
      setIsDeleting(true);
      await divesAPI.deleteDive(dive.uuid);

      toast({
        title: "Success",
        description: "Dive deleted successfully.",
      });

      router.push("/dives");
    } catch (error) {
      console.error("Failed to delete dive:", error);
      toast({
        title: "Error",
        description: "Failed to delete dive. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsConfirmOpen(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingDive) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SectionSpinner />
      </div>
    );
  }

  if (!dive) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotFoundState
          message="Dive not found."
          backHref="/dives"
          backLabel="Back to Dives"
        />
      </div>
    );
  }

  const hasEnvironmentInfo =
    dive.bottom_temperature != null || dive.visibility != null;

  const hasGearInfo = (dive.gear_items?.length ?? 0) > 0 || dive.weight != null;

  // Null both when the figure is present and when the dive was never a
  // candidate for one, so `dive.gas_use || gasUseReason` is the whole "is there
  // anything to show" test.
  const gasUseReason = gasUseUnavailableReason(dive);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        backHref="/dives"
        backLabel="Back to Dives"
        title={`Dive #${dive.dive_number}`}
        subtitle={formatDiveDateTime(dive.start_time, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/dives/${dive.uuid}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={() => setIsConfirmOpen(true)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </>
        }
      />

      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Delete dive"
        description="Are you sure you want to delete this dive? This action cannot be undone."
        confirmText="Delete"
        isLoading={isDeleting}
        onConfirm={handleDeleteDive}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Time & Duration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Time & Duration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Start Time
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {formatDiveTimeOnly(dive.start_time)}{" "}
                      <span className="text-muted-foreground">
                        (UTC
                        {formatUtcOffset(
                          parseUtcOffsetMinutes(dive.start_time) ?? 0,
                        )}
                        )
                      </span>
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Duration
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDurationHoursMinutes(dive.duration)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Depth Information */}
          {(dive.max_depth != null || dive.avg_depth != null) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="h-5 w-5" />
                  Depth Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dive.max_depth != null && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Maximum Depth
                      </div>
                      <div className="text-2xl font-bold">
                        {dive.max_depth}m
                      </div>
                    </div>
                  )}
                  {dive.avg_depth != null && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Average Depth
                      </div>
                      <div className="text-2xl font-bold">
                        {dive.avg_depth}m
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* The recorded profile, immediately after the two depth numbers it
              is the detailed form of, and before the gas mixtures whose
              pressures its third curve traces. Renders nothing for a dive
              logged by hand. */}
          <DiveProfileCard dive={dive} />

          {/* Gas Mixtures */}
          {dive.mixtures && dive.mixtures.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wind className="h-5 w-5" />
                  Gas Mixtures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Volume</TableHead>
                        <TableHead>Start Pressure</TableHead>
                        <TableHead>End Pressure</TableHead>
                        <TableHead>O₂</TableHead>
                        <TableHead>He</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dive.mixtures.map((mixture, index) => (
                        <TableRow key={mixture.id ?? index}>
                          <TableCell className="font-medium">
                            {mixture.name || `Tank ${index + 1}`}
                          </TableCell>
                          <TableCell>{mixture.volume} L</TableCell>
                          <TableCell>
                            {mixture.start_pressure != null
                              ? `${mixture.start_pressure} bar`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {mixture.end_pressure != null
                              ? `${mixture.end_pressure} bar`
                              : "-"}
                          </TableCell>
                          <TableCell>{mixture.oxygen}%</TableCell>
                          <TableCell>{mixture.helium}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Air consumption, derived by the API from the duration, average
              depth and cylinder pressures above - which is why it sits after
              the mixtures table rather than before it: the inputs are on screen
              by the time the number is.

              Rendered even when the figure couldn't be derived, unlike the
              other optional cards here. Those are absent because the diver
              didn't record something they'd know they hadn't; this one can be
              absent despite the pressures being filled in (a missing average
              depth, a second tank), and silence would read as a bug. */}
          {(dive.gas_use || gasUseReason) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Air Consumption
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dive.gas_use ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          SAC / RMV
                        </div>
                        <div className="text-2xl font-bold">
                          {dive.gas_use.rmv} L/min
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          Pressure Rate
                        </div>
                        <div className="text-2xl font-bold">
                          {dive.gas_use.sac_bar_per_min} bar/min
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          Gas Used
                        </div>
                        <div className="text-2xl font-bold">
                          {dive.gas_use.gas_used} L
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4">
                      What you&apos;d have breathed doing the same dive at the
                      surface, from an average depth of {dive.avg_depth}m.
                      Assumes salt water at sea level. Lower is better.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{gasUseReason}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Gear & weight. Shown whenever *either* is recorded - a dive can
              have a logged weight without any gear items listed, and vice
              versa. */}
          {hasGearInfo && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Backpack className="h-5 w-5" />
                  Gear
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {dive.gear_items && dive.gear_items.length > 0 && (
                  <ul className="space-y-2">
                    {dive.gear_items.map((item) => (
                      <li key={item.uuid} className="flex items-center gap-2">
                        <Link
                          href={`/gear/${item.uuid}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {gearItemLabel(item)}
                        </Link>
                        {item.rented && (
                          <Badge variant="secondary">Rented</Badge>
                        )}
                        {item.is_archived && (
                          <Badge variant="outline">Archived</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {dive.weight != null && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Weight
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Weight className="h-4 w-4 text-muted-foreground" />
                      {dive.weight} kg
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {dive.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none">
                  <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                    {dive.notes}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Trip & Dive Site */}
          {(trip || dive.dive_sites.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Trip & Dive Site</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {trip && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Trip
                    </div>
                    <Link
                      href={`/trips/${trip.uuid}`}
                      className="flex items-center gap-2 text-sm font-medium hover:underline"
                    >
                      <Luggage className="h-4 w-4 text-muted-foreground" />
                      {trip.name}
                    </Link>
                  </div>
                )}
                {dive.dive_sites.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Dive Site
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <DiveSitesLabel sites={dive.dive_sites} linked />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Environmental Conditions */}
          {hasEnvironmentInfo && (
            <Card>
              <CardHeader>
                <CardTitle>Environment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {dive.bottom_temperature != null && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Bottom Temperature
                    </div>
                    <div className="flex items-center gap-2 text-xl font-semibold">
                      <Thermometer className="h-4 w-4 text-muted-foreground" />
                      {dive.bottom_temperature}°C
                    </div>
                  </div>
                )}
                {dive.visibility != null && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Visibility
                    </div>
                    <div className="flex items-center gap-2 text-xl font-semibold">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      {dive.visibility}m
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* The dive-computer export this dive was imported from, if any */}
          <DiveSourceFileCard dive={dive} onChanged={refreshDive} />

          {/* Dive Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Dive Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <div className="text-sm font-medium text-muted-foreground">
                  Logged on
                </div>
                <div className="text-sm">
                  {formatDateTime(dive.created_at, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
