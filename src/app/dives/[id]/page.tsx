"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { divesAPI, Dive } from "@/lib/api/dives";
import { tripsAPI, Trip } from "@/lib/api/trips";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
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
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

export default function DiveDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [dive, setDive] = useState<Dive | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [isLoadingDive, setIsLoadingDive] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const diveId = parseInt(params.id as string);

  // Redirect to signin if not authenticated, but only once the auth check
  // has actually finished.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/signin');
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Fetch dive details
  useEffect(() => {
    const fetchDive = async () => {
      if (!user?.username || !diveId) return;

      try {
        setIsLoadingDive(true);
        const diveData = await divesAPI.getDive(user.username, diveId);
        setDive(diveData);
      } catch (error) {
        console.error('Failed to fetch dive:', error);
        toast({
          title: "Error",
          description: "Failed to load dive details. Please try again.",
          variant: "destructive",
        });
        router.push('/dives');
      } finally {
        setIsLoadingDive(false);
      }
    };

    if (user?.username) {
      fetchDive();
    }
  }, [user?.username, diveId, toast, router]);

  // Once the dive has loaded, resolve its trip's name (the dive itself only
  // stores the trip's ID; its dive site(s) come embedded on the dive already).
  // Failures here are non-fatal - the dive page still works, it just won't
  // show the trip link.
  useEffect(() => {
    const fetchTrip = async () => {
      if (!user?.username || !dive?.trip_id) {
        setTrip(null);
        return;
      }

      try {
        const tripData = await tripsAPI.getTrip(user.username, dive.trip_id);
        setTrip(tripData);
      } catch (error) {
        console.error('Failed to fetch trip:', error);
        setTrip(null);
      }
    };

    fetchTrip();
  }, [user?.username, dive?.trip_id]);

  // Handle dive deletion
  const handleDeleteDive = async () => {
    if (!user?.username || !dive?.id || !confirm('Are you sure you want to delete this dive? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(true);
      await divesAPI.deleteDive(user.username, dive.id);

      toast({
        title: "Success",
        description: "Dive deleted successfully.",
      });

      router.push('/dives');
    } catch (error) {
      console.error('Failed to delete dive:', error);
      toast({
        title: "Error",
        description: "Failed to delete dive. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format time for display
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Format dive duration (given in seconds)
  const formatDuration = (durationSeconds: number) => {
    const totalMinutes = Math.round(durationSeconds / 60);

    if (totalMinutes < 60) {
      return `${totalMinutes} minute${totalMinutes !== 1 ? 's' : ''}`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}` : `${hours} hour${hours !== 1 ? 's' : ''}`;
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showDashboardActions={true} currentPage="dives" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingDive) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showDashboardActions={true} currentPage="dives" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!dive) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showDashboardActions={true} currentPage="dives" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              Dive not found.
            </div>
            <Button asChild>
              <Link href="/dives">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dives
              </Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const hasEnvironmentInfo = dive.bottom_temperature != null || dive.visibility != null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showDashboardActions={true} currentPage="dives" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dives">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dives
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Dive #{dive.dive_number}</h1>
              <p className="text-muted-foreground mt-1">
                {formatDate(dive.start_time)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/dives/${dive.id}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteDive}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </div>
        </div>

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
                    <div className="text-sm font-medium text-muted-foreground mb-1">Start Time</div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{formatTime(dive.start_time)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Duration</div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{formatDuration(dive.duration)}</span>
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
                        <div className="text-sm font-medium text-muted-foreground mb-1">Maximum Depth</div>
                        <div className="text-2xl font-bold">
                          {dive.max_depth}m
                        </div>
                      </div>
                    )}
                    {dive.avg_depth != null && (
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">Average Depth</div>
                        <div className="text-2xl font-bold">
                          {dive.avg_depth}m
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

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
                          <TableHead>PO₂</TableHead>
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
                              {mixture.start_pressure != null ? `${mixture.start_pressure} bar` : '-'}
                            </TableCell>
                            <TableCell>
                              {mixture.end_pressure != null ? `${mixture.end_pressure} bar` : '-'}
                            </TableCell>
                            <TableCell>{mixture.oxygen}%</TableCell>
                            <TableCell>{mixture.po2} bar</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
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
                      <div className="text-sm font-medium text-muted-foreground mb-1">Trip</div>
                      <Link
                        href={`/trips/${trip.id}`}
                        className="flex items-center gap-2 text-sm font-medium hover:underline"
                      >
                        <Luggage className="h-4 w-4 text-muted-foreground" />
                        {trip.name}
                      </Link>
                    </div>
                  )}
                  {dive.dive_sites.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Dive Site</div>
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
                      <div className="text-sm font-medium text-muted-foreground mb-1">Bottom Temperature</div>
                      <div className="flex items-center gap-2 text-xl font-semibold">
                        <Thermometer className="h-4 w-4 text-muted-foreground" />
                        {dive.bottom_temperature}°C
                      </div>
                    </div>
                  )}
                  {dive.visibility != null && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Visibility</div>
                      <div className="flex items-center gap-2 text-xl font-semibold">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        {dive.visibility}m
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Dive Metadata */}
            <Card>
              <CardHeader>
                <CardTitle>Dive Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Logged on</div>
                  <div className="text-sm">
                    {new Date(dive.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
