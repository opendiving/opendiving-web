import Link from "next/link";
import { Dive } from "@/lib/api/dives";
import { gearTypeLabel } from "@/lib/api/gear";
import { formatDurationHoursMinutes } from "@/lib/date-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiveProfileCard } from "@/components/dives/dive-profile-card";
import { DiveMixturesCard } from "@/components/dives/dive-mixtures-card";
import { DiveExposureCard } from "@/components/dives/dive-exposure-card";
import { DiveGasConsumptionCard } from "@/components/dives/dive-gas-consumption-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Backpack, FileText, Timer, Weight } from "lucide-react";

interface DiveDetailMainProps {
  dive: Dive;
}

/**
 * The dive detail page's main column, ordered so each card's inputs are already on screen
 * by the time a card derived from them appears: the duration and depth numbers, then the
 * profile that is their detailed form, then the mixtures whose pressures its third curve
 * traces, then the consumption figures derived from all three.
 *
 * Every card past the first renders only when the dive carries the relevant data, so a
 * hand-logged dive shows just the duration and whatever else was filled in.
 */
export function DiveDetailMain({ dive }: DiveDetailMainProps) {
  const hasGearInfo = (dive.gear_items?.length ?? 0) > 0 || dive.weight != null;

  return (
    <div className="lg:col-span-2 space-y-6">
      {/* The three numbers that describe the shape of the dive, in one card and
          at one weight. They were two - a "Time & Duration" card holding the
          start time and the duration, and a "Depth Information" card below it -
          which spent a whole card's header on a single figure and put "45min"
          and "30.5 m" in different boxes despite being read together. The start
          time went up to the page header, where the date already was. */}
      <Card>
        <CardHeader>
          {/* `Timer`, not the `Gauge` the old "Depth Information" card carried:
              `DiveExposureCard` further down this same column heads itself with
              a gauge too, and two cards a scroll apart under one icon is the
              icon saying nothing. The merged card leads with duration, so it
              takes the icon for the word it leads with. */}
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Duration & Depth
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Three columns for three figures, and a dive that recorded no depths
              simply leaves the duration on its own rather than stretching it. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Duration
              </div>
              <div className="text-2xl font-bold">
                {formatDurationHoursMinutes(dive.duration)}
              </div>
            </div>
            {dive.max_depth != null && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Maximum Depth
                </div>
                <div className="text-2xl font-bold">{dive.max_depth}m</div>
              </div>
            )}
            {dive.avg_depth != null && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Average Depth
                </div>
                <div className="text-2xl font-bold">{dive.avg_depth}m</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Renders nothing for a dive logged by hand. */}
      <DiveProfileCard dive={dive} />

      <DiveMixturesCard dive={dive} />

      {/* Between the gas and what it cost: the mixtures above are what produced this
          exposure, and the consumption below is the other thing those same cylinders
          determined. Renders nothing unless the dive was imported from a format that
          records any of it. */}
      <DiveExposureCard dive={dive} />

      <DiveGasConsumptionCard dive={dive} />

      {/* Shown whenever *either* is recorded - a dive can have a logged weight without
          any gear items listed, and vice versa. */}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dive.gear_items.map((item) => (
                    <TableRow key={item.uuid}>
                      <TableCell className="text-muted-foreground">
                        {gearTypeLabel(item.type) ?? "-"}
                      </TableCell>
                      <TableCell>{item.brand || "-"}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/gear/${item.uuid}`}
                            className="hover:underline"
                          >
                            {item.name}
                          </Link>
                          {item.rented && (
                            <Badge variant="secondary">Rented</Badge>
                          )}
                          {item.is_archived && (
                            <Badge variant="outline">Archived</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
  );
}
