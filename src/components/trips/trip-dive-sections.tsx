"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Dive } from "@/lib/api/dives";
import type { TripPart } from "@/lib/api/trips";
import { formatTripDateRange } from "@/lib/date-time";
import { tripDiveSections } from "@/lib/trip-dive-sections";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BackdropCardSkeleton } from "@/components/ui/backdrop-card";
import { DiveCard } from "@/components/dives/dive-card";
import { DiveIcon } from "@/components/logo";
import { MapPin, Plus } from "lucide-react";

const SKELETON_COUNT = 5;

interface TripDiveSectionsProps {
  // Every dive of the trip, newest first; `null` until they have loaded.
  dives: Dive[] | null;
  loadFailed: boolean;
  parts: TripPart[];
  newDiveHref: string;
}

function DiveList({ dives }: { dives: Dive[] }) {
  return (
    <ul className="space-y-3">
      {dives.map((dive) => (
        <DiveCard key={dive.uuid} dive={dive} />
      ))}
    </ul>
  );
}

function DivesCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// The trip's dives, a card for each part they were made on, headed by the
// part's place and dates. The dives no part's dates cover sit between those
// cards, where their days put them. A trip whose dives fall in no part - or
// that has no parts - keeps the one card of every dive.
export function TripDiveSections({
  dives,
  loadFailed,
  parts,
  newDiveHref,
}: TripDiveSectionsProps) {
  const withReturnTo = useWithReturnTo();
  const allDivesCard = (children: ReactNode) => (
    <DivesCard
      icon={<DiveIcon className="h-5 w-5" />}
      title="Dives in This Trip"
      // Not "logged as part of this trip": a part is a noun here now, and that
      // sentence reads as a claim about which stretch a dive was on.
      description="Every dive logged on this trip"
    >
      {children}
    </DivesCard>
  );

  if (loadFailed) {
    return allDivesCard(
      <p className="text-sm text-muted-foreground">
        This trip&apos;s dives could not be loaded.
      </p>,
    );
  }
  if (dives === null) {
    return allDivesCard(
      <ul className="space-y-3" aria-busy>
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <BackdropCardSkeleton key={index} />
        ))}
      </ul>,
    );
  }
  if (dives.length === 0) {
    return (
      <Card>
        <CardHeader className="p-0">
          <CardTitle as="h2" className="sr-only">
            Dives in This Trip
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={DiveIcon}
            title="No dives logged for this trip yet"
            description="Log a dive and assign it to this trip to see it here."
            action={
              <Button asChild>
                <Link href={withReturnTo(newDiveHref)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Log a dive for this trip
                </Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const sections = tripDiveSections(dives, parts);
  if (!sections.some((section) => section.kind === "part")) {
    return allDivesCard(<DiveList dives={dives} />);
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        if (section.kind === "loose") {
          return (
            <DiveList
              key={`loose-${section.dives[0].uuid}`}
              dives={section.dives}
            />
          );
        }
        const { part } = section;
        // Only a dated part holds dives, so there is always a date line; a part
        // with no place is headed by its dates alone.
        const dates = formatTripDateRange(
          part.start_date ?? undefined,
          part.end_date ?? undefined,
        );
        const place = part.location?.name;
        return (
          <DivesCard
            key={`part-${section.partIndex}`}
            icon={<MapPin className="h-5 w-5" />}
            title={place ?? dates}
            description={place ? dates : undefined}
          >
            <DiveList dives={section.dives} />
          </DivesCard>
        );
      })}
    </div>
  );
}
