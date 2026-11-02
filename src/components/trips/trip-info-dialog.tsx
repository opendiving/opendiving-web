"use client";

import type { Trip } from "@/lib/api/trips";
import { formatDateOnly } from "@/lib/date-time";
import {
  RecordInfoDialog,
  type RecordInfoSection,
} from "@/components/ui/record-info-dialog";

const date = (value?: string | null) => (value ? formatDateOnly(value) : null);

// The trip's own fields in the trip form's order, a section per part. A part's
// accommodation and the trip's people are links to other records, so they are
// not here.
export function TripInfoDialog({ trip }: { trip: Trip }) {
  const parts: RecordInfoSection[] =
    trip.parts.length > 0
      ? trip.parts.map((part, index) => ({
          heading: trip.parts.length > 1 ? `Part ${index + 1}` : "Part",
          facts: [
            { label: "Location", value: part.location?.name },
            { label: "Start date", value: date(part.start_date) },
            { label: "End date", value: date(part.end_date) },
          ],
        }))
      : [{ facts: [{ label: "Parts", value: null }] }];

  const sections: RecordInfoSection[] = [
    { facts: [{ label: "Name", value: trip.name }] },
    ...parts,
    { facts: [{ label: "Notes", value: trip.notes, wide: true }] },
  ];

  return <RecordInfoDialog title="Trip information" sections={sections} />;
}
