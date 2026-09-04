import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import GoodbyePage from "./page";

// The page carries one fact, and it comes off the URL because nothing else survives
// the page load a deletion ends in. What that leaves worth testing is the three shapes
// that fact arrives in - a date still ahead, a date already behind us, and no readable
// date at all - because every one of them is reachable by a reload, a bookmark or
// anybody editing the query string, and the failure modes are a screen reading
// "Invalid Date" to somebody who came here for the date, and one telling them
// something about their instance that only the URL's age actually supports.

const search = vi.fn<() => URLSearchParams>(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useSearchParams: () => search(),
}));

beforeEach(() => {
  search.mockReturnValue(new URLSearchParams());
});

const withPurgeAfter = (value: string) =>
  search.mockReturnValue(new URLSearchParams({ purge_after: value }));

const pageText = () => document.body.textContent ?? "";

describe("the goodbye screen", () => {
  it("names the day everything is erased", () => {
    // Relative to now, not a literal, and that is the whole point: this case is
    // "a date still ahead", and a hard-coded one stops being ahead on a date
    // nobody is watching for. The 2026-09-04T12:00:00Z that used to sit here did
    // exactly that at midday on 2026-09-04, turning every run afterwards - CI on
    // main included - red for a reason that has nothing to do with the page.
    //
    // Midday UTC still, on the original reasoning: the date renders in the
    // reader's own timezone, and a midnight one would land on a different day
    // either side of the world. Thirty days out keeps it inside no month
    // boundary in particular, so the month and year read off the same `Date` the
    // page will format rather than off a guess about which they are.
    const ahead = new Date();
    ahead.setUTCDate(ahead.getUTCDate() + 30);
    ahead.setUTCHours(12, 0, 0, 0);
    withPurgeAfter(ahead.toISOString());

    render(<GoodbyePage />);

    expect(pageText()).toContain(
      ahead.toLocaleDateString("en-US", { month: "long" }),
    );
    expect(pageText()).toContain(String(ahead.getFullYear()));
    expect(screen.getByText(/nothing has been erased yet/i)).toBeVisible();
  });

  it("offers no window once the deadline is behind us", () => {
    // Reached two ways - a zero-grace instance answering with a deadline that is
    // already past, and anyone reloading or bookmarking this URL after their own
    // window ran out - so there is nothing to point at and nothing to ask the
    // operator to undo.
    withPurgeAfter("2020-01-01T12:00:00Z");

    render(<GoodbyePage />);

    expect(screen.getByText(/no longer recoverable/i)).toBeVisible();
    expect(screen.queryByText(/nothing has been erased yet/i)).toBeNull();
    expect(pageText()).not.toContain("Deleted by mistake?");
  });

  it("says only that the date has passed, not how the instance is configured", () => {
    // An elapsed timestamp cannot tell a zero-grace instance from a link revisited a
    // month late, so copy claiming the instance keeps no grace period would be a
    // fact about somebody else's install stated to the wrong reader.
    withPurgeAfter("2020-01-01T12:00:00Z");

    render(<GoodbyePage />);

    expect(pageText()).not.toMatch(/grace period/i);
  });

  it("points at the email when it has no date to show", () => {
    render(<GoodbyePage />);

    expect(screen.getByText(/confirmation email/i)).toBeVisible();
    expect(pageText()).toContain("the date in that email");
  });

  it("treats an unreadable date as no date rather than rendering it", () => {
    withPurgeAfter("whenever");

    render(<GoodbyePage />);

    expect(pageText()).not.toContain("Invalid Date");
    expect(screen.getByText(/confirmation email/i)).toBeVisible();
  });
});
