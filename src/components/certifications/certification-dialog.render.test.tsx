import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CertificationDialog } from "./certification-dialog";
import type { Certification } from "@/lib/api/certifications";
import type { Course } from "@/lib/api/courses";

vi.mock("@/lib/api/certifications", async (importOriginal) => ({
  // The agency vocabulary, its labels and the form's default are real: the
  // picker's options and the create form's starting value both come from them,
  // and stubbing them would make this test agree with itself rather than with
  // the API.
  ...(await importOriginal<typeof import("@/lib/api/certifications")>()),
  certificationsAPI: {
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
const createCertification = vi.mocked(certificationsAPI.createCertification);
const updateCertification = vi.mocked(certificationsAPI.updateCertification);
const getCourses = vi.mocked(coursesAPI.getCourses);
const getCourse = vi.mocked(coursesAPI.getCourse);

const course = (overrides: Partial<Course> = {}): Course => ({
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
  notes: "Ran the 21m and 30m dives on back gas.",
  user_uuid: "user-1",
  created_at: "2026-03-08T09:00:00Z",
  ...overrides,
});

// A referral: a different centre and instructor, no instructor number, and an
// agency the certification form does not default to either.
const OTHER_COURSE = course({
  uuid: "course-2",
  name: "Rescue Diver, Dahab",
  agency: "ssi",
  instructor_name: "Sam Reef",
  instructor_number: null,
  training_center: "Red Sea Divers",
  notes: "",
});

// A course run by a private instructor: no agency to hand over, while every
// other prefillable field is its own.
const AGENCYLESS_COURSE = course({
  uuid: "course-4",
  name: "Sidemount, with Kim",
  agency: null,
  instructor_name: "Kim Solo",
  instructor_number: "IND-3",
  training_center: "No shop",
});

const COURSE = course();

const EXISTING: Certification = {
  uuid: "cert-1",
  agency: "padi",
  agency_other: null,
  name: "Open Water Diver",
  certification_number: "OW-1",
  certified_on: "2020-05-01",
  expires_on: null,
  instructor_name: "Jo Teacher",
  instructor_number: "OLD-9",
  training_center: "Old Shop",
  notes: "",
  course_uuid: null,
  user_uuid: "user-1",
  created_at: "2020-05-02T09:00:00Z",
};

const page = <T,>(items: T[]) => ({
  data: items,
  total_count: items.length,
  has_more: false,
  page: 1,
  items_per_page: 25,
});

beforeEach(() => {
  vi.clearAllMocks();
  createCertification.mockResolvedValue({ ...EXISTING, uuid: "cert-new" });
  updateCertification.mockResolvedValue(undefined);
  // The server filters by `search`; the stub answers every query with both
  // courses, so a second pick doesn't depend on re-typing the exact name.
  getCourses.mockImplementation(async () => page([COURSE, OTHER_COURSE]));
  getCourse.mockImplementation(async (uuid: string) =>
    uuid === OTHER_COURSE.uuid ? OTHER_COURSE : COURSE,
  );
});

function open({
  certification,
  initialCourse,
}: { certification?: Certification; initialCourse?: Course } = {}) {
  const onSaved = vi.fn();
  render(
    <CertificationDialog
      open
      onOpenChange={vi.fn()}
      certification={certification}
      initialCourse={initialCourse}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

// Opens the course menu and picks one by name. Clicking rather than typing:
// the menu's own search runs on focus, and a pick is the path every one of
// these invariants is about.
async function pickCourse(name: string) {
  await userEvent.click(screen.getByLabelText("Course"));
  await userEvent.click(await screen.findByRole("option", { name }));
}

const trainingCenter = () => screen.getByLabelText("Training center");
const instructor = () => screen.getByLabelText("Instructor");
const instructorNumber = () => screen.getByLabelText("Instructor number");
const agency = () => screen.getByLabelText("Agency *");
const certificationName = () => screen.getByLabelText("Certification *");

const save = () =>
  userEvent.click(
    screen.getByRole("button", { name: /Create Certification|Save Changes/ }),
  );

describe("picking a course fills the card's own fields in", () => {
  it("copies the training centre, instructor and agency across", async () => {
    open();

    await pickCourse(COURSE.name);

    await waitFor(() =>
      expect(trainingCenter()).toHaveValue("Blue Ocean, Koh Tao"),
    );
    expect(instructor()).toHaveValue("Alex Diver");
    expect(instructorNumber()).toHaveValue("123");
    // Despite `padi` being the create form's default rather than an empty box,
    // which is what rules a fill-only-if-empty prefill out.
    expect(agency()).toHaveTextContent("TDI");
  });

  it("leaves the level and the notes for the diver to read off the card", async () => {
    // A course name is not the level printed on a card, and one course can
    // issue two differently-named ones; a course's notes describe the training,
    // a card's describe the card. A plausible-but-wrong value here would be
    // saved unread.
    open();

    await pickCourse(COURSE.name);

    await waitFor(() =>
      expect(trainingCenter()).toHaveValue("Blue Ocean, Koh Tao"),
    );
    expect(certificationName()).toHaveValue("");
    expect(screen.getByLabelText("Notes")).toHaveValue("");
  });

  it("never overwrites a field the diver has typed into", async () => {
    open();

    await userEvent.type(trainingCenter(), "My Shop");
    await pickCourse(COURSE.name);

    await waitFor(() => expect(instructor()).toHaveValue("Alex Diver"));
    expect(trainingCenter()).toHaveValue("My Shop");
  });

  it("replaces its own earlier prefill when the course changes, and empties what the new one lacks", async () => {
    open();

    await userEvent.type(trainingCenter(), "My Shop");
    await pickCourse(COURSE.name);
    await waitFor(() => expect(instructorNumber()).toHaveValue("123"));

    await pickCourse(OTHER_COURSE.name);

    await waitFor(() => expect(instructor()).toHaveValue("Sam Reef"));
    // The second course has no instructor number, so the first one's must go -
    // keeping it would attribute course A's instructor number to course B.
    expect(instructorNumber()).toHaveValue("");
    expect(agency()).toHaveTextContent("SSI");
    // Still the diver's, two courses later.
    expect(trainingCenter()).toHaveValue("My Shop");
  });

  it("still replaces its own prefill after an unrelated field is cleared back to empty", async () => {
    // The regression this guards is not hypothetical: react-hook-form recomputes
    // `dirtyFields` for the *whole* form the moment any field is edited back to
    // its default, and a silently prefilled field differs from its default by
    // construction - so a dirtiness-based prefill marks every prefilled field
    // dirty here and quietly stops replacing them. See DECISIONS.md, "A silently
    // prefilled field is not a clean field".
    open();

    await pickCourse(COURSE.name);
    await waitFor(() =>
      expect(trainingCenter()).toHaveValue("Blue Ocean, Koh Tao"),
    );

    await userEvent.type(certificationName(), "x");
    await userEvent.clear(certificationName());

    await pickCourse(OTHER_COURSE.name);

    await waitFor(() => expect(trainingCenter()).toHaveValue("Red Sea Divers"));
    expect(instructor()).toHaveValue("Sam Reef");
  });

  it("keeps every field when the course is cleared, and unlinks only", async () => {
    // Clearing asserts "no logged course", not "those facts are wrong" - a
    // certification is designed to stand alone.
    open();

    await pickCourse(COURSE.name);
    await waitFor(() =>
      expect(trainingCenter()).toHaveValue("Blue Ocean, Koh Tao"),
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(trainingCenter()).toHaveValue("Blue Ocean, Koh Tao");

    await userEvent.type(certificationName(), "Advanced Nitrox");
    await save();

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      course_uuid: null,
      training_center: "Blue Ocean, Koh Tao",
      instructor_name: "Alex Diver",
      agency: "tdi",
    });
  });

  it("leaves the card's own agency alone for a course that names none", async () => {
    // A course's agency is optional and a certification's is required, so the
    // one field the prefill must not empty is this one.
    getCourses.mockImplementation(async () => page([AGENCYLESS_COURSE]));

    open();
    await pickCourse(AGENCYLESS_COURSE.name);

    await waitFor(() => expect(trainingCenter()).toHaveValue("No shop"));
    expect(instructor()).toHaveValue("Kim Solo");
    expect(agency()).toHaveTextContent("PADI");
    expect(screen.queryByLabelText("Agency name *")).not.toBeInTheDocument();

    await userEvent.type(certificationName(), "Sidemount Diver");
    await save();

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      agency: "padi",
      agency_other: null,
      training_center: "No shop",
    });
  });

  it("keeps an agency it copied itself when the next course names none", async () => {
    // The one exception to "switching A -> B empties what B lacks": neither
    // half of the pair is blanked, because the result would be unsubmittable.
    getCourses.mockImplementation(async () =>
      page([COURSE, AGENCYLESS_COURSE]),
    );

    open();
    await pickCourse(COURSE.name);
    await waitFor(() => expect(agency()).toHaveTextContent("TDI"));

    await pickCourse(AGENCYLESS_COURSE.name);

    await waitFor(() => expect(instructor()).toHaveValue("Kim Solo"));
    expect(instructorNumber()).toHaveValue("IND-3");
    expect(agency()).toHaveTextContent("TDI");
  });

  it("sends the agency pair the API validates together", async () => {
    // A named agency carrying an `agency_other` is a 422, and so is "other"
    // without one - so the two are only ever copied as a pair.
    const namedOther = course({
      uuid: "course-3",
      name: "Nitrox, FFESSM",
      agency: "other",
      agency_other: "FFESSM",
    });
    getCourses.mockImplementation(async () => page([namedOther]));

    open();
    await pickCourse(namedOther.name);

    // The picker itself reads "Other"; the name it stands for is the second
    // field, which only exists while the agency is "other" - so a prefill that
    // moved one without the other would leave the form unsubmittable.
    await waitFor(() => expect(agency()).toHaveTextContent("Other"));
    expect(await screen.findByLabelText("Agency name *")).toHaveValue("FFESSM");

    await userEvent.type(certificationName(), "Nitrox");
    await save();

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      agency: "other",
      agency_other: "FFESSM",
    });
  });
});

describe("the edit dialog's values are a pure function of the card being edited", () => {
  it("changes nothing but the link when the course is relinked", async () => {
    open({ certification: EXISTING });

    await waitFor(() => expect(trainingCenter()).toHaveValue("Old Shop"));

    await pickCourse(COURSE.name);

    // Every field still the card's own, however tempting the course's are.
    await waitFor(() =>
      expect(screen.getByLabelText("Course")).toHaveValue(COURSE.name),
    );
    expect(trainingCenter()).toHaveValue("Old Shop");
    expect(instructor()).toHaveValue("Jo Teacher");
    expect(instructorNumber()).toHaveValue("OLD-9");
    expect(agency()).toHaveTextContent("PADI");

    await save();

    await waitFor(() => expect(updateCertification).toHaveBeenCalled());
    expect(updateCertification.mock.calls[0][1]).toMatchObject({
      course_uuid: COURSE.uuid,
      training_center: "Old Shop",
      instructor_name: "Jo Teacher",
      agency: "padi",
    });
  });
});

describe("a dialog opened from a course page starts on that course", () => {
  it("opens pre-linked and prefilled", async () => {
    open({ initialCourse: COURSE });

    await waitFor(() =>
      expect(trainingCenter()).toHaveValue("Blue Ocean, Koh Tao"),
    );
    expect(instructor()).toHaveValue("Alex Diver");
    expect(instructorNumber()).toHaveValue("123");
    expect(agency()).toHaveTextContent("TDI");
    expect(certificationName()).toHaveValue("");

    await userEvent.type(certificationName(), "Advanced Nitrox");
    await save();

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      name: "Advanced Nitrox",
      course_uuid: COURSE.uuid,
      training_center: "Blue Ocean, Koh Tao",
    });
  });

  it("opens on its own agency when the seed course names none", async () => {
    // The seeded path is the only one that could open a create dialog with its
    // required agency unset, so it answers the field from the form's default.
    open({ initialCourse: AGENCYLESS_COURSE });

    await waitFor(() => expect(trainingCenter()).toHaveValue("No shop"));
    expect(agency()).toHaveTextContent("PADI");

    await userEvent.type(certificationName(), "Sidemount Diver");
    await save();

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      agency: "padi",
      agency_other: null,
      course_uuid: AGENCYLESS_COURSE.uuid,
    });
  });

  it("still protects what the diver types over the seeded values", async () => {
    open({ initialCourse: COURSE });

    await waitFor(() =>
      expect(trainingCenter()).toHaveValue("Blue Ocean, Koh Tao"),
    );
    await userEvent.clear(trainingCenter());
    await userEvent.type(trainingCenter(), "My Shop");

    await pickCourse(OTHER_COURSE.name);

    await waitFor(() => expect(instructor()).toHaveValue("Sam Reef"));
    expect(trainingCenter()).toHaveValue("My Shop");
  });
});
