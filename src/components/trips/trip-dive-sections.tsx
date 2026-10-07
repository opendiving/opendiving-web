"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Dive } from "@/lib/api/dives";
import type { TripDiveAddScope, TripPart } from "@/lib/api/trips";
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
import {
  TripDiveAddButton,
  type TripDiveAddExtent,
} from "@/components/trips/trip-dive-add-button";
import { DiveIcon } from "@/components/logo";
import { ChevronDown, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const SKELETON_COUNT = 5;

interface TripDiveSectionsProps {
  // The trip's dives and its candidates as far as they have loaded, newest
  // first; `null` until the first page has.
  dives: Dive[] | null;
  // More pages to come, so a part with nothing loaded yet may still fill.
  hasMore: boolean;
  loadFailed: boolean;
  parts: TripPart[];
  // Every candidate of the trip, loaded or not, as the trip read counts them.
  candidateCount: number;
  newDiveHref: string;
  // Adds the candidates a scope names - `expected` of them, as far as the page
  // knows - and resolves once the page shows the outcome: `true` when any were
  // added.
  onAdd: (scope: TripDiveAddScope, expected: number) => Promise<boolean>;
}

// A dive in the trip's list that is not the trip's yet: a candidate, which the
// API marks by giving it no trip.
const isCandidate = (dive: Dive) => dive.trip_uuid == null;

// Where focus goes once an add has landed: the card that turned ordinary - its
// menu, which now stands where the Add control did - or, for more than one
// dive, the heading of the part the add was made from.
type FocusTarget = { diveUuid: string | null; partIndex: number | null };

function DiveList({
  dives,
  className,
  addControl,
}: {
  dives: Dive[];
  className?: string;
  addControl: (dive: Dive) => ReactNode;
}) {
  return (
    <ul className={cn("space-y-3", className)}>
      {dives.map((dive) => (
        <DiveCard
          key={dive.uuid}
          dive={dive}
          addToTrip={isCandidate(dive) ? addControl(dive) : undefined}
        />
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
  partIndex,
  title,
  description,
  children,
}: {
  partIndex: number;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const contentId = useId();
  return (
    <Card data-trip-part={partIndex}>
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
  hasMore,
  loadFailed,
  parts,
  candidateCount,
  newDiveHref,
  onAdd,
}: TripDiveSectionsProps) {
  const withReturnTo = useWithReturnTo();
  const containerRef = useRef<HTMLDivElement>(null);
  // One add at a time: every Add control waits while one is in flight.
  const [isAdding, setIsAdding] = useState(false);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);

  // Run after the render that shows the add's outcome, so the elements named
  // are the ones on screen now rather than the ones the add was made from. A
  // new object for every add, so this runs once for each.
  useEffect(() => {
    if (!focusTarget) return;
    const container = containerRef.current;
    if (!container) return;
    const { diveUuid, partIndex } = focusTarget;
    // The card's own link leads to the dive's page; its menu is the one
    // `aria-haspopup` button on the card once the Add control is gone.
    const card = diveUuid
      ? container
          .querySelector(
            `a[href="/dives/${diveUuid}"], a[href^="/dives/${diveUuid}?"]`,
          )
          ?.closest("li")
      : null;
    const target =
      card?.querySelector<HTMLElement>('button[aria-haspopup="menu"]') ??
      (partIndex === null
        ? null
        : container.querySelector<HTMLElement>(
            `[data-trip-part="${partIndex}"] button[aria-expanded]`,
          ));
    target?.focus();
  }, [focusTarget]);

  const add = async (
    dive: Dive,
    extent: TripDiveAddExtent,
    part: TripPart | null,
    partIndex: number | null,
  ) => {
    // A part is named by its dates as the trip read carries them; the button
    // offers the part only where there is one, holding more than this dive.
    const [scope, expected]: [TripDiveAddScope, number] =
      extent === "dive"
        ? [{ dive_uuids: [dive.uuid] }, 1]
        : extent === "part" && part
          ? [
              {
                part: {
                  ...(part.start_date ? { start_date: part.start_date } : {}),
                  ...(part.end_date ? { end_date: part.end_date } : {}),
                },
              },
              part.candidate_count ?? 0,
            ]
          : [{}, candidateCount];
    setIsAdding(true);
    try {
      const added = await onAdd(scope, expected);
      if (added) {
        setFocusTarget({
          diveUuid: extent === "dive" ? dive.uuid : null,
          partIndex,
        });
      }
    } finally {
      setIsAdding(false);
    }
  };

  const addButton = (
    dive: Dive,
    part: TripPart | null,
    partIndex: number | null,
  ) => (
    <TripDiveAddButton
      diveNumber={dive.dive_number}
      partCount={part?.candidate_count ?? 0}
      tripCount={candidateCount}
      disabled={isAdding}
      onAdd={(extent) => void add(dive, extent, part, partIndex)}
    />
  );
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
    return allDivesCard(
      <DiveList
        dives={dives}
        addControl={(dive) => addButton(dive, null, null)}
      />,
    );
  }

  return (
    <div ref={containerRef} className="space-y-6">
      {tripDiveSections(dives, parts, { complete: !hasMore }).map((section) => {
        if (section.kind === "loose") {
          return (
            <DiveList
              key={`loose-${section.dives[0].uuid}`}
              // Inset as a card's content is - its border and its padding - so
              // these cards line up with the ones inside the part cards.
              className="border border-transparent px-6 max-sm:px-4"
              dives={section.dives}
              addControl={(dive) => addButton(dive, null, null)}
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
            partIndex={section.partIndex}
            title={place ?? dates ?? "No place recorded"}
            description={place ? dates : undefined}
          >
            {section.dives.length > 0 ? (
              <DiveList
                dives={section.dives}
                addControl={(dive) => addButton(dive, part, section.partIndex)}
              />
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
