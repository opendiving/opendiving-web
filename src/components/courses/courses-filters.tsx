"use client";

import { type Ref } from "react";
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
  /**
   * The agencies and statuses to offer, which are the ones the diver's own
   * courses carry rather than the whole vocabulary - `useCourseFilterOptions`
   * derives them. Default to everything, so the row is complete for a caller
   * that has not read them yet.
   */
  agencies?: readonly CertificationAgency[];
  statuses?: readonly CourseStatus[];
  /** The search box itself, for a caller that puts the cursor in it. */
  searchRef?: Ref<HTMLInputElement>;
}

// Keeps whatever is picked on the list even once it is no longer in use - the
// last course with that agency deleted while the filter is set, say. A select
// whose value is not among its options shows blank, which reads as a filter that
// has quietly forgotten itself while the table stays narrowed by it.
function withPicked<T extends string>(
  options: readonly T[],
  picked: T | "",
): readonly T[] {
  if (!picked) return options;
  return options.includes(picked as T) ? options : [...options, picked as T];
}

// Search and the four filters beside it, above the course table. They narrow
// the same query rather than competing: whatever is set here is AND-ed by the
// API, so a name and a status answer the courses matching both.
export function CoursesFilters({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  agencies = CERTIFICATION_AGENCIES,
  statuses = COURSE_STATUSES,
  searchRef,
}: CoursesFiltersProps) {
  const set = <K extends keyof CourseListFilters>(
    key: K,
    value: CourseListFilters[K],
  ) => onFiltersChange({ ...filters, [key]: value });

  return (
    <div className="mb-4 space-y-3">
      {/* One rule for the five controls, stepping down a breakpoint at a time:
          a row of five on a desktop, then the search on its own line above the
          four, then two pairs under it, then one per line on a phone. */}
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-4 xl:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="course-search" className="sr-only">
            Search courses by name
          </label>
          <Input
            ref={searchRef}
            id="course-search"
            type="search"
            className="pl-9"
            placeholder="Search by name..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="course-date-from">From</Label>
          <DatePicker
            id="course-date-from"
            value={filters.dateFrom}
            onChange={(value) => set("dateFrom", value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="course-date-to">To</Label>
          <DatePicker
            id="course-date-to"
            value={filters.dateTo}
            onChange={(value) => set("dateTo", value)}
          />
        </div>

        <div className="space-y-2">
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
            {withPicked(agencies, filters.agency).map((agency) => (
              <option key={agency} value={agency}>
                {certificationAgencyLabel(agency)}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="course-status">Status</Label>
          <NativeSelect
            id="course-status"
            value={filters.status}
            onChange={(event) =>
              set("status", event.target.value as CourseStatus | "")
            }
          >
            <option value="">Any status</option>
            {withPicked(statuses, filters.status).map((status) => (
              <option key={status} value={status}>
                {courseStatusLabel(status)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {/* Under the grid rather than in it: a fifth cell on the widest row would
          have to come out of one of the five controls' width, and only some
          visits have anything to clear. Which is the other half - a
          permanently-present control that does nothing reads as part of the
          row, and a disabled one reads as broken. */}
      {hasCourseFilters(filters) && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => onFiltersChange(NO_COURSE_FILTERS)}
          >
            <X className="mr-2 h-4 w-4" />
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
