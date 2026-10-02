"use client";

import Link from "next/link";
import { Dive } from "@/lib/api/dives";
import { gearTypeLabel } from "@/lib/api/gear";
import { speciesDisplayName, speciesNameWithRank } from "@/lib/species";
import { SpeciesThumbnail } from "@/components/species/species-thumbnail";
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
import { formatWeight } from "@/lib/units";

interface DiveDetailMainProps {
  dive: Dive;
}

/**
 * The dive detail page's main column, ordered so each card's inputs are already on screen
 * by the time a card derived from them appears: under the hero's duration and depth
 * numbers, the profile that is their detailed form, then the mixtures whose pressures its
 * third curve traces, then the consumption figures derived from all three.
 *
 * Every card renders only when the dive carries the relevant data, so a hand-logged dive
 * shows whatever else was filled in.
 */
export function DiveDetailMain({ dive }: DiveDetailMainProps) {
  const hasGearInfo = (dive.gear_items?.length ?? 0) > 0 || dive.weight != null;
  const units = useUnits();
  const sightings = dive.sightings ?? [];
  // A column only when some row fills it, so a dive whose species were logged
  // without a count or a note shows the names alone.
  const hasCounts = sightings.some((sighting) => sighting.count != null);
  const hasNotes = sightings.some((sighting) => Boolean(sighting.notes));

  return (
    <div className="lg:col-span-2 space-y-6">
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
                  {formatWeight(dive.weight, units)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Between the kit and the notes, mirroring where the form puts the picker.
          A `Table` for the same reason the Gear card above is one: a real dive
          can carry a dozen sightings, and a list of glued-together strings gives
          the eye nothing to scan down. Common name leads the two text columns,
          because that is the one a diver reads - the binomial is what makes it
          unambiguous, not what makes it findable. */}
      {sightings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Fish className="h-5 w-5" />
              Species Spotted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {/* The image column's header is a name for screen readers and
                      nothing for the eye: a word over a column of photographs
                      labels what needs no label. */}
                  <TableHead className="w-16">
                    <span className="sr-only">Photo</span>
                  </TableHead>
                  <TableHead>Common name</TableHead>
                  <TableHead>Scientific name</TableHead>
                  {hasCounts && (
                    <TableHead className="text-right">Count</TableHead>
                  )}
                  {hasNotes && <TableHead>Notes</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sightings.map((sighting) => (
                  <TableRow key={sighting.uuid}>
                    {/* Every row gets this cell, and `SpeciesThumbnail` reserves
                        its box whether or not there is a photo to put in it - so
                        the rows stay the same height down the table instead of a
                        photo-less one collapsing to the height of its text. */}
                    <TableCell className="w-16">
                      <Link
                        href={`/species/${sighting.uuid}`}
                        // The name cell beside this links to the same page and
                        // carries the accessible name. Two adjacent links to one
                        // destination is a tab stop nobody wants and a link list
                        // entry that says nothing, so this one is taken out of
                        // both while staying clickable for the mouse.
                        aria-hidden="true"
                        tabIndex={-1}
                      >
                        <SpeciesThumbnail
                          uuid={sighting.uuid}
                          photoSha256={sighting.photo_sha256}
                          className="h-12 w-12"
                        />
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {/* The link the card's comment used to say did not exist
                          yet. It is also the attribution route: the photo beside
                          it carries no credit of its own, and this is the page
                          that does.

                          `aria-label` because the visible content is an em-dash
                          for the many species with no English name, and "—" is
                          not a link name. Where there *is* a common name the
                          label is that same string, so nothing diverges from
                          what is on screen. */}
                      <Link
                        href={`/species/${sighting.uuid}`}
                        className="hover:underline"
                        aria-label={speciesDisplayName(sighting)}
                      >
                        {sighting.common_name || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </TableCell>
                    {/* Italic by the binomial convention, and the rank comes
                        along when the row isn't one - "Muraenidae" on its own
                        reads as a species and isn't. */}
                    <TableCell className="italic text-muted-foreground">
                      {speciesNameWithRank(sighting)}
                    </TableCell>
                    {/* Blank for "seen, not counted", which is not 1. */}
                    {hasCounts && (
                      <TableCell className="text-right tabular-nums">
                        {sighting.count}
                      </TableCell>
                    )}
                    {/* Pre-wrap, as the Notes card below keeps the dive's own:
                        a merge or an import can put line breaks in a note. */}
                    {hasNotes && (
                      <TableCell className="whitespace-pre-wrap text-muted-foreground">
                        {sighting.notes}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
