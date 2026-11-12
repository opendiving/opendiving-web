import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseCombobox } from "./course-combobox";
import type { CourseLookupItem } from "@/lib/api/courses";

// What a host fills from a pick rides on the lookup row the menu already holds:
// no read of the whole course, once per pick.

vi.mock("@/lib/api/courses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/courses")>()),
  coursesAPI: { lookupCourses: vi.fn(), getCourse: vi.fn() },
}));

const { coursesAPI } = await import("@/lib/api/courses");
const lookupCourses = vi.mocked(coursesAPI.lookupCourses);
const getCourse = vi.mocked(coursesAPI.getCourse);

const OPEN_WATER: CourseLookupItem = {
  uuid: "course-1",
  name: "Open Water",
  agency: "padi",
  agency_other: null,
  instructor_number: "12345",
  contact_uuid: "contact-a",
  people: [],
};
const RESCUE: CourseLookupItem = {
  ...OPEN_WATER,
  uuid: "course-2",
  name: "Rescue Diver",
  contact_uuid: "contact-b",
};
const COURSES = [OPEN_WATER, RESCUE];

beforeEach(() => {
  vi.clearAllMocks();
  lookupCourses.mockResolvedValue({
    data: COURSES,
    total_count: COURSES.length,
    has_more: false,
    page: 1,
    items_per_page: 25,
  });
});

function Field({
  onCourseSelected,
  until,
}: {
  onCourseSelected: (course: CourseLookupItem) => void;
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

  it("hands the host the picked course's lookup row, once, without reading the course", async () => {
    const onCourseSelected = vi.fn();
    render(<Field onCourseSelected={onCourseSelected} />);

    await pick("Rescue Diver");

    expect(onCourseSelected).toHaveBeenCalledWith(RESCUE);
    expect(onCourseSelected).toHaveBeenCalledTimes(1);
    expect(getCourse).not.toHaveBeenCalled();
  });

  it("fires nothing for a cleared selection", async () => {
    const onCourseSelected = vi.fn();
    render(<Field onCourseSelected={onCourseSelected} />);

    await pick("Open Water");
    onCourseSelected.mockClear();
    await userEvent.clear(screen.getByRole("combobox"));
    await userEvent.tab();

    expect(onCourseSelected).not.toHaveBeenCalled();
  });
});
