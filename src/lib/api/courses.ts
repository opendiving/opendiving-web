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
  agency: CertificationAgency;
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
  // Free text ("EUR 1450", "1 200 AUD included gear"). Cost appears in no agency
  // record; it is a personal note, and nothing else in the app models money.
  cost?: string | null;
  notes?: string;
  user_uuid: string;
  created_at: string;
}

export interface CourseCreate {
  user_uuid: string;
  name: string;
  agency: CertificationAgency;
  agency_other?: string | null;
  status?: CourseStatus;
  start_date?: string | null;
  end_date?: string | null;
  instructor_name?: string | null;
  instructor_number?: string | null;
  training_center?: string | null;
  cost?: string | null;
  notes?: string;
}

export type CourseUpdate = Partial<Omit<CourseCreate, "user_uuid">>;

export type PaginatedCoursesResponse = PaginatedResponse<Course>;

/** Training-course CRUD. Every call is scoped to the signed-in user by the API. */
export const coursesAPI = {
  // Create a course. `data.user_uuid` must be the signed-in user's uuid. Dives
  // and certifications are linked to it from their own forms, not from here.
  async createCourse(data: CourseCreate): Promise<Course> {
    const response = await apiClient.post(`/course`, data);
    return response.data;
  },

  /**
   * A page of the user's courses, most recent start date first and dateless ones
   * last. `search` is a case-insensitive substring of the name; the API caps
   * `items_per_page` at 100, so this is a page of matches, never the whole set.
   */
  async getCourses(
    userUuid: string,
    page: number = 1,
    items_per_page: number = 10,
    search?: string,
  ): Promise<PaginatedCoursesResponse> {
    const response = await apiClient.get(`/courses`, {
      params: {
        user_uuid: userUuid,
        page,
        items_per_page,
        ...(search ? { search } : {}),
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
