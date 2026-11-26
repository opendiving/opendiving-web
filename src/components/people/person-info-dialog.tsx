"use client";

import type { Person } from "@/lib/api/people";
import {
  customPropertiesSections,
  RecordInfoDialog,
  type RecordInfoSection,
} from "@/components/ui/record-info-dialog";

// The person's own fields in the person form's order, then their custom
// properties. The dives, trips and courses they were on are the page's cards.
export function PersonInfoDialog({ person }: { person: Person }) {
  const sections: RecordInfoSection[] = [
    {
      facts: [
        { label: "Name", value: person.name },
        { label: "Username", value: person.username && `@${person.username}` },
        { label: "Email", value: person.email },
        { label: "Phone", value: person.phone },
        { label: "Notes", value: person.notes, wide: true },
      ],
    },
    ...customPropertiesSections(person.custom_properties),
  ];

  return <RecordInfoDialog title="Person information" sections={sections} />;
}
