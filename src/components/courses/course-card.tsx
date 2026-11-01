"use client";

import { Edit } from "lucide-react";
import { certificationAgencyLabel } from "@/lib/api/certifications";
import type { Course } from "@/lib/api/courses";
import { courseStatusBadgeVariant, courseStatusLabel } from "@/lib/course";
import { formatTripDateRange } from "@/lib/date-time";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteMenuItem } from "@/components/ui/item-actions-menu";
import { FactsLine } from "@/components/ui/icon-fact";
import { PlainCard } from "@/components/ui/plain-card";

interface CourseCardProps {
  course: Course;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

// One course as a card, on /courses: what its page's hero says of it - its
// status beside its name, and the agency and the dates under it.
export function CourseCard({
  course,
  onEdit,
  onDelete,
  isDeleting,
}: CourseCardProps) {
  // A course need not name an agency or carry dates, and the line leaves out
  // whichever it lacks.
  const facts = [
    certificationAgencyLabel(course.agency, course.agency_other),
    formatTripDateRange(
      course.start_date ?? undefined,
      course.end_date ?? undefined,
    ),
  ].filter(Boolean);

  return (
    <PlainCard
      title={course.name}
      href={`/courses/${course.uuid}`}
      badges={
        // `courseStatusLabel` de-snakes a status this build doesn't know, so
        // the label can be any length and never breaks.
        <Badge
          variant={courseStatusBadgeVariant(course.status)}
          className="whitespace-nowrap"
        >
          {courseStatusLabel(course.status)}
        </Badge>
      }
      line={facts.length > 0 && <FactsLine facts={facts} />}
      actionsLabel={`Actions for ${course.name}`}
      actions={
        <>
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DeleteMenuItem onSelect={onDelete} disabled={isDeleting} />
        </>
      }
    />
  );
}
