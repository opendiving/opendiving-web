import Link from "next/link";
import { Dive } from "@/lib/api/dives";
import { Trip } from "@/lib/api/trips";
import { formatDateTime } from "@/lib/date-time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";
import { DiveSourceFileCard } from "@/components/dives/dive-source-file-card";
import { Eye, Luggage, MapPin, Thermometer } from "lucide-react";

interface DiveDetailSidebarProps {
  dive: Dive;
  /** Resolved separately from the dive, which stores only the trip's uuid. Null while
   * loading, when the dive has no trip, or when that lookup failed — all three are
   * non-fatal and simply hide the trip link. */
  trip: Trip | null;
  /** Called after the source file is deleted, so the dive can be re-read. */
  onSourceFileChanged: () => void;
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
    dive.bottom_temperature != null || dive.visibility != null;

  return (
    <div className="space-y-6">
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
