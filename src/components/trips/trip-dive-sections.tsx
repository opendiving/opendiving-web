"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Contact } from "@/lib/api/contacts";
import type { Dive } from "@/lib/api/dives";
import type { TripDiveAddScope, TripPart } from "@/lib/api/trips";
import { formatDiveDays, tripDiveSections } from "@/lib/trip-dive-sections";
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
import { BackdropCardList } from "@/components/ui/backdrop-card";
import {
  SectionIndexTrigger,
  SectionSentinel,
  scrollToSection,
  useSection,
  useSectionIndexShown,
  type SectionIcon,
} from "@/components/ui/section-index";
import { DiveCard } from "@/components/dives/dive-card";
import {
  TripDiveAddButton,
  type TripDiveAddExtent,
} from "@/components/trips/trip-dive-add-button";
import { DiveIcon } from "@/components/logo";
import { ChevronDown, MapPin, MapPinOff, Plus } from "lucide-react";
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
  // Contacts by uuid, for the names of the places the parts say the diver
  // stayed at; one not read yet, or deleted since, leaves its name out.
  contacts: Readonly<Record<string, Contact>>;
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

// Where focus goes once an add has landed: for more than one dive, the heading
// of the part the add was made from, and otherwise the card it was made from -
// its menu, which now stands where the Add control did. An add made outside any
// part's card, or in one that does not fold and so has no toggle to go to,
// keeps to the card.
type FocusTarget = { diveUuid: string; partIndex: number | null };

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
    <BackdropCardList className={className}>
      {dives.map((dive) => (
        <DiveCard
          key={dive.uuid}
          dive={dive}
          addToTrip={isCandidate(dive) ? addControl(dive) : undefined}
        />
      ))}
    </BackdropCardList>
  );
}

// A card of the trip's dives: a part's, a run of dives no part covers, or every
// dive the trip has. Its heading sticks under the site header while the card
// scrolls past, as the dive form's sections do, and the page's index lists it.
//
// It folds to its header where another card on the page holds dives too: the
// only one that does would fold to nothing worth seeing. The title is the
// toggle, so the whole heading line is the target and the heading keeps its name
// for a screen reader. A folded card unmounts its dives, maps and all.
function SectionCard({
  sectionKey,
  partIndex,
  icon: Icon,
  title,
  description,
  foldable,
  children,
}: {
  sectionKey: string;
  partIndex?: number;
  icon: SectionIcon;
  title: string;
  description?: ReactNode;
  foldable: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const contentId = useId();
  const { cardRef, headingRef, sentinelRef, stuck } = useSection({
    key: sectionKey,
    label: title,
    icon: Icon,
    onExpand: () => setOpen(true),
  });
  const indexShown = useSectionIndexShown();
  // A card that stops folding shows its dives, however it was left.
  const shown = open || !foldable;
  // Where the index is not beside the cards, the stuck heading carries it.
  const sectionsTrigger = shown && stuck && indexShown;
  const heading = (
    <>
      {/* Each icon in a box one title line tall - the title is `leading-none` -
          so a name that wraps leaves both on its first line. */}
      <span className="flex h-[1em] shrink-0 items-center">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">{title}</span>
    </>
  );
  return (
    // Focusable so a jump from the index can land the keyboard on a card whose
    // heading has no control of its own.
    <Card
      ref={cardRef}
      tabIndex={-1}
      data-trip-part={partIndex}
      className="relative outline-none"
    >
      <SectionSentinel ref={sentinelRef} />
      {/* Squared off at the foot while dives show, so they cannot show through
          the stuck heading's corners as they scroll under it. */}
      <CardHeader
        className={cn(
          "sticky top-[var(--header-height)] z-10 rounded-t-lg bg-card",
          !shown && "rounded-b-lg",
          shown && stuck && "shadow-[inset_0_-1px_0_hsl(var(--border))]",
        )}
      >
        <div className="flex items-start gap-2">
          <CardTitle as="h2" className="min-w-0 grow">
            {foldable ? (
              <button
                ref={headingRef}
                type="button"
                aria-expanded={open}
                aria-controls={contentId}
                data-fold-toggle=""
                onClick={() => {
                  // A stuck heading is a way back to the top of its card, which
                  // folding would throw away by moving everything below it.
                  if (open && stuck) {
                    if (cardRef.current) scrollToSection(cardRef.current);
                    return;
                  }
                  setOpen(!open);
                }}
                className="relative flex w-full items-start gap-2 rounded-sm text-left touch:tap-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {heading}
                {/* Stuck, a tap on the heading scrolls rather than folds, so the
                    chevron says nothing there; on a narrow screen the sections
                    control takes its place rather than widening the heading. */}
                <span
                  className={cn(
                    "flex h-[1em] shrink-0 items-center",
                    sectionsTrigger && "max-lg:hidden",
                  )}
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "h-5 w-5 text-muted-foreground transition-transform",
                      !open && "-rotate-90",
                    )}
                  />
                </span>
              </button>
            ) : (
              <span className="flex items-start gap-2">{heading}</span>
            )}
          </CardTitle>
          {/* One title line tall, as the chevron's box is, so the control sits on
              the first line of a name that wraps. */}
          {sectionsTrigger && (
            <div className="-mr-1 flex h-6 items-center max-sm:h-[1.125rem] lg:hidden">
              <SectionIndexTrigger />
            </div>
          )}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent id={contentId} hidden={!shown}>
        {shown && children}
      </CardContent>
    </Card>
  );
}

// The trip's dives, a card for each of its parts headed by the part's place and
// dates, holding the dives made on it. The dives no part's dates cover sit
// between those cards, where their days put them, in a card of each run headed
// by its first and last days. A trip with no parts, or one part holding every
// dive, keeps the one card of every dive.
export function TripDiveSections({
  dives,
  hasMore,
  loadFailed,
  parts,
  contacts,
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
    // Marked rather than matched by `aria-expanded`, which every dive card's
    // menu trigger carries too.
    const toggle =
      partIndex === null
        ? null
        : container.querySelector<HTMLElement>(
            `[data-trip-part="${partIndex}"] [data-fold-toggle]`,
          );
    // The card's own link leads to the dive's page; its menu is the one
    // `aria-haspopup` button on the card once the Add control is gone.
    const target =
      toggle ??
      container
        .querySelector(
          `a[href="/dives/${diveUuid}"], a[href^="/dives/${diveUuid}?"]`,
        )
        ?.closest("li")
        ?.querySelector<HTMLElement>('button[aria-haspopup="menu"]');
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
          diveUuid: dive.uuid,
          partIndex: extent === "dive" ? null : partIndex,
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
    <SectionCard
      sectionKey="all"
      icon={DiveIcon}
      title="Dives in This Trip"
      // Not "logged as part of this trip": a part is a noun here now, and that
      // sentence reads as a claim about which stretch a dive was on.
      description="Every dive logged on this trip"
      foldable={false}
    >
      {children}
    </SectionCard>
  );

  if (loadFailed) {
    return allDivesCard(
      <p className="text-sm text-muted-foreground">
        This trip&apos;s dives could not be loaded.
      </p>,
    );
  }
  if (dives === null) {
    return allDivesCard(<BackdropCardList placeholders={SKELETON_COUNT} />);
  }
  // One part every dive was made on would only repeat over them the place and
  // dates the trip's information card lists, so they keep the one card a trip
  // with no parts has. Judged on the pages loaded so far: a dive outside the
  // part on a later page brings the part's card back once it loads.
  const sections = tripDiveSections(dives, parts, { complete: !hasMore });
  const oneCard =
    parts.length === 0 ||
    (parts.length === 1 &&
      sections.every((section) => section.kind === "part"));
  const foldable =
    sections.filter((section) => section.dives.length > 0).length > 1;

  if (oneCard && dives.length === 0) {
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

  if (oneCard) {
    // With no part's card, a candidate's Add control names the trip, whose
    // candidates are its one part's.
    return (
      <div ref={containerRef}>
        {allDivesCard(
          <DiveList
            dives={dives}
            addControl={(dive) => addButton(dive, null, null)}
          />,
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-6 max-sm:space-y-2.5">
      {sections.map((section) => {
        if (section.kind === "loose") {
          return (
            <SectionCard
              key={`loose-${section.dives[0].uuid}`}
              sectionKey={`loose-${section.dives[0].uuid}`}
              icon={MapPinOff}
              title="Not in Any Part"
              description={formatDiveDays(section.dives)}
              foldable={foldable}
            >
              <DiveList
                dives={section.dives}
                addControl={(dive) => addButton(dive, null, null)}
              />
            </SectionCard>
          );
        }
        const { part } = section;
        // A part with no place is headed by its dates alone.
        const dates = formatTripPartDates(part);
        const place = part.location?.name;
        const accommodation = part.accommodation_uuid
          ? contacts[part.accommodation_uuid]?.name
          : undefined;
        const when = place ? dates : undefined;
        return (
          <SectionCard
            key={`part-${section.partIndex}`}
            sectionKey={`part-${section.partIndex}`}
            partIndex={section.partIndex}
            icon={MapPin}
            title={place ?? dates ?? "No place recorded"}
            description={
              (when || accommodation) && (
                <>
                  {when}
                  {when && accommodation && " · "}
                  {accommodation && (
                    <>
                      <span className="sr-only">Stayed at </span>
                      {accommodation}
                    </>
                  )}
                </>
              )
            }
            foldable={foldable}
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
          </SectionCard>
        );
      })}
    </div>
  );
}
