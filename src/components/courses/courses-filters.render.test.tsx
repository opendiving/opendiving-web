import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CERTIFICATION_AGENCIES } from "@/lib/api/certifications";
import { COURSE_STATUSES } from "@/lib/api/courses";

import {
  CoursesFilters,
  NO_COURSE_FILTERS,
  type CourseListFilters,
  type CoursesFiltersProps,
} from "./courses-filters";

// The row narrows one query rather than four, so what these pin is that each
// control reports its own field and leaves the other three where they were -
// the failure that turns "PADI courses in 2025" into "PADI courses".

function Row({
  initial = NO_COURSE_FILTERS,
  ...options
}: {
  initial?: CourseListFilters;
} & Pick<CoursesFiltersProps, "agencies" | "statuses">) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(initial);

  return (
    <>
      <CoursesFilters
        search={search}
        onSearchChange={setSearch}
        filters={filters}
        onFiltersChange={setFilters}
        {...options}
      />
      <output data-testid="asked">
        {JSON.stringify({ search, ...filters })}
      </output>
    </>
  );
}

const asked = () =>
  JSON.parse(screen.getByTestId("asked").textContent ?? "{}") as Record<
    string,
    string
  >;

const clearButton = () =>
  screen.queryByRole("button", { name: "Clear filters" });

const optionsOf = (label: string) =>
  [...screen.getByLabelText<HTMLSelectElement>(label).options].map(
    (option) => option.text,
  );
const agencyOptions = () => optionsOf("Agency");
const statusOptions = () => optionsOf("Status");

describe("CoursesFilters", () => {
  it("opens on no filter at all, with every control reachable by its label", () => {
    render(<Row />);

    expect(screen.getByLabelText("Search courses by name")).toHaveValue("");
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(screen.getByLabelText("Agency")).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("");
  });

  it("offers an 'any' option on each select, so a pick can be taken back", () => {
    render(<Row initial={{ ...NO_COURSE_FILTERS, agency: "padi" }} />);

    expect(
      screen.getByRole("option", { name: "Any agency" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Any status" }),
    ).toBeInTheDocument();
  });

  it("reports a picked agency and leaves the rest of the row alone", async () => {
    render(<Row initial={{ ...NO_COURSE_FILTERS, status: "completed" }} />);

    await userEvent.selectOptions(screen.getByLabelText("Agency"), "tdi");

    expect(asked()).toMatchObject({ agency: "tdi", status: "completed" });
  });

  it("reports a picked status by its wire value, not its label", async () => {
    render(<Row />);

    await userEvent.selectOptions(
      screen.getByLabelText("Status"),
      "in_progress",
    );

    expect(asked().status).toBe("in_progress");
  });

  it("reports a typed date once the field is left", async () => {
    render(<Row />);

    await userEvent.type(screen.getByLabelText("From"), "2025-01-01");
    await userEvent.tab();

    expect(asked().dateFrom).toBe("2025-01-01");
  });

  it("holds both ends of the window at once", async () => {
    render(<Row initial={{ ...NO_COURSE_FILTERS, dateFrom: "2025-01-01" }} />);

    await userEvent.type(screen.getByLabelText("To"), "2025-12-31");
    await userEvent.tab();

    expect(asked()).toMatchObject({
      dateFrom: "2025-01-01",
      dateTo: "2025-12-31",
    });
  });

  it("searches and filters together rather than one replacing the other", async () => {
    render(<Row initial={{ ...NO_COURSE_FILTERS, agency: "padi" }} />);

    await userEvent.type(
      screen.getByLabelText("Search courses by name"),
      "nitrox",
    );

    expect(asked()).toMatchObject({ search: "nitrox", agency: "padi" });
  });

  it("offers nothing to clear until something is set", () => {
    render(<Row />);

    expect(clearButton()).not.toBeInTheDocument();
  });

  // The search box is the diver's other way of narrowing the list and it has its
  // own affordance - a `type="search"` input clears itself. Sweeping it up here
  // would throw away a term they did not ask to lose.
  it("clears every filter but not the search term", async () => {
    render(
      <Row
        initial={{
          dateFrom: "2025-01-01",
          dateTo: "2025-12-31",
          agency: "padi",
          status: "completed",
        }}
      />,
    );
    await userEvent.type(
      screen.getByLabelText("Search courses by name"),
      "nitrox",
    );

    await userEvent.click(clearButton()!);

    expect(asked()).toEqual({ search: "nitrox", ...NO_COURSE_FILTERS });
    expect(clearButton()).not.toBeInTheDocument();
  });

  // Nineteen agencies are eighteen ways to empty a table for a diver who trained
  // with one of them. What the selects offer is the vocabulary the courses
  // themselves carry, which the page reads off its own list.
  it("offers only the agencies and statuses it is given", () => {
    render(<Row agencies={["padi", "sdi"]} statuses={["completed"]} />);

    expect(agencyOptions()).toEqual(["Any agency", "PADI", "SDI"]);
    expect(statusOptions()).toEqual(["Any status", "Completed"]);
  });

  it("falls back to the whole vocabulary when it is given none", () => {
    render(<Row />);

    expect(agencyOptions()).toHaveLength(CERTIFICATION_AGENCIES.length + 1);
    expect(statusOptions()).toHaveLength(COURSE_STATUSES.length + 1);
  });

  // The last PADI course deleted while the filter still says PADI. Dropping the
  // option would blank the select while the table stayed narrowed by it.
  it("keeps a picked value that is no longer in use", () => {
    render(
      <Row
        initial={{ ...NO_COURSE_FILTERS, agency: "padi" }}
        agencies={["sdi"]}
      />,
    );

    expect(screen.getByLabelText("Agency")).toHaveValue("padi");
    expect(agencyOptions()).toEqual(["Any agency", "SDI", "PADI"]);
  });
});
