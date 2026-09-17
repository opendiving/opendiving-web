import { apiClient } from "./client";
import type { PaginatedResponse } from "./client";
import type { CertificationAgency } from "./certifications";

/**
 * How far a course got. Mirrors the API's `CourseStatus` enum - a closed
 * vocabulary rather than free text, which is what lets the list render a status
 * badge rather than whatever the diver happened to type.
 *
 * The four beyond the obvious pair are real states an agency produces: a booked
 * course exists before its first dive (`planned`), a referral leaves one open
 * for months (`in_progress`, `incomplete`), and GUE issues provisional passes
 * upgradeable later. Declared in the order a course moves through them, which is
 * the order the picker offers. Keep in sync with the API.
 */
export const COURSE_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "incomplete",
  "provisional",
  "not_passed",
] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

/**
 * What the API defaults a course's status to, mirrored here so the create form
 * opens on the same value. Back-filling history is the common case, and a diver
 * entering the course that issued a card they already hold is entering one that
 * finished.
 */
export const DEFAULT_COURSE_STATUS: CourseStatus = "completed";

/**
 * A training course: a group of dives and the certifications they produced.
 *
 * Works like a trip without a location. The instructor/training-center trio
 * duplicates the same fields on `Certification` deliberately - a certification
 * has to stand alone, because imported history arrives certification-first with
 * no course to hang them on.
 */
export interface Course {
  uuid: string;
  name: string;
  // Optional, unlike a certification's: a course run by a private instructor
  // has no agency to name, and inventing one would store a fact the diver
  // never gave.
  agency?: CertificationAgency | null;
  // Only set when `agency` is `other` - the name of the training body.
  agency_other?: string | null;
  status: CourseStatus;
  // Both nullable, unlike a trip's start date: a `planned` course has no dates
  // yet, and a referral spans months with fuzzy edges. Bare "YYYY-MM-DD".
  start_date?: string | null;
  end_date?: string | null;
  instructor_name?: string | null;
  instructor_number?: string | null;
  training_center?: string | null;
  notes?: string;
  user_uuid: string;
  created_at: string;
}

export interface CourseCreate {
  name: string;
  agency?: CertificationAgency | null;
  agency_other?: string | null;
  status?: CourseStatus;
  start_date?: string | null;
  end_date?: string | null;
  instructor_name?: string | null;
  instructor_number?: string | null;
  training_center?: string | null;
  notes?: string;
}

export type CourseUpdate = Partial<CourseCreate>;

export type PaginatedCoursesResponse = PaginatedResponse<Course>;

/**
 * What narrows a course list. Every field set is AND-ed with the others, so a
 * name and a status answer the intersection rather than the union.
 *
 * An object rather than four more positional parameters: `getCourses` would
 * otherwise read `(page, perPage, search, dateFrom, dateTo, agency, status)`,
 * and a caller wanting only the last would count `undefined`s to reach it - the
 * shape `getDives` has, and the one DECISIONS.md records as the cost of having
 * appended `courseUuid` last.
 */
export interface CourseFilters {
  /** Case-insensitive substring of the course's name. */
  search?: string;
  /**
   * Bounds of a window the course's own dates must **overlap**, as bare
   * "YYYY-MM-DD". Overlap rather than containment, so a course that began in
   * December and finished in February is training done in both years and
   * answers a filter on either. A course with no dates at all has no interval to
   * overlap, so it drops out the moment either bound is set - which is what a
   * `planned` course should do in a list filtered by date, not a gap.
   *
   * The two are one window rather than two independent bounds, so a `dateFrom`
   * later than `dateTo` is a swapped pair: the API answers it with an empty page
   * rather than an error, and the list says nothing matches.
   */
  dateFrom?: string;
  dateTo?: string;
  agency?: CertificationAgency | "";
  status?: CourseStatus | "";
}

/** Training-course CRUD. Every call is scoped to the signed-in user by the API. */
export const coursesAPI = {
  // Create a course, owned by the signed-in user. Dives and certifications
  // are linked to it from their own forms, not from here.
  async createCourse(data: CourseCreate): Promise<Course> {
    const response = await apiClient.post(`/course`, data);
    return response.data;
  },

  /**
   * A page of the user's courses, most recent start date first and dateless ones
   * last, narrowed by whichever of `filters` is set. The API caps
   * `items_per_page` at 100, so this is a page of matches, never the whole set.
   *
   * `""` is how the controls hold an unset filter, and dropping those is this
   * function's job rather than each caller's - the one rule, in the one place
   * that builds the query string. It is not tidiness: `agency` and `status` are
   * enums on the API, and FastAPI answers `?agency=` with a 422 rather than
   * reading it as "any", so an empty value sent through would break the list
   * instead of widening it.
   */
  async getCourses(
    page: number = 1,
    items_per_page: number = 10,
    filters: CourseFilters = {},
  ): Promise<PaginatedCoursesResponse> {
    const { search, dateFrom, dateTo, agency, status } = filters;
    const response = await apiClient.get(`/courses`, {
      params: {
        page,
        items_per_page,
        ...(search ? { search } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        ...(agency ? { agency } : {}),
        ...(status ? { status } : {}),
      },
    });
    return response.data;
  },

  async getCourse(courseUuid: string): Promise<Course> {
    const response = await apiClient.get(`/course/${courseUuid}`);
    return response.data;
  },

  async updateCourse(
    courseUuid: string,
    data: CourseUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(`/course/${courseUuid}`, data);
    return response.data;
  },

  /**
   * Delete a course. Its dives and certifications survive with the link gone -
   * the database nulls both references - so there is no reassign option to pass,
   * unlike `deleteTrip`. Not idempotent either: a second delete on the same uuid
   * is a 404, because the row really is gone.
   */
  async deleteCourse(courseUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/course/${courseUuid}`);
    return response.data;
  },
};
