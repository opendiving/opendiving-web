import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseDialog } from "./course-dialog";
import type { Course } from "@/lib/api/courses";

vi.mock("@/lib/api/courses", async (importOriginal) => ({
  // The status vocabulary and its default are real - the picker's options and
  // the create form's starting value both come from them, and stubbing them
  // would make this test agree with itself rather than with the API.
  ...(await importOriginal<typeof import("@/lib/api/courses")>()),
  coursesAPI: { createCourse: vi.fn(), updateCourse: vi.fn() },
}));

const { coursesAPI } = await import("@/lib/api/courses");
const createCourse = vi.mocked(coursesAPI.createCourse);
const updateCourse = vi.mocked(coursesAPI.updateCourse);

const EXISTING: Course = {
  uuid: "course-1",
  name: "Advanced Nitrox + Decompression Procedures",
  agency: "tdi",
  agency_other: null,
  status: "completed",
  start_date: "2026-03-02",
  end_date: "2026-03-06",
  instructor_name: "Ana Ruiz",
  instructor_number: "TDI-99871",
  training_center: "Blue Ocean, Koh Tao",
  cost: "EUR 1450",
  notes: "Ran the 21m and 30m dives on back gas.",
  user_uuid: "user-1",
  created_at: "2026-03-08T09:00:00Z",
};

beforeEach(() => {
  createCourse.mockReset();
  updateCourse.mockReset();
  createCourse.mockResolvedValue(EXISTING);
  updateCourse.mockResolvedValue({ message: "Course updated" });
});

function open(course?: Course, onSaved = vi.fn()) {
  render(
    <CourseDialog
      userId="user-1"
      open
      onOpenChange={vi.fn()}
      course={course}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

const save = () =>
  userEvent.click(screen.getByRole("button", { name: /Create Course|Save/ }));

describe("CourseDialog", () => {
  it("seeds every field from the course being edited", async () => {
    open(EXISTING);

    await waitFor(() =>
      expect(screen.getByLabelText("Course *")).toHaveValue(EXISTING.name),
    );
    expect(screen.getByLabelText("Training center")).toHaveValue(
      "Blue Ocean, Koh Tao",
    );
    expect(screen.getByLabelText("Instructor number")).toHaveValue("TDI-99871");
    expect(screen.getByLabelText("Cost")).toHaveValue("EUR 1450");
  });

  it("sends an explicit null for every field the diver cleared", async () => {
    // The whole reason the submit maps `""` back to `null`: an omitted key
    // leaves the stored value alone, so clearing the cost of a course would
    // report success and change nothing.
    open(EXISTING);

    await waitFor(() =>
      expect(screen.getByLabelText("Cost")).toHaveValue("EUR 1450"),
    );
    await userEvent.clear(screen.getByLabelText("Cost"));
    await userEvent.clear(screen.getByLabelText("Instructor"));
    await save();

    await waitFor(() => expect(updateCourse).toHaveBeenCalled());
    expect(updateCourse.mock.calls[0][1]).toMatchObject({
      cost: null,
      instructor_name: null,
      training_center: "Blue Ocean, Koh Tao",
    });
  });

  it("creates a course with the API's own default status", async () => {
    const onSaved = open();

    await userEvent.type(screen.getByLabelText("Course *"), "PADI Open Water");
    await save();

    await waitFor(() => expect(createCourse).toHaveBeenCalled());
    expect(createCourse.mock.calls[0][0]).toMatchObject({
      user_uuid: "user-1",
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

    await userEvent.click(screen.getByLabelText("Agency *"));
    await userEvent.click(await screen.findByRole("option", { name: "Other" }));

    expect(await screen.findByLabelText("Agency name *")).toBeInTheDocument();
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
