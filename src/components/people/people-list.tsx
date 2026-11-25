"use client";

import Link from "next/link";
import {
  personRoleLabel,
  type Person,
  type PersonReference,
} from "@/lib/api/people";
import { cn } from "@/lib/utils";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { PersonPicture } from "@/components/people/person-picture";

interface PeopleListProps {
  // The references on the record, in the diver's order.
  people: readonly PersonReference[];
  // The records behind them, by uuid, from `usePeopleByUuid`.
  resolved: Readonly<Record<string, Person>>;
  className?: string;
}

// Who was on a dive, a trip or a course, as read-only rows: each name linking to
// the person's page, the connected account's picture and `@username`, and the
// role they had.
// A reference whose person has not been read - still loading, or deleted since -
// has no row, the way a contact that could not be looked up leaves its row out.
export function PeopleList({ people, resolved, className }: PeopleListProps) {
  const rows = people.flatMap((reference) => {
    const person = resolved[reference.person_uuid];
    return person ? [{ reference, person }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <ul className={cn("space-y-1.5 touch:space-y-0", className)}>
      {rows.map(({ reference, person }) => (
        <li key={reference.person_uuid}>
          <PersonRow person={person} role={reference.role} />
        </li>
      ))}
    </ul>
  );
}

interface PersonRowProps {
  person: Person;
  // Left out where a label beside the row already names it.
  role?: PersonReference["role"];
}

// One person as a `PeopleList` row draws them, for a block that holds a single
// person, such as a course's instructor.
export function PersonRow({ person, role }: PersonRowProps) {
  const withReturnTo = useWithReturnTo();
  return (
    <div className="flex items-start gap-2 text-sm touch:min-h-11">
      <PersonPicture person={person} />
      <span className="min-w-0">
        <Link
          href={withReturnTo(`/people/${person.uuid}`)}
          className="relative font-medium hover:underline touch:tap-target"
        >
          {person.name}
        </Link>
        {person.username && (
          <span className="text-muted-foreground"> @{person.username}</span>
        )}
        {role && (
          <span className="block text-xs text-muted-foreground">
            {personRoleLabel(role)}
          </span>
        )}
      </span>
    </div>
  );
}
