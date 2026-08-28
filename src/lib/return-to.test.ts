import { describe, it, expect } from "vitest";
import { isFormPath, labelForPath, resolveReturnTarget } from "./return-to";

const FALLBACK = { href: "/dives", label: "Back to Dives" };

describe("labelForPath", () => {
  it("names the section's list page", () => {
    expect(labelForPath("/dives")).toBe("Back to Dives");
    expect(labelForPath("/sites")).toBe("Back to Dive Sites");
    expect(labelForPath("/dashboard")).toBe("Back to Dashboard");
    expect(labelForPath("/courses")).toBe("Back to Courses");
  });

  it("switches to the singular for a single record", () => {
    expect(labelForPath("/trips/abc")).toBe("Back to Trip");
    expect(labelForPath("/sites/abc")).toBe("Back to Dive Site");
    expect(labelForPath("/dives/abc")).toBe("Back to Dive");
    expect(labelForPath("/courses/abc")).toBe("Back to Course");
  });

  it("ignores a query string or hash", () => {
    expect(labelForPath("/trips?page=2")).toBe("Back to Trips");
    expect(labelForPath("/trips/abc#gear")).toBe("Back to Trip");
  });

  it("falls back to a bare label for anything unrecognised", () => {
    expect(labelForPath("/settings")).toBe("Back");
    expect(labelForPath("/")).toBe("Back");
  });
});

describe("resolveReturnTarget", () => {
  it("prefers an explicit from over everything else", () => {
    expect(
      resolveReturnTarget({ from: "/trips/abc", trip_uuid: "xyz" }, FALLBACK),
    ).toEqual({ href: "/trips/abc", label: "Back to Trip" });
  });

  it("derives the target from the context the form was opened with", () => {
    expect(resolveReturnTarget({ trip_uuid: "abc" }, FALLBACK)).toEqual({
      href: "/trips/abc",
      label: "Back to Trip",
    });
    expect(resolveReturnTarget({ dive_site_uuid: "abc" }, FALLBACK)).toEqual({
      href: "/sites/abc",
      label: "Back to Dive Site",
    });
    // What "Log a Dive for this Course" hands the form, with no `?from=` of its
    // own - the same wiring the trip's own button gets for free.
    expect(resolveReturnTarget({ course_uuid: "abc" }, FALLBACK)).toEqual({
      href: "/courses/abc",
      label: "Back to Course",
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
    ).toEqual({ href: "/trips/abc", label: "Back to Trip" });
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
