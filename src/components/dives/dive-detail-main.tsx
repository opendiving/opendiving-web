"use client";

import Link from "next/link";
import { Dive } from "@/lib/api/dives";
import { gearTypeLabel } from "@/lib/api/gear";
import {
  SPECIES_CARD_GRID,
  SpeciesCard,
} from "@/components/species/species-card";
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
import { Backpack, Fish, FileText, Weight } from "lucide-react";
import { useUnits } from "@/hooks/useUnits";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { formatWeight } from "@/lib/units";

interface DiveDetailMainProps {
  dive: Dive;
}

/**
 * The dive detail page's main column, ordered so each card's inputs are already on screen
 * by the time a card derived from them appears: under the hero's duration and depth
 * numbers, the profile that is their detailed form, then the tanks whose pressures its
 * third curve traces, then the consumption figures derived from all three, then the
 * exposure those same tanks produced.
 *
 * Every card renders only when the dive carries the relevant data, so a hand-logged dive
 * shows whatever else was filled in.
 */
export function DiveDetailMain({ dive }: DiveDetailMainProps) {
  const hasGearInfo = (dive.gear_items?.length ?? 0) > 0 || dive.weight != null;
  const units = useUnits();
  const withReturnTo = useWithReturnTo();
  const sightings = dive.sightings ?? [];

  return (
    <div className="lg:col-span-2 space-y-6 max-sm:space-y-2.5">
      {/* Renders nothing for a dive logged by hand. */}
      <DiveProfileCard dive={dive} />

      <DiveMixturesCard dive={dive} />

      <DiveGasConsumptionCard dive={dive} />

      {/* Renders nothing unless the dive was imported from a format that records any
          of it. */}
      <DiveExposureCard dive={dive} />

      {/* Shown whenever *either* is recorded - a dive can have a logged weight without
          any gear items listed, and vice versa. */}
      {hasGearInfo && (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
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
                            href={withReturnTo(`/gear/${item.uuid}`)}
                            className="relative hover:underline touch:tap-target"
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
                  {formatWeight(dive.weight, units)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Between the kit and the notes, mirroring where the form puts the
          picker, in spotting order. */}
      {sightings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Fish className="h-5 w-5" />
              Species Spotted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className={SPECIES_CARD_GRID}>
              {sightings.map((sighting) => (
                <SpeciesCard
                  key={sighting.uuid}
                  species={sighting}
                  // None for "seen, not counted", which is not 1.
                  figures={
                    sighting.count != null
                      ? [{ label: "Count", value: sighting.count }]
                      : []
                  }
                >
                  {/* Pre-wrap, as the Notes card below keeps the dive's own: a
                      merge or an import can put line breaks in a note. */}
                  {sighting.notes && (
                    <span className="whitespace-pre-wrap">
                      {sighting.notes}
                    </span>
                  )}
                </SpeciesCard>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {dive.notes && (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
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
