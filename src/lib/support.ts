// The public issue trackers offered on `/contact` - one per repository, since a bug in
// the iOS app isn't the web app's to fix. Shared with `ContactForm`, which falls back to
// one of them when a submission can't get through.
export const ISSUE_TRACKERS = [
  {
    label: "Web app",
    href: "https://github.com/opendiving/opendiving-web/issues",
  },
  { label: "API", href: "https://github.com/opendiving/opendiving-api/issues" },
  {
    label: "iOS app",
    href: "https://github.com/opendiving/opendiving-ios/issues",
  },
] as const;

// Where a visitor is pointed when the form itself fails and no fallback address is
// configured. The form lives in the web app, so "the contact form is broken" belongs on
// the web app's tracker regardless of what the message was going to be about.
export const FALLBACK_ISSUES_URL = ISSUE_TRACKERS[0].href;
