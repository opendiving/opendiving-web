import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseCertificationsCard } from "./course-certifications-card";
import type { Certification } from "@/lib/api/certifications";
import type { Course } from "@/lib/api/courses";
import type { Contact } from "@/lib/api/contacts";

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

vi.mock("@/lib/api/contacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/contacts")>()),
  contactsAPI: { getContacts: vi.fn(), getContact: vi.fn() },
}));

const { certificationsAPI } = await import("@/lib/api/certifications");
const { coursesAPI } = await import("@/lib/api/courses");
const { contactsAPI } = await import("@/lib/api/contacts");
const getContact = vi.mocked(contactsAPI.getContact);

const BLUE_OCEAN: Contact = {
  uuid: "contact-blue",
  name: "Blue Ocean, Koh Tao",
  roles: ["school"],
  notes: "",
  user_uuid: "user-1",
  created_at: "2026-03-01T09:00:00Z",
};
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
  contact_uuid: BLUE_OCEAN.uuid,
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
  contact_uuid: BLUE_OCEAN.uuid,
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
  getContact.mockImplementation(async () => BLUE_OCEAN);
});

// The page owns "is the create dialog open", because its sidebar opens the same
// dialog this card's empty state does. This stands in for the page.
function Harness() {
  const [isAdding, setIsAdding] = useState(false);
  return (
    <CourseCertificationsCard
      course={COURSE}
      isAdding={isAdding}
      onAddingChange={setIsAdding}
    />
  );
}

const render_ = () => render(<Harness />);

describe("the course's certifications card", () => {
  it("reads the list once, not once per render", async () => {
    render_();
    await screen.findByText("No certifications from this course yet");

    expect(getCertifications).toHaveBeenCalledTimes(1);
    expect(getCertifications).toHaveBeenCalledWith(1, 50, COURSE.uuid);
  });

  it("carries exactly one way into the dialog, worded apart from the sidebar's", async () => {
    // A screen reader's controls list is flat, so the page's sidebar button
    // ("Add a certification") and this one must not share a name.
    render_();
    await screen.findByText("No certifications from this course yet");

    expect(
      screen
        .getAllByRole("button", { name: /certification/i })
        .map((button) => button.textContent),
    ).toEqual(["Add the first certification"]);
  });

  it("shows a certification created from here without a reload", async () => {
    render_();
    await screen.findByText("No certifications from this course yet");

    await userEvent.click(
      screen.getByRole("button", { name: "Add the first certification" }),
    );

    // The dialog arrives linked to this course and filled in from it, which is
    // the whole reason the card holds the course rather than just its uuid.
    expect(await screen.findByLabelText("Course")).toHaveValue(COURSE.name);
    await waitFor(() =>
      expect(screen.getByLabelText("Dive center")).toHaveValue(
        BLUE_OCEAN.name,
      ),
    );

    // Including the level, which the diver then corrects to what their card
    // actually says - the course's own name is longer than the card's.
    expect(screen.getByLabelText("Certification *")).toHaveValue(COURSE.name);

    getCertifications.mockImplementation(async () => page([CREATED]));
    await userEvent.clear(screen.getByLabelText("Certification *"));
    await userEvent.type(
      screen.getByLabelText("Certification *"),
      "Advanced Nitrox",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Create certification/ }),
    );

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      name: "Advanced Nitrox",
      course_uuid: COURSE.uuid,
      contact_uuid: BLUE_OCEAN.uuid,
      instructor_name: "Alex Diver",
      agency: "tdi",
    });

    // In the card's own list, with no browser reload. The card photos were part
    // of that same form, so there is no second dialog to close first.
    expect(
      await screen.findByRole("button", { name: /Advanced Nitrox/ }),
    ).toBeInTheDocument();
    expect(getCertifications).toHaveBeenCalledTimes(2);
  });
});
