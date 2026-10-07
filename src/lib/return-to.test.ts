import { describe, it, expect } from "vitest";
import {
  isFormPath,
  labelForPath,
  resolveReturnTarget,
  withReturnTo,
} from "./return-to";

const FALLBACK = { href: "/dives", label: "Back to dives" };

describe("labelForPath", () => {
  it("names the section's list page", () => {
    expect(labelForPath("/dives")).toBe("Back to dives");
    expect(labelForPath("/sites")).toBe("Back to dive sites");
    expect(labelForPath("/home")).toBe("Back to home");
    expect(labelForPath("/courses")).toBe("Back to courses");
    expect(labelForPath("/people")).toBe("Back to people");
    expect(labelForPath("/data")).toBe("Back to export");
  });

  it("switches to the singular for a single record", () => {
    expect(labelForPath("/trips/abc")).toBe("Back to trip");
    expect(labelForPath("/sites/abc")).toBe("Back to dive site");
    expect(labelForPath("/dives/abc")).toBe("Back to dive");
    expect(labelForPath("/courses/abc")).toBe("Back to course");
    expect(labelForPath("/people/abc")).toBe("Back to person");
    expect(labelForPath("/settings/account")).toBe("Back to settings");
  });

  it("ignores a query string or hash", () => {
    expect(labelForPath("/trips?page=2")).toBe("Back to trips");
    expect(labelForPath("/trips/abc#gear")).toBe("Back to trip");
  });

  it("falls back to a bare label for anything unrecognised", () => {
    expect(labelForPath("/nowhere")).toBe("Back");
    expect(labelForPath("/")).toBe("Back");
  });
});

describe("resolveReturnTarget", () => {
  it("prefers an explicit from over everything else", () => {
    expect(
      resolveReturnTarget({ from: "/trips/abc", trip_uuid: "xyz" }, FALLBACK),
    ).toEqual({ href: "/trips/abc", label: "Back to trip" });
  });

  it("derives the target from the context the form was opened with", () => {
    expect(resolveReturnTarget({ trip_uuid: "abc" }, FALLBACK)).toEqual({
      href: "/trips/abc",
      label: "Back to trip",
    });
    expect(resolveReturnTarget({ dive_site_uuid: "abc" }, FALLBACK)).toEqual({
      href: "/sites/abc",
      label: "Back to dive site",
    });
    // What "Log a dive for this course" hands the form, with no `?from=` of its
    // own - the same wiring the trip's own button gets for free.
    expect(resolveReturnTarget({ course_uuid: "abc" }, FALLBACK)).toEqual({
      href: "/courses/abc",
      label: "Back to course",
    });
  });

  it("uses the caller's fallback when the URL says nothing", () => {
    expect(resolveReturnTarget({}, FALLBACK)).toEqual(FALLBACK);
  });

  // A `from` a visitor can hand-craft must not become an open redirect, and
  // must not point back at a form.
  it("rejects an off-origin from", () => {
    expect(resolveReturnTarget({ from: "//evil.example" }, FALLBACK)).toEqual(
      FALLBACK,
    );
    expect(
      resolveReturnTarget({ from: "https://evil.example" }, FALLBACK),
    ).toEqual(FALLBACK);
    expect(resolveReturnTarget({ from: "/\\evil.example" }, FALLBACK)).toEqual(
      FALLBACK,
    );
  });

  it("rejects a from that points back at a form", () => {
    expect(resolveReturnTarget({ from: "/dives/new" }, FALLBACK)).toEqual(
      FALLBACK,
    );
    expect(resolveReturnTarget({ from: "/dives/abc/edit" }, FALLBACK)).toEqual(
      FALLBACK,
    );
  });

  it("still derives from context when the from is rejected", () => {
    expect(
      resolveReturnTarget(
        { from: "//evil.example", trip_uuid: "abc" },
        FALLBACK,
      ),
    ).toEqual({ href: "/trips/abc", label: "Back to trip" });
  });
});

describe("isFormPath", () => {
  it("recognises the dive form's own routes", () => {
    expect(isFormPath("/dives/new")).toBe(true);
    expect(isFormPath("/dives/abc/edit")).toBe(true);
    expect(isFormPath("/dives/new?trip_uuid=abc")).toBe(true);
  });

  it("leaves ordinary pages alone", () => {
    expect(isFormPath("/dives")).toBe(false);
    expect(isFormPath("/dives/abc")).toBe(false);
    expect(isFormPath("/trips/abc")).toBe(false);
  });
});

describe("withReturnTo", () => {
  // What the opened page reads back, as `useReturnTo` would.
  const backFrom = (href: string) =>
    resolveReturnTarget(
      { from: new URL(href, "http://localhost").searchParams.get("from") },
      FALLBACK,
    );

  it("names the page the link is followed from", () => {
    expect(withReturnTo("/trips/abc", "/home")).toBe("/trips/abc?from=%2Fhome");
    expect(backFrom(withReturnTo("/dives/d", "/trips/abc"))).toEqual({
      href: "/trips/abc",
      label: "Back to trip",
    });
  });

  // Home to trip to dive, and back twice.
  it("keeps that page's own way back", () => {
    const trip = withReturnTo("/trips/abc", "/home");
    const back = backFrom(withReturnTo("/dives/d", trip));
    expect(back).toEqual({ href: trip, label: "Back to trip" });
    expect(backFrom(back.href)).toEqual({
      href: "/home",
      label: "Back to home",
    });
  });

  it("adds nothing where the opened page's back link already goes", () => {
    expect(withReturnTo("/dives/d", "/dives")).toBe("/dives/d");
    expect(withReturnTo("/dives/new", "/dives")).toBe("/dives/new");
    expect(withReturnTo("/dives/d/edit", "/dives/d")).toBe("/dives/d/edit");
    // An edit from the list is not one from its own dive.
    expect(withReturnTo("/dives/d/edit", "/dives")).toBe(
      "/dives/d/edit?from=%2Fdives",
    );
  });

  it("adds nothing from a form, or from nowhere", () => {
    expect(withReturnTo("/dives/d", "/dives/new")).toBe("/dives/d");
    expect(withReturnTo("/dives/d", "/dives/x/edit?from=/trips/t")).toBe(
      "/dives/d",
    );
    expect(withReturnTo("/dives/d", null)).toBe("/dives/d");
  });

  it("leaves a link to the page it is on as that page stands", () => {
    expect(withReturnTo("/courses/c", "/courses/c?from=/home")).toBe(
      "/courses/c?from=/home",
    );
    expect(withReturnTo("/courses/c", "/courses/c")).toBe("/courses/c");
  });

  it("joins a query the link already has", () => {
    expect(withReturnTo("/dives/new?trip_uuid=t", "/people/p")).toBe(
      "/dives/new?trip_uuid=t&from=%2Fpeople%2Fp",
    );
  });

  it("stops a long walk from growing the URL any further", () => {
    const deep = `/sites/s?from=${"x".repeat(1000)}`;
    expect(withReturnTo("/dives/d", deep)).toBe("/dives/d?from=%2Fsites%2Fs");
  });
});
