// Where a form's "back" link, its Cancel button, and (where it makes sense) its
// post-save redirect should send someone.
//
// The dive form is reachable from at least six places - the dashboard, the dive
// list, the header's create menu, and the "log a dive here" buttons on a trip or
// a dive site - so a hardcoded `/dives` is wrong for most of them. Rather than
// each caller threading its own href through the form, the destination is read
// off the URL, which means it also survives a reload or a shared link.
//
// Deliberately not `router.back()`: a deep link or a refresh has no history
// entry to pop, and after a successful save "back" points at the form that was
// just submitted.

import { sanitizeRedirectPath } from "@/lib/auth-redirect";

export interface ReturnTarget {
  href: string;
  label: string;
}

// Section labels for the back link, in both their list and single-record forms:
// `/trips` is "Back to Trips", `/trips/{uuid}` is "Back to Trip".
const SECTIONS: Record<string, { index: string; item: string }> = {
  dashboard: { index: "Dashboard", item: "Dashboard" },
  dives: { index: "Dives", item: "Dive" },
  trips: { index: "Trips", item: "Trip" },
  sites: { index: "Dive Sites", item: "Dive Site" },
  gear: { index: "Gear", item: "Gear" },
  certifications: { index: "Certifications", item: "Certification" },
};

export function labelForPath(path: string): string {
  const segments = path.split(/[?#]/)[0].split("/").filter(Boolean);
  const section = SECTIONS[segments[0]];
  if (!section) return "Back";
  return `Back to ${segments.length > 1 ? section.item : section.index}`;
}

// A form must never send someone back to a form. The header's create menu is
// present on the dive form itself, so without this a "New Dive" opened from
// `/dives/new` would hand that same path back to Cancel.
export function isFormPath(path: string): boolean {
  const route = path.split(/[?#]/)[0].replace(/\/$/, "");
  return route === "/dives/new" || route.endsWith("/edit");
}

export interface ReturnToParams {
  /** An explicit destination, set by whoever linked to the form. */
  from?: string | null;
  /** The form's own context params, used when there's no explicit `from`. */
  trip_uuid?: string | null;
  dive_site_uuid?: string | null;
}

// Resolution order, most to least specific:
//   1. `?from=` - the linking page said exactly where to go back to.
//   2. The context the form was opened with. "Log a dive for this trip" already
//      passes `?trip_uuid=`, so that entry point needs no extra wiring to send
//      the diver back to the trip they were looking at.
//   3. The caller's own fallback (the dive list, or the dive being edited).
//
// `from` goes through the same `sanitizeRedirectPath` guard as the post-sign-in
// redirect: only same-origin, path-relative destinations are honoured, so a
// hand-crafted `?from=//evil.example` can't turn a Cancel button into an open
// redirect.
export function resolveReturnTarget(
  params: ReturnToParams,
  fallback: ReturnTarget,
): ReturnTarget {
  const from = sanitizeRedirectPath(params.from);
  if (from && !isFormPath(from)) {
    return { href: from, label: labelForPath(from) };
  }

  if (params.trip_uuid) {
    return {
      href: `/trips/${params.trip_uuid}`,
      label: "Back to Trip",
    };
  }

  if (params.dive_site_uuid) {
    return {
      href: `/sites/${params.dive_site_uuid}`,
      label: "Back to Dive Site",
    };
  }

  return fallback;
}
