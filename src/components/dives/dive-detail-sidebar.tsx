import Link from "next/link";
import { Dive, WATER_TYPE_LABELS } from "@/lib/api/dives";
import { Trip } from "@/lib/api/trips";
import { formatDateTime } from "@/lib/date-time";
import { formatDistance, GeoPoint, haversineMeters } from "@/lib/geo-distance";
import { formatCoordinates } from "@/lib/validations/dive-site";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";
import { DiveSourceFileCard } from "@/components/dives/dive-source-file-card";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import type { MappableLocation } from "@/components/map/locations-map";
import {
  Eye,
  Luggage,
  MapPin,
  Mountain,
  Thermometer,
  Waves,
} from "lucide-react";

interface DiveDetailSidebarProps {
  dive: Dive;
  /** Resolved separately from the dive, which stores only the trip's uuid. Null while
   * loading, when the dive has no trip, or when that lookup failed — all three are
   * non-fatal and simply hide the trip link. */
  trip: Trip | null;
  /** Called after the source file is deleted, so the dive can be re-read. */
  onSourceFileChanged: () => void;
}

// A recorded pair as a point, or null when the dive has no fix on that side.
//
// `== null`, not falsiness: a dive off West Africa exits at longitude 0 and one
// in the Galápagos at latitude 0, and both are positions rather than absences.
function fixPoint(
  latitude?: number | null,
  longitude?: number | null,
): GeoPoint | null {
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
}

/**
 * The dive detail page's sidebar: where the dive was, what the water was like, what it was
 * imported from, and when it was logged.
 *
 * Each card renders only when it has something to show, so a hand-logged dive with no trip
 * or conditions recorded leaves just the metadata card.
 */
export function DiveDetailSidebar({
  dive,
  trip,
  onSourceFileChanged,
}: DiveDetailSidebarProps) {
  const hasEnvironmentInfo =
    dive.bottom_temperature != null ||
    dive.visibility != null ||
    dive.water_type != null ||
    dive.altitude != null;

  // Where the dive computer put the diver, which is a different claim from where
  // the site is pinned - so both are drawn, and the ring/dot pair is what tells
  // them apart. Exit-only is the ordinary case, not half a reading: every
  // GPS-carrying export in the API's corpus takes its first fix after surfacing.
  const entry = fixPoint(dive.entry_latitude, dive.entry_longitude);
  const exit = fixPoint(dive.exit_latitude, dive.exit_longitude);
  const entryCoordinates =
    entry && formatCoordinates(entry.latitude, entry.longitude);
  const exitCoordinates =
    exit && formatCoordinates(exit.latitude, exit.longitude);

  // The map is capped at zoom 10, where a surface swim is well under a pixel, so
  // the drift between the two fixes is a line of text or it is nothing.
  const drift =
    entry && exit ? formatDistance(haversineMeters(entry, exit)) : null;

  const mapLocations: MappableLocation[] = [
    ...dive.dive_sites.map((site) => ({
      name: site.name,
      latitude: site.latitude,
      longitude: site.longitude,
    })),
    ...(entry ? [{ name: "Entry", ...entry, variant: "fix" as const }] : []),
    ...(exit ? [{ name: "Exit", ...exit, variant: "fix" as const }] : []),
  ];
  // The map draws nothing without a position anyway; this gate is what keeps a
  // dive with no positions at all from fetching its chunk (same as the site
  // page). Linked sites are the reason it is not simply `entry || exit`: a dive
  // may have a pinned site and no fixes of its own.
  const hasMappableLocation = mapLocations.some(
    (location) => location.latitude != null && location.longitude != null,
  );

  return (
    <div className="space-y-6">
      {(trip ||
        dive.dive_sites.length > 0 ||
        entryCoordinates ||
        exitCoordinates) && (
        <Card>
          <CardHeader>
            {/* "Location", not the "Trip & Dive Site" this card was called
                while those were the only two things in it: a dive with GPS but
                no trip and no site is now one of the cases it renders for, and
                the blocks inside are each labelled anyway. */}
            <CardTitle>Location</CardTitle>
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

            {hasMappableLocation && (
              <LocationsMap
                locations={mapLocations}
                subject="the dive's location"
              />
            )}

            {entryCoordinates && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Entry
                </div>
                <div className="text-sm tabular-nums">{entryCoordinates}</div>
              </div>
            )}
            {exitCoordinates && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Exit
                </div>
                <div className="text-sm tabular-nums">{exitCoordinates}</div>
              </div>
            )}
            {drift && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Entry → exit
                </div>
                <div className="text-sm tabular-nums">{drift}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
            {dive.water_type != null && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Water Type
                </div>
                <div className="flex items-center gap-2 text-xl font-semibold">
                  <Waves className="h-4 w-4 text-muted-foreground" />
                  {/* Falls back to the wire value, like `gearTypeLabel` and the
                      mixtures table's role badge: the API can grow a member
                      before this build ships a label for it, and rendering the
                      slug beats rendering a blank row. */}
                  {WATER_TYPE_LABELS[dive.water_type] ?? dive.water_type}
                </div>
              </div>
            )}
            {dive.altitude != null && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Altitude
                </div>
                <div className="flex items-center gap-2 text-xl font-semibold">
                  <Mountain className="h-4 w-4 text-muted-foreground" />
                  {dive.altitude} m
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* The dive-computer export this dive was imported from, if any */}
      <DiveSourceFileCard dive={dive} onChanged={onSourceFileChanged} />

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
  );
}
