"use client";

import Link from "next/link";
import { Dive, ENTRY_TYPE_LABELS } from "@/lib/api/dives";
import { labelOrFallback } from "@/lib/api/labels";
import { Trip } from "@/lib/api/trips";
import { Course } from "@/lib/api/courses";
import { Contact } from "@/lib/api/contacts";
import type { Person } from "@/lib/api/people";
import { formatContactAddress, formatWebsite } from "@/lib/contact";
import { formatDistance, haversineMeters } from "@/lib/geo-distance";
import { formatCoordinates } from "@/lib/validations/coordinates";
import { CARD_SECTION_CONTENT, Card, CardContent } from "@/components/ui/card";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";
import { tripPartLocations } from "@/lib/trip-parts";
import { DiveRecordingsCard } from "@/components/dives/dive-recordings-card";
import { PeopleList } from "@/components/people/people-list";
import { fixPoint } from "@/components/dives/dive-map-locations";
import { Building2, Globe, GraduationCap, Luggage, Phone } from "lucide-react";
import { DiveSiteIcon } from "@/components/icons/dive-site-icon";
import { DiveEnvironmentCard } from "@/components/dives/dive-environment-card";
import { DiveCardHeader } from "@/components/dives/dive-card-header";
import type { DiveCardSection } from "@/components/dives/dive-section-dialog";
import { useUnits } from "@/hooks/useUnits";
import { cn } from "@/lib/utils";
import { useWithReturnTo } from "@/hooks/useReturnTo";

interface DiveDetailSidebarProps {
  dive: Dive;
  /** Resolved separately from the dive, which stores only the trip's uuid. Null while
   * loading, when the dive has no trip, or when that lookup failed — all three are
   * non-fatal and simply hide the trip link. */
  trip: Trip | null;
  /** The training course this dive was part of, resolved the same way and with the
   * same three meanings for null. */
  course: Course | null;
  /** The dive center that ran the dive, resolved the same way and with the same
   * three meanings for null. */
  contact: Contact | null;
  /** The diver's people by uuid, for the names behind `dive.people`. A person it
   * does not hold - still loading, or the read failed - has no row. */
  people?: Readonly<Record<string, Person>>;
  /** Called after a recording or one of its files changes, so the dive can be re-read. */
  onRecordingsChanged: () => void;
  /** Opens a section's edit dialog; absent, the cards have no edit control. */
  onEdit?: (section: DiveCardSection) => void;
  /** Opens the Recordings card's edit dialog. */
  onEditRecordings?: () => void;
}

const NO_PEOPLE: Readonly<Record<string, Person>> = {};

/**
 * The dive detail page's sidebar: where the dive was, what the water was like, and
 * what recorded it.
 *
 * Each card renders only when it has something to show.
 */
export function DiveDetailSidebar({
  dive,
  trip,
  course,
  contact,
  people = NO_PEOPLE,
  onRecordingsChanged,
  onEdit,
  onEditRecordings,
}: DiveDetailSidebarProps) {
  const { preferences: units } = useUnits();
  const withReturnTo = useWithReturnTo();
  const divePeople = dive.people ?? [];
  const hasPeople = divePeople.some(
    (reference) => people[reference.person_uuid],
  );
  const contactPlace = formatContactAddress({
    city: contact?.address?.city,
    region: contact?.address?.region,
    country: contact?.address?.country,
  });

  const entry = fixPoint(dive.entry_latitude, dive.entry_longitude);
  const exit = fixPoint(dive.exit_latitude, dive.exit_longitude);
  const entryCoordinates =
    entry && formatCoordinates(entry.latitude, entry.longitude);
  const exitCoordinates =
    exit && formatCoordinates(exit.latitude, exit.longitude);

  // The hero's map is capped at zoom 9, where a surface swim is well under a pixel, so
  // the drift between the two fixes is a line of text or it is nothing.
  const drift =
    entry && exit ? formatDistance(haversineMeters(entry, exit), units) : null;

  return (
    <div className="space-y-6 max-sm:space-y-2.5">
      {/* Its own card rather than a row in "Location" below: a course is not a
          place, and the card it would otherwise join renders on the strength of
          the dive having one. A dive with no course looks exactly as it did
          before courses existed. */}
      {course && (
        <Card>
          <DiveCardHeader
            group="Training"
            title="Training"
            onEdit={onEdit && (() => onEdit("Training"))}
          />
          <CardContent className={CARD_SECTION_CONTENT}>
            <div className="text-sm font-medium text-muted-foreground mb-1">
              Course
            </div>
            <Link
              href={withReturnTo(`/courses/${course.uuid}`)}
              className="flex items-center gap-2 text-sm font-medium hover:underline touch:min-h-11"
            >
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
              {course.name}
            </Link>
          </CardContent>
        </Card>
      )}

      {(trip ||
        contact ||
        dive.dive_sites.length > 0 ||
        dive.entry_type != null ||
        dive.boat_name != null ||
        entryCoordinates ||
        exitCoordinates) && (
        <Card>
          {/* "Location", not the "Trip & Dive Site" this card was called
                while those were the only two things in it: a dive with GPS but
                no trip and no site is now one of the cases it renders for, and
                the blocks inside are each labelled anyway. */}
          <DiveCardHeader
            group="Location"
            title="Location"
            onEdit={onEdit && (() => onEdit("Location"))}
          />
          <CardContent className={cn(CARD_SECTION_CONTENT, "space-y-4")}>
            {trip && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Trip
                </div>
                {/* Only the name links - where a trip went is not a second
                    way to reach it - and the icon sits against that first line
                    rather than the middle of two. */}
                <div className="flex items-start gap-2 text-sm">
                  <Luggage className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="min-w-0">
                    <Link
                      href={withReturnTo(`/trips/${trip.uuid}`)}
                      className="relative font-medium hover:underline touch:tap-target"
                    >
                      {trip.name}
                    </Link>
                    <TripLocationsLabel
                      locations={tripPartLocations(trip.parts)}
                      className="block text-muted-foreground"
                    />
                  </div>
                </div>
              </div>
            )}
            {contact && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Dive center
                </div>
                {/* The two ways to reach it sit under the name at a finger's
                    height, since a dive page on a phone is where a diver goes
                    looking for the shop's number. */}
                <div className="flex items-start gap-2 text-sm">
                  <Building2 className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="font-medium">{contact.name}</div>
                    {contactPlace && (
                      <span className="block text-muted-foreground">
                        {contactPlace}
                      </span>
                    )}
                  </div>
                </div>
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                    className="flex min-h-11 items-center gap-2 text-sm hover:underline"
                  >
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {contact.phone}
                  </a>
                )}
                {contact.website && (
                  <a
                    href={contact.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center gap-2 text-sm hover:underline"
                  >
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="min-w-0 truncate">
                      {formatWebsite(contact.website)}
                    </span>
                  </a>
                )}
              </div>
            )}
            {dive.dive_sites.length > 0 && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  {dive.dive_sites.length > 1 ? "Dive sites" : "Dive site"}
                </div>
                {/* Every site, in the order they were visited, as the trip page
                    lists its parts: the hero and the cards cap the list at the
                    first with a "+N", and this is the one surface with room to
                    name the rest. */}
                <ul className="space-y-1.5 touch:space-y-0">
                  {dive.dive_sites.map((site) => (
                    <li
                      key={site.uuid}
                      className="flex items-start gap-2 text-sm touch:min-h-11"
                    >
                      <DiveSiteIcon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                      <div className="min-w-0">
                        <Link
                          href={withReturnTo(`/sites/${site.uuid}`)}
                          className="relative font-medium hover:underline touch:tap-target"
                        >
                          {site.name}
                        </Link>
                        {site.location?.name && (
                          <span className="block text-muted-foreground">
                            {site.location.name}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
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
            {dive.entry_type != null && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Entry type
                </div>
                <div className="text-sm">
                  {labelOrFallback(ENTRY_TYPE_LABELS, dive.entry_type)}
                </div>
              </div>
            )}
            {dive.boat_name != null && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Boat name
                </div>
                <div className="text-sm">{dive.boat_name}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Its own card rather than a row on "Training" or "Location": who the
          diver was with is a fact about the dive whether or not a shop ran it
          or a course taught it. */}
      {hasPeople && (
        <Card>
          <DiveCardHeader
            group="People"
            title="People"
            onEdit={onEdit && (() => onEdit("People"))}
          />
          <CardContent className={CARD_SECTION_CONTENT}>
            <PeopleList people={divePeople} resolved={people} />
          </CardContent>
        </Card>
      )}

      <DiveEnvironmentCard
        dive={dive}
        onEdit={onEdit && (() => onEdit("Environment"))}
      />

      {/* What recorded this dive, and what the account still holds from each */}
      <DiveRecordingsCard
        dive={dive}
        onChanged={onRecordingsChanged}
        onEdit={onEditRecordings}
      />
    </div>
  );
}
