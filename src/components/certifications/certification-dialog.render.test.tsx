import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CertificationDialog } from "./certification-dialog";
import type { Certification } from "@/lib/api/certifications";
import type { Course } from "@/lib/api/courses";
import type { Contact } from "@/lib/api/contacts";

vi.mock("@/lib/api/certifications", async (importOriginal) => ({
  // The agency vocabulary, its labels and the form's default are real: the
  // picker's options and the create form's starting value both come from them,
  // and stubbing them would make this test agree with itself rather than with
  // the API.
  ...(await importOriginal<typeof import("@/lib/api/certifications")>()),
  certificationsAPI: {
    createCertification: vi.fn(),
    updateCertification: vi.fn(),
    getCertification: vi.fn(),
    uploadCertificationFile: vi.fn(),
    deleteCertificationFile: vi.fn(),
    getCertificationFileBlob: vi.fn(() => new Promise<Blob>(() => {})),
  },
}));

// jsdom has neither canvas nor an image decoder, so the two steps between picking
// a file and holding its cropped bytes stand in.
vi.mock("@/lib/image-crop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image-crop")>()),
  cropToBlob: vi.fn(),
  decodeImage: vi.fn(),
}));

// The cropper measures itself with a ResizeObserver that reports zeroes here, so
// it stands in as the one thing the form cares about: a Save that hands back a
// crop rectangle.
vi.mock("@/components/ui/image-crop-dialog", () => ({
  ImageCropDialog: ({
    saveLabel,
    onSave,
  }: {
    saveLabel: string;
    onSave: (area: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSave({ x: 0, y: 0, width: 1013, height: 638 })}
    >
      {saveLabel}
    </button>
  ),
}));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/lib/api/courses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/courses")>()),
  coursesAPI: {
    getCourses: vi.fn(),
    getCourse: vi.fn(),
    createCourse: vi.fn(),
  },
}));

vi.mock("@/lib/api/contacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/contacts")>()),
  contactsAPI: {
    getContacts: vi.fn(),
    getContact: vi.fn(),
    createContact: vi.fn(),
  },
}));

const { certificationsAPI } = await import("@/lib/api/certifications");
const { coursesAPI } = await import("@/lib/api/courses");
const { contactsAPI } = await import("@/lib/api/contacts");
const { cropToBlob, decodeImage } = await import("@/lib/image-crop");
const createCertification = vi.mocked(certificationsAPI.createCertification);
const updateCertification = vi.mocked(certificationsAPI.updateCertification);
const getCertification = vi.mocked(certificationsAPI.getCertification);
const uploadFile = vi.mocked(certificationsAPI.uploadCertificationFile);
const deleteFile = vi.mocked(certificationsAPI.deleteCertificationFile);
const crop = vi.mocked(cropToBlob);
const decode = vi.mocked(decodeImage);
const CROPPED = new Blob(["cropped"], { type: "image/webp" });
const getCourses = vi.mocked(coursesAPI.getCourses);
const getCourse = vi.mocked(coursesAPI.getCourse);
const createCourse = vi.mocked(coursesAPI.createCourse);
const getContacts = vi.mocked(contactsAPI.getContacts);
const getContact = vi.mocked(contactsAPI.getContact);
const createContact = vi.mocked(contactsAPI.createContact);

const contact = (uuid: string, name: string): Contact => ({
  uuid,
  name,
  roles: ["school"],
  notes: "",
  user_uuid: "user-1",
  created_at: "2026-03-01T09:00:00Z",
});

const BLUE_OCEAN = contact("contact-blue", "Blue Ocean, Koh Tao");
const RED_SEA = contact("contact-red", "Red Sea Divers");
const MY_SHOP = contact("contact-mine", "My Shop");
const OLD_SHOP = contact("contact-old", "Old Shop");
const NO_SHOP = contact("contact-none", "No shop");
const CONTACTS = [BLUE_OCEAN, RED_SEA, MY_SHOP, OLD_SHOP, NO_SHOP];

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
  contact_uuid: BLUE_OCEAN.uuid,
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
  contact_uuid: RED_SEA.uuid,
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
  contact_uuid: NO_SHOP.uuid,
});

// A course that names no contact at all.
const CONTACTLESS_COURSE = course({
  uuid: "course-5",
  name: "Deep Diver, self-study",
  contact_uuid: null,
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
  contact_uuid: OLD_SHOP.uuid,
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
  getCertification.mockResolvedValue(EXISTING);
  uploadFile.mockResolvedValue({
    uuid: "file-1",
    side: "front",
    content_type: "image/webp",
    byte_size: 7,
    original_filename: "card-front.webp",
  });
  deleteFile.mockResolvedValue(undefined);
  decode.mockResolvedValue({} as HTMLImageElement);
  crop.mockResolvedValue(CROPPED);
  // The server filters by `search`; the stub answers every query with both
  // courses, so a second pick doesn't depend on re-typing the exact name.
  getCourses.mockImplementation(async () => page([COURSE, OTHER_COURSE]));
  getCourse.mockImplementation(async (uuid: string) =>
    uuid === OTHER_COURSE.uuid ? OTHER_COURSE : COURSE,
  );
  // The picker shows a contact's name once it has looked the uuid up, which is
  // what these tests read the field's value off.
  getContacts.mockImplementation(async () => page(CONTACTS));
  getContact.mockImplementation(async (uuid: string) => {
    const found = CONTACTS.find((one) => one.uuid === uuid);
    if (!found) throw new Error("not found");
    return found;
  });
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

// The diver's own choice of dive center, made the same way.
async function pickDiveCenter(name: string) {
  await userEvent.click(diveCenter());
  await userEvent.click(await screen.findByRole("option", { name }));
}

const diveCenter = () => screen.getByLabelText("Dive center");
// A picker's own Clear button, which sits beside its input - the date fields
// carry one each too.
const clearOf = (input: HTMLElement) =>
  within(input.parentElement!).getByRole("button", { name: "Clear" });
const instructor = () => screen.getByLabelText("Instructor");
const instructorNumber = () => screen.getByLabelText("Instructor number");
const agency = () => screen.getByLabelText("Agency *");
const certificationName = () => screen.getByLabelText("Certification *");

const save = () =>
  userEvent.click(
    screen.getByRole("button", { name: /Create certification|Save changes/ }),
  );

describe("picking a course fills the card's own fields in", () => {
  it("copies the level, dive center, instructor and agency across", async () => {
    open();

    await pickCourse(COURSE.name);

    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));
    expect(certificationName()).toHaveValue("Advanced Nitrox + Deco");
    expect(instructor()).toHaveValue("Alex Diver");
    expect(instructorNumber()).toHaveValue("123");
    // Despite `padi` being the create form's default rather than an empty box,
    // which is what rules a fill-only-if-empty prefill out.
    expect(agency()).toHaveTextContent("TDI");
  });

  it("leaves the notes for the diver to write about the card", async () => {
    // A course's notes describe the training and a card's describe the card, so
    // a course value here would be plausible-but-wrong and saved unread. The
    // level is prefilled and the notes are not, which is the whole difference.
    open();

    await pickCourse(COURSE.name);

    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));
    expect(screen.getByLabelText("Notes")).toHaveValue("");
  });

  it("keeps a level the diver typed off the card in their hand", async () => {
    // The course name is often longer than what the card says, and one course
    // can issue two differently-named cards - so this is the field the
    // typed-into guard matters most for.
    open();

    await userEvent.type(certificationName(), "Advanced Nitrox");
    await pickCourse(COURSE.name);

    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));
    expect(certificationName()).toHaveValue("Advanced Nitrox");
  });

  it("never overwrites a dive center the diver picked", async () => {
    open();

    await pickDiveCenter(MY_SHOP.name);
    await pickCourse(COURSE.name);

    await waitFor(() => expect(instructor()).toHaveValue("Alex Diver"));
    expect(diveCenter()).toHaveValue(MY_SHOP.name);

    await save();
    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      contact_uuid: MY_SHOP.uuid,
    });
  });

  it("replaces its own earlier prefill when the course changes, and empties what the new one lacks", async () => {
    open();

    await pickCourse(COURSE.name);
    await waitFor(() => expect(instructorNumber()).toHaveValue("123"));
    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));

    await pickCourse(OTHER_COURSE.name);

    await waitFor(() => expect(instructor()).toHaveValue("Sam Reef"));
    // The second course has no instructor number, so the first one's must go -
    // keeping it would attribute course A's instructor number to course B.
    expect(instructorNumber()).toHaveValue("");
    expect(agency()).toHaveTextContent("SSI");
    await waitFor(() => expect(diveCenter()).toHaveValue(RED_SEA.name));
  });

  it("keeps the diver's dive center two courses later", async () => {
    open();

    await pickCourse(COURSE.name);
    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));
    await pickDiveCenter(MY_SHOP.name);

    await pickCourse(OTHER_COURSE.name);

    await waitFor(() => expect(instructor()).toHaveValue("Sam Reef"));
    expect(diveCenter()).toHaveValue(MY_SHOP.name);
  });

  it("takes back a dive center it copied when the next course names none", async () => {
    // What the dialog wrote is the course's, and a course naming nobody has no
    // contact to leave behind - course A's must not be filed under course B.
    getCourses.mockImplementation(async () =>
      page([COURSE, CONTACTLESS_COURSE]),
    );
    open();

    await pickCourse(COURSE.name);
    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));

    await pickCourse(CONTACTLESS_COURSE.name);

    await waitFor(() => expect(diveCenter()).toHaveValue(""));
    await save();
    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      course_uuid: CONTACTLESS_COURSE.uuid,
      contact_uuid: null,
    });
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
    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));

    await userEvent.type(certificationName(), "x");
    await userEvent.clear(certificationName());

    await pickCourse(OTHER_COURSE.name);

    await waitFor(() => expect(diveCenter()).toHaveValue(RED_SEA.name));
    expect(instructor()).toHaveValue("Sam Reef");
  });

  it("keeps every field when the course is cleared, and unlinks only", async () => {
    // Clearing asserts "no logged course", not "those facts are wrong" - a
    // certification is designed to stand alone.
    open();

    await pickCourse(COURSE.name);
    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));

    await userEvent.click(clearOf(screen.getByLabelText("Course")));
    expect(diveCenter()).toHaveValue(BLUE_OCEAN.name);

    await userEvent.type(certificationName(), "Advanced Nitrox");
    await save();

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      course_uuid: null,
      contact_uuid: BLUE_OCEAN.uuid,
      instructor_name: "Alex Diver",
      agency: "tdi",
    });
  });

  it("sends no training center, only the contact", async () => {
    // A name sent as text would be matched to a contact, or make one, on the
    // API's side; the picker has already said which contact it is.
    open();

    await pickCourse(COURSE.name);
    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));
    await save();

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).not.toHaveProperty(
      "training_center",
    );
  });

  it("leaves the card's own agency alone for a course that names none", async () => {
    // A course's agency is optional and a certification's is required, so the
    // one field the prefill must not empty is this one.
    getCourses.mockImplementation(async () => page([AGENCYLESS_COURSE]));

    open();
    await pickCourse(AGENCYLESS_COURSE.name);

    await waitFor(() => expect(diveCenter()).toHaveValue(NO_SHOP.name));
    expect(instructor()).toHaveValue("Kim Solo");
    expect(agency()).toHaveTextContent("PADI");
    expect(screen.queryByLabelText("Agency name *")).not.toBeInTheDocument();

    await userEvent.type(certificationName(), "Sidemount Diver");
    await save();

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      agency: "padi",
      agency_other: null,
      contact_uuid: NO_SHOP.uuid,
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

    await waitFor(() => expect(diveCenter()).toHaveValue(OLD_SHOP.name));

    await pickCourse(COURSE.name);

    // Every field still the card's own, however tempting the course's are.
    await waitFor(() =>
      expect(screen.getByLabelText("Course")).toHaveValue(COURSE.name),
    );
    expect(diveCenter()).toHaveValue(OLD_SHOP.name);
    expect(instructor()).toHaveValue("Jo Teacher");
    expect(instructorNumber()).toHaveValue("OLD-9");
    expect(agency()).toHaveTextContent("PADI");

    await save();

    await waitFor(() => expect(updateCertification).toHaveBeenCalled());
    expect(updateCertification.mock.calls[0][1]).toMatchObject({
      course_uuid: COURSE.uuid,
      contact_uuid: OLD_SHOP.uuid,
      instructor_name: "Jo Teacher",
      agency: "padi",
    });
  });

  it("unlinks the contact when the diver clears it", async () => {
    // `null`, not an omitted key: the update leaves an absent key alone, so a
    // cleared picker has to say so for the link to go.
    open({ certification: EXISTING });
    await waitFor(() => expect(diveCenter()).toHaveValue(OLD_SHOP.name));

    await userEvent.click(clearOf(diveCenter()));
    await save();

    await waitFor(() => expect(updateCertification).toHaveBeenCalled());
    expect(updateCertification.mock.calls[0][1]).toMatchObject({
      contact_uuid: null,
    });
  });
});

describe("a dialog opened from a course page starts on that course", () => {
  it("opens pre-linked and prefilled", async () => {
    open({ initialCourse: COURSE });

    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));
    expect(instructor()).toHaveValue("Alex Diver");
    expect(instructorNumber()).toHaveValue("123");
    expect(agency()).toHaveTextContent("TDI");
    expect(certificationName()).toHaveValue("Advanced Nitrox + Deco");

    // The seeded level is a starting point, not an answer: this course issues a
    // card whose printed name is shorter than the course's own.
    await userEvent.clear(certificationName());
    await userEvent.type(certificationName(), "Advanced Nitrox");
    await save();

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      name: "Advanced Nitrox",
      course_uuid: COURSE.uuid,
      contact_uuid: BLUE_OCEAN.uuid,
    });
  });

  it("opens on its own agency when the seed course names none", async () => {
    // The seeded path is the only one that could open a create dialog with its
    // required agency unset, so it answers the field from the form's default.
    open({ initialCourse: AGENCYLESS_COURSE });

    await waitFor(() => expect(diveCenter()).toHaveValue(NO_SHOP.name));
    expect(agency()).toHaveTextContent("PADI");

    await userEvent.clear(certificationName());
    await userEvent.type(certificationName(), "Sidemount Diver");
    await save();

    await waitFor(() => expect(createCertification).toHaveBeenCalled());
    expect(createCertification.mock.calls[0][0]).toMatchObject({
      agency: "padi",
      agency_other: null,
      course_uuid: AGENCYLESS_COURSE.uuid,
    });
  });

  it("still protects what the diver picks over the seeded values", async () => {
    open({ initialCourse: COURSE });

    await waitFor(() => expect(diveCenter()).toHaveValue(BLUE_OCEAN.name));
    await pickDiveCenter(MY_SHOP.name);

    await pickCourse(OTHER_COURSE.name);

    await waitFor(() => expect(instructor()).toHaveValue("Sam Reef"));
    expect(diveCenter()).toHaveValue(MY_SHOP.name);
  });
});

describe("a contact made three dialogs deep", () => {
  it("comes back through the course dialog into the certification", async () => {
    // Certification -> "Add course..." -> "Add dive center...": three forms, one
    // above the other, each portalled to the body. Each inner save has to land
    // in the form that opened it and nowhere else - the course dialog selects
    // the new contact, the certification selects the new course and copies the
    // contact across from it, and the certification's own field keeps its text.
    const created = contact("contact-new", "Sea Dragon Diving");
    createContact.mockResolvedValue(created);
    getContact.mockImplementation(async (uuid: string) => {
      const found = [...CONTACTS, created].find((one) => one.uuid === uuid);
      if (!found) throw new Error("not found");
      return found;
    });
    createCourse.mockImplementation(async (body) =>
      course({
        uuid: "course-new",
        name: body.name,
        contact_uuid: body.contact_uuid ?? null,
        instructor_name: null,
        instructor_number: null,
      }),
    );
    open();
    await userEvent.type(certificationName(), "Deep Diver");

    await userEvent.click(screen.getByLabelText("Course"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Add course..." }),
    );
    const courseDialog = await screen.findByRole("dialog", {
      name: "New Course",
    });
    await userEvent.type(
      within(courseDialog).getByLabelText("Course *"),
      "Deep Specialty",
    );

    await userEvent.click(within(courseDialog).getByLabelText("Dive center"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Add dive center..." }),
    );
    const contactDialog = await screen.findByRole("dialog", {
      name: "New Contact",
    });
    // The role a course's contact starts with, already ticked.
    expect(within(contactDialog).getByLabelText("School")).toBeChecked();
    await userEvent.type(
      within(contactDialog).getByLabelText("Name *"),
      created.name,
    );
    await userEvent.click(
      within(contactDialog).getByRole("button", { name: "Create contact" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New Contact" }),
      ).not.toBeInTheDocument(),
    );
    expect(createContact).toHaveBeenCalledWith(
      expect.objectContaining({ name: created.name, roles: ["school"] }),
    );
    expect(within(courseDialog).getByLabelText("Dive center")).toHaveValue(
      created.name,
    );
    expect(createCertification).not.toHaveBeenCalled();

    await userEvent.click(
      within(courseDialog).getByRole("button", { name: "Create course" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New Course" }),
      ).not.toBeInTheDocument(),
    );
    expect(createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ contact_uuid: created.uuid }),
    );

    expect(screen.getByLabelText("Course")).toHaveValue("Deep Specialty");
    await waitFor(() => expect(diveCenter()).toHaveValue(created.name));
    expect(certificationName()).toHaveValue("Deep Diver");
    expect(createCertification).not.toHaveBeenCalled();
  });
});

// A photo file, small enough to pass the size check this form makes before the
// API's own.
const photo = () =>
  new File([new Uint8Array([1, 2, 3])], "card.jpg", { type: "image/jpeg" });

const frontPicker = () =>
  screen.getByLabelText("Choose a front card image") as HTMLInputElement;

// Pick an image for the front slot and take the stub cropper's crop.
async function pickFrontImage() {
  await userEvent.upload(frontPicker(), photo());
  await userEvent.click(
    await screen.findByRole("button", { name: "Use this crop" }),
  );
}

// Picking an image sends nothing: a diver who cancels leaves the stored cards as
// they found them, and a card being created has no uuid to upload against until
// the save resolves.
describe("card images ride on the form's own save", () => {
  it("sends nothing while the diver is still picking", async () => {
    open({ certification: EXISTING });

    await pickFrontImage();

    expect(await screen.findByText(/Added when you save/)).toBeInTheDocument();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(updateCertification).not.toHaveBeenCalled();
  });

  it("sends a struck-off image nowhere until the form is saved", async () => {
    open({
      certification: {
        ...EXISTING,
        files: [
          {
            uuid: "file-1",
            side: "front",
            content_type: "image/webp",
            byte_size: 7,
            original_filename: "padi-ow.webp",
          },
        ],
      },
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Remove the front image/ }),
    );

    expect(screen.getByText("Deleted when you save")).toBeInTheDocument();
    expect(deleteFile).not.toHaveBeenCalled();

    await save();

    await waitFor(() =>
      expect(deleteFile).toHaveBeenCalledWith("cert-1", "front"),
    );
  });

  it("uploads the cropped bytes after the details, against the card just created", async () => {
    // The ordering the API forces: `PUT .../file/{side}` needs a uuid, and a card
    // being created does not have one until `createCertification` resolves.
    open();
    await userEvent.type(certificationName(), "Advanced Nitrox");
    await pickFrontImage();

    await save();

    await waitFor(() => expect(uploadFile).toHaveBeenCalled());
    expect(uploadFile).toHaveBeenCalledWith(
      "cert-new",
      "front",
      CROPPED,
      "card-front.webp",
    );
  });

  it("hands back a re-read card, the embedded file metadata being stale either way", async () => {
    // Only the API knows which sides landed, and the list and the check-in sheet
    // both render their thumbnails from that embedded metadata.
    const withFile = { ...EXISTING, files: [] };
    getCertification.mockResolvedValue(withFile);
    const onSaved = open({ certification: EXISTING });

    await pickFrontImage();
    await save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(withFile));
    expect(getCertification).toHaveBeenCalledWith("cert-1");
  });

  it("re-reads nothing when no image was touched", async () => {
    const onSaved = open({ certification: EXISTING });

    await save();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(getCertification).not.toHaveBeenCalled();
  });

  it("keeps the save when an image fails, and says which side", async () => {
    // The details are already written by then, so failing the whole save would
    // make the diver fill the form in again to retry one picture.
    uploadFile.mockRejectedValue(new Error("nope"));
    const onSaved = open({ certification: EXISTING });

    await pickFrontImage();
    await save();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("front image did not"),
      }),
    );
  });
});
