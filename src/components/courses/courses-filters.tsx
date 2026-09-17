"use client";

import { Search, X } from "lucide-react";

import {
  CERTIFICATION_AGENCIES,
  certificationAgencyLabel,
  type CertificationAgency,
} from "@/lib/api/certifications";
import { COURSE_STATUSES, type CourseStatus } from "@/lib/api/courses";
import { courseStatusLabel } from "@/lib/course";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * What narrows the course list, as the controls hold it. `""` means "not
 * filtering on this" throughout - the state the row opens in and the one every
 * control has to be able to return to, which is what `Clear filters` restores
 * and what the page drops rather than sending to the API.
 */
export interface CourseListFilters {
  /**
   * Bounds of a window the course's dates must overlap. The semantics, and what
   * a dateless course does under them, are `CourseFilters`' in `lib/api/courses`.
   */
  dateFrom: string;
  dateTo: string;
  agency: CertificationAgency | "";
  status: CourseStatus | "";
}

export const NO_COURSE_FILTERS: CourseListFilters = {
  dateFrom: "",
  dateTo: "",
  agency: "",
  status: "",
};

/** Whether anything beyond the name search is narrowing the list. */
export function hasCourseFilters(filters: CourseListFilters): boolean {
  return Object.values(filters).some(Boolean);
}

export interface CoursesFiltersProps {
  /** What the search box holds, which is not yet what has been asked for. */
  search: string;
  onSearchChange: (value: string) => void;
  filters: CourseListFilters;
  onFiltersChange: (filters: CourseListFilters) => void;
}

// Search and the three filters beside it, above the course table. They narrow
// the same query rather than competing: whatever is set here is AND-ed by the
// API, so a name and a status answer the courses matching both.
export function CoursesFilters({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
}: CoursesFiltersProps) {
  const set = <K extends keyof CourseListFilters>(
    key: K,
    value: CourseListFilters[K],
  ) => onFiltersChange({ ...filters, [key]: value });

  return (
    <div className="mb-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor="course-search" className="sr-only">
          Search courses by name
        </label>
        <Input
          id="course-search"
          type="search"
          className="pl-9"
          placeholder="Search by name..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      {/* Wrapping rather than a fixed column count: the four sit in a row on a
          desktop, pair up on a tablet and stack on a phone, off one rule. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1 space-y-2">
          <Label htmlFor="course-date-from">From</Label>
          <DatePicker
            id="course-date-from"
            value={filters.dateFrom}
            onChange={(value) => set("dateFrom", value)}
          />
        </div>

        <div className="min-w-[12rem] flex-1 space-y-2">
          <Label htmlFor="course-date-to">To</Label>
          <DatePicker
            id="course-date-to"
            value={filters.dateTo}
            onChange={(value) => set("dateTo", value)}
          />
        </div>

        <div className="min-w-[12rem] flex-1 space-y-2">
          <Label htmlFor="course-agency">Agency</Label>
          {/* A plain `<select>` rather than the shadcn `Select` the course
              dialog uses, for the reason DECISIONS.md gives under "A dive-level
              select carries the same three states": "Any agency" *is* `""`, and
              Radix reserves that value for clearing. The dialog reaches for a
              sentinel instead because there `null` is a stored fact - a course
              run by a private instructor - rather than an absent filter. */}
          <NativeSelect
            id="course-agency"
            value={filters.agency}
            onChange={(event) =>
              set("agency", event.target.value as CertificationAgency | "")
            }
          >
            <option value="">Any agency</option>
            {CERTIFICATION_AGENCIES.map((agency) => (
              <option key={agency} value={agency}>
                {certificationAgencyLabel(agency)}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="min-w-[12rem] flex-1 space-y-2">
          <Label htmlFor="course-status">Status</Label>
          <NativeSelect
            id="course-status"
            value={filters.status}
            onChange={(event) =>
              set("status", event.target.value as CourseStatus | "")
            }
          >
            <option value="">Any status</option>
            {COURSE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {courseStatusLabel(status)}
              </option>
            ))}
          </NativeSelect>
        </div>

        {/* Only once there is something to clear. A permanently-present control
            that does nothing on most visits reads as part of the row, and a
            disabled one reads as broken. */}
        {hasCourseFilters(filters) && (
          <Button
            variant="ghost"
            onClick={() => onFiltersChange(NO_COURSE_FILTERS)}
          >
            <X className="mr-2 h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
