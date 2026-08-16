import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailPageSkeleton, FormPageSkeleton } from "./page-skeleton";
import { TableRowsSkeleton } from "./table-skeleton";
import { Table, TableBody } from "./table";

// These components exist to hold a page's shape while its data is in flight, so what
// is worth asserting is exactly that: that they occupy the layout without claiming to
// be content. A spinner passed both of those tests by being absent from the layout
// entirely, which is what made every navigation jump.

describe("DetailPageSkeleton", () => {
  it("offers the real back link, so the wait is escapable", () => {
    render(<DetailPageSkeleton backHref="/dives" backLabel="Back to Dives" />);

    expect(screen.getByRole("link", { name: "Back to Dives" })).toHaveAttribute(
      "href",
      "/dives",
    );
  });

  it("marks the region busy rather than announcing its placeholders", () => {
    const { container } = render(
      <DetailPageSkeleton backHref="/dives" backLabel="Back to Dives" />,
    );

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    // Every bar is hidden from the accessibility tree: a screen reader reading out a
    // dozen empty boxes is worse than the silence `aria-busy` leaves.
    const bars = container.querySelectorAll(".animate-skeleton");
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => expect(bar).toHaveAttribute("aria-hidden", "true"));
  });

  it("stands in for the title inside the heading it will fill", () => {
    // The placeholder has to sit *in* the `h1`, not beside it - that's what keeps the
    // header the same height before and after the record lands.
    render(<DetailPageSkeleton backHref="/gear" backLabel="Back to Gear" />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.querySelector(".animate-skeleton")).toBeInTheDocument();
  });
});

describe("FormPageSkeleton", () => {
  it("draws a label and an input for each field it's told to expect", () => {
    const { container } = render(
      <FormPageSkeleton
        backHref="/dives"
        backLabel="Back to Dives"
        fields={4}
      />,
    );

    // Four fields, two bars each, plus the header title/subtitle, the card heading
    // and the two footer buttons.
    expect(container.querySelectorAll(".animate-skeleton")).toHaveLength(
      4 * 2 + 5,
    );
  });
});

describe("TableRowsSkeleton", () => {
  it("fills every column, so the placeholder shares the real rows' grid", () => {
    render(
      <Table>
        <TableBody>
          <TableRowsSkeleton columns={3} rows={2} />
        </TableBody>
      </Table>,
    );

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.querySelectorAll("td")).toHaveLength(3));
  });
});
