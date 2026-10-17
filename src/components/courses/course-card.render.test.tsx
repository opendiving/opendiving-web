import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Course } from "@/lib/api/courses";
import { CourseCard } from "./course-card";

const course = (overrides: Partial<Course> = {}): Course => ({
  uuid: "course-1",
  name: "Advanced Nitrox",
  agency: "tdi",
  status: "completed",
  start_date: "2025-03-08",
  end_date: "2025-03-11",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

const handlers = () => ({ onEdit: vi.fn(), onDelete: vi.fn() });

// The card is a list item, as every list's card is.
const card = (
  overrides: Partial<Course> = {},
  props: Partial<ReturnType<typeof handlers>> = {},
) =>
  render(
    <ul>
      <CourseCard
        course={course(overrides)}
        {...handlers()}
        {...props}
        isDeleting={false}
      />
    </ul>,
  ).container.querySelector("li") as HTMLElement;

describe("CourseCard", () => {
  it("opens the course's page from its name, its status beside it", () => {
    const item = card();

    expect(
      within(item).getByRole("link", { name: "Advanced Nitrox" }),
    ).toHaveAttribute("href", "/courses/course-1");
    expect(within(item).getByText("Completed")).toBeInTheDocument();
  });

  it("says who ran it and when under its name", () => {
    expect(card()).toHaveTextContent("TDI · Mar 8 - Mar 11, 2025");
  });

  it("leaves out an agency or dates it does not carry", () => {
    const item = card({ agency: null, start_date: null, end_date: null });

    expect(item).not.toHaveTextContent("·");
    expect(item).not.toHaveTextContent("TDI");
  });

  it("edits and deletes from a menu named after the course", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const item = card({}, { onEdit, onDelete });
    const menu = within(item).getByRole("button", {
      name: "Actions for Advanced Nitrox",
    });

    await userEvent.click(menu);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit" }),
    );
    expect(onEdit).toHaveBeenCalledOnce();

    await userEvent.click(menu);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
