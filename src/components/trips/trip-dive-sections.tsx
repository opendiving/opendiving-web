"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Dive } from "@/lib/api/dives";
import type { TripPart } from "@/lib/api/trips";
import { tripDiveSections } from "@/lib/trip-dive-sections";
import { formatTripPartDates } from "@/lib/trip-parts";
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
import { ChevronDown, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const SKELETON_COUNT = 5;

interface TripDiveSectionsProps {
  // Every dive of the trip, newest first; `null` until they have loaded.
  dives: Dive[] | null;
  loadFailed: boolean;
  parts: TripPart[];
  newDiveHref: string;
}

function DiveList({ dives, className }: { dives: Dive[]; className?: string }) {
  return (
    <ul className={cn("space-y-3", className)}>
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

// A part's card, folding to its header. The title is the toggle, so the whole
// heading line is the target and the heading keeps its name for a screen
// reader. A folded card unmounts its dives, maps and all.
function PartCard({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const contentId = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={() => setOpen(!open)}
            className="flex w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MapPin className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">{title}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                !open && "-rotate-90",
              )}
            />
          </button>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent id={contentId} hidden={!open}>
        {open && children}
      </CardContent>
    </Card>
  );
}

// The trip's dives, a card for each of its parts headed by the part's place and
// dates, holding the dives made on it. The dives no part's dates cover sit
// between those cards, where their days put them. A trip with no parts keeps
// the one card of every dive.
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
  if (parts.length === 0 && dives.length === 0) {
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

  if (parts.length === 0) {
    return allDivesCard(<DiveList dives={dives} />);
  }

  return (
    <div className="space-y-6">
      {tripDiveSections(dives, parts).map((section) => {
        if (section.kind === "loose") {
          return (
            <DiveList
              key={`loose-${section.dives[0].uuid}`}
              // Inset as a card's content is - its border and its padding - so
              // these cards line up with the ones inside the part cards.
              className="border border-transparent px-6 max-sm:px-4"
              dives={section.dives}
            />
          );
        }
        const { part } = section;
        // A part with no place is headed by its dates alone, as the trip's
        // information card lists it by them.
        const dates = formatTripPartDates(part);
        const place = part.location?.name;
        return (
          <PartCard
            key={`part-${section.partIndex}`}
            title={place ?? dates ?? "No place recorded"}
            description={place ? dates : undefined}
          >
            {section.dives.length > 0 ? (
              <DiveList dives={section.dives} />
            ) : (
              <EmptyState
                icon={DiveIcon}
                title="No dives logged for this part yet"
              />
            )}
          </PartCard>
        );
      })}
    </div>
  );
}
