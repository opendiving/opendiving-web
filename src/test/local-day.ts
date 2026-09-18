// The calendar day an ISO instant falls on *in whatever timezone the suite is
// running in*, formatted the way the cards format it.
//
// Cards that print a `created_at`/`last_used_at` render it for the reader's own
// zone (`formatDateTime`), so a test asserting a day has to ask the same
// question the browser will. Writing the day down instead encodes the runner's
// timezone into the suite: UTC offsets run from -12 to +14, a 26-hour spread, so
// no instant renders as the same calendar day everywhere and there is no "safe"
// hour to pick - `12:00Z` is already 02:00 the next day in Kiritimati. Four
// assertions across three tests were red on `main` in one corner or the other
// before this existed;
// see DECISIONS.md, "A fixture meaning 'in the future' is derived, never written
// down".
//
// The options are spelled out here rather than reusing `formatDateTime` so the
// shape a test expects - short month, no time - stays pinned by the tests
// independently of the helper the component happens to call.
export function localDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// A bare "YYYY-MM-DD" `days` from now, in the suite's own timezone.
//
// Built from local getters because the fields these fixtures feed are compared against
// a local date (`todayIsoDate` in `lib/gear-service.ts`). East of UTC in the small
// hours `toISOString().slice(0, 10)` renders tomorrow as today, and an assertion that a
// future date is refused then never fires. Spelled out rather than calling
// `todayIsoDate` so a bug in that one cannot cancel itself out here.
export function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
