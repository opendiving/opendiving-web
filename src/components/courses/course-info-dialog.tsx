"use client";

import type { Course } from "@/lib/api/courses";
import { certificationAgencyLabel } from "@/lib/api/certifications";
import { courseStatusLabel } from "@/lib/course";
import { formatDateOnly } from "@/lib/date-time";
import {
  customPropertiesSections,
  RecordInfoDialog,
  type RecordInfoSection,
} from "@/components/ui/record-info-dialog";

const date = (value?: string | null) => (value ? formatDateOnly(value) : null);

// The course's own fields in the course form's order, then its custom
// properties. Its instructor, its contact and its people are links to other
// records, so they are the page's, not here.
export function CourseInfoDialog({ course }: { course: Course }) {
  const sections: RecordInfoSection[] = [
    {
      facts: [
        { label: "Name", value: course.name },
        {
          label: "Agency",
          value: certificationAgencyLabel(course.agency, course.agency_other),
        },
        { label: "Status", value: courseStatusLabel(course.status) },
        { label: "Start date", value: date(course.start_date) },
        { label: "End date", value: date(course.end_date) },
        { label: "Instructor number", value: course.instructor_number },
        { label: "Notes", value: course.notes, wide: true },
      ],
    },
    ...customPropertiesSections(course.custom_properties),
  ];

  return <RecordInfoDialog title="Course information" sections={sections} />;
}
