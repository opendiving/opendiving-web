"use client";

import Link from "next/link";
import { User } from "lucide-react";
import {
  personRoleLabel,
  type Person,
  type PersonReference,
} from "@/lib/api/people";
import { cn } from "@/lib/utils";

interface PeopleListProps {
  // The references on the record, in the diver's order.
  people: readonly PersonReference[];
  // The records behind them, by uuid, from `usePeopleByUuid`.
  resolved: Readonly<Record<string, Person>>;
  className?: string;
}

// Who was on a dive, a trip or a course, as read-only rows: each name linking to
// the person's page, the linked account's `@username`, and the role they had.
// A reference whose person has not been read - still loading, or deleted since -
// has no row, the way a contact that could not be looked up leaves its row out.
export function PeopleList({ people, resolved, className }: PeopleListProps) {
  const rows = people.flatMap((reference) => {
    const person = resolved[reference.person_uuid];
    return person ? [{ reference, person }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <ul className={cn("space-y-1.5", className)}>
      {rows.map(({ reference, person }) => (
        <li
          key={reference.person_uuid}
          className="flex items-start gap-2 text-sm"
        >
          <User className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <Link
              href={`/people/${person.uuid}`}
              className="font-medium hover:underline"
            >
              {person.name}
            </Link>
            {person.username && (
              <span className="text-muted-foreground"> @{person.username}</span>
            )}
            {reference.role && (
              <span className="block text-xs text-muted-foreground">
                {personRoleLabel(reference.role)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
