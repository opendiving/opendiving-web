import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseCertificationsCard } from "./course-certifications-card";
import type { Certification } from "@/lib/api/certifications";
import type { Course } from "@/lib/api/courses";

vi.mock("@/lib/api/certifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/certifications")>()),
  certificationsAPI: {
    getCertifications: vi.fn(),
    getCertification: vi.fn(),
    createCertification: vi.fn(),
    updateCertification: vi.fn(),
  },
}));

vi.mock("@/lib/api/courses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/courses")>()),
  coursesAPI: { getCourses: vi.fn(), getCourse: vi.fn() },
}));

const { certificationsAPI } = await import("@/lib/api/certifications");
const { coursesAPI } = await import("@/lib/api/courses");
const getCertifications = vi.mocked(certificationsAPI.getCertifications);
const createCertification = vi.mocked(certificationsAPI.createCertification);
const getCourse = vi.mocked(coursesAPI.getCourse);

const COURSE: Course = {
  uuid: "course-1",
  name: "Advanced Nitrox + Deco",
  agency: "tdi",
  agency_other: null,
  status: "completed",
  start_date: "2026-03-02",
  end_date: "2026-03-06",
  instructor_name: "Alex Diver",
  instructor_number: "123",
  training_center: "Blue Ocean, Koh Tao",
  cost: "EUR 1450",
  notes: "Ran the 21m and 30m dives on back gas.",
  user_uuid: "user-1",
  created_at: "2026-03-08T09:00:00Z",
};

const CREATED: Certification = {
  uuid: "cert-new",
  agency: "tdi",
  agency_other: null,
  name: "Advanced Nitrox",
  certification_number: null,
  certified_on: null,
  expires_on: null,
  instructor_name: "Alex Diver",
  instructor_number: "123",
  training_center: "Blue Ocean, Koh Tao",
  notes: "",
  course_uuid: COURSE.uuid,
  user_uuid: "user-1",
  created_at: "2026-03-09T09:00:00Z",
};

const page = <T,>(items: T[]) => ({
  data: items,
  total_count: items.length,
  has_more: false,
  page: 1,
  items_per_page: 50,
});

beforeEach(() => {
  vi.clearAllMocks();
  // `mockImplementation` rather than `mockResolvedValue`: a single shared
  // response object is the array React can bail out of re-rendering on, which
  // hides a fetch loop instead of failing on it. See DECISIONS.md, "A shared
  // mock response object hides a render loop".
  getCertifications.mockImplementation(async () => page<Certification>([]));
  createCertification.mockImplementation(async () => CREATED);
  getCourse.mockImplementation(async () => COURSE);
});

const render_ = () =>
  render(<CourseCertificationsCard userId="user-1" course={COURSE} />);

describe("the course's certifications card", () => {
  it("reads the list once, not once per render", async () => {
    render_();
    await screen.findByText("No certifications linked to this course yet.");

    expect(getCertifications).toHaveBeenCalledTimes(1);
    expect(getCertifications).toHaveBeenCalledWith(
      "user-1",
      1,
      50,
      COURSE.uuid,
    );
  });

  it("names its two ways into the same dialog differently", async () => {
    // A screen reader's controls list is flat, so two identically named
    // buttons in one card would be indistinguishable in it.
    render_();
    await screen.findByText("No certifications linked to this course yet.");

    expect(
      screen.getByRole("button", { name: "Add certification" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add the first certification" }),
    ).toBeInTheDocument();
  });

  it("shows a certification created from here without a reload, then asks for the card photos", async () => {
    render_();
    await screen.findByText("No certifications linked to this course yet.");

    await userEvent.click(
      screen.getByRole("button", { name: "Add certification" }),
    );

    // The dialog arrives linked to this course and filled in from it, which is
    // the whole reason the card holds the course rather than just its uuid.
    expect(await screen.findByLabelText("Course")).toHaveValue(COURSE.name);
    await waitFor(() =>
      expect(screen.getByLabelText("Training center")).toHaveValue(
        "Blue Ocean, Koh Tao",
      ),
    );

    // The card the diver is about to photograph is the one they just entered.
    getCertifications.mockImplementation(async () => page([CREATED]));
    await userEvent.type(
      screen.getByLabelText("Certification *"),
      "Advanced Nitrox",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Create Certification/ }),
    );

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      user_uuid: "user-1",
      name: "Advanced Nitrox",
      course_uuid: COURSE.uuid,
      training_center: "Blue Ocean, Koh Tao",
      instructor_name: "Alex Diver",
      agency: "tdi",
    });

    // Photographing the card is the point of the feature, so the upload step
    // follows the save rather than waiting to be found. Asserted before the
    // list because it is a modal: Radix marks everything behind it
    // `aria-hidden`, which is exactly what a role query refuses to see.
    expect(
      await screen.findByText(`Card images — ${CREATED.name}`),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    // In the card's own list, with no browser reload.
    expect(
      await screen.findByRole("button", { name: /Advanced Nitrox/ }),
    ).toBeInTheDocument();
    expect(getCertifications).toHaveBeenCalledTimes(2);
  });
});
