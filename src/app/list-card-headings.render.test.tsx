import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CertificationsPageFrame } from "@/components/certifications/certifications-page-frame";
import { CoursesPageFrame } from "@/components/courses/courses-page-frame";
import { DivesPageFrame } from "@/components/dives/dives-page-frame";
import { SitesPageFrame } from "@/components/sites/sites-page-frame";
import { SpeciesPageFrame } from "@/components/species/species-page-frame";
import { TripsPageFrame } from "@/components/trips/trips-page-frame";

// A one-list page's card shows no title, but it is still a section of its page, so it
// keeps an `sr-only` `h2`. Nothing on screen would miss that heading if it went - the
// only thing that notices is an empty page's outline, where the empty state's `h3` would
// then sit straight under the page's `h1`. So this asserts the outline of the *empty*
// render rather than the presence of the element: what the heading is for, rather than
// the fact of it.

const FRAMES = {
  "dives-page-frame": DivesPageFrame,
  "trips-page-frame": TripsPageFrame,
  "sites-page-frame": SitesPageFrame,
  "species-page-frame": SpeciesPageFrame,
  "courses-page-frame": CoursesPageFrame,
  "certifications-page-frame": CertificationsPageFrame,
};

// The admin queue's copy is checked in its own directory, since nothing out here may
// import that section (`lib/admin-isolation.test.ts`).
const CHECKED_INSIDE_ADMIN = "invite-queue-frame";

const COMPONENTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../components",
);

// Derived rather than listed: a one-list frame is one that draws a `CountBadge`, so an
// eighth fails here rather than going unchecked. The gear cards are not frames and hold
// two lists between them, which is why their titles stay on screen.
const countingFrames = () =>
  readdirSync(COMPONENTS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      readdirSync(path.join(COMPONENTS, entry.name))
        .filter((file) => file.endsWith("-frame.tsx"))
        .filter((file) =>
          readFileSync(
            path.join(COMPONENTS, entry.name, file),
            "utf8",
          ).includes("CountBadge"),
        )
        .map((file) => file.replace(/\.tsx$/, "")),
    );

describe("a one-list page's card keeps a heading nobody sees", () => {
  it("covers every frame that counts a list", () => {
    expect([...countingFrames()].sort()).toEqual(
      [...Object.keys(FRAMES), CHECKED_INSIDE_ADMIN].sort(),
    );
  });

  it.each(Object.entries(FRAMES))("%s", (_name, Frame) => {
    const { container } = render(
      <Frame isLoading={false} totalCount={0} itemsPerPage={10} />,
    );

    const headings = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    expect(headings.map((heading) => Number(heading.tagName[1]))).toEqual([
      1, 2, 3,
    ]);
    expect(headings[1]).toHaveClass("sr-only");
  });

  // And that heading is all it keeps. "0 total dives" over "No dives logged
  // yet" counts the thing the sentence below has just said there is none of,
  // and a search box that would search nothing sits beside it. Each frame's own
  // tests cover the list *narrowed* to nothing, which keeps both.
  it.each(Object.entries(FRAMES))("%s, and nothing else", (_name, Frame) => {
    const { container } = render(
      <Frame isLoading={false} totalCount={0} itemsPerPage={10} />,
    );

    const heading = container.querySelector("h2")!;
    expect([...heading.parentElement!.children]).toEqual([heading]);
  });
});
