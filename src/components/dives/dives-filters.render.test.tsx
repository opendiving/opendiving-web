import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DIVE_TYPES } from "@/lib/api/dives";
import type { Tag } from "@/lib/api/tags";

import {
  DivesFilters,
  diveFiltersChanged,
  hasDiveFilters,
  NO_DIVE_FILTERS,
  type DiveListFilters,
} from "./dives-filters";

// The row narrows one query and orders it, so what these pin is that each
// control reports its own field and leaves the other two where they were - the
// failure that turns "night dives, best first" into "night dives".

const TAGS: Tag[] = [
  {
    uuid: "tag-night",
    name: "night",
    dive_count: 3,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    uuid: "tag-wreck",
    name: "wreck",
    dive_count: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
];

function Row({ initial = NO_DIVE_FILTERS }: { initial?: DiveListFilters }) {
  const [filters, setFilters] = useState(initial);
  return (
    <>
      <DivesFilters
        filters={filters}
        onFiltersChange={setFilters}
        tags={TAGS}
      />
      <output data-testid="asked">{JSON.stringify(filters)}</output>
    </>
  );
}

const asked = () =>
  JSON.parse(
    screen.getByTestId("asked").textContent ?? "{}",
  ) as DiveListFilters;

const optionsOf = (label: string) =>
  [...screen.getByLabelText<HTMLSelectElement>(label).options].map(
    (option) => option.text,
  );

describe("DivesFilters", () => {
  it("opens on every dive, newest first", () => {
    render(<Row />);

    expect(screen.getByLabelText("Tag")).toHaveValue("");
    expect(screen.getByLabelText("Dive type")).toHaveValue("");
    expect(screen.getByLabelText("Sort")).toHaveValue("date");
  });

  it("offers every tag the diver has, and 'any' first so a pick can be taken back", () => {
    render(<Row />);

    expect(optionsOf("Tag")).toEqual(["Any tag", "night", "wreck"]);
    expect(optionsOf("Dive type")).toHaveLength(DIVE_TYPES.length + 1);
    expect(optionsOf("Dive type")[0]).toBe("Any type");
    expect(optionsOf("Sort")).toEqual(["Newest first", "Highest rated first"]);
  });

  it("reports each control's own field and keeps the others", async () => {
    render(<Row />);

    await userEvent.selectOptions(screen.getByLabelText("Tag"), "tag-night");
    await userEvent.selectOptions(
      screen.getByLabelText("Dive type"),
      "freedive",
    );
    await userEvent.selectOptions(screen.getByLabelText("Sort"), "rating");

    expect(asked()).toEqual({
      tagUuid: "tag-night",
      type: "freedive",
      sort: "rating",
    });

    await userEvent.selectOptions(screen.getByLabelText("Tag"), "");
    expect(asked()).toEqual({ tagUuid: "", type: "freedive", sort: "rating" });
  });
});

describe("hasDiveFilters and diveFiltersChanged", () => {
  // The sort orders every dive rather than choosing some, so a list sorted by
  // rating and empty is an empty logbook, not a filter that matched nothing.
  it("counts the tag and the type, and not the sort", () => {
    expect(hasDiveFilters(NO_DIVE_FILTERS)).toBe(false);
    expect(hasDiveFilters({ ...NO_DIVE_FILTERS, sort: "rating" })).toBe(false);
    expect(hasDiveFilters({ ...NO_DIVE_FILTERS, tagUuid: "tag-night" })).toBe(
      true,
    );
    expect(hasDiveFilters({ ...NO_DIVE_FILTERS, type: "snorkel" })).toBe(true);
  });

  it("counts the sort as something a shut panel would clear", () => {
    expect(diveFiltersChanged({ ...NO_DIVE_FILTERS, sort: "rating" })).toBe(
      true,
    );
    expect(diveFiltersChanged(NO_DIVE_FILTERS)).toBe(false);
  });
});
