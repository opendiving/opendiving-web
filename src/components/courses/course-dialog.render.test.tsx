import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseDialog } from "./course-dialog";
import type { Course } from "@/lib/api/courses";
import type { Contact } from "@/lib/api/contacts";
import type { Person } from "@/lib/api/people";

vi.mock("@/lib/api/courses", async (importOriginal) => ({
  // The status vocabulary and its default are real - the picker's options and
  // the create form's starting value both come from them, and stubbing them
  // would make this test agree with itself rather than with the API.
  ...(await importOriginal<typeof import("@/lib/api/courses")>()),
  coursesAPI: { createCourse: vi.fn(), updateCourse: vi.fn() },
}));

vi.mock("@/lib/api/contacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/contacts")>()),
  contactsAPI: { getContacts: vi.fn(), getContact: vi.fn() },
}));

vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/people")>()),
  peopleAPI: {
    getPeople: vi.fn(),
    getPerson: vi.fn(),
    createPerson: vi.fn(),
  },
  fetchAllPeople: vi.fn(),
}));

const { coursesAPI } = await import("@/lib/api/courses");
const { contactsAPI } = await import("@/lib/api/contacts");
const { peopleAPI, fetchAllPeople } = await import("@/lib/api/people");
const createCourse = vi.mocked(coursesAPI.createCourse);
const updateCourse = vi.mocked(coursesAPI.updateCourse);
const getContact = vi.mocked(contactsAPI.getContact);
const getPeople = vi.mocked(peopleAPI.getPeople);
const getPerson = vi.mocked(peopleAPI.getPerson);
const createPerson = vi.mocked(peopleAPI.createPerson);

const person = (uuid: string, name: string): Person => ({
  uuid,
  name,
  notes: "",
  username: null,
  dive_count: 0,
  created_at: "2026-03-01T09:00:00Z",
});

const ANA = person("person-ana", "Ana Ruiz");
const BEN = person("person-ben", "Ben Student");
const PEOPLE = [ANA, BEN];

const page = <T,>(items: T[]) => ({
  data: items,
  total_count: items.length,
  has_more: false,
  page: 1,
  items_per_page: 25,
});

const BLUE_OCEAN: Contact = {
  uuid: "contact-blue",
  name: "Blue Ocean, Koh Tao",
  roles: ["dive_center", "school"],
  notes: "",
  user_uuid: "user-1",
  created_at: "2026-03-01T09:00:00Z",
};

const EXISTING: Course = {
  uuid: "course-1",
  name: "Advanced Nitrox + Decompression Procedures",
  agency: "tdi",
  agency_other: null,
  status: "completed",
  start_date: "2026-03-02",
  end_date: "2026-03-06",
  instructor_number: "TDI-99871",
  contact_uuid: BLUE_OCEAN.uuid,
  // The instructor second, as an import may have them: the dialog finds them
  // by role, not by place.
  people: [
    { person_uuid: BEN.uuid, role: "student" },
    { person_uuid: ANA.uuid, role: "instructor" },
  ],
  notes: "Ran the 21m and 30m dives on back gas.",
  user_uuid: "user-1",
  created_at: "2026-03-08T09:00:00Z",
};

beforeEach(() => {
  createCourse.mockReset();
  updateCourse.mockReset();
  createCourse.mockResolvedValue(EXISTING);
  updateCourse.mockResolvedValue({ message: "Course updated" });
  getContact.mockImplementation(async () => BLUE_OCEAN);
  getPeople.mockReset().mockImplementation(async () => page(PEOPLE));
  getPerson.mockReset().mockImplementation(async (uuid: string) => {
    const found = PEOPLE.find((one) => one.uuid === uuid);
    if (!found) throw new Error("not found");
    return found;
  });
  createPerson.mockReset();
  vi.mocked(fetchAllPeople).mockReset().mockResolvedValue(PEOPLE);
});

const instructor = () => screen.getByLabelText("Instructor");
const peopleField = () => screen.getByLabelText("People");

function open(course?: Course, onSaved = vi.fn()) {
  render(
    <CourseDialog
      open
      onOpenChange={vi.fn()}
      course={course}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

const save = () =>
  userEvent.click(screen.getByRole("button", { name: /Create course|Save/ }));

describe("CourseDialog", () => {
  it("seeds every field from the course being edited", async () => {
    open(EXISTING);

    await waitFor(() =>
      expect(screen.getByLabelText("Course *")).toHaveValue(EXISTING.name),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Dive center")).toHaveValue(BLUE_OCEAN.name),
    );
    expect(screen.getByLabelText("Instructor number")).toHaveValue("TDI-99871");
    await waitFor(() => expect(instructor()).toHaveValue("Ana Ruiz"));
    // Everyone else on the list below, the instructor not twice.
    expect(
      await screen.findByRole("combobox", { name: "Role of Ben Student" }),
    ).toHaveValue("student");
    expect(
      screen.queryByRole("combobox", { name: "Role of Ana Ruiz" }),
    ).toBeNull();
  });

  it("writes the instructor back first, as the instructor, with the rest behind", async () => {
    open(EXISTING);
    await waitFor(() => expect(instructor()).toHaveValue("Ana Ruiz"));

    await save();

    await waitFor(() => expect(updateCourse).toHaveBeenCalled());
    expect(updateCourse.mock.calls[0][1].people).toEqual([
      { person_uuid: ANA.uuid, role: "instructor" },
      { person_uuid: BEN.uuid, role: "student" },
    ]);
    expect(updateCourse.mock.calls[0][1]).not.toHaveProperty("instructor_name");
  });

  it("names a new instructor in one step: the name, then Enter", async () => {
    // What typing a name did while the field was text, and no more.
    const created = person("person-new", "Robin Reef");
    getPeople.mockImplementation(async () => page([]));
    createPerson.mockResolvedValue(created);
    open();

    await userEvent.type(screen.getByLabelText("Course *"), "Deep Specialty");
    await userEvent.click(instructor());
    await screen.findByText(/No people yet/);
    await userEvent.type(instructor(), "Robin Reef{Enter}");
    await waitFor(() => expect(instructor()).toHaveValue("Robin Reef"));

    await save();

    await waitFor(() => expect(createCourse).toHaveBeenCalled());
    expect(createCourse.mock.calls[0][0].people).toEqual([
      { person_uuid: created.uuid, role: "instructor" },
    ]);
  });

  it("adds the rest of the class as students", async () => {
    open();

    await userEvent.type(screen.getByLabelText("Course *"), "Open Water");
    await userEvent.click(peopleField());
    await userEvent.click(
      await screen.findByRole("option", { name: "Ben Student" }),
    );
    expect(
      await screen.findByRole("combobox", { name: "Role of Ben Student" }),
    ).toHaveValue("student");

    await save();

    await waitFor(() => expect(createCourse).toHaveBeenCalled());
    expect(createCourse.mock.calls[0][0].people).toEqual([
      { person_uuid: BEN.uuid, role: "student" },
    ]);
  });

  it("moves a person made the instructor off the list below", async () => {
    open(EXISTING);
    await screen.findByRole("combobox", { name: "Role of Ben Student" });

    await userEvent.click(instructor());
    await userEvent.click(
      await screen.findByRole("option", { name: "Ben Student" }),
    );

    await waitFor(() => expect(instructor()).toHaveValue("Ben Student"));
    expect(
      screen.queryByRole("combobox", { name: "Role of Ben Student" }),
    ).toBeNull();

    await save();
    await waitFor(() => expect(updateCourse).toHaveBeenCalled());
    expect(updateCourse.mock.calls[0][1].people).toEqual([
      { person_uuid: BEN.uuid, role: "instructor" },
    ]);
  });

  it("sends an explicit null for every field the diver cleared", async () => {
    // The whole reason the submit maps `""` back to `null`: an omitted key
    // leaves the stored value alone, so clearing the instructor number of a
    // course would report success and change nothing. A cleared instructor is
    // simply one no longer on the people it sends.
    open(EXISTING);

    await waitFor(() =>
      expect(screen.getByLabelText("Instructor number")).toHaveValue(
        "TDI-99871",
      ),
    );
    await waitFor(() => expect(instructor()).toHaveValue("Ana Ruiz"));
    await userEvent.clear(screen.getByLabelText("Instructor number"));
    await userEvent.click(
      within(instructor().parentElement!).getByRole("button", {
        name: "Clear",
      }),
    );
    await save();

    await waitFor(() => expect(updateCourse).toHaveBeenCalled());
    expect(updateCourse.mock.calls[0][1]).toMatchObject({
      instructor_number: null,
      contact_uuid: BLUE_OCEAN.uuid,
      people: [{ person_uuid: BEN.uuid, role: "student" }],
    });
    expect(updateCourse.mock.calls[0][1]).not.toHaveProperty("training_center");
  });

  it("unlinks a cleared dive center with an explicit null", async () => {
    open(EXISTING);

    const diveCenter = screen.getByLabelText("Dive center");
    await waitFor(() => expect(diveCenter).toHaveValue(BLUE_OCEAN.name));
    await userEvent.click(
      within(diveCenter.parentElement!).getByRole("button", { name: "Clear" }),
    );
    await save();

    await waitFor(() => expect(updateCourse).toHaveBeenCalled());
    expect(updateCourse.mock.calls[0][1]).toMatchObject({ contact_uuid: null });
  });

  it("creates a course with the API's own default status", async () => {
    const onSaved = open();

    await userEvent.type(screen.getByLabelText("Course *"), "PADI Open Water");
    await save();

    await waitFor(() => expect(createCourse).toHaveBeenCalled());
    expect(createCourse.mock.calls[0][0]).toMatchObject({
      name: "PADI Open Water",
      status: "completed",
      // Both dates absent rather than empty strings - a course can legitimately
      // have neither, and the API's date columns are nullable for exactly that.
      start_date: null,
      end_date: null,
    });
    expect(onSaved).toHaveBeenCalledWith(EXISTING);
  });

  it("asks which agency ran the course only when the agency is 'other'", async () => {
    open(EXISTING);

    expect(screen.queryByLabelText("Agency name *")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Agency"));
    await userEvent.click(await screen.findByRole("option", { name: "Other" }));

    expect(await screen.findByLabelText("Agency name *")).toBeInTheDocument();
  });

  it("creates a course with no agency when the diver never opens the picker", async () => {
    // The create form opens on no agency rather than PADI, so a diver who
    // never looks at the field stores nothing instead of a fabricated one.
    open();
    expect(screen.getByLabelText("Agency")).toHaveTextContent("No agency");

    await userEvent.type(screen.getByLabelText("Course *"), "Nitrox, at home");
    await save();

    await waitFor(() => expect(createCourse).toHaveBeenCalled());
    expect(createCourse.mock.calls[0][0]).toMatchObject({
      name: "Nitrox, at home",
      agency: null,
      agency_other: null,
    });
  });

  it("clears a stored agency with an explicit null", async () => {
    // An omitted key would leave `tdi` in place and report success, the same
    // trap the text fields' `""` -> `null` mapping exists for.
    open(EXISTING);

    await waitFor(() =>
      expect(screen.getByLabelText("Agency")).toHaveTextContent("TDI"),
    );
    await userEvent.click(screen.getByLabelText("Agency"));
    await userEvent.click(
      await screen.findByRole("option", { name: "No agency" }),
    );
    await save();

    await waitFor(() => expect(updateCourse).toHaveBeenCalled());
    expect(updateCourse.mock.calls[0][1]).toMatchObject({
      agency: null,
      agency_other: null,
    });
  });

  it("reopens a course with no agency on the no-agency state, and leaves it there", async () => {
    open({ ...EXISTING, agency: null });

    await waitFor(() =>
      expect(screen.getByLabelText("Agency")).toHaveTextContent("No agency"),
    );

    await save();

    await waitFor(() => expect(updateCourse).toHaveBeenCalled());
    expect(updateCourse.mock.calls[0][1]).toMatchObject({ agency: null });
  });

  it("refuses an end date before the start date, beside the end date", async () => {
    // The API refuses this outright behind a 422; catching it here is what puts
    // the complaint next to the field the diver would fix.
    open({ ...EXISTING, start_date: "2026-03-06", end_date: "2026-03-02" });

    await waitFor(() =>
      expect(screen.getByLabelText("Course *")).toHaveValue(EXISTING.name),
    );
    await save();

    expect(
      await screen.findByText("End date must be on or after start date"),
    ).toBeInTheDocument();
    expect(updateCourse).not.toHaveBeenCalled();
  });
});
