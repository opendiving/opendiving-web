import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseCombobox } from "./course-combobox";
import type { Course } from "@/lib/api/courses";

// The menu lists thin rows; a host that wants the whole course gets it from a
// read on pick, once per pick, and never for a pick something later replaced.

vi.mock("@/lib/api/courses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/courses")>()),
  coursesAPI: { lookupCourses: vi.fn(), getCourse: vi.fn() },
}));

const { coursesAPI } = await import("@/lib/api/courses");
const lookupCourses = vi.mocked(coursesAPI.lookupCourses);
const getCourse = vi.mocked(coursesAPI.getCourse);

const course = (uuid: string, name: string, contact_uuid: string): Course => ({
  uuid,
  name,
  status: "completed",
  contact_uuid,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00Z",
});

const OPEN_WATER = course("course-1", "Open Water", "contact-a");
const RESCUE = course("course-2", "Rescue Diver", "contact-b");
const COURSES = [OPEN_WATER, RESCUE];

beforeEach(() => {
  vi.clearAllMocks();
  lookupCourses.mockResolvedValue({
    data: COURSES.map(({ uuid, name }) => ({ uuid, name })),
    total_count: COURSES.length,
    has_more: false,
    page: 1,
    items_per_page: 25,
  });
  getCourse.mockImplementation(async (uuid) =>
    COURSES.find((one) => one.uuid === uuid)!,
  );
});

function Field({
  onCourseSelected,
  until,
}: {
  onCourseSelected: (course: Course) => void;
  until?: string;
}) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <CourseCombobox
      aria-label="Course"
      value={value}
      onChange={setValue}
      onCourseSelected={onCourseSelected}
      until={until}
    />
  );
}

const pick = async (name: string) => {
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name }));
};

describe("CourseCombobox", () => {
  it("asks the lookup for courses ranked at the record's date", async () => {
    render(<Field onCourseSelected={vi.fn()} until="2024-03-02" />);

    await userEvent.click(screen.getByRole("combobox"));

    await waitFor(() =>
      expect(lookupCourses).toHaveBeenCalledWith(1, 25, {
        search: "",
        until: "2024-03-02",
      }),
    );
  });

  it("hands the host the whole course a pick read, once", async () => {
    const onCourseSelected = vi.fn();
    render(<Field onCourseSelected={onCourseSelected} />);

    await pick("Rescue Diver");

    await waitFor(() => expect(onCourseSelected).toHaveBeenCalledWith(RESCUE));
    expect(onCourseSelected).toHaveBeenCalledTimes(1);
    expect(getCourse).toHaveBeenCalledWith(RESCUE.uuid);
  });

  it("never fires for a pick a later one replaced before its read landed", async () => {
    let landFirst: (course: Course) => void = () => {};
    getCourse.mockImplementationOnce(
      () => new Promise<Course>((resolve) => (landFirst = resolve)),
    );
    const onCourseSelected = vi.fn();
    render(<Field onCourseSelected={onCourseSelected} />);

    await pick("Open Water");
    await userEvent.clear(screen.getByRole("combobox"));
    await pick("Rescue Diver");
    await waitFor(() => expect(onCourseSelected).toHaveBeenCalledWith(RESCUE));
    landFirst(OPEN_WATER);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onCourseSelected).toHaveBeenCalledTimes(1);
    expect(onCourseSelected).not.toHaveBeenCalledWith(OPEN_WATER);
  });
});
