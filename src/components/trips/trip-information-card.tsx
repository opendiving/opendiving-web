"use client";

import { Calendar } from "lucide-react";
import type { Person, PersonReference } from "@/lib/api/people";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeopleList } from "@/components/people/people-list";
import {
  SectionIndexTrigger,
  SectionSentinel,
  useSection,
  useSectionIndexShown,
} from "@/components/ui/section-index";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

// Tailwind's `lg`, where the card leaves the page's one column for the side.
const WIDE = "(min-width: 64rem)";

interface TripInformationCardProps {
  people: readonly PersonReference[];
  resolvedPeople: Readonly<Record<string, Person>>;
  diveCenterNames: readonly string[];
  notes?: string;
}

// What the trip says beyond its dives. Beside them from `lg` up, under the index
// of its parts and fixed with it; below that, the last of the page's sections, so
// the index lists it and its heading sticks as theirs do.
export function TripInformationCard({
  people,
  resolvedPeople,
  diveCenterNames,
  notes,
}: TripInformationCardProps) {
  const narrow = !useMediaQuery(WIDE);
  const { cardRef, sentinelRef, stuck } = useSection({
    key: "trip-information",
    label: "Trip Information",
    icon: Calendar,
    listed: narrow,
  });
  const indexShown = useSectionIndexShown();
  const stuckHere = narrow && stuck;
  const hasPeople = people.some(
    (reference) => resolvedPeople[reference.person_uuid],
  );

  return (
    <Card ref={cardRef} tabIndex={-1} className="relative outline-none">
      <SectionSentinel ref={sentinelRef} />
      <CardHeader
        className={cn(
          "rounded-t-lg bg-card max-lg:sticky max-lg:top-[var(--header-height)] max-lg:z-10",
          stuckHere && "shadow-[inset_0_-1px_0_hsl(var(--border))]",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle as="h2" className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Trip Information
          </CardTitle>
          {stuckHere && indexShown && (
            <div className="-my-1 -mr-1 flex items-center">
              <SectionIndexTrigger />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasPeople && (
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">
              People
            </div>
            <PeopleList people={people} resolved={resolvedPeople} />
          </div>
        )}

        {/* What the contacts here are, and not who the diver was with: that is
            the People list above. */}
        {diveCenterNames.length > 0 && (
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">
              Dive centers
            </div>
            <div className="text-sm">{diveCenterNames.join(", ")}</div>
          </div>
        )}

        {notes && (
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">
              Notes
            </div>
            <div className="text-sm whitespace-pre-wrap">{notes}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
