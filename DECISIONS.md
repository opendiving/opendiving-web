# Frontend Decisions & Gotchas

Notes on non-obvious choices and pitfalls hit while building out the web app, so the reasoning
survives independently of any particular chat/agent session. Keep this updated as new gotchas are
discovered.

## Dive/trip/dive-site API calls take `uuid` strings, not `username`/numeric ids

`divesAPI`/`tripsAPI`/`diveSitesAPI`/`diveStatsAPI` (in `lib/api/*.ts`) used to take a
`username: string` as their first argument, matching backend routes nested under `/{username}/...`.
The backend flattened these to plain routes (`/dive`, `/dives`, `/dive/{id}`, etc., see the API's
`DECISIONS.md`), so these functions - and every component that calls them (`RecentDivesCard`,
`RecentTripsCard`, `TripCombobox`, `DiveSiteMultiSelect`, `NewTripDialog`, `NewDiveSiteDialog`,
`DiveFormFields`, and every `dives/`/`sites/`/`trips/` page) - took/forwarded a `userId: number`
(from `user.id` in `AuthContext`, not `user.username`) for a while instead. The backend then moved
from numeric ids to string `uuid`s everywhere (see the API's `DECISIONS.md`), so as of the
frontend's `uuid` commit these functions take a `userUuid: string` (from `user.uuid`) instead of
`userId: number`:

- Create calls (`createDive`/`createTrip`/`createDiveSite`) take the full request object as a single
  argument, with `user_uuid` included in its body - there's no separate leading
  `username`/`userId`/`userUuid` parameter for these.
- List calls (`getDives`/`getTrips`/`getDiveSites`/`getDiveStats`) take `userUuid` as their first
  argument and send it as a `user_uuid` query param.
- Single-resource calls (`getDive`/`updateDive`/`deleteDive` and the trip/dive-site equivalents)
  don't take a user identifier at all - just the resource `uuid` - since the backend authorizes
  these by comparing the fetched object's owner to the logged-in user, not by an identifier in the
  URL.

The `/user/{username}` account-management endpoints (`authAPI.updateProfile`/ `changePassword`) were
changed the same way, ending up on the backend's `/user/{uuid}/...` routes (see the API's
`DECISIONS.md`) - `authAPI.updateProfile`/`changePassword` now take a `userUuid: string`
(`user.uuid`) as their first argument instead of `username`/`userId`. `GET /user/me`
(`authAPI.getCurrentUser`) is unaffected - it's an exact literal path, not a
`{username}`/`{id}`/`{uuid}` placeholder, and always resolves the caller's own account from their
auth token.

(This no longer reflects `updateProfile`'s or `getDiveStats`'s current signatures - see
"Current-user endpoints moved off `/user/me`/`/user/{uuid}` onto a bare `/user`" below.)

## Never use `z.preprocess()`/`.transform()` on fields feeding `z.input<>`-derived types

Several form pages derive their form-data type from Zod via `z.input<typeof schema>` (e.g.
`DiveCreateInput`, `DiveUpdateInput`). `.preprocess()`/`.transform()` collapse the _input_ type to
`unknown` or to the transformed output type, which breaks `useForm<T>()`'s generic binding to
`onSubmit` with confusing "two different types with this name exist, but they are unrelated"
errors - and this only surfaces during a full `next build`, **not** during `diagnostics`/editor
type-checking.

The established pattern instead: keep the Zod schema's input and output types identical (e.g.
`z.union([z.literal(""), z.number()])`, no `.transform()`), and do any real conversion (like
`"" -> undefined`) in a plain TS helper function called explicitly right before the API call (see
`normalizeMixtures`, `normalizeTripDates` in `lib/validations/*.ts`).

**Always run a full `npm run build` after touching any Zod schema tied to a form**

- `diagnostics` alone has repeatedly missed this class of bug.

## The "cleared field resets to default" React Hook Form quirk

Setting a _live_ RHF field value to `undefined` mid-edit makes RHF fall back to displaying that
field's default value (RHF can't distinguish "explicitly cleared" from "never set"). This affects
any optional numeric/date field with a non-empty-string default.

Fix pattern used throughout: use the empty string `""` as the live "cleared" sentinel (never
`undefined`) for these fields, and only convert `"" -> undefined` in a normalize helper called right
before sending to the API. See `diveMixtureSchema.start_pressure/end_pressure` and
`tripCreateSchema.start_date/ end_date` for the two example call sites (numeric and date-string
respectively).

## Explicit field construction beats spread-then-override for generics

`normalizeMixtures()` originally tried `{ ...mixture, start_pressure: ... }` with a generic type
parameter for `mixture`. TypeScript did not reliably narrow the overridden property away from the
original (wider, union-typed) property when the source object's type was generic - the `""`
placeholder type leaked back into the inferred return type and broke assignability to the API's
`DiveMixture[]` type. Switching to explicitly listing every output field (no spread, no generics)
fixed it immediately and is the safer default for any similar "normalize before submit" helper.

## Bare `YYYY-MM-DD` dates must not go through `new Date(dateString)`

`new Date("2024-06-01")` parses as UTC midnight. Displaying that in a negative-UTC-offset timezone
(most of the Americas) can show the _previous_ day. Any date-only field (trip
`start_date`/`end_date`) is formatted via `formatDateOnly()`/`formatTripDateRange()` in
`lib/date-time.ts`, which manually splits the string and constructs a _local_
`Date(year, month-1, day)` instead. `Dive.start_time` is a full ISO datetime, so it doesn't have
_this specific_ off-by-one-day problem - but see the next section, since displaying/editing it
correctly still can't just go through `new Date(dateString)` and local getters.

## A dive's `start_time` displays/edits in its own timezone, never the browser's

`Dive.start_time` is always an offset-aware ISO 8601 string, e.g.
`"2021-04-04T10:04:47.910+02:00"` - the offset is the dive's _own_ original timezone
(wherever/whatever logged it), not the viewer's. A dive logged at 09:00 in Thailand should always
show 09:00, whether it's viewed from Thailand, the US, or anywhere else.

The naive approach - `new Date(start_time)` then `.getHours()`/`toLocaleString()`

- is wrong here: those always convert to the _browser's_ timezone, silently showing a different
  wall-clock time than what was actually logged. All of the helpers in `lib/date-time.ts` avoid this
  by working with the offset embedded in the string directly, never through browser-local getters:
- `parseUtcOffsetMinutes()` extracts the embedded offset (or `null` for a naive string with none).
- `formatDiveDateTime()`/`formatDiveTimeOnly()` (display) shift the underlying instant by that
  offset and format with `timeZone: "UTC"`, so `Intl`/`toLocaleDateString` reads the shifted instant
  back as the original wall-clock time regardless of the browser's own zone.
- `splitStartTime()`/`combineStartTime()` convert between that single string and a "YYYY-MM-DD
  HH:mm:ss" wall-clock string + a UTC offset in minutes - the two pieces the underlying
  `DateTimePicker`/`UtcOffsetSelect` inputs actually edit.

`formatDateTime()`/`formatTimeOnly()` (plain, no `Dive`-prefix) are unaffected and still show the
_viewer's_ browser-local time - correct for `created_at` and any other plain metadata timestamp,
just not for a dive's `start_time`.

**The form only ever has one `start_time` field**, in the exact offset-aware shape the API uses -
there's no separate `start_time_utc_offset_minutes` form field to keep in sync with it.
`DiveStartTimeField` (`components/dives/dive-start-time-field.tsx`) is the _only_ place that calls
`splitStartTime()`/`combineStartTime()`: it renders the `DateTimePicker` + `UtcOffsetSelect` pair,
splitting its single `value` prop for them to display and recombining their changes back into one
string via `onChange`. Every caller - the create/edit forms, `dive-file-import.tsx`,
`lib/validations/dive.ts`

- only ever reads/writes that one string, identical to `Dive.start_time` over the API. New dives
  default it to `nowStartTime()` (now, in the browser's own offset via
  `getBrowserUtcOffsetMinutes()` - the negation of `Date.prototype.getTimezoneOffset()`) - the best
  available guess for someone logging a dive shortly after diving it. Importing a dive-computer file
  (`normalizeParsedStartTime()` in `lib/date-time.ts`) uses the file's own embedded offset if it has
  one, and falls back to that same browser default if the file's `start_time` is naive (e.g. Suunto
  XML's `StartTime`, which has no offset at all).

## FastAPI 422 errors can be an array, not a string - never render `detail` directly

Pydantic validation errors return `detail` as an array of `{type, loc, msg, input}` objects; other
errors (duplicate name, etc.) return `detail` as a plain string. Rendering the array directly in JSX
crashes React ("objects are not valid as a React child"). Every error-handling call site uses
`getApiErrorMessage()` (`lib/api/error.ts`) to normalize both shapes into a displayable string - use
it for any new API call, don't reach for `error.response?.data?.detail` directly.

## The generic `CreatableCombobox` pattern

`components/ui/creatable-combobox.tsx` is a generic "pick existing or create new on the fly"
combobox. `TripCombobox` is a thin single-select wrapper that just supplies the fetch/create API
calls. `DiveSiteMultiSelect` wraps it too, but for picking _several_ dive sites (a dive can have
more than one, e.g. a drift dive that crosses named sites) - it renders `CreatableCombobox` as the
"add a site" input (always called with `value={undefined}` so it clears after each pick) plus its
own reorderable list of already-added sites above it. `GearItemMultiSelect` and `SpeciesMultiSelect`
followed. Wrap `CreatableCombobox` the same way for any further "pick or create" entity type rather
than copy-pasting the interaction logic (filtering, commit-on-blur/Enter, mouse-down-prevents-blur
for option clicks).

**Read the species picker's section before writing the next one**, though — "The species picker
resolves a pick into a catalog row before form state sees it" below. It is the only wrapper whose
pick can need a round trip before it has a value at all, and the three things that fall out of that
(a pending row held outside form state, the submit guard that stops a save racing it, and reading
the selection from a ref so two concurrent resolves don't drop each other) are not visible from this
section or from the two synchronous wrappers. A pointer rather than a summary, so there is only one
place for it to be wrong.

## Every dive form picker searches server-side

`DiveSiteMultiSelect`, `TripCombobox` and `GearItemMultiSelect` each used to page through the user's
_entire_ list before their dropdown was usable, so a diver with a few hundred logged sites paid
several sequential round-trips on every dive form open. (`TripCombobox` didn't even loop - it
fetched one page of 100 and dropped the rest silently, so a 101st trip couldn't be selected at all.)
All three now pass `CreatableCombobox`'s `onSearch`: one request for 25 matches when the menu opens,
and one more per debounced query. See the backend `DECISIONS.md` for which columns each endpoint
matches.

`CreatableCombobox` therefore has two modes. Pass `items` for a list small enough to ship to the
browser (it filters locally, by name); pass `onSearch` for one that isn't. In remote mode the
component deliberately does **not** re-filter what came back - the server may have matched on a
field the local filter can't see (a site's location, a gear item's brand), and re-filtering on the
name would empty a correctly-filled menu. Related pieces, all of which exist because the browser no
longer holds the full list:

- `excludeIds` (rather than the caller filtering inside `onSearch`) hides already-picked items, so a
  pick disappears from the menu immediately instead of at the next query.
- `selectedItem` supplies the option behind `value` for a remote-mode _single_-select.
  `TripCombobox`'s own results only cover the current query, so without it the input sits empty for
  a trip loaded from the form rather than picked in this session.
- `noMatchesLabel` is separate from `noItemsLabel`: "no gear yet" is a different (and, once
  filtered, false) statement from "none match 'scub'".
- The `hasMore` flag from `onSearch` renders a "keep typing to narrow" footer. A silently truncated
  page otherwise reads as the user's whole catalogue.
- `onSearch` is held in a ref, so an inline arrow - the obvious thing to write - doesn't restart the
  search on every render.
- The debounce is skipped for the empty query the menu fires on open: there was no keystroke to
  coalesce, and a quarter-second blank menu is the lag this was meant to remove.

Each picker tracks the records behind its _selections_ separately from the dropdown, since a picked
item drops out of the results as soon as the query changes. All three fill that map the same three
ways: from a `known*` prop where the caller already has the records (the edit page passes
`dive.dive_sites` and `dive.gear_items`), from **every** result its own `onSearch` returns, and -
only as a fallback - by fetching the record by uuid one at a time. Three things worth knowing about
that:

- The `known*` prop is read _through_ rather than copied into state by an effect: the copy hasn't
  landed on the render that first sees a selection, so the fallback would fire for records the
  caller had already handed over.
- The fallback isn't dead weight. It names a site pre-selected by uuid alone via
  `/dives/new?dive_site_uuid=...`, and it's the only way _archived_ gear renders properly - an older
  dive can legitimately reference retired kit, which the dropdown deliberately never offers, so it
  can only ever arrive by uuid.
- Those lookups have a `requestedRef` guard but **no cancellation flag**, which looks like an
  oversight and isn't. The guard fires each uuid exactly once, so under StrictMode's
  mount/unmount/remount the only in-flight request belongs to the discarded first mount - honouring
  `cancelled` in the cleanup drops the name for good, which is exactly the bug that shipped and had
  to be undone. Writing to a uuid-keyed map is idempotent, so a late arrival is always safe to
  apply.

`fetchAllGearSets` still pages through everything, and that's fine: the dive form's set switcher is
a client-side-filtered dropdown and sets are few per user. Only the item-level pickers had a list
that grows without bound.

## Duration is a free-typed, regex-validated "MM:SS" string in the form

`Dive.duration` on the API/`Dive`/`DiveCreate`/`DiveUpdate` types is always seconds, but the dive
**form** field holds a plain `"MM:SS"` string (e.g. `"45:30"`), exactly like `start_time` holds a
`"YYYY-MM-DD HH:mm:ss"` string - see `dateTimeField()`/`durationField()` in
`lib/validations/dive.ts` for the matching pattern (required, regex-validated, no `.transform()` per
the Zod rule above). The user can type anything into the plain `<Input>`; Zod's `durationField()`
regex (`^\d{1,3}:[0-5]\d$`) is the only validation, surfaced via the normal `<FormMessage />` -
there's no live reformatting/auto-correction as they type (an earlier version tried that with a
dedicated `DurationInput` component and local text-buffer state; it was simpler to just validate the
raw string like every other form field).

Conversion to/from the API's seconds representation happens right before submit / right after fetch
via `parseFormDuration()`/`formatDurationForForm()` in `lib/date-time.ts` (mirroring
`parseFormDateTime()`/`formatDateTimeForForm()`). If a duration ever needs editing elsewhere, reuse
`durationField()` + those two helpers rather than re-deriving minutes from seconds inline (the dive
form used to do that with a single "total minutes" number input, which lost sub-minute precision on
read - e.g. a 45:30 dive displayed and round-tripped as 46 minutes).

## Occasional `.next` cache corruption during builds

`npm run build` has intermittently failed with unrelated-looking errors (`ENOENT` on `.nft.json`
trace files, `Cannot find module for page: /some-route`) that have nothing to do with the code just
changed - confirmed by TypeScript compiling/linting successfully every time this happened. Fix:
`rm -rf .next && npm run build`. If a build fails in a way that doesn't match the actual diff you
just made, try this before assuming the code is broken.

## Layout width convention

Every page rendered inside the shared chrome uses `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8` for its
content container width (matching the profile page, which was the reference chosen). The landing
page (`/`) is exempt - it's built from several full-bleed alternating sections, a fundamentally
different layout pattern. The dive/trip/dive-site "new"/"edit" forms are also exempt - they
intentionally use a narrower `max-w-2xl` since they're single-column forms.

This is purely a content-width choice, not a chrome one: `Header`/`Footer` are no longer rendered
per-page (see the `AppShell` entry below), so the "new"/"edit" forms _do_ sit inside the shared
header/footer now - they just constrain their own inner content to `max-w-2xl` instead of
`max-w-6xl`.

## `Header`/`Footer` live once in `AppShell`, not per-page

`components/layout/app-shell.tsx`, mounted near the root of `app/layout.tsx`, renders
`Header`/`Footer` around `children` for every route except a hardcoded `NO_CHROME_ROUTES` list
(currently just `/signin`/`/signup`, which render their own standalone centered-card layout). Pages
used to each import and render `Header`/`Footer` themselves, passing `currentPage`/
`showDashboardActions` props - that duplicated the chrome JSX on every page and, worse, meant
`Header`/`Footer` fully unmounted and remounted on every navigation (visible jank, plus any
header-local state resetting).

`Header` no longer takes `currentPage`/`showDashboardActions` props - it calls `usePathname()`
itself and derives the active nav item from the `NAV_SECTIONS` prefix table in `header.tsx`. Adding
a new top-level nav item means adding a `{ prefix, page }` entry there, not threading a new prop
through every page.

If a new route needs to opt out of the shared chrome (e.g. another standalone/full-bleed page like
`/signin`), add its path to `NO_CHROME_ROUTES` in `app-shell.tsx` rather than trying to suppress
`Header`/`Footer` from within the page itself - there's no longer a per-page mechanism for that.

## Shared list-page pattern: `useAuthGuard` + `usePaginatedResource` + `useDeleteResource`

The dives/trips/dive-sites list pages (`app/dives/page.tsx`, `app/trips/page.tsx`,
`app/sites/page.tsx`) used to each hand-roll the same ~100 lines: an auth-redirect effect,
fetch-on-mount + pagination state, a native `confirm()` + delete + toast + refetch flow, and a
"Showing X to Y of Z" footer. That's now factored into three hooks plus two shared components - any
new paginated/deletable resource list should reuse them rather than re-deriving the pattern:

- `hooks/useAuthGuard.ts` - redirects to `/signin` once the auth check settles and the user isn't
  signed in (mirrors `useRedirectIfAuthenticated` for the opposite case: public-only pages
  redirecting _signed-in_ users away).
- `hooks/usePaginatedResource.ts` - takes a
  `(page, perPage) => Promise<{data, total_count, has_more}>` fetcher and returns
  `items`/`isLoading`/`totalCount`/`currentPage`/`hasMore`/`fetchPage`/ `refetch`. Pair with
  `components/ui/pagination-footer.tsx` (`<PaginationFooter />`) for the "Showing X to Y of Z" +
  Previous/Next UI - it renders nothing if everything fits on one page.
- `hooks/useDeleteResource.ts` - takes a `(id) => Promise<...>` delete function and returns
  `deletingId`/`pendingId`/`requestDelete`/ `cancelDelete`/`confirmDelete`. Pair with
  `components/ui/confirm-dialog.tsx` (`<ConfirmDialog open={pendingId !== null} ... />`) instead of
  the blocking native `confirm()` - it's stylable, testable, and doesn't freeze the tab.

Wire `usePaginatedResource`'s `refetch` as `useDeleteResource`'s `onDeleted` so a successful delete
refreshes the current page.

## Access token lives in memory only, never in `localStorage`

`lib/api/client.ts` used to store `access_token` in `localStorage`, which any JS running on the page
(XSS, a compromised dependency, a browser extension, an error-reporting SDK that serializes storage)
can read directly via `localStorage.getItem`. The refresh token was already safe (`httponly`,
`secure`, `samesite=lax` cookie set by the API - see `login.py`), so only the access token needed
fixing.

It's now a plain module-scoped variable in `client.ts`, exposed via
`getAccessToken`/`setAccessToken`/`clearAccessToken` - not React state/context, since the request
interceptor just needs the latest value at request time, not a re-render. Because it's in-memory
only, it doesn't survive a page reload, so `AuthContext`'s bootstrap effect calls
`refreshAccessToken()` (POST `/auth/refresh`, re-deriving a token from the httpOnly cookie) on every
mount instead of checking `localStorage` for a cached token. `authAPI.isAuthenticated()` now just
reflects whether the current tab happens to hold a token in memory right now, not whether the user
has a valid session overall - use `refreshAccessToken()` for that.

Note this only protects against _passive_/out-of-band token exfiltration (storage-scraping malware,
other scripts reading storage later, etc.) - a _live_ XSS payload executing in the page can still
just call `/auth/refresh` itself and ride the session for as long as the page stays open, since the
browser attaches the httpOnly cookie automatically. Actual XSS prevention (escaping, CSP - see
below) is what closes that gap, not token storage choice alone.

## `NEXT_PUBLIC_API_URL` is the full base, `/api/v1` included - not an origin

The variable is handed straight to axios as `baseURL` in `lib/api/client.ts`, and every
`lib/api/*.ts` module passes route-relative paths (`/dives`, `/user`) on top of it. The API mounts
its whole surface under `/api/v1` (`APIRouter(prefix="/api")` + `APIRouter(prefix="/v1")` on the
backend, not configurable), so the prefix has to be part of the variable. `.env.example` shipped it
without one for a long time, which meant a fresh clone that followed the file to the letter 404'd on
every single request - including the first sign-in, so it looked like a broken auth flow rather than
a misconfiguration.

The two other readers of the variable both cope with the path, in opposite ways, and that is the
part worth remembering before changing any of them:

- `src/proxy.ts` needs an _origin_ for the CSP's `connect-src` (a source expression with a path
  matches that exact path only), so it runs the value through `new URL(...).origin` and the prefix
  is discarded. That reduction now lives in `lib/api-base.ts`'s `apiCspSource`, because the value
  may also be relative, which `new URL` throws on - see the next section.
- `scripts/screenshots.mjs` reads the same variable for its own `fetch` calls and used to append
  `/api/v1` itself. Left that way, anyone with the variable exported in their shell got
  `.../api/v1/api/v1/...`; it now appends only the route, like the app does. It runs in Node with no
  page origin to resolve against, so an absolute value is the only kind it can use - which is one
  reason `.env.example` keeps the absolute URL for dev even though the deployed default is relative.

The alternative - keep the variable an origin and have `client.ts` append the prefix - was not
taken. The prefix is fixed on the API side, but the path is not: an instance behind a reverse proxy
that mounts the API under a subpath has nowhere else to say so, and `proxy.ts` was already written
around the variable carrying a path.

The variable is no longer _required_, though. It is a build-time override for a split-origin
deployment; unset, the base is the relative `/api/v1` and this app proxies it - see the next
section.

## The web app proxies `/api/v1` to the API, and that is the shipped topology

`NEXT_PUBLIC_API_URL` unset, axios' `baseURL` is the relative `/api/v1` (`DEFAULT_API_BASE_URL` in
`lib/api-base.ts`) and a catch-all route handler, `app/api/v1/[...path]/route.ts`, streams whatever
reaches it through to `API_INTERNAL_URL` (default `http://api:8000`, the compose service name;
`http://localhost:8000` under `next dev`). Everything the browser touches is one origin.

The reason is the `NEXT_PUBLIC_*` build-time trap. Those values are inlined into the client bundle
by the compiler, so a bundle built with an API address baked in only works for whoever built it -
which is why the `Dockerfile` used to hard-fail without the build-arg, and why a prebuilt image was
impossible. Nothing about the API's address is in the bundle any more; one published image runs on
any domain. Consequences, all simplifying: no CORS to configure, no cross-site request for the
`SameSite=Lax` refresh cookie to fall foul of, and `Content-Disposition` finally visible to JS
(`lib/download.ts` explains why it usually isn't).

Why a route handler rather than `rewrites()` in `next.config.js`: rewrites are evaluated when the
config is loaded and serialized into the build output under `output: "standalone"`, so a prebuilt
image would carry whatever the _builder_ had set - the same trap one layer down. Route handlers run
per request and read `process.env` then. This is the pattern Next's own self-hosting guide points at
for "one image promoted through multiple environments".

Things that are load-bearing in `lib/api-proxy.ts`, each of which was found by breaking it:

- **`Expect` must be dropped.** `undici` (the `fetch` behind route handlers) rejects the header
  outright with `UND_ERR_NOT_SUPPORTED`, so forwarding it fails the entire request. Node has already
  answered the `100-continue` by the time a handler runs, so there is nothing to forward. Browsers
  never send it - only `curl` and similar do, on large bodies - so this surfaces as "every upload
  from a script 502s" and nothing else.
- **`Accept-Encoding` must not be forwarded, and `Content-Encoding` must not be passed back.**
  `fetch` negotiates its own encoding for the hop it opens (`gzip, deflate`) and decodes the reply
  transparently, but leaves `content-encoding` on the response object. Copy the response headers
  verbatim and the browser is told to gunzip bytes that are already plain. `content-length` goes
  with it, being the compressed length of a body that no longer is. Forwarding the browser's own
  list is worse than useless: it can advertise a codec `fetch` will not decode, and then the header
  is telling the truth and stripping it is what corrupts the body.
- **`Set-Cookie` has to be re-added with `getSetCookie()`.** Iterating `Headers` joins repeats with
  a comma, and cookie `Expires` values contain one. The refresh cookie is the whole session.
- **No body for `HEAD`/204/205/304**, or the `Response` constructor throws.
- **Nothing is buffered.** `request.body` goes straight into `fetch` (which needs `duplex: "half"`
  before it will accept a stream), so a 20 MB upload arrives at the API as it is being sent. This
  holds only because `src/proxy.ts`'s matcher excludes `api/`: a request that reaches middleware has
  its body cloned into memory first, capped at Next's 10 MB default and **silently truncated** past
  it (`experimental.proxyClientMaxBodySize`). Widening that matcher would quietly break every upload
  over 10 MB.
- **The unreachable-API log names the path, never the query string.** Two precheck routes carry a
  live, single-use sign-in token as `?token=...`, and that error branch fires precisely when the
  check never reached the API - so the token is still valid at the moment it would be written. The
  API refuses to log those for the same reason.
- **`X-Forwarded-For` is passed through, not appended to.** A route handler cannot see the socket
  peer - `NextRequest.ip` was removed in Next 15 - but it does not need to: Next's own server fills
  `x-forwarded-for`, `-proto`, `-host` and `-port` from the connection when they are absent and
  leaves a front proxy's values when they are not, so the chain is already assembled by the time the
  handler runs. Copying it across is what keeps the API's ten per-IP rate limits in separate
  buckets. The API only believes that chain when its peer is listed in `TRUSTED_PROXY_IPS`, and its
  peer is _this container_, not the operator's own proxy - which the API never talks to directly. An
  install that omits it gets one shared bucket rather than a forgeable one. That is the shipped
  case, and it inverts when nothing appends: Next fills the header in only when it is _absent_
  (`req.headers['x-forwarded-for'] ??= originalRequest?.socket?.remoteAddress`, `base-server.js`),
  so a caller that sends its own arrives with it intact and its socket address never appended.
  Behind a proxy that does append - Caddy, Traefik, nginx - that is harmless: the appended entry is
  the real caller and the right-most one no listed proxy vouched for, so the API's right-to-left
  walk stops there and the forged prefix is ignored. Expose this container directly, with nothing in
  front of it, and cover it in `TRUSTED_PROXY_IPS` anyway, and the forged entry _is_ that right-most
  untrusted one - all ten limits, magic-link and contact form included, bypassable by rotating one
  header. There it is _setting_ the variable that makes the bucket forgeable, and omitting it is
  still the safe direction. Not fixable at this layer either: with no socket peer to compare
  against, an honest chain and a forged one are the same bytes, and stripping the header would merge
  every caller into one bucket on the topology that actually ships. `.env.example` carries the
  warning instead, beside where an operator meets the proxy setup.

Local dev keeps the split-origin shape: `.env` sets `NEXT_PUBLIC_API_URL` to the API's own published
port, so the route handler is never reached and `scripts/screenshots.mjs`, which reads the same
variable from Node, still has an absolute URL to fetch. Both paths are exercised - the relative
default is what CI builds, the absolute override is what dev runs.

## Strict, nonce-based CSP via `src/proxy.ts` - Node server only

`src/proxy.ts` (Next.js 16 renamed the `middleware` file convention to `proxy` - see
https://nextjs.org/docs/messages/middleware-to-proxy; the exported function is named `proxy`, not
`middleware`) generates a fresh, unpredictable nonce on every request and sets a
`script-src 'nonce-...' 'strict-dynamic'` CSP - no unqualified `'unsafe-inline'` in any browser that
understands nonces. The nonce is threaded to Server Components via the `x-nonce` request header;
`app/layout.tsx` reads it via `headers()` and passes it to `next-themes`' `ThemeProvider` (its
no-flash-of-wrong-theme bootstrap `<script>` needs a matching nonce to be allowed to run). Next.js
automatically propagates the same nonce into its own internal hydration/RSC-payload `<script>` tags
and the CSS/font preload `Link` headers once the request header is set this way - no extra wiring
needed beyond the one `nonce={nonce}` prop.

This only works because the app runs as a persistent Node server (`output: "standalone"`, see the
`Dockerfile`). Two things to know before touching this:

- Reading `headers()` in the root layout forces every route to render dynamically (`ƒ` instead of
  `○` in the `next build` output) - there is no statically-prerendered page anymore. This is an
  accepted, deliberate trade-off for the stronger CSP, not a regression to "fix".
- If the app ever moves to a static export (`output: "export"`), this entire mechanism breaks:
  `next build` explicitly lists `Proxy`, `Headers`, and dynamic APIs like `headers()` as unsupported
  there (confirmed by actually trying it - the build fails immediately, first on the `[id]` routes
  missing `generateStaticParams()`, and would fail again on `proxy.ts` even after fixing that). A
  nonce also fundamentally can't work against a static file anyway, since it must be unique per
  response and a static export serves the same bytes to everyone. If/when static hosting happens,
  this needs to be replaced with a build-time hash-based CSP or a CDN/host-level static header
  config instead - see chat history from the security-hardening session for the explored options
  (query-param/rewrite-based routing for the `[id]` pages, hash-generation postbuild script for
  CSP).
- `eslint.config.mjs` has `"react/no-danger": "error"` as a guardrail - the codebase has no
  `dangerouslySetInnerHTML` today (React's default escaping is the actual first line of defense),
  and any future use of it needs an explicit `eslint-disable` plus a sanitizer
  (DOMPurify/`rehype-sanitize`), not an unreviewed add.
- `style-src-attr` is intentionally its own directive with plain `'unsafe-inline'` (no nonce),
  separate from the nonce-gated `style-src`. Per the CSP spec, a nonce/hash in a directive disables
  that directive's `'unsafe-inline'` fallback, and inline `style="..."` attributes set by UI
  libraries (Radix's `pointer-events`/positioning styles, etc.) can't practically carry a matching
  nonce - there's no way to tag every element a third-party component renders. Inline style
  _attributes_ can't execute script in any modern browser (unlike injected `<style>`/`<script>`
  elements), so this is a narrow, deliberate relaxation; `style-src` (which governs actual `<style>`
  blocks) stays nonce-only in production.
- `style-src` itself only carries the nonce in production; in dev it falls back to plain
  `'unsafe-inline'`. Next's own dev-mode tooling - Fast Refresh, the dev/error overlay,
  webpack/Turbopack's CSS hot-injection - injects inline `<style>` tags with no nonce at all,
  unrelated to any app code (documented upstream, e.g. vercel/next.js#87343); a strict nonce here
  just breaks dev styling for reasons outside this app's control. Production never inline-injects
  CSS - it ships static, hashed `<link rel="stylesheet">` files covered by `'self'`, so the nonce
  requirement costs nothing there.
- `style-src` also lists `https://accounts.google.com` in _both_ modes. GSI's client script injects
  its own `<link rel="stylesheet" href="https://accounts.google.com/gsi/style">` into `<head>`, and
  a host source is the only thing that allows it: `'unsafe-inline'` covers inline `<style>` blocks
  only, never an external stylesheet, so the dev branch needs the entry just as much as production
  does. Without it the browser reports a `style-src-elem` violation for that URL and the real
  (invisible, click-receiving) Google button in `components/auth/google-auth-button.tsx` renders
  unstyled - it still sits under the custom visual, so nothing looks broken, which is exactly why
  this went unnoticed. The same origin already appears in `connect-src`/`frame-src`; note that
  adding a host source alongside a nonce is fine - a nonce only disables the `'unsafe-inline'`
  fallback for its directive, not host allowlisting.
- Radix components that lock body scroll (`Dialog`, `Popover`, `DropdownMenu`, ...) pull in
  `react-remove-scroll` -> `react-style-singleton`, which injects a `<style>` tag straight into
  `document.head` via raw DOM APIs - completely outside React/Next's own nonce propagation. It looks
  up a nonce via the `get-nonce` package's `getNonce()`, which only returns one if something already
  called `setNonce()` (or set the webpack-specific `__webpack_nonce__` global) in the browser.
  `src/components/nonce-provider.tsx` is a tiny client component, mounted near the root of
  `app/layout.tsx`, that calls `setNonce(nonce)` synchronously in its render body (not a
  `useEffect`) so it's guaranteed to run before any descendant's mount-time effects - React finishes
  calling every component function in the tree before committing and running effects, so this
  ordering is reliable even though the scroll lock itself only activates later (e.g. when a dialog
  opens). Without this, opening the first `Dialog`/`Popover`/etc. throws a `style-src-elem` CSP
  violation for react-remove-scroll's un-nonced style tag.

## Unified auth flow: `/signin`/`/signup` are gone, replaced by `AuthForm` on the landing page

The password-based `SignInForm`/`SignUpForm` (and their `/signin`/`/signup` pages) were removed
entirely, matching the API's move to a passwordless, single-entry-point auth flow (see the API's
`DECISIONS.md`). There is now exactly one form, `components/auth/AuthForm.tsx` - an email field, a
"Continue" button, and "Continue with Google" - and it lives directly in the landing page's hero
section (`app/page.tsx`, `#get-started`), not behind a dedicated route or a modal. `Header`'s
authenticated-out state is now a single "Sign In" button linking to `/#get-started` rather than
separate Sign In/Sign Up buttons.

Three new routes carry the rest of the flow:

- **`app/auth/verify/page.tsx`** - what the emailed magic link actually points to
  (`{FRONTEND_URL}/auth/verify?token=...`). Deliberately a page that _calls_
  `POST /auth/email/verify` from a `useEffect`, rather than the link target being that API call
  directly - an email client or link-scanner prefetching the URL only ever loads this page (a
  harmless GET), it never runs the app's JS, so it can't accidentally burn the single-use token
  before the real user clicks it. A `useRef` guard (`hasRun`) stops React Strict Mode's
  double-invoked effects in development from doing the same.
- **`app/onboarding/page.tsx`** - profile completion (name + username, email read-only), shared by
  both auth methods. It reads from `AuthContext`'s `onboarding` state, which only ever exists in
  memory (set by `verifyEmailLink`/ `signInWithGoogle` when the backend returns
  `status: "onboarding_required"`) and is never persisted - a direct page load/refresh has nothing
  to recover, so the page bounces back to `/` instead of erroring.
- **`AuthContext`** grew `onboarding`/`completeProfile`/`clearOnboarding` alongside the rewritten
  `requestEmailLink`/`verifyEmailLink`/`signInWithGoogle` - the latter two now return a `boolean`
  (`true` = signed in, `false` = onboarding started) instead of `void`, since the caller (the verify
  page, or `GoogleAuthButton`) needs to decide whether to route to `/dashboard` or `/onboarding`.

`useAuthGuard`'s default `redirectTo` changed from `/signin` to `/` - the landing page _is_ the
sign-in surface now, so there's no separate page to send signed-out visitors to. `NO_CHROME_ROUTES`
in `app-shell.tsx` changed from `/signin`/`/signup` to `/onboarding`/`/auth/verify` (the two
remaining standalone, chrome-free pages).

(Both of those are no longer true: `/signin` is back as a dedicated page and `useAuthGuard` bounces
to it again - see "`/signin` is back, and carries where the visitor was headed" below. The _form_ is
still the single shared `AuthForm`, and the landing page still hosts its own copy of it; only the
routing changed.)

Settings' "Change Password" card was deleted outright (`app/settings/page.tsx`,
`lib/validations/settings.ts`'s `passwordSchema`) - there's no password anywhere to change. Profile
editing (name/username/email) is unaffected; it was never part of the auth flow itself, just a
`PATCH /user/{uuid}`.

### `GoogleAuthButton` talks to `google.accounts.id` directly - `@react-oauth/google` was removed

This app used to render Google's button through the `@react-oauth/google` package
(`GoogleOAuthProvider` in `app/layout.tsx`, `GoogleLogin` in `GoogleAuthButton`). It's no longer a
dependency at all - removed (`npm uninstall @react-oauth/google`) after it turned out to make one
specific, real requirement impossible to satisfy cleanly: forcing the button's language to English
regardless of the visitor's browser/Google account locale (a real bug report: a German-locale
browser saw "Mit Google anmelden", while every other string in this app - which has no i18n at all -
is always English).

The first attempt was to pass `locale="en"` to `GoogleLogin`. That did nothing. Per Google's own
docs (Sign In With Google → Display the button → "Button Language"): the button's language is only
reliably overridden by adding an `hl` query parameter to the **script URL itself**
(`https://accounts.google.com/gsi/client?hl=en`) - the `locale`/`data-locale` config value is
documented as a companion to that, not a substitute for it; the actual translated strings are baked
into the script response at load time, based on the request's `hl` param (or failing that, the
browser's `Accept-Language`/the signed-in Google session's own language). `@react-oauth/google`'s
script loader (`GoogleOAuthProvider`'s internal `useLoadGsiScript`) hardcodes the plain,
un-parameterized URL with no prop to add a query string to it - so there was no way to get the `hl`
parameter in via that library at all, short of loading a _second_ copy of the same script with
`?hl=en` ourselves alongside it. That second option was considered and rejected: both scripts would
race to define the same `window.google.accounts.id` global, and whichever `onload` fired last would
win - inherently non-deterministic, and liable to silently regress back to the wrong language
depending on network timing.

So `GoogleAuthButton` now calls the vanilla `google.accounts.id.initialize()`/ `renderButton()` JS
API itself, after loading `.../gsi/client?hl=en` with its own (deduplicated - see `loadGsiScript`'s
module-level promise) `<script>` tag - the same API `@react-oauth/google` was itself a thin wrapper
around, so nothing was lost by dropping it; this app only ever used its single, simplest feature (a
standard `GoogleLogin` button, not one-tap/auto-sign-in/the custom-button hooks). This also has a
nice side effect on the unrelated `[GSI_LOGGER]` "initialize() is called multiple times" dev warning
`@react-oauth/google` used to cause (see the previous version of this entry, and `git log` for the
full story of why `reactStrictMode` was briefly toggled off and then back on over it): this
hand-rolled version calls `initialize()` from its own effect exactly once (guarded by
`[clientId, onError]` deps and a ref for the actual callback logic, so it never needs to re-run),
and calls `renderButton()` - which is _meant_ to be called repeatedly, once per desired appearance
change - from a separate effect keyed on `[ready, width, resolvedTheme]`. The warning simply doesn't
apply to code that only ever calls `initialize()` once per script load.

Google's Sign-In button renders inside its own iframe, so it can't be reached with our own CSS at
all - only through `renderButton`'s own config options. `GoogleAuthButton` sets:

- **`theme`** - tracks `next-themes`' `resolvedTheme`: `"outline"` (a white button with a gray
  border) in light mode, matching the white card it sits on; `"filled_black"` in dark mode, matching
  the near-black card background (`--card` in `globals.css`). Using the same `"outline"` theme in
  dark mode would render a stray white box that doesn't match anything else on the page.
- **`shape="rectangular"`** - the closest of GSI's four shapes to `Button`'s own `rounded-md`
  corners; `"pill"` (fully rounded) would stand out as visibly more rounded than every other button
  on the page.
- **`text="continue_with"`** - renders "Continue with Google", matching this form's own
  "Continue"/"Continue with Google" copy instead of GSI's default "Sign in with Google" (which would
  be an odd thing to show a new user, given this one button covers both sign-in and sign-up - see
  above).
- **`logo_alignment="center"`** - centers the Google logo + text as a unit, matching how the icon
  and label center together inside our own `Button`s (e.g. the `ArrowRight` next to "Continue"),
  instead of GSI's default of pinning the logo to the left edge.

Width needed more than a static config value: GSI's `width` is a fixed pixel number (clamped by
Google itself to 200-400px), not a CSS percentage, so it can't just be told `w-full` the way the
"Continue" button above it can. `GoogleAuthButton` measures its own wrapping `<div>` (which - being
an ordinary block box in the same padded card as the "Continue" button - is exactly as wide as it,
and also `renderButton`'s own target element) via a `ResizeObserver`, and feeds that measured width
(clamped to GSI's 200-400 range) into the next `renderButton()` call, so the two buttons end up
pixel-width-matched and stay in sync if that width ever changes (e.g. the viewport being resized).

A minimal `declare global { interface Window { google?: ... } }` augmentation covers just the two
methods actually used (`initialize`, `renderButton`) - no need to pull in `@react-oauth/google`'s
(or `@types/gapi.auth2`-style) full type definitions for a two-method surface.

### The button's border radius and dark-mode outline aren't config options - GSI's own pixels can't be reached, so a wrapper draws the missing edge instead

A follow-on request: match the button's corner radius to `Button`'s own `rounded-md`, and fix how
the button visually disappears in dark mode (the `filled_black` theme has no border of its own, and
blends into the near-black `--card` background it sits on).

The first idea - reaching for a _fully_ custom-graphic button, along the lines of
[Google's "Building a button with a custom graphic" guide](https://developers.google.com/identity/sign-in/web/build-button)

- turned out to be a dead end: that guide is for the **deprecated** `gapi.auth2` library (the page
  says so explicitly), not the Google Identity Services library this app actually uses. GIS
  deliberately has no equivalent of `gapi.auth2`'s `attachClickHandler(anyElement, ...)` for the
  ID-token/credential flow - only `renderButton()` can trigger it, and it only exposes the config
  already listed above (`theme`/`shape`/`text`/`logo_alignment`/`width`) - no border-radius, and no
  way to remove the light backing chip GSI always puts behind the multicolor "G" logo on dark themes
  (it's there so the logo stays legible against a dark fill).

A fully pixel-perfect custom button _is_ still technically achievable by overlaying an invisible
(`opacity: 0`) real `renderButton()` output on top of a fully custom-styled visible button, so
clicks land on the real, invisible one - but that was set aside for now: making the real interactive
button invisible also makes its native keyboard-focus ring invisible, a real accessibility
regression that would need extra work to paper over convincingly.

What shipped instead, as the safer option: a `border border-input rounded-md overflow-hidden`
wrapper around GSI's own rendered button (`GoogleAuthButton`), matching `Button`'s own outline
styling. This doesn't touch GSI's own pixels at all - it just draws a visible edge around whatever
GSI renders inside (fixing the actual dark-mode complaint: the button having no boundary at all
against the card), and `overflow-hidden` neatly clips GSI's own (very slightly rounded
"rectangular"-shape) corners flush with our own `rounded-md` corner underneath. The light
logo-backing chip in dark mode is unaffected either way - it's GSI's own pixels, inside the border,
not something a wrapper can reach - and is left as an accepted, common trait of Google's own
dark-themed button (see plenty of other sites' dark modes) rather than something worth the
accessibility trade-off above to fully eliminate.

### `colorScheme` on the render target, kept in sync with `resolvedTheme` (not hardcoded to `"light"`)

A reasonable follow-up question, prompted by
[a Medium post](https://medium.com/@ludvig.flyckt/fixing-the-react-google-auth-button-background-in-dark-mode-150e12220256)
describing a real `@react-oauth/google` dark-mode fix: wrapping the button in a
`<div style={{ colorScheme: "light" }}>`. That post's fix is for a _different_ symptom than the
logo-backing chip above, though: it's for sites that always want a light-styled Google button
(`theme="outline"`/`"filled_blue"`) but see the surrounding iframe/UA chrome pick up a stray dark
background regardless - `color- scheme` is a real CSS property (distinct from GSI's own `theme`
config) that hints to the browser which UA-native rendering defaults (initial/unstyled backgrounds,
form-control chrome, etc.) to use, and this app set it nowhere at all, leaving it to the browser's
default OS-preference-based inference - which has no guaranteed relationship to _this app's own_
manually-toggled dark/light state (`next-themes` is a `class`-based toggle, entirely independent of
the OS's `prefers-color-scheme`, so a visitor's OS could easily disagree with what this app is
currently showing).

At the time, `GoogleAuthButton`'s render target was set to
`colorScheme: resolvedTheme === "dark" ? "dark" : "light"` - kept explicit and in sync with the same
`resolvedTheme` driving GSI's `theme` config then, rather than left to a browser/OS guess that may
or may not agree with it (a reasonable change to make regardless of what it does or doesn't fix
visually, since there's no reason for a UA-level rendering hint to ever disagree with what the app
already knows), while flagging that it wasn't expected to touch the logo-backing chip - that's an
explicit background GSI's script draws for contrast against a solid fill, not an
unstyled/transparent region deferring to a UA color-scheme default.

That prediction held: the chip was still there after shipping it. See the next entry for what
actually resolved this.

### Resolution: `theme` is always `"outline"`, regardless of the app's own light/dark mode

With the logo-backing chip confirmed as genuinely unreachable (not a CSS/config issue - see both
entries above), the two remaining options were: (1) accept a fully custom button via the
invisible-`renderButton()`-overlay trick from above, accessibility trade-off included, or (2) stop
trying to make GSI's button itself look dark at all, and just show the same clean, fully-`"outline"`
(light) button in both of this app's themes - trading an exact dark-mode match for a button that's
simply, consistently correct-looking everywhere. Option 2 shipped first, as the cheaper, zero-risk
change - `GoogleAuthButton` no longer reads `resolvedTheme`/`next-themes` at all, since
`theme: "outline"` and `colorScheme: "light"` are now both unconditional. This is a genuinely common
pattern - plenty of sites keep Google's button light regardless of their own site's theme, rather
than fight GSI's limited dark-theme options.

The `border border-input rounded-md overflow-hidden` wrapper (see above) still earns its keep even
with an all-light button: `outline` theme's own border color is a fixed light gray that would
otherwise contrast poorly against this app's dark `--card` background at the seam where GSI's iframe
meets our own layout; the wrapper's border (drawn in our own `--input` color, which _does_ adapt to
dark mode) keeps that edge visible and consistent in both themes.

If a truly dark-native button (no light patches anywhere) becomes worth the accessibility trade-off
later, the fully custom overlay approach from above is still the one documented path to get there.

### Resolution, take two: the fully custom overlay button, with the focus-ring trade-off actually mitigated

The all-`"outline"` button above shipped first as the cheap, zero-risk fix, but was revisited in
favor of the fully custom button after all: `GoogleAuthButton` now renders its own `Button`-styled
visual (own inlined "G" logo - `components/google-icon.tsx`, see the next entry for exactly where
that came from - exact `rounded-md` corners, follows the app's theme like any other button) with
GSI's _real_ `renderButton()` output stacked exactly on top of it at `opacity: 0`. Clicks land on
the real, invisible button; nobody ever sees its actual pixels, so none of GSI's
theme/shape/logo-chip limitations matter anymore - only its _size_ (via `width`, still measured the
same way as every earlier version) and its role as the click/keyboard target.

The accessibility concern flagged when this option was first raised - making the real interactive
element invisible also hides its native focus ring - turned out to have a clean, pure-CSS
mitigation: `:focus-within`/`:hover` (and `:has()`) match an ancestor whenever _any_ descendant
matches, including a descendant that's a focused/hovered cross-origin `<iframe>` (browsers treat a
focused iframe as matching `:focus`/`:focus-visible` on the iframe element itself, which is enough
for these ancestor-matching pseudo-classes to pick it up, no JS required). So the visible and
invisible buttons share one `group`-marked wrapper, and the _visible_ decorative button's
hover/focus-ring styling is driven by Tailwind's `group-hover:`/`group-has-[:focus-visible]:`
variants - reacting correctly to interaction with the real (invisible) button, without ever touching
it directly.

The first version of this used `group-focus-within:`, not `group-has- [:focus-visible]:`, for the
ring - and immediately showed an unwanted bright ring after an ordinary _mouse click_, not just
keyboard Tab navigation. That's exactly what `:focus-within` is defined to do (match on _any_ focus,
mouse- or keyboard-triggered alike) - the same thing `:focus` (as opposed to `:focus-visible`) does
on a plain element, and precisely why native `<button>`s use `focus-visible:` rather than `focus:`
for their own ring in this codebase (see `buttonVariants` in `components/ui/button.tsx`).
`group-has-[:focus-visible]:` (Tailwind's `has-*` arbitrary-variant syntax, generating
`.group:has(:focus- visible) *`) is the ancestor-matching equivalent of that same distinction - it
only matches when the browser judges the underlying focus as keyboard-driven, rather than on every
focus. The ring classes
(`group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-ring group-has-[:focus-visible]:ring-offset-2`)
otherwise intentionally mirror `Button`'s own `focus-visible:` styling exactly, for the same visual
result.

The decorative visual button is `aria-hidden="true"` with `pointer-events-none` (defensive - the
real button's higher `z-10` already guarantees it receives every click regardless) - only the real
button is ever exposed to assistive tech, and it carries its own correct accessible name from GSI's
`text: "continue_with"` config, matching what's shown visually.

### `google-icon.tsx`'s "G" mark is extracted directly from Google's own pre-approved asset download - not hand-reconstructed

The first version of `components/google-icon.tsx` used the classic, flat 4-quadrant "G" (solid
`#4285F4`/`#34A853`/`#FBBC05`/`#EA4335` fills) - the long-standing mark, and still byte-accurate for
_that_ version of the logo. But Google's current
[Sign in with Google branding guidelines](https://developers.google.com/identity/branding-guidelines)
specifically require "the standard color **gradient** super G logo" - Google refreshed the mark
itself on May 12, 2025 from flat quadrant fills to an actual gradient blend between them, and the
branding guidelines page mandates that current version specifically ("Don't ... use an outdated
Google 'G' for the button").

Getting the _exact_ current asset mattered enough here to not guess: this tool's `fetch` can extract
readable text from HTML pages, but not raw SVG/binary file contents (tried several direct asset URLs
first - all came back as unparseable/ empty), so there was no way to byte-verify a
hand-reconstructed gradient against Google's real one from this environment alone. The actual fix:
the user downloaded Google's own pre-approved icon bundle directly from the branding guidelines page
("Download Pre-Approved Brand Icons") and pasted one of the SVGs in - the dark-theme, pill-shaped,
icon-only, Android+Web variant.

That file is a full pre-styled _button_ (pill-shaped `#131314` background, `#8E918F` stroke, plus
the "G" mark), not just the logo mark alone - only the logo needed extracting, since this app's
button already supplies its own background/border/shape (and per the guidelines, the "G" mark's own
color is fixed regardless of button theme, so pulling it from the dark-theme download specifically
doesn't matter - light/dark/neutral variants all use the identical mark). What got kept, verbatim:
the mask path that traces the actual "G" letterform, and the entire gradient-producing layer it
masks - a CSS `conic-gradient()` (rendered via a `<foreignObject>`, since SVG has no native
conic/angular gradient paint server) plus several soft, blurred colored ellipses layered on top for
the same painterly color blending Google's own asset uses, rather than a flat conic sweep. What got
dropped: the pill background/stroke paths, and Figma-export-only metadata
(`data-figma-gradient-fill`, `data-figma-skip-parse`) that browsers never read and JSX can't cleanly
hold anyway. The outer `viewBox` was cropped from the original `0 0 40 40` (the whole button, mostly
empty space around the mark) down to `10 10 20 20` (the mark's own bounding box) - safe to do
without recomputing any of the inner coordinates, since a `viewBox` change only changes which region
of the same coordinate space is visible/scaled, and the mask already confines everything to the "G"
shape regardless of how far the gradient/blur layers extend past it.

The original file hardcodes its mask/clip-path/filter `id`s (safe only because it's a lone,
standalone SVG file, never composed with anything else) - since `GoogleIcon` is a React component
that could in principle render more than once on a page, every one of those ids is namespaced
through `React.useId()` instead, so multiple instances (however unlikely in practice) can never
collide.

One real bug from the first pass at this extraction: the icon rendered as almost solid black, with
only a sliver of color peeking through at the edges. Root cause - the root `<svg>` in Google's
original file carries `fill="none"` as a presentation attribute, and `fill` is inheritable in SVG;
that root-level `none` is the only reason the small fallback `<path>` sitting alongside the
conic-gradient `<foreignObject>` (present purely for Figma's own re-import - its
`data-figma-gradient-fill` attribute is metadata Figma reads, not something any browser renders)
stays invisible. Rewriting this as a React component and dropping that root `fill="none"` (along
with the Figma-only metadata attributes) left that fallback path with no `fill` of its own, so it
fell back to SVG's actual initial value - solid black - and painted right over the gradient beneath
it, in document order. Restored by adding `fill="none"` to `GoogleIcon`'s own root `<svg>`, matching
the original.

Remaining trade-offs, accepted: this relies on the real and decorative layers staying pixel-aligned
(both simply fill the same `relative` wrapper via `inset-0`, so this only breaks if that structure
changes), and on browsers' focused-iframe-matches-:focus behavior, which is old, stable, and
consistently implemented, but still an assumption about GSI's internals rather than a documented
contract with Google.

## Changing your account email is a request/confirm flow, not a plain field edit

`lib/validations/settings.ts`'s `profileSchema` no longer has an `email` field - matching the API
dropping it from `UserUpdate` entirely (see the API's `DECISIONS.md`). `app/settings/page.tsx`'s
profile form only ever touches name/username now; email lives in its own
`components/settings/EmailChangeCard.tsx`, a small request/confirm UI: enter a new address, submit
(`authAPI.requestEmailChange`), get back the same generic "check your new email" message regardless
of whether that address is already taken by someone else, and the change only actually applies once
the emailed link is confirmed. `requestEmailChange` takes only `newEmail` - the backend's
`POST /user/email-change/request` always operates on the caller's own account (from the access
token), so `EmailChangeCard` doesn't need (and no longer takes) a `userUuid` prop.

`EmailChangeCard` used to hide the "new email" field behind a "Change email" button (an `isEditing`
toggle) - removed in favor of always showing the field and a single full-width "Send confirmation
link" button, matching the Profile Information card's always-visible form (and its full-width "Save
Changes" button) next to it, and avoiding an extra click for what's usually a rarely-used but still
one-step action. There's no separate "Cancel" button either - with the field always visible, there's
no edit mode to cancel out of; a mis-typed address is just overwritten or left as-is. Both settings
cards (`app/settings/page.tsx`'s Profile Information card and `EmailChangeCard`) use the same
`flex flex-col h-full` (card) / `flex flex-col flex-1` (content/form) / `flex-1` (fields wrapper)
structure so their action buttons land at the same vertical position regardless of how much taller
one card's field list or inline alerts make it - the fields wrapper absorbs the extra height and the
button stays pinned to the bottom of the (grid-stretched, so equal-height) card, rather than
trailing directly after the last field the way it did before.

That confirmation link points at `app/settings/confirm-email/page.tsx` - structurally similar to
`app/auth/verify/page.tsx`. It's in `NO_CHROME_ROUTES` for the same reason `/auth/verify` and
`/onboarding` are - a standalone, centered-card confirmation screen, not a page meant to sit inside
the normal app chrome. On success it calls `refreshUser()`, which is a harmless no-op unless the
visitor happens to still be signed in on that same browser/tab (the link is just as likely to be
opened elsewhere, e.g. a different device's mail app).

### Both magic-link pages require an explicit click before the verifying `POST` fires

A real user reported clicking a confirmation link and seeing "invalid or expired", despite their
email having actually changed in the DB. Root cause: many mail clients (Outlook/Microsoft Defender
"Safe Links", iOS Mail's rich link previews) render links using a real, JS-executing browser to
generate a preview/security-scan _before_ a human clicks them, which - when both pages auto-verified
from a `useEffect` on load - silently consumed the token first.

Two other fixes were tried and abandoned before landing here:

- A same-browser "pairing" cookie (paired at request time, checked at verify time) to tell a scanner
  apart from the real user - rejected because requesting a link on one device/browser and opening it
  from another (e.g. laptop -> phone's mail app) is a completely normal, common flow, not a corner
  case; pairing would've punished it as if it were suspicious.
- Auto-verifying unconditionally on load, relying solely on the backend's idempotent-reuse handling
  (see below) to paper over a scanner having already consumed the token - genuinely zero-click, but
  still lets automation silently trigger the _real_ sign-in/email-change before a human ever acts,
  which is the actual thing being protected against, not just the confusing error message.

The fix that stuck mirrors what the sign-up flow already gets "for free": completing a _new_ account
requires a real person to fill in and submit the profile-completion form (`/onboarding`) - something
automation won't do - so no sign-in/account-creation ever happens without genuine user interaction.
`/auth/verify` and `/settings/confirm-email` now apply the same principle to the other two flows:
both render a `"ready"` state with a plain button ("Sign in" / "Confirm email change") and only call
`verifyEmailLink`/`verifyEmailChange` from that button's `onClick`, never automatically. A
preview/scan can load and render the page, but it can't fake a real click, so the token isn't
touched - and no session is issued, no email is changed - until an actual person acts.

The backend's idempotent handling of an already-used-but-not-invalidated token (see the API's
`DECISIONS.md` - `AuthenticationRequest.used_at` vs. `invalidated_at`) is still in place and still
useful (e.g. a double click, or a slow network retry), but is defense-in-depth layered under the
click requirement, not a substitute for it.

Once `/settings/confirm-email` reaches its `"success"` state, it auto-redirects to `/settings` after
a 3s `setTimeout` (cleaned up on unmount/state change) - there's nothing more to do on this
standalone confirmation page once the change is applied, so it sends the user back on its own rather
than leaving them stranded there. The "Back to settings" link stays visible too, for anyone who
wants to leave sooner. `/auth/verify` doesn't need this: a successful sign-in already navigates
itself, via `router.replace("/dashboard")`/`"/onboarding"`, right after `verifyEmailLink` resolves.

### The button itself shouldn't show for a link that's already been used

Follow-on report: pressing the browser's **back** button after already confirming an email change
lands back on `/settings/confirm-email` with the "Confirm email change" button still there, and
clicking it again "succeeds" (the backend's idempotent-reuse leniency treats it as a harmless
repeat - see the API's `DECISIONS.md`). That leniency is meant for races, not for making a stale,
already-actioned link look repeatedly actionable to a human revisiting it.

Both pages now call a new, side-effect-free precheck on mount - `authAPI.checkEmailLink`/
`checkEmailChangeLink` (`GET /auth/email/verify/check` / `GET /user/email-change/verify/check`) -
_before_ ever showing the confirm button. A new `"checking"` state (distinct from `"verifying"`,
which is what happens _after_ the button is pressed) covers this brief lookup. If the link is
already used, invalidated, or expired, the page goes straight to the `"error"` state - the button
never appears at all. Only a still-live token reaches `"ready"`. A `useRef` guard (`checkedRef`)
keeps this check from firing twice under React Strict Mode's double-invoked effects - harmless
either way since the check has no side effects, but wasteful to double up on.

The check response also carries the token's target email, which both pages now surface:
`/auth/verify`'s `"ready"` state reads "Click below to sign in as `{email}`", and
`/settings/confirm-email`'s reads "...change your account's email to `{email}`". The confirm-email
page also shows the new email in its `"success"` state ("Your email address has been updated to
`{email}`"), taken from `verifyEmailChange`'s response rather than the precheck (the precheck's
`email` isn't re-read at that point).

`AuthForm`'s "Check your email" screen has a "Resend link" button gated by a client-side,
per-component 30s countdown (`RESEND_COOLDOWN_SECONDS`) - implemented as a `setTimeout` that
reschedules itself and decrements `cooldown` by one each second, rather than a mount-tied
`setInterval`, so it naturally stops at zero and restarts cleanly if a resend bumps `cooldown` back
up. This is purely a UX nicety (immediate, friendly feedback instead of a dead button) - the real
limit is server-side (`MagicLinkSettings` in the API's `core/config.py`) and is what actually
prevents abuse; a resend that races past the countdown still just surfaces whatever generic message
`RateLimitException` returns.

## Current-user endpoints moved off `/user/me`/`/user/{uuid}` onto a bare `/user`

The backend consolidated its current-user-only routes onto a bare `/user` (no `/me`, no `{uuid}` -
see the API's `DECISIONS.md`), as a first step toward separating "my account" (full data, always the
signed-in caller) from a future public-profile endpoint for _other_ users (limited fields, no
`email`, not built yet). `lib/api/auth.ts` was updated to match:

- `authAPI.getCurrentUser()` now calls `GET /user` instead of `GET /user/me`.
- `authAPI.updateProfile(profileData)` now calls `PATCH /user` and no longer takes a `userUuid`
  argument - it always operates on the signed-in caller, so the `settings/page.tsx` call site
  dropped the `user.uuid` it used to pass.

`lib/api/dive-stats.ts`'s `diveStatsAPI.getDiveStats()` was missed in the initial pass (it kept
calling the old `GET /user/${userUuid}/dive-stats`, which now 404s, rather than the new
`GET /user/dive-stats`) and was fixed afterward along with its two call sites (`dashboard/page.tsx`,
`profile/page.tsx`) - `getDiveStats()` no longer takes a `userUuid` argument either, for the same
reason `updateProfile` doesn't.

There is currently no way to fetch or manage another user's data through this API at all - that's
deliberate until the public-profile endpoint exists.

## FIT imports: one vendor-neutral label, and gas gaps filled here but declared

The API gained a `fit` parser reading Garmin Descent and Suunto's native export alike, so
`DIVE_FILE_ACCEPT` is now `.xml,.json,.fit`. Three client-side decisions came with it.

**`diveParserLabel` says "FIT export", not "Garmin FIT".** One API parser reads the FIT files of
every vendor that writes them, because FIT fixes units in a global profile rather than per
manufacturer. Naming a single vendor would mislabel the other one's dives, and the stored
`parser_key` is `fit` for both. `dives.test.ts` asserts a label for every key the API's registry can
currently emit, and `DIVE_FILE_ACCEPT` is pinned against the same list - a parser the API grows and
this list forgets is invisible rather than broken: the file simply cannot be selected in the picker.
`DIVE_PARSER_LABELS` is exported so the test can write
`satisfies Record<keyof typeof DIVE_PARSER_LABELS, string>`, which is what makes that coupling real:
a hand-written `Record<string, string>` in the test looked like it enforced this and didn't, since a
fourth parser would have compiled and passed unchanged.

**Missing gas values are defaulted here, not in the API - and the diver is told.** The API's parsers
deliberately return `null` for anything an export did not record, rather than substituting a
plausible number (see its `DiveMixtureSchema`). The form cannot hold `null` for
`volume`/`oxygen`/`helium`, so `mergeMixture` fills them from `DEFAULT_MIXTURE` - the same values a
hand-added cylinder starts with.

Doing only that would have thrown away exactly the information the API kept `null` to preserve. A
FIT file can never record cylinder size, and the 2026 Suunto Ocean export records no gas fraction
anywhere, so **every** FIT import silently claimed an 11.1 L cylinder of air. That is not cosmetic:
one cylinder plus an average depth plus both pressures is precisely `compute_gas_use`'s trigger, so
a diver who used a 15 L got an RMV about 26 % low, rendered as a derived fact, and a 32 % nitrox
dive was logged as air. So `applyParsedDiveToForm` returns what it had to invent and the import box
says so, in a line that stays on screen rather than a toast that doesn't. Pressures are never
defaulted - `""` means unknown, and 0 bar would read as an empty tank.

**`guessed` is keyed off the file alone**, and getting that wrong made the whole warning dead code
on both real forms. It first asked whether _no_ source had the value - file or carried-over
cylinder - which reads sensibly and almost never fires, because a form that already holds a cylinder
has all three values: at the time both dive pages seeded `mixtures` with a complete
`DEFAULT_MIXTURE` cylinder before any import happened, and the create form's last-dive prefill
supplies all three too. For the ordinary one-cylinder-file-against-a-one-cylinder-form case the
counts always match, so the note appeared only when the cylinder counts differed - a minority path,
and one that made it look like it worked.

That premise has since gone entirely: the create form seeds `[]` rather than a cylinder (see "The
create form proposes no cylinder, and the last one is removable" below), and the edit form seeds
`[]` for a dive that records no gas (see "The edit form submits the whole dive, because the read is
the whole dive"), so an untouched form on either page may hold nothing to consult. **The conclusion
is unchanged and the reasoning is stronger for it**, not weaker - "no source had it" is still dead
on any form the prefill filled in, on any dive that has cylinders, and on the second of two
complementary imports, which are exactly the cases the warning exists for. Do not re-derive it from
the seed; the seed is not what makes it right.

What an empty form does change is the _wording_ the same one-cylinder import gets. With no cylinder
to pair against, `volume` and `helium` genuinely fall to `DEFAULT_MIXTURE`, so the note reads "Those
are defaults" where it used to say "already on this form" - which is the more urgent of the two
sentences and, for a number the page supplied rather than the diver, the only true one.

`applyParsedDiveToForm` is tested against the pages' literal seeds rather than a hand-picked
`existing` cylinder, because the bug lived entirely in that seam: every unit test of the merge
passed, and none of them used the input the app actually produces. There are two such seeds now -
`[]` for an untouched create form and one `DEFAULT_MIXTURE` for anything the diver, the prefill or
an earlier import has filled in - and `dive-file-import.test.ts` covers both.

**The note says where the value came from, not just that it was guessed.** `mergeMixture` reports
per field whether the number now in the box came from the file, from the cylinder already on the
form, or from `DEFAULT_MIXTURE`. Importing onto a form prefilled from the previous dive keeps that
dive's gases, so the fields are _untouched_ - and "filled in as a starting point" described
something that had not happened. The sentence now reads "Those values were already on this form" or
"Those are defaults" accordingly.

This is not the unanswerable question an earlier round ruled out. "Did the diver type this or did
the form seed it?" is genuinely unknowable; "which branch of the merge ran" is something the merge
knows exactly, and conflating the two is what left the wrong wording in place.

**The note is a statement about the file, and never changes after import.** "This export doesn't
record cylinder size" is true when it appears and stays true - nothing the diver types afterwards
bears on it.

Two rounds of review pushed the other way, and both were right _given_ a note that talks about form
state: quote the live value so the figure in the field is recognisable, then track provenance so a
corrected field stops being called a default. What collapses the whole idea is the layout. The note
sits in the import card; the gas fields are **~2 200 px below it**, measured. They are never on
screen together, so a quoted figure can never be compared with the one in the box, and a sentence
that rewrites itself while the diver edits a field two viewports away is a change nobody is present
for.

That left only the cost: a snapshot of the imported cylinders, a `form.watch` subscription, an
`addressed` check, a `null`-returning `reading()` for cleared fields, and a live region
re-announcing itself once per keystroke - every one of it machinery introduced to fix a problem the
previous piece of machinery had created. Gone, along with the numbers that required it. Computed
once, at import.

If naming the specific value ever earns its place, the place for it is a hint on the field itself,
where the value and the claim about it _are_ visible together - not a sentence 2 200 px away trying
to describe one.

**`guessed` holds a per-field source, not a value.** That is what survives of the attempts to quote
one: whether each field came from the file, the form or `DEFAULT_MIXTURE` is fixed at import and is
the only thing the sentence needs.

**Helium is folded into "gas mix" when oxygen was guessed too**, and named on its own
(`helium fraction`) otherwise - a file recording neither has no gas mix at all, and "0 % helium"
adds nothing to that, while a file that recorded the oxygen would be described by a "gas mix" label
it has no business wearing.

Provenance is judged over _every_ guessed field rather than the named ones, or a defaulted helium
hides behind the label oxygen is wearing for it: the note said "already on this form" while the He
box showed a `DEFAULT_MIXTURE` 0 the diver had deliberately cleared.

**The two pressures move as a pair.** Falling back field by field let a start from the file meet an
end from whatever was on the form - a fill that never existed. It either trips `diveMixtureSchema`'s
`end <= start` refine on a field the diver never touched, or passes and hands `compute_gas_use` a
consumption spanning two different fills. The form's pressures are carried over only when the file
supplies neither.

**The live region is rendered unconditionally, `sr-only` until there is something to say.** A
`role="status"` element that mounts together with its text is typically not announced - screen
readers register the region on insertion and read _subsequent_ changes - so conditionally rendering
it reintroduced the silence it was added to fix.

The mixture mapping, note derivation and note prose live in `lib/dive-import.ts` rather than in the
component. It had reached 411 lines doing four separable things, and `src/lib/**` is where the
coverage report looks - which is where this logic, the densest in the import path, belongs.

**An import keeps what the form already held.** `replaceMixtures` swaps the array wholesale, which
was destructive once FIT arrived: Suunto's FIT carries gas mixes and no transmitter data while its
JSON carries pressures and no gas mix, so importing both for one dive is the documented way to log a
multi-gas dive - and the second import erased the first one's contribution, quietly costing the dive
its `gas_use`. `mergeMixture` now reads from the file first, then whatever sat in that cylinder's
position, then `DEFAULT_MIXTURE`. Positional pairing applies **only when the counts match**,
mirroring how the API pairs tank telemetry to gases: carrying a stage bottle's pressures onto a back
gas would produce a confidently wrong RMV, which is worse than an empty field.

Imported cylinders are also named via `getDefaultMixtureName`, as hand-added ones are. Mixture names
are never parsed, and multi-gas FIT imports are routine enough (4 of 19 dives in the API's Ocean
corpus) that leaving them anonymous is a chore repeated every dive.

(That last paragraph no longer holds: mixtures have no `name` at all now, and
`getDefaultMixtureName` is gone with it - see "The mixture `name` is gone, and position is what a
cylinder is called now" below. `mergeMixture` lost the `index` parameter that fed it; the merge
tiers this section describes are otherwise unchanged.)

## Parsed dive-file mixtures need `useFieldArray().replace()`, not `form.setValue()`

`applyParsedDiveToForm` (`dive-file-import.tsx`) filled in every top-level field from
`/dive/parse`'s response via a plain `form.setValue(...)`, but the API's `ParsedDiveSchema.mixtures`
was never applied to the form's `mixtures` field array at all - parsed gas mixtures were silently
dropped even though the backend now returns them (see the API's `DECISIONS.md` on `SuuntoJsonParser`
gas mixtures).

The fix isn't just adding a `setDiveFormValue(form, "mixtures", ...)` call: `MixtureFields`
(`mixture-fields.tsx`) renders the array via its own `useFieldArray({ name: "mixtures" })` call,
which tracks its own `fields` state (each row keyed by a generated `id`) independently of the
underlying form value. Overwriting the value directly with `setValue` doesn't reliably keep that
row-key bookkeeping in sync, so `applyParsedDiveToForm` now takes an explicit `replaceMixtures`
parameter and calls it with the parsed mixtures (converted from the API's nullable/no-`id` shape to
`DiveMixtureInput` via a small `mergeMixture` mapper) instead of replacing the array's contents
wholesale.

`ParsedDive` (`lib/api/dives.ts`) also gained a proper `ParsedDiveMixture` interface/`mixtures`
field - it was previously only implicitly typed via the catch-all `[key: string]: unknown` index
signature, which meant nothing caught this at the type level.

**Follow-up bug, and the actual fix**: the first version of `replaceMixtures` came from a _second_,
separate `useFieldArray({ name: "mixtures" })` call made directly inside `DiveFileImport`, on the
assumption that react-hook-form keeps multiple field-array subscriptions on the same
`control`/`name` in sync with each other. That assumption is wrong for shrinking: calling
`replace()` on one `useFieldArray` instance does **not** reliably shrink another separate instance's
`fields` when the new array is shorter - confirmed with an isolated repro (two
`useFieldArray({ name: "mixtures" })` calls sharing one `control`; calling `replace()` via one
instance's handle left the other instance's `fields.length` unchanged). In practice this meant:
importing a parsed file with _fewer_ mixtures than the form currently had left the extra trailing
row(s) behind instead of removing them (growing or exactly-matching counts happened to work, which
is why it wasn't caught earlier).

The real fix: there must be only **one** `useFieldArray({ name: "mixtures" })` call for the whole
form, created once at the nearest common ancestor of everything that needs it. `mixture-fields.tsx`
exports a `MixtureFieldArray` type (`UseFieldArrayReturn<MixtureFieldsValues, "mixtures">`) and a
`useMixtureFieldArray(control)` hook that creates one, already cast to that type (see the next
section for why the cast is needed and where it now lives). The two page components
(`dives/new/page.tsx`, `dives/[id]/edit/page.tsx`) call `useMixtureFieldArray(form.control)` once,
right next to their `useForm()` call, and pass the result down (now via `DiveFormCard`, see below)
to both `DiveFormFields`/`MixtureFields` and `DiveFileImport`. Neither of those two ever creates its
own `useFieldArray` anymore.

## `dives/new`/`dives/[id]/edit` pages' shared structure extracted into `DiveFormCard`/`PageHeader`/`PageSpinner`

The two dive form pages had a lot of identical structure wrapped around the genuinely page-specific
logic (loading the existing dive vs. pre-filling from the last one, the create vs. partial-update
payload shape, different labels/routes). Extracted the parts that were byte-for-byte identical (or
identical modulo a handful of string/callback props) into shared components, rather than leaving
each page to re-assemble the same JSX:

- `useMixtureFieldArray(control)` (`mixture-fields.tsx`) replaces the
  `useFieldArray<TConcreteFormType, "mixtures">({...}) as unknown as MixtureFieldArray` block (plus
  its explanatory comment) that was duplicated verbatim in both pages - the generic parameter and
  the cast now live in one place instead of two.
- `DiveFormCard` (`dive-form-card.tsx`) wraps the `Card`/`Form`/`form` + `DiveFileImport` +
  `DiveFormFields` + `DiveFormActions` block, which was identical between the two pages apart from
  `mode`, `userId`, `onSubmit`, and the three action-row strings
  (`cancelHref`/`submittingLabel`/`submitLabel`) - now the only per-page inputs left.
- `DiveFormPageHeader` (`dive-form-page-header.tsx`) wrapped the back-button + title/subtitle block
  above the card, parameterized by `backHref`/ `backLabel`/`title`/`subtitle`. It no longer exists -
  it was generalized into the resource-agnostic `PageHeader`, see the follow-up below.
- `PageSpinner` (`components/ui/page-spinner.tsx`) wraps the full-viewport `<Loader2>` spinner used
  for the auth-loading state in both pages (and `new`'s `Suspense` fallback). This exact markup is
  also duplicated across several other pages (`sites/new`, `sites/[id]/edit`, `trips/new`,
  `trips/[id]/edit`) that weren't touched here since they were out of scope - worth switching them
  to `PageSpinner` too next time one of them is touched anyway.

Each page now reduces to: its own data-loading effect(s), its own `onSubmit`, and a handful of
early-return loading/error states, followed by one `PageHeader` (`DiveFormPageHeader` at the time -
see below) + one `DiveFormCard`. The edit page's dive-not-found and in-card loading states were left
as page-local JSX (not extracted) since they're not shared with the create page at all.

**Follow-up:** this was later generalized. `DiveFormPageHeader`'s markup moved into a
resource-agnostic `PageHeader` (`components/ui/page-header.tsx`, adding an optional `actions` slot
for right-aligned buttons); `dive-form-page-header.tsx` was deleted and both dive pages now import
`PageHeader` directly instead. `sites/new`, `sites/[id]/edit`, `trips/new`, `trips/[id]/edit` were
switched to `PageSpinner` + `PageHeader` (their auth-loading spinner markup was byte-for-byte
identical to `PageSpinner`, so this is a no-op visually), and the detail pages (`dives/[id]`,
`sites/[id]`, `trips/[id]`) had their back-button + title/subtitle + Edit/Delete-button header rows
switched to `PageHeader` with `actions`. Note: the list pages (`dives`/`sites`/`trips`) and detail
pages' auth/data-loading spinners intentionally use `min-h-[60vh]` (they render below `AppShell`'s
header/footer) rather than `PageSpinner`'s `min-h-screen`, so those were left alone.

The same six pages (the three `[id]/edit` pages and the three `[id]` detail pages) also had two more
duplicated inline blocks: the `isLoading<Resource>` spinner
(`<div className="flex items-center justify-center py-12"><Loader2 .../></div>`) and the
`!<resource>` not-found state (centered message + "Back to X" button). These were extracted into
`SectionSpinner` (`components/ui/section-spinner.tsx`) and `NotFoundState`
(`components/ui/not-found-state.tsx`, taking `message`/`backHref`/`backLabel`) respectively - both
intentionally don't include the outer container `div`, since its class differs slightly between edit
pages (`container mx-auto px-4 py-8`) and detail pages
(`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8`). `SectionSpinner` is distinct from `PageSpinner`:
the former is for a loading section within an already-rendered page shell, the latter is
full-viewport for the top-level auth-loading gate.

## Mixture form/display numbers needed updating to match the API's 2-decimal precision

Once the backend started rounding parsed mixture `oxygen`/`helium`/ `start_pressure`/`end_pressure`
to 2 decimal places (see the API's `DECISIONS.md`), a few spots in the frontend that assumed coarser
precision needed fixing to actually display/accept it correctly:

- `mixture-fields.tsx`'s O₂/He/start-pressure/end-pressure `<Input type="number">`s used
  `step="0.1"`, inconsistent with `max_depth`/`avg_depth`/ `bottom_temperature` in
  `dive-form-fields.tsx` (`step="0.01"`) and the API's actual precision. Changed to `step="0.01"` to
  match.
- The "Volume (L)" field was a `<Select>` over 3 hardcoded tank-size presets (11.1/12/22.2 L). A
  parsed value that doesn't match one exactly (e.g. a D5-style JSON export's `22.0 L`, one tenth of
  a liter off from the `22.2` preset) left the select showing empty/unselected despite the
  underlying field holding a valid value. First attempted fix: inject the field's current value as a
  one-off extra `<SelectItem>` when it doesn't match a preset - this actually made things worse,
  showing a literal "NaN L" for exactly this case. Root cause: shadcn/Radix `Select`'s
  `SelectContent`/ `SelectItem`s are portal-rendered and only registered once the dropdown has
  actually been opened, so the closed trigger's `SelectValue` has no item to resolve a label from
  for a value it's never "seen" - which some path in that resolution turns into `NaN` rather than
  falling back to the placeholder.

  Fixed for good by extracting the field into its own `VolumeCombobox` component
  (`volume-combobox.tsx`), built the same way `CreatableCombobox` already is (a plain `<input>` + a
  manually-rendered absolute-positioned dropdown of `<button>`s, not Radix `Select`) - so there's no
  item-registration step to go wrong for an arbitrary value in the first place. It supports picking
  one of a curated list of common cylinder water capacities (metric steel sizes, plus common US
  aluminum cylinders labeled with both their liter capacity and familiar cu-ft-based size, e.g.
  `11.1 L (S80)`), or typing/committing any other number directly - covering parsed values that
  don't match a preset without losing the one-click convenience of the presets for the common case.
  Unlike `CreatableCombobox`, the dropdown always shows every preset regardless of what's typed (no
  filter-as-you-type)
  - there are few enough of them that filtering only gets in the way of browsing/comparing them, and
    the field also just as commonly gets its value from a click as from typing a custom number.

  Simplified further: the input is a plain `type="number"` (matching the other mixture fields)
  showing only the bare value (e.g. `11.1`, never `"11.1 L (S80)"`) - a preset's descriptive label
  is only ever shown in the dropdown, as a hint for _picking_ a preset, not echoed back into the
  input once selected. This dropped the separate text-vs-number `inputValue` state and the
  label-parsing branch in `commit()` entirely, since the displayed value is now always just `value`
  itself with no text-based round-tripping. The old custom "Clear" (X) button was also dropped once
  the input became a plain native `type="number"` - clearing via select-all+delete/backspace already
  works out of the box, so a bespoke clear affordance was redundant.

- `dives/[id]/page.tsx`'s dive-detail view displayed `mixture.oxygen.toFixed(1)}%` but
  `mixture.helium}%` with no formatting at all - inconsistent with each other, and the `toFixed(1)`
  actively hid a second decimal digit that's now a real, meaningful value (e.g. `20.99%` rendering
  as `21.0%`). Both now render the raw number, matching how `volume`/`start_pressure`/`end_pressure`
  are already displayed elsewhere in the same table.

## Gear sets are loaded into the dive form, never linked from the dive

The dive form's gear section (`components/gear/dive-gear-field.tsx`) has three parts: a "Load a gear
set..." picker, the item list itself (`GearItemMultiSelect`), and a "Save as set" button. Picking a
set **replaces** the form's `gear_item_uuids` with that set's items; from that moment the two are
independent - adding or removing an item on the dive never writes back to the stored set, and the
dive is saved with items only (the API has no `gear_set_uuid` on a dive at all - see the backend
DECISIONS.md).

Three deliberate UX choices around that:

- **Replacing a non-empty list asks first.** Loading a set into an empty list - the common case -
  stays a single click, but if the diver has already picked gear (or loaded a different set), a
  `ConfirmDialog` names what's about to be thrown away. Cheap insurance against one mis-click wiping
  a hand-built list.
- **The picker un-selects itself once the list is edited.** `GearItemMultiSelect` takes an
  `onManualChange` callback fired only on user-driven add/remove (not on a programmatic `onChange`
  from loading a set), which clears the picker's selected set. Otherwise it would keep claiming the
  dive is "Sidemount" after the diver swapped half the kit out.
- **"Save as set" reuses the set form rather than being its own flow.** `GearSetDialog` is the same
  component the gear page uses to create/edit a set; from the dive form it just gets
  `initialItemUuids` plus `allowChoosingTarget`, which adds a "Save to" dropdown offering the user's
  existing sets alongside "Create a new set". One component, one set of validation rules, two entry
  points.

## The gear picker displays archived items but won't offer them

An older dive - or a set built before a piece of kit was retired - can legitimately reference
archived gear, so `GearItemMultiSelect` has to _render_ archived items while never offering them for
a new selection. They show with an "Archived" badge and can be removed, just not newly added.

It used to square that by fetching every page _including_ archived gear and filtering the archived
ones back out of the dropdown. Now that the dropdown searches server-side it asks for
`include_archived=false` instead - retired kit shouldn't be offered, and leaving it in the results
would eat into the page of matches the user can actually pick from - and an archived selection
reaches the list the same way any other unknown uuid does, through the per-uuid lookup described
above.

New-dive prefill (`dives/new/page.tsx`) carries the previous dive's gear over - divers reuse the
same kit dive after dive - but skips archived items, since the picker wouldn't offer them for a new
dive either.

## Gear is created and edited in dialogs, not on `new`/`edit` pages

Trips and dive sites each get `/x/new` and `/x/[id]/edit` pages. Gear doesn't: `GearItemDialog` and
`GearSetDialog` handle both create and edit, and `/gear` is a single page listing items and sets
together.

A gear item is four fields (name, brand, rented, notes), and the flow that matters most is adding
one _from inside a half-filled dive form_ - navigating away to a page and back would mean either
losing that form or building draft-persistence for it. Both dialogs take an optional existing
record: passing one edits it in place, omitting one creates. `/gear/[id]` still exists as a detail
page, since it hosts the "Dives with this Gear" list that makes an item's dive count explorable.

## The gear delete dialog offers "Archive instead", and had to stop lying first

Both gear delete confirmations used to say "Dives you already logged it on keep showing it. To
retire gear without touching your log, archive it instead." Neither half held up. The API stopped
rendering soft-deleted gear on a dive read (`crud_dive_gear_items.py`) and in a set
(`crud_gear_set_items.py`), so a deleted item drops off the log entirely; and the archive it pointed
at was offered nowhere in that dialog, only behind a row action the diver had already walked past.

Both are fixed together, because the honest sentence is what makes the button worth having:

> Deleting removes this gear from your dives and gear sets. To keep it in your log and its service
> history, archive it instead. Either way, its service reminders stop.

`ConfirmDialog` grew a `secondaryAction?: { label, onClick }` for it, rendered between Cancel and
confirm. Between, not beside Cancel: leaving by it is a deliberate action rather than a way out of
one. It is disabled by `isLoading` and _not_ by `confirmDisabled` - `isLoading` means the
destructive request is already gone and there is nothing left to divert, while `confirmDisabled`
only means the dialog's own content is incomplete, which says nothing about the gentler action.

**The offer is conditional on `is_archived`.** Both pages archive through a _toggle_
(`toggleArchived` on the list, `handleToggleArchived` on the detail page), so wiring the button
straight to one on an already-archived item would unarchive it - the exact opposite of its label,
under a label that reads as the safe choice. Archived gear reaches the delete dialog through the
list's "Show archived", so this is a real path, not a theoretical one.

It also archives **directly**, skipping the separate archive confirmation the row action opens
(`handleArchiveToggle` / `setIsArchiveConfirmOpen`). Stacking a second confirmation on a diver who
is already reading one, to confirm the milder of the two things in front of them, is a dialog for
its own sake - and the copy they are reading already says what the button does.

**The reminders sentence stands on its own, and that placement is the whole point of it.** Archiving
stops service reminders exactly as deleting does - `send_gear_service_digests` filters
`GearItem.is_archived.is_(False)` alongside `is_deleted` (see the backend DECISIONS.md: silencing a
retired item's rules without having to pause each one is why). The first draft hung the clause off
the delete - "Deleting ... and stops its service reminders. To keep it ..., archive it instead" -
where both halves are individually true and the contrast between them still reads as "archiving
keeps them". That is the same shape of untruth this section exists to remove, one step subtler, so
it went the same way. "Either way" is doing real work; a future edit that reattaches the clause to
either verb reintroduces the claim. Pinned by a test.

## `ui/checkbox.tsx` is a plain `<input type="checkbox">`

Every other `ui/` primitive wraps a Radix component, but `@radix-ui/react-checkbox` isn't a
dependency and this is the app's only checkbox (the "Rented" field and the gear list's "Show
archived" toggle). A styled native input keeps focus, keyboard and screen-reader behaviour for free
without adding a package - so it takes `checked`/`onChange` rather than Radix's
`checked`/`onCheckedChange`, which is worth remembering if a second checkbox ever needs
`indeterminate` styling.

## A dialog's submit event bubbles into the form that opened it

Every "quick add" dialog - new gear item, new gear set, new dive site, new trip - is rendered _from
inside the dive form_, because the pickers that open them are dive form fields. Each dialog contains
its own `<form>`, and all four were wiring it up as `onSubmit={form.handleSubmit(onSubmit)}`.

That silently submits the dive form too. Radix portals `DialogContent` out to `document.body`, so
there are no nested `<form>` elements in the DOM and the setup looks fine - but React bubbles events
through the **React** tree, not the DOM tree, so the dialog's submit event still lands in the dive
form's own `onSubmit`. `handleSubmit` calls `preventDefault()` but never `stopPropagation()`, so
nothing stops it.

Symptom: add a gear item from the dive form and the item saves correctly, then the dive form behind
the dialog runs its own `handleSubmit`, fails validation on whatever isn't filled in yet ("Duration
is required") and scrolls to that field. Pressing Enter in any dialog input does the same thing, via
implicit submission.

`lib/dialog-form.ts`'s `dialogFormSubmit()` wraps the handler and stops propagation first:

```tsx
<form onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}>
```

**Any new dialog containing a form must use it** - the bug is invisible until the dialog happens to
be opened from inside another form, and then it presents as a mysterious validation error on a form
the user never submitted.

Verified with a throwaway jsdom test that mounted a portalled form inside an outer form: the outer
`onSubmit` fires on the inner form's submit, and stops firing once wrapped.
`lib/dialog-form.test.ts` keeps the helper's contract (stop-before-handle, event passthrough, errors
not swallowed) covered.

## Gear types are a closed vocabulary shared with the API, not free text

`GEAR_TYPES` in `lib/api/gear.ts` mirrors the API's `GearType` enum. It's a fixed list rather than a
text field so the same kind of kit is named the same way across a diver's whole list, which is what
makes the type worth showing at all.

Two details worth keeping:

- **Order is meaningful.** The array is declared in the order kit is normally listed, not
  alphabetically, and it's what drives the picker's option order - so it reads "Mask, Snorkel,
  Fins..." rather than "BCD, Boots, Camera...".
- **`gearTypeLabel()` falls back to the raw value** for a type this build doesn't know. The API can
  grow a category before the frontend ships the matching label, and rendering the slug beats
  rendering a blank cell. A test walks `GEAR_TYPES` to catch the opposite mistake - a type added
  without a label.

Type is optional. `""` is the form's "not set" state (React Hook Form re-displays a field's default
whenever its value resolves to `undefined` - see "The 'cleared field resets to default' React Hook
Form quirk"), converted to an explicit `null` on update so clearing it actually clears it, and
simply omitted on create. Radix's `SelectItem` can't take an empty string value, so the dropdown's
"No type" option uses a `__none__` sentinel - the same pattern as `GearSetDialog`'s "Create a new
set".

## `ComboboxItem.location` was renamed to `hint`

`CreatableCombobox` has always had an optional second line of text after an item's name, documented
as "purely cosmetic" but named `location` because dive sites were its only caller. The gear picker
wants the same slot for an item's type ("Apeks XTX50, Regulator") - kit often has cryptic model
names, so the category is what makes the dropdown scannable. Renamed to `hint`, which is what the
field always was.

## Drag-to-reorder uses Pointer Events and no library

The dive form's gear list is sortable by dragging its grip handle (`hooks/useDragSort.ts`). Three
choices worth keeping:

- **Pointer Events, not the HTML5 drag-and-drop API.** HTML5 DnD emits no events for touch, so a
  phone couldn't reorder at all - the app has a mobile nav, so that's not a theoretical gap. Pointer
  events cover mouse, touch and pen through one code path. The handle needs `touch-action: none`
  (supplied by the hook, so consumers can't forget it) or the browser scrolls the page instead of
  letting the drag through.
- **Move listeners go on `window`, and `setPointerCapture` is deliberately not used.** Capture is
  the obvious tool and was the first implementation, but it is wrong here: the capturing element
  sits _inside_ the row being reordered, so the moment the list rearranges React moves that row in
  the DOM, the browser releases the capture and fires `lostpointercapture` - killing the drag
  mid-gesture. It bit hardest when dragging past either end, where a swap fires immediately and the
  row was "lost" on the first movement. Window listeners don't care about the DOM moving underneath
  them, so a drag ends only on a real pointerup/cancel.
- **The dragged row is translated to follow the pointer** (`dragOffset`). Without it the row stayed
  in place until it happened to reach its destination, which reads as the drag never having started.
  The offset is re-based at each swap (`desiredTop - targetRect.top`) so the row doesn't jump by a
  row height at the moment the list rearranges, and is otherwise self-correcting: each move nudges
  by the difference between where the row is and where the pointer wants it, which survives reorders
  and reflows without tracking layout by hand.
- **A swap walks past every neighbour the row has cleared, not one per event.** A quick flick emits
  only a handful of pointermove events; single-stepping left the list crawling behind the pointer.
- **No @dnd-kit / react-beautiful-dnd.** This is one short vertical list on one screen; a drag
  library would be a dependency and a bundle for that.
- **The handle is a real `<button>` with Up/Down keyboard support.** A drag-only implementation
  quietly assumes a pointer, which would make reordering impossible for keyboard users. Its
  `aria-label` says so, since "drag to reorder" alone would be a dead end. Because rows are keyed by
  item uuid, React moves the DOM node on reorder rather than recreating it, so focus follows the
  item and repeated arrow presses keep working.

The list reorders live as the pointer crosses a row rather than only on drop, so `onReorder` fires
many times per gesture - hence `moveItem()` returns the _same array reference_ for a no-op move,
which keeps a pointermove within one row from queueing a pointless form-state update.

Swapping compares the dragged row's own centre against its neighbours' centres, not "which row is
the pointer inside?". The pointer-inside test did nothing while the pointer sat in the gap between
two rows, and tied the swap to where the pointer was rather than to where the row had visibly got
to.

`resolveSwapTarget()` is exported separately from the hook purely so it can be unit-tested: it's the
only pure logic (centre crossing, multi-step walking, parking at the ends, tolerating
not-yet-mounted refs) and testing it through simulated pointer events in jsdom would mostly be
testing stubs, since jsdom has no layout and `getBoundingClientRect` returns zeroes. The gesture as
a whole was verified in a real browser instead, against a throwaway unauthenticated page: follows
the pointer 1:1 from the first pixel, swaps at the halfway crossing with the row staying exactly
under the cursor, survives being dragged far outside the list in both directions, and leaves no
transform or lifted styling behind on release.

A second pointer going down mid-drag is ignored, or a stray finger on a touchscreen would start a
second gesture whose listeners fight the first over the same offset.

Dive sites use the same handle, and their up/down arrow buttons were removed rather than kept
alongside it: the handle already answers Up/Down when focused, so the arrows were a third and fourth
control per row doing what the grip does. Dive site order is semantically load-bearing (position 0
is the primary site, shown as "Site +2" wherever only one fits), so their handle's `aria-label`
names the position and calls out the primary slot - dragging blind is fine when order is cosmetic,
less so when it decides which site the dive is filed under.

## The combobox opens on click as well as focus, and stays open for multi-select

`CreatableCombobox` originally opened its menu only in `onFocus`. Two consequences, both reported as
bugs:

- **Picking an existing item left the picker stuck.** `handleSelect` closed the menu, but the item's
  `onMouseDown` preventDefault deliberately keeps focus on the input - so the input stayed focused
  with the menu closed. A `focus` event doesn't fire on an already-focused element, so clicking the
  input did nothing: the only way back was to click away and click in again. Adding a second dive
  site or gear item therefore took three clicks instead of one.
- Any other path that closes the menu while keeping focus (Escape, a dialog restoring focus on
  close) landed in the same dead end.

Two fixes, deliberately both:

- `onClick` on the input also opens the menu. That's the general guard - whatever closes the menu, a
  click always brings it back, with no dependence on focus having actually changed.
- `keepOpenOnSelect` keeps the menu up after a pick and clears the typed filter, so several items
  can be added in a row. Set by `DiveSiteMultiSelect` and `GearItemMultiSelect`, whose picked items
  move into the list above them. `TripCombobox` leaves it off: it fills a single field, so closing
  the menu and showing the chosen name in the input is the right outcome there.

Verified in a real browser against a throwaway page: picking an item leaves the input focused and
empty with the menu open and the picked item gone from the options, two picks land back to back with
no clicking away, and clicking an already-focused input with a closed menu reopens it.

## Dropdowns are navigable with Up/Down and Enter

Both of the dive form's dropdown implementations - `CreatableCombobox` (dive sites, trips, gear) and
`VolumeCombobox` (cylinder presets) - highlight rows with Up/Down and take the highlighted one with
Enter. They share `nextActiveIndex()`, so they move identically.

The details worth keeping:

- **The menu opens with nothing highlighted (`activeIndex === -1`).** Enter then keeps its original
  meaning - commit the typed text, which is what matches an exactly-typed name or creates one via
  `onCreate` - rather than silently picking whichever row happened to be first. Down enters the list
  from the top, Up from the bottom.
- **Movement clamps rather than wrapping.** Running off the end of a long list and silently
  reappearing at the other end is disorienting.
- **The "Add new..." row is option 0, not a special case.** It's a row in the menu like any other;
  skipping it would make it the one thing in the list you can't reach by keyboard.
- **Typing resets the highlight**, since re-filtering would otherwise leave the index pointing at a
  different row than the one being looked at. Hovering with the mouse moves the highlight too, so
  mouse and keyboard can't end up disagreeing about which row is active.
- The input carries `role="combobox"` + `aria-expanded`/`aria-controls`/ `aria-activedescendant`,
  and rows carry `role="option"`/`aria-selected`, so a screen reader follows the highlight without
  focus ever leaving the input. The highlighted row is scrolled into view (`block: "nearest"`) - the
  menu is only 15rem tall, so arrowing down a long list otherwise walks off the bottom.

One deliberate behaviour change: `VolumeCombobox`'s input is `type="number"`, where Up/Down natively
step the value by `step` (0.01 here). Navigating the preset list is the far more useful binding and
nudging a volume by a hundredth of a litre isn't something anyone reaches for, but it _is_ a
change - if the stepping is ever wanted back, that's the one dropdown to reconsider.

## Weight sits with the gear, not with the environment readings

`weight` (kilograms of ballast, a plain per-dive number on the API's `Dive` - see the backend
DECISIONS.md for why it isn't a gear item) is rendered directly below the gear picker in
`DiveFormFields`, and inside the "Gear" card on the dive detail page - not alongside Bottom
Temperature/Visibility.

The split the form makes is _what the diver observed_ vs. _how the diver was configured_: depth,
temperature, visibility, water type and altitude are facts about the dive and the water it was in,
while gear and weight are choices carried into it. Weight is also the field a diver most often looks
up in an old log precisely to check it against the suit and cylinder they were using, so it wants to
be next to them.

Two follow-on details:

- **The detail page's Gear card renders when _either_ is present.** `hasGearInfo` is
  `gear_items.length > 0 || weight != null`, mirroring `hasEnvironmentInfo` above it - a dive can
  have a recorded weight and no itemized gear (or gear and no weight), and neither should hide the
  other.
- **`dives/new` pre-fills it from the last dive**, alongside the gear list and mixtures. Weight is a
  property of the kit and exposure suit, so it rarely changes between consecutive dives; the same
  reasoning that carries the gear over carries the weight.

Zod uses `min(0)` rather than `positive()` (unlike the depths), matching the API's
`ck_dive_weight_non_negative`: zero is a real entry, distinct from an omitted one.

## Loading a gear set fills in the dive's weight too

A `GearSet` carries an optional `weight` (kg) - the ballast the diver normally uses with that
configuration - and picking a set in the dive form applies it alongside the item list. The dive
keeps its own copy from then on; the set is never linked (see "Gear sets are loaded into the dive
form, never linked from the dive").

Three rules make this predictable:

- **A set with no weight changes nothing.** `applySet` only calls `onWeightChange` when
  `set.weight != null`. A set that doesn't record a weight isn't asserting "dive with zero lead", so
  it leaves the field alone. This is also why `gear_set.weight` is nullable rather than defaulting
  to 0 - see the backend DECISIONS.md.
- **The weight isn't separately guarded by the replace confirmation.** The `ConfirmDialog` still
  fires on a non-empty item list only, and the set's weight rides along with the items. An earlier
  version also confirmed when the set would overwrite a weight the diver had typed, and named
  whichever was at stake in the dialog copy - about 18 lines to protect one visible number that
  takes a second to retype. The item list earns a confirmation because rebuilding eight hand-picked
  items is laborious; a single number doesn't.
- **"Save as set" carries the dive's weight into the dialog.** `initialWeight={weight}` mirrors
  `initialItemUuids={value}` - whatever is on the dive is the obvious default for the set being
  saved from it.

`DiveGearField` therefore takes `weight`/`onWeightChange` props even though it doesn't render the
input. In `DiveFormFields` the gear `FormField` is **nested inside** the weight one so both `field`
objects are in scope: the alternative, registering `weight` twice (once via `useController` for the
set logic, once via `FormField` for the input), works in react-hook-form but leaves two
subscriptions to the same name for no benefit.

## Service status is derived in the browser, because a cached "days remaining" is a lie

The API deliberately never returns a service status for a gear item - only clock-stable facts:
`next_due_on`, `next_due_at_dive_count`, `last_service_on`, plus the item's existing `dive_count`.
Status depends on _today's date_, and the API's single-gear-item cache is an hour long (the list is
60s), so a server-computed "due in 1 day" would still say "due in 1 day" tomorrow morning.

So `serviceStatus()` in `src/lib/gear-service.ts` does that arithmetic here, at render time, where
"today" is always actually today. It's a near-line-for-line twin of `service_status` in the API's
`services/gear_service.py`, which exists solely for the reminder email - the one consumer with no
browser. The constants are named identically on both sides (`SERVICE_DUE_SOON_DAYS = 30`,
`SERVICE_DUE_SOON_DIVES = 10`), so a single `grep SERVICE_DUE_SOON` finds the pair; change one and
you must change the other.

Both interval arms are evaluated and the more urgent wins, which is what implements "annually or
every 100 dives, whichever comes first". `worstServiceStatus()` collapses an item's schedules into
the one badge shown in the gear list, and returns **`null`** rather than `"ok"` when there are no
schedules at all - nothing being tracked is not the same as everything being fine, and
`ServiceStatusBadge` renders that as a muted dash.

## `lib/gear-service.ts` holds the logic, `lib/api/gear-service.ts` holds the transport

Two modules with almost the same name, split on purpose. `lib/api/gear-service.ts` is the usual
hand-written types + axios calls (`SERVICE_KINDS`, `serviceKindLabel`, the `gearServiceAPI` object)
mirroring the API's Pydantic schemas, exactly like `lib/api/gear.ts`. `lib/gear-service.ts` is pure
functions - no axios, no React - so the rules that actually matter (status thresholds, date
arithmetic, the due-text phrasing, the type presets) are unit-testable and covered.

That split isn't cosmetic: `vitest.config.mts` only collects coverage for `src/lib/**`, and
component-level code is generally untested here, so anything worth testing has to live in `lib/`.
`gear-service.test.ts` is where the whole status truth table lives.

`lib/api/gear.ts` imports `GearServiceScheduleSummary` from `lib/api/gear-service.ts` as
`import type` - the API side made the mirror-image choice (`schemas/gear_service.py` imports nothing
from `gear_item.py`) so the pair points one way only and can never become a cycle.

## Service dates are `YYYY-MM-DD` and never touch `new Date(dateString)`

`next_due_on`, `starts_on`, `serviced_on` and `last_service_on` are all bare dates, so they fall
squarely under the trap documented in "Bare `YYYY-MM-DD` dates must not go through
`new Date(dateString)`": that parses as UTC midnight, which is the previous day anywhere west of
Greenwich, and would make every due date read as one day closer than it is.

`daysBetweenIsoDates()` builds both ends from split parts (`new Date(y, m-1, d)`), same as
`formatDateOnly()`. Using local midnight for both also makes it immune to DST - the two Dates shift
by the same offset, and rounding the millisecond difference absorbs the one 23- or 25-hour day in
between. `todayIsoDate()` is built from local getters rather than `toISOString()` for the same
reason. The tests assert exact day counts across both DST transitions, and the suite is run under
UTC-8 through UTC+14.

## Gear service uses two dialogs, and both need `dialogFormSubmit`

`GearServiceScheduleDialog` and `GearServiceRecordDialog` follow `GearItemDialog` exactly - dialogs
rather than pages, because they're a handful of fields always reached from a gear detail page you
want to stay on, and the same three-way open state (`null` = closed, `undefined` = creating, an
object = editing).

Both contain a `<form>`, so both wrap their submit in `dialogFormSubmit()` per "A dialog's submit
event bubbles into the form that opened it". They aren't opened from the dive form today, but the
rule is about the React tree, not the current call sites, and it costs nothing.

Both interval fields use the `""`-means-cleared convention already used by `gearSetSchema.weight`,
mapped to an explicit `null` on PATCH so an interval can actually be removed rather than being
ignored as an omitted key. The "at least one interval" rule is an object-level `.refine()`, which -
unlike a `z.preprocess()`/`.transform()` - leaves `z.input<>` untouched (see "Never use
`z.preprocess()`/`.transform()` on fields feeding `z.input<>`-derived types").

## Per-gear-type service presets are prefills, not safety advice

Opening "Add Schedule" on a cylinder starts at "visual inspection, every 12 months"; on a regulator
at "service, every 12 months or 100 dives". These come from `defaultSchedulesForGearType()` and
exist purely to save typing.

They are **not** authoritative. Manufacturer service intervals differ, and cylinder test periods are
set by jurisdiction (five years across much of the US and EU, two and a half in some regimes for
some cylinder types). Every field stays editable, nothing is filled in silently on save, and the
dialog says so in as many words. This is dive-safety-adjacent UI and must not read as advice - if
the preset list is ever extended, keep that framing.

Gear with no meaningful convention (a mask, a knife) and gear with no type set get `[]`, not a
made-up default.

## The dashboard's "Service due" card renders nothing when nothing is due

`ServiceDueCard` returns `null` when no schedule needs attention, and also when its fetch fails
(logged, not surfaced). A permanent "all your gear is fine" tile is dashboard noise that trains
people to stop reading the dashboard; a supplementary card erroring out shouldn't make the whole
page look broken either.

It calls `GET /gear-service-due`, which deliberately takes no date horizon - a server-side "due
within N days" filter would bake today's date into a cached response and go wrong at midnight - so
the bucketing happens client-side, through the same `serviceStatus()` every other surface uses.

The gear _list_ needs no extra request at all: `GET /gear-items` embeds each item's schedules
(`item.service`), and the badge is derived from those.

## The gear reminder toggle lives in its own settings card, and saves on change

`NotificationsCard` is factored out like `EmailChangeCard` rather than being bolted onto the profile
form, since it's a different concern and will grow if more email preferences appear.

It saves immediately on change rather than behind a "Save Changes" button: it's a single boolean,
and a toggle that needs confirming reads as broken. It sends only `{ gear_service_emails }` -
`PATCH /user` is `extra="forbid"`, so sending anything else alongside would 422.

`User.gear_service_emails` is optional in the TS type and falls back to `true` when absent, matching
the server-side default, so the toggle renders correctly against an API that predates the field.

## Private card images render from a blob URL, which needs `blob:` in `img-src`

Certification card files are owner-only: `GET /certification/{uuid}/file/{side}` requires an
`Authorization` header. An `<img src>` cannot send one, and there is no ambient credential to fall
back on either - `lib/api/client.ts` holds the access token in memory and only the _refresh_ token
is a cookie. So a plain `src` pointing at the API would 401.

`hooks/useAuthedBlobUrl.ts` fetches through the API client with `responseType: "blob"`, wraps the
result in `URL.createObjectURL`, and revokes it whenever it's replaced and on unmount (object URLs
are held by the document until explicitly released - skipping that leaks the whole blob for the life
of the page).

That required the one CSP change in `proxy.ts`: blob URLs are **not** covered by `'self'`, so
`img-src` needed an explicit `blob:` or the `<img>` is blocked. It widens nothing an attacker could
reach - a `blob:` URL can only name data this document already created.

The hook keeps a single "settled result" object rather than three flags, and derives `isLoading`
from `result === null`. That isn't cosmetic: setting an `isLoading` flag synchronously in the effect
body trips `react-hooks/set-state-in-effect`, which is an error in this config.

Known cost: the blob is re-fetched on every mount, so a card shown in both the list and a dialog is
fetched twice. Fine for a handful of cards with `Cache-Control: private, max-age=300` and `ETag`
revalidation behind it; it would need real thought at gallery scale.

### Keying that fetch on (certification, side) is not enough - it breaks Replace

The card image lives at a stable URL whose _contents can change_, which breaks two caches at once.
Replacing an image would upload fine, the filename beside it would update, and the picture would not
move:

1. `fetchBlob` was `useCallback(..., [certificationUuid, side])`. Neither changes when a file is
   replaced, so `useAuthedBlobUrl`'s effect never re-ran and the previous object URL stayed on
   screen.
2. Even once it does refetch, `max-age=300` lets the _browser_ serve the old bytes from its own HTTP
   cache for five minutes, since the URL is identical.

Both are fixed by `certificationFileVersion(file)` in `lib/certification.ts`, which is in the
`useCallback` deps _and_ sent as a `v` query param the API ignores. `updated_at` moves on every
replace; `uuid` covers delete-then-upload, which inserts a new row rather than updating the old
one - and would otherwise produce a token identical to the original (`updated_at` is null on both).
It deliberately does **not** fold in `side`, which is already in the URL, so repeat views of an
unchanged card still hit the cache.

It lives in `lib/` rather than inline in the component specifically so it can be tested -
`certification.test.ts` covers replace, second replace, and delete-then-reupload, since none of that
is visible to a type checker and all of it looks correct while being wrong.

## PDFs are download-only, never previewed inline

Rendering a PDF inline means an `<object>` or `<iframe>`, and `proxy.ts` sets `object-src 'none'`
with a narrow `frame-src`. Loosening either to display _user-uploaded documents_ is a bad trade for
a preview, so a stored PDF shows as a labelled file with a Download button instead. Most c-cards get
photographed rather than scanned, so the image path is the common one.

Downloading goes through the API client for the same reason rendering does - a plain `<a href>` to
the endpoint would 401 - so it fetches the blob, clicks a synthetic anchor and revokes the URL
immediately.

## `useWatch`, not `form.watch()`

`CertificationDialog` shows the `agency_other` field only when the agency is `other`.
`form.watch("agency")` returns a fresh function every render that can't be memoized, which
`react-hooks/incompatible-library` flags; `useWatch({ control, name })` is the supported equivalent.
Worth knowing because the error it produces is reported against the `useForm()` call, and while it's
present the react-hooks plugin stops analysing the rest of the component - so fixing it can _reveal_
previously-silent `set-state-in-effect` errors elsewhere in the same file.

## Certification expiry is derived in the browser, and `null` means "don't badge"

`lib/certification.ts` reuses `todayIsoDate`/`daysBetweenIsoDates` from `lib/gear-service.ts` rather
than reimplementing date maths (both avoid `new Date(dateString)` on a bare date, which parses as
UTC midnight and lands a day early in western timezones).

`certificationExpiryStatus` returns `null` for both "no expiry date" and "expires, but not soon" -
there is no "valid" state. Most recreational certifications never expire, so badging them all green
would bury the two rows that actually need attention. Same reasoning as `worstServiceStatus`
returning `null` for untracked gear.

The window is 90 days, not gear's 30: renewing a rescue or first-aid card means booking onto a
course with an instructor, not dropping a regulator at a shop.

## Card uploads are a separate step from creating the certification

The API takes card images on `PUT /certification/{uuid}/file/{side}`, not as multipart on create, so
the dialog creates the certification first and then opens the card-images dialog. Creating a new
certification hands straight off to that second dialog - adding the photo is the point of the
feature, so making the diver find the button afterwards would bury it.

After any upload or delete the list's embedded file metadata is stale, so the page refetches the
single certification _and_ the list, and re-points the open dialog at the refreshed row - otherwise
the panel being looked at keeps showing what it loaded with.

## The dive form holds the imported file in page state and uploads it after saving

`DiveFileImport` calls `onFileSelected(file, fileToken)` only after a _successful_ parse, and the
page - `dives/new` and `dives/[id]/edit` - parks both in `useState` until `createDive`/`updateDive`
resolves. The API stores nothing at parse time and there is no dive to attach to until the save
succeeds, so there is nowhere earlier to send it.

Uploading after the save rather than on selection also matters on the edit page: importing a file
and then cancelling the edit must not silently change the dive's stored export.

A failed attach is a toast, not a rollback. The dive is saved and correct; the file is kept so new
parsing features can be developed against real exports later, which is not something the diver asked
for and not worth undoing their save over. Both real failures surface here with the API's own
wording and are worth reading: a 409 means this export is already attached to another dive (usually
one file logged as two dives), a 422 means the import went stale and needs redoing.

`isSubmitting` stays true across the upload so the button doesn't re-enable mid-flight.

## The dive's source file downloads through the API client, like card images

`DiveSourceFileCard` fetches a Blob and clicks a synthetic `<a download>`, the same pattern as
`certification-view-dialog.tsx` and for the same reason: the endpoint needs an `Authorization`
header and the access token lives in memory, not a cookie, so a plain `<a href>` would 401. The
object URL is revoked immediately - the browser has its own copy by the time the click returns.

Unlike card images this needs **no** CSP change: nothing renders the file, so `useAuthedBlobUrl` and
the `blob:` `img-src` entry aren't involved.

The `v` param is `${uuid}:${updated_at}` - `uuid` covers delete-then-reattach, `updated_at` covers a
replace. Without it the response's `max-age=300` would keep serving the previous file's bytes after
a replace.

## Deleting the imported file refreshes without the page-level spinner

The dive detail page has two fetchers: the initial `useEffect` one that toggles `isLoadingDive` and
redirects on failure, and a separate `refreshDive` `useCallback` passed to `DiveSourceFileCard` as
`onChanged` that does neither.

Reusing the first would blank the whole page into a spinner to swap one card, and would redirect to
`/dives` if the refetch failed after a delete that had already succeeded. It also trips
`react-hooks/set-state-in-effect`: a `useCallback` that calls `setState` synchronously can't then be
called from an effect body, which is what made the split necessary as well as correct.

## `Dive.source_file` is optional because the list response never carries it

The same `Dive` interface backs both `GET /dives` and `GET /dive/{uuid}`, and the API deliberately
only sends `source_file` on the detail one - the list is its hottest query and nothing in the table
renders an attachment. Hence `source_file?:` rather than a required field. Don't "fix" a missing
value in the list by adding it server-side.

`diveParserLabel` falls back to the raw `parser_key` for a parser this build hasn't heard of, rather
than to a blank or "Unknown": the API can grow a parser ahead of the frontend, and rendering
`garmin_fit` is worse than a label but far better than an empty cell that reads as a bug.

## Air consumption is the API's number; the browser only explains its absence

`dive.gas_use` (SAC/RMV) arrives computed from the detail endpoint and is rendered as-is. This is
deliberately the _opposite_ call to "Service status is derived in the browser, because a cached
'days remaining' is a lie" a few sections up, and for a reason that generalizes: service status
depends on today's date, so a cached one goes stale on its own; gas use depends only on stored dive
fields, so it can't. There is one implementation of the formula, in the API's
`services/dive_gas.py`, and no `grep`-the-pair maintenance burden. Don't add a second one here - not
even for a live preview in the dive form.

What the browser _does_ own is `lib/dive-gas.ts`'s `gasUseUnavailableReason()`. The API returns
`gas_use: null` for every un-derivable dive without saying why, which is right - the reasons are all
plainly visible in the dive itself and phrasing them is a UI job. But rendering nothing would be
wrong: unlike the other optional cards on the dive detail page (Depth, Environment, Gear), which are
absent because the diver knows they didn't record something, this one can vanish _despite_ the
pressures being filled in - a missing average depth, or a second tank - and silence reads as a bug.
So the Air Consumption card renders whenever the dive logs a tank at all, showing either the figures
or the one specific thing in the way.

That helper's branches mirror the guard clauses of `compute_gas_use()` _and_
`compute_multi_tank_gas_use()`, and have to be changed with them (`grep gas_use` finds the set). It
lives in `lib/` rather than in the page for the usual reason: `vitest.config.mts` only collects
coverage for `src/lib/**`.

Two guards in it are load-bearing. It returns `null` when `mixtures` is missing entirely, because
the _list_ response carries neither `mixtures` nor `gas_use` and every row would otherwise claim its
pressures were missing. And the multi-tank branch names a limitation rather than asking for a field
in the ordinary case — see "The multi-tank branch now splits three ways, and tests attribution
first" below for the one case where it does ask.

## The air-consumption chart is hand-rolled SVG, and breaks its trend line at gaps

No charting library, for the same reason `VolumeCombobox` and the drag-to-reorder list are
hand-rolled - plus one specific to this app. The CSP in `src/proxy.ts` is nonce-based and strict:
`style-src-attr 'unsafe-inline'` allows inline style _attributes_, but `style-src` is nonce-gated in
production and `'unsafe-inline'` only in dev. A library that injects a `<style>` element (the
emotion/styled-components-based ones do) therefore works locally and breaks in production, which is
a miserable bug to buy for one chart. `gas-use-chart.tsx` is ~130 lines of `<svg>` that themes
itself off `currentColor`.

**The trend line is drawn per stretch of diving, not across the whole series.** With one polyline
over 343 points, a diver who logs a week in April and a week in October gets a long flat segment
spanning the six months between, which reads as "steady all summer" when the truth is "no data
here". `segmentByGap()` splits the series wherever consecutive dives are more than `TREND_GAP_DAYS`
(60) apart and each run gets its own polyline. The trailing mean itself still averages across the
gap - your consumption doesn't reset because you took a winter off - it's only the drawn connector
that would be a lie.

**Coral for the trend, teal for the dots.** Both are declared once in `globals.css` and never
redeclared under `.dark`, so they hold contrast in both themes; `--primary` is near-black in light
mode and a mid grey in dark, which left the line barely visible on a dark card. Two different hues
rather than one at two opacities because the dots and the line they're averaged into are otherwise
the same mark in the same color, and the eye can't separate the raw data from the smoothing.

**The y axis is not zero-based.** RMV clusters between roughly 10 and 25 L/min, so anchoring at 0
squashes a career's variation into the top third. `niceDomain()` rounds outward from the data
instead, and the axis is labeled. Its nice-number progression includes 2.5, which the textbook
1/2/5/10 one doesn't: without it an entirely typical 5-to-26 spread falls through to a step of 10
and gets three gridlines for the whole chart.

Each dot is a plain SVG `<a>` (not `next/link`, which would be creating an anchor in the SVG
namespace) wrapping a `<title>` - a tooltip with no JS, no hover state to manage, and the thing a
screen reader announces. The chart scrolls inside its own `overflow-x-auto` container below ~560px
rather than scaling down, which would shrink the axis labels past legibility on a phone; the page
body never scrolls sideways.

The chart lives in a card that renders even when there's nothing to plot, unlike `ServiceDueCard`.
An empty service list means nothing needs attention; an empty series here means the dives are
missing pressures or an average depth, which is something the diver can act on and won't otherwise
discover.

## The chart windows to All/Year/Month, but scales itself from the whole series

Three years of dots in one frame shows the long arc and buries any single trip; a month shows the
trip and no arc. Both are worth seeing, so `GasUseCard` owns a scope switch (`all`/`year`/`month`)
and, for the two bounded scopes, prev/next buttons. It opens on `year` at the most recent dive - how
you're diving _now_ is the question people actually have, and "All" is one click away.

Three things are deliberately derived from the **whole** series and not the visible window, and all
three matter:

- **The y domain.** A per-window domain rescales on every click, which makes a good year and a bad
  year draw identically. Fixed, the axis stays put and the periods are comparable at a glance.
- **The trailing mean.** Computed across all history and then sliced, so January's first dive
  carries the context of December's last few instead of restarting the average at each period
  boundary.
- **The x bounds within a period**, which are the _calendar_ period, not the min/max of what's in
  it. A year in which you only dived in April shows one cluster on the left, not April stretched
  across the full width as though it were the whole year.

All of the machinery named below - `periodRange`, `periodLabel`, `availablePeriods`, `stepPeriod`,
`resolveAnchor` - lives in `lib/chart-period.ts` and is shared with `DiveActivityCard`, which offers
the same three scopes. It started here, in `dive-gas.ts` and `gas-use-view.ts`; see _"The activity
chart is bars over the same three scopes as the gas chart"_ for why it moved.

**Prev/next skip to the next period that has dives**, rather than stepping one calendar period at a
time (`stepPeriod()`). Diving happens in bursts a season apart; stepping would mean clicking through
eight empty months to reach the next trip. `null` means there's nothing further in that direction,
which is what disables the button.

**The period label between them is also a dropdown** (`availablePeriods()`), listing only the
years - or month/year pairs - that contain dives. Stepping is the right control for "the trip before
this one" and useless for reaching a specific season three years back. Its `<Select>` value is the
_period's_ start, never the anchor itself: the anchor is whichever dive you last landed on, which
usually isn't the one representing its period in the list, and a Radix `Select` whose value matches
no registered item renders an empty trigger - the same trap documented under the `VolumeCombobox`
"NaN L" note above. The options carry a real dive time alongside that key, so picking one preserves
the invariant below.

**The anchor is always one of the dives' own timestamps**, never a synthesized date. That is what
makes switching scope land somewhere useful: going from `year` to `month` shows the month
_containing_ the dive you were looking at, not an arbitrary month that may be empty.

**All of it buckets on `diveWallClockTime()`, never `new Date(start_time).getTime()`.** A dive at
00:30 on New Year's Day in Thailand (+07:00) is still the previous year in UTC and would land in the
wrong year - and, worse, in a _different_ year depending on where the viewer is. That's the same
rule as "A dive's `start_time` displays/edits in its own timezone, never the browser's", extended
from formatting to bucketing; the helper is the numeric counterpart to `formatDiveDateTime()`.
Everything downstream of it - `periodRange`, `periodLabel`, the axis ticks - reads it back with
`getUTC*`/`Date.UTC`/`timeZone: "UTC"`. Using the local getters anywhere in that chain silently
reintroduces the bug.

### The chart's tooltip is one state-driven card, not a tooltip per dot

The dots started with a native SVG `<title>`, which is free and needs no JavaScript but looks like
an OS tooltip - wrong font, wrong colors, half a second of delay, no control over any of it. It's
now an HTML card positioned over the chart.

**One `hovered` index for the whole chart**, not a `Tooltip.Root` per point. At a few hundred dives,
per-dot tooltip instances are a lot of machinery for the one that can ever be open, and the same
state drives the dot's own enlarge-and-brighten, so the lit dot and the card can't disagree the way
a CSS `:hover` and React state would. (That's also why the app's unused `@radix-ui/react-tooltip`
dependency stayed unused here - it's the right tool for a button, not for a scatter plot.)

**Positioned in percentages of the chart box.** The SVG scales uniformly inside a wrapper of exactly
its size, so viewBox units map straight onto percentages and nothing has to be measured in the DOM
on hover. The `style` prop is an inline style _attribute_, which the CSP explicitly allows
(`style-src-attr 'unsafe-inline'`) - an injected `<style>` element would not be, which is the same
constraint that ruled out a charting library.

**It flips to stay inside the box** rather than overflowing: below the dot in the top third, and
left/right-aligned within 18% of either edge. It has to stay inside, because setting
`overflow-x: auto` on the scroll container makes `overflow-y` compute to `auto` as well, so anything
hanging past the top edge is clipped or adds a stray scrollbar.

**Each dot has an invisible `r=7` hit circle** on top of the visible one - a 2.5-unit dot is a ~4px
target, which is fiddly to hover deliberately. `fill="transparent"`, not `fill="none"`: `none` takes
no pointer events at all, which is the opposite of the point.

The card is `pointer-events-none` (otherwise it steals the hover from the dot that triggered it and
flickers) and carries no accessible text - `aria-label` on the link does what `<title>` used to. It
also clears when the visible window changes underneath it, so paging from 2025 to 2026 with the
cursor still on the chart can't leave a card describing a dive that is no longer drawn.

### `--tooltip` is its own surface token, because `--popover` isn't one

`--popover` and `--card` are declared the _same color_ in both themes - white in light, 13%
lightness under `.dark` - so anything using `bg-popover` on top of a card is separated from it by
nothing but a 1px border. That is fine for a dropdown, which is usually over page background and is
the only thing you're looking at. It is not fine for the chart's hover card, which overlaps its own
data points: matching the panel underneath made it read as cut out of the card rather than floating
above it.

So the hover card uses `--tooltip`/`--tooltip-foreground`, added alongside `--coral` and `--teal` in
`globals.css` and registered in `tailwind.config.mts` the same way. It is **dark in both themes**
rather than inverting per theme - a near-black chip is the conventional chart tooltip, and it
carries the same weight over a white card as over a dark one. Measured against the card it sits on:
17.9:1 in light, 1.22:1 in dark (where the shadow and hairline border do proportionally more of the
work, the same way `--card` separates from `--background` by 13% vs 9% lightness). Text on the chip
is 17:1, and the 70%-alpha secondary lines 8.8:1.

The border is `border-white/10`, not the `--border` token: on a near-black chip the theme's border
color is invisible in light mode and merges with the chip in dark.

## `niceDomain`/`axisTicks` moved to `lib/chart-scale.ts` when a second chart needed them

A pure move out of `lib/dive-gas.ts`, with their tests, and no behavior change. A depth axis has
nothing to do with gas use, and importing a gas module to scale meters reads as an accident.

Worth noting because it looks like an omission: `niceDomain`'s "deliberately not zero-based"
docstring is _right for depth too_. The depth axis has to anchor at the surface, and it does -
feeding the surface's own `0` into the values makes `Math.floor(0 / step) * step` equal 0, so the
axis lands on 0 by arithmetic. Nobody needs to add a `zeroBased` flag here that would do nothing.

## The dive profile chart is hand-rolled SVG too, with three channels and one hovered time

Same CSP reasoning as the air-consumption chart, restated in full in the component rather than
cross-referenced: `src/proxy.ts` ships a strict nonce-based CSP where inline style _attributes_ are
allowed but an injected `<style>` element is not, so an emotion/styled-components-based charting
library works in dev and breaks in production. That comment is what stops the next person reaching
for Recharts, and it only works if it is where they are looking.

All of the arithmetic lives in `lib/dive-profile.ts` and is Vitest-tested, per the repo convention
of testing pure functions in `lib/` and not rendering components. If a number on that chart could be
wrong, its derivation is in there.

**Depth is inverted and anchored at the surface**, filled (`text-teal` at `opacity-15`) with the
curve stroked over it - the fill is also what makes "which side is the water" unambiguous on an
upside-down axis. **Temperature gets its own domain**, not a shared one: a whole dive's temperature
usually spans something like 21.6-21.9 °C, which is a flat line on any axis wide enough for depth.
**Pressure shares the right-hand side but not its labels** - three sets of numbers on one edge is
unreadable, and the tooltip gives the exact figure for any instant. Every cylinder shares one
pressure domain, unlike the channels above, because two tanks on one dive are directly comparable
and per-tank axes would make a 50-bar stage look like the 200-bar back gas.

**One hovered _time_, not one hovered index.** `GasUseChart` keeps a single hovered index for the
whole chart; the analogue here can't be an index, because the channels are independently sampled and
don't share a time axis - "the sample under the cursor" is a different index per channel. So a
full-plot transparent `<rect>` turns the cursor's x into seconds once, and each channel resolves its
own nearest sample with `nearestSampleIndex` (binary search, clamped both ends). Every value in the
readout is a real reading, never an interpolation: the card says "26.4 m at 16:13", and a value the
sensor never recorded has no business being presented as one.

**The readout card anchors to a plot edge, not to a data point** - the one thing here that differs
from `GasUseChart` and the one that was got wrong first. Offsetting a card from the point it
describes (`translateY: calc(-100% - 12px)` when the point is low, `12px` when it's high) only works
if you know how tall the card is, and here you don't: its height depends on how many channels the
dive recorded, and the SVG scales to its container while the card's text does not. A "flip above the
point when it's in the top third" rule put a 100px card into 76px of space on a real dive, 11px past
the top of a scroll container that clips (`overflow-x: auto` computes `overflow-y` to `auto` too),
so it was cut off between roughly 11:54 and 15:06.

`tooltipVerticalAnchor` instead pins the card's bottom edge to the plot's bottom edge, or its top
edge to the plot's top edge, choosing whichever end keeps it off the readings it describes. Both
placements are inside the box for _any_ card height at _any_ render scale, which is a property
rather than a tuned constant - and it also stops the card jumping between channels as you scrub,
since "the hovered point" was always three different points and picking the topmost was arbitrary. A
test sweeps every y in the plot and asserts the anchor is only ever an edge.

**Keyboard scrubbing is deliberately out of scope**, said in a comment rather than left silently
absent. The gas chart gets focus for free because its dots are `<a>` links to dives; a polyline has
no equivalent without inventing a focus model. The `aria-label` carries the summary instead ("Dive
profile over 46min, maximum depth 27.7 meters, temperature 22.9 to 26.0 degrees Celsius, tank
pressure 205 down to 87 bar"), using `formatDurationHoursMinutes` rather than the axis's `MM:SS` -
read aloud, "84:36" is not a length of time.

`--pressure` is a third theme-stable chart token in `globals.css`, declared once and _not_
redeclared under `.dark` - the property that makes `--coral` and `--teal` hold contrast in both
themes. Violet, because it is the only family clearly separable from both coral and teal when all
three are thin lines sharing one plot.

## The profile's line breaks are derived from the series' own cadence

`segmentByTimeGap` is the same idea as `segmentByGap` on the gas chart - never draw a line across
data that isn't there - expressed in seconds instead of days. A transmitter that drops out for ten
minutes mid-dive would otherwise be drawn as a straight line from the last reading to the first one
after it, which reads as "the pressure fell smoothly" when the truth is "nothing was recorded here".
Real: `Dive_2025-03-08-1440.xml` has a 1 341-second hole in its pressure series.

The threshold has to be **derived rather than fixed** (`gapThreshold`): cadence ranges from 1 s
(Suunto Ocean temperature) to 10 s (every Suunto depth series), and the API's min/max downsampling
stretches it further and unevenly. A fixed threshold would either break every downsampled line into
confetti or draw straight through a real dropout. Three times the median delta sits comfortably
above normal jitter and below any dropout worth showing; `MIN_GAP_SECONDS` keeps a perfectly regular
1 Hz series from breaking on a rounding wobble.

## The profile card fetches on mount and needs no `onChanged`

`DiveProfileCard` renders nothing when `dive.profile` is absent - the same call as
`DiveSourceFileCard`, and the opposite of `GasUseCard`. A dive logged by hand has no samples and
never could, so there is nothing for the diver to act on and nothing worth an empty state; a missing
air-consumption figure, by contrast, is usually something they can fix.

It takes no `onChanged` callback, unlike `DiveSourceFileCard`. Deleting the source file deletes the
profile with it server-side, and the page's `refreshDive` already drops `dive.profile` - which
unmounts this card. A callback would be a second mechanism for something that already happens.

The series are fetched separately from the dive, keyed on the profile's `updated_at` as a `v`
cache-buster, because they are tens of KB and the detail response carries only the summary. A
failure shows a muted line where the chart would have been rather than a toast: nothing the diver
did caused it and there is nothing for them to do about it, so it belongs in the card, not over the
whole page.

## `Dive.profile` is optional for the same reason as `source_file`

Detail-response only. The API deliberately doesn't send it on the paginated list - that is the app's
hottest query and nothing in the list renders it - so the field is optional on the shared `Dive`
interface, with the same "don't fix this by adding it server-side" note.

The series themselves stay integer-scaled on the wire (depth in cm, temperature in tenths of a
degree, pressure in tenths of a bar) and are divided in `toChannelSeries`. **Divided, never
multiplied by a reciprocal:** `1234 / 100` is the correctly-rounded `12.34`, whereas `1234 * 0.01`
is `12.340000000000002` - exactly the noise the integer encoding was chosen to remove.
`PROFILE_CHANNELS` holds the divisors and is the mirror of the API's
`DEPTH_SCALE`/`TEMPERATURE_SCALE`/`PRESSURE_SCALE`; the two lists are a pair.

## The contact form posts to the API, and the page it lives on claims only what exists

`/contact` used to be a mock: a `<form>` with no `onSubmit` (clicking "Send Message" reloaded the
page and dropped the message), links to a `github.com/opendiving/opendiving` repo and a
`/discussions` page that don't exist, and three invented mailboxes (`community@`, `security@`,
`docs@`). A contact page that silently discards messages is worse than no contact page, so the whole
thing was rebuilt around things that are real.

**Where the message goes.** There is no mail provider on this side and no server-side secret to hold
one - the app is a client for the API, which already owns the mail transport. So
`contactAPI.sendMessage` posts to `POST /contact`, and the API forwards it to its
`CONTACT_FORM_EMAIL` (see the API's `DECISIONS.md`). Nothing here decides, or can decide, the
recipient.

`NEXT_PUBLIC_CONTACT_EMAIL` is therefore **display only, optional, and deliberately has no
default** - it's the address offered as a `mailto:` fallback in the error state, so a visitor whose
submission fails isn't left at a dead end. Setting it does not change where a successful submission
is delivered.

The missing default is the point. Two values that must be kept in sync by hand _will_ drift, and
this pair drifts silently - nothing can detect it, since one side is baked into the client bundle at
build time and the other lives in the API's environment. So the question is which way a drifted (or
simply unconfigured) instance should fail. Defaulting to `contact@opendiving.app` fails badly: a
self-hosted instance would hand its visitors an address reaching people who, by the page's own
"Self-hosted instances" card, can't see that server or touch its data - reintroducing exactly the
wrong-address problem this rebuild removed. Unset, `ContactForm` points at the web app's issue
tracker (`FALLBACK_ISSUES_URL` in `lib/contact.ts`) instead, which is correct for every deployment
because the form being broken is itself a bug in this repo. Only set the variable on a deployment
whose operator reads the mailbox it names.

**The category list is a closed vocabulary shared with the API** (`CONTACT_CATEGORIES` in
`lib/api/contact.ts`, mirroring `ContactCategory` in the API's `schemas/contact.py`). The backend
rejects anything else with a 422, and the human-readable label that ends up in the subject line of
the forwarded email is derived from the slug _there_, not here - the labels in this repo are only
what the dropdown shows. Adding a category means changing both sides. Every option maps to something
the app actually does; the old list had "Partnership" and "Legal/Privacy" options pointing at
channels that never existed.

`contactSchema` duplicates the API's length bounds on purpose - the server enforces them regardless,
but finding out via a 422 after a round-trip is a worse form.

**The form prefills from `useAuth()` for a signed-in diver**, filling only fields that are still
empty. It can't be done with `defaultValues`: the user object only arrives once the auth bootstrap
resolves (see `AuthContext`), long after the form first renders.

The page itself is a Server Component (for `metadata`); only the form is `"use client"`.

## `/signin` is back, and carries where the visitor was headed

Sending signed-out visitors to `/` (see "Unified auth flow" above) meant a protected URL - a shared
dive link, a bookmarked `/gear`, a session that expired mid-session - dumped them on the marketing
page, where the sign-in form is one section among many, and where nothing recorded what they'd been
trying to reach. `app/signin/page.tsx` is a dedicated page for exactly that: the same shared
`AuthForm`, a "Sign in" heading, and nothing else competing with it. It's chrome-free (added to
`NO_CHROME_ROUTES` in `app-shell.tsx`), matching the other two auth-flow pages, `/auth/verify` and
`/onboarding`. This is _not_ a return to the old password-based `/signin`/`/signup` pair - there's
still exactly one form and one entry point, and the landing page still hosts its own `AuthForm` in
the hero for visitors arriving cold.

`Header`'s signed-out state, which rendered nothing at all where the user menu sits, now has a coral
"Sign In" button linking there. It stays in the actions row at every breakpoint rather than being
folded into the mobile menu - on a phone it's the single most important thing a signed-out visitor
can do, and the row still fits at 375px.

### The destination round-trips through `lib/auth-redirect.ts`

`useAuthGuard` now redirects to `signInHref(...)` - `/signin?next=<encoded path>` - and `/signin`
sends the visitor there once they're in. Three things about that are worth knowing before touching
this code:

- **`next` is sanitized, never trusted.** `sanitizeRedirectPath` rejects anything that isn't a plain
  `/`-relative path (absolute URLs, `//host`, `/\host`), so a crafted link can't turn our own
  sign-in page into an open redirect. It's applied on the way in _and_ on the way out, since the
  value also survives in `localStorage` between those two points.
- **The guard reads `window.location`, not `usePathname()`/`useSearchParams()`.**
  `useSearchParams()` inside `useAuthGuard` would force every one of the ~15 pages that call it to
  grow its own `Suspense` boundary or fail `next build`. The redirect happens in an effect, where
  `window` is real, so there's nothing to gain from the hook version. (`/signin` itself _does_ use
  `useSearchParams`, and therefore _does_ have a `Suspense` boundary - same shape as
  `/auth/verify`.)
- **The email flow needs storage; Google doesn't.** Google sign-in never leaves the tab, so the
  destination is just a prop (`AuthForm` -> `GoogleAuthButton`). The magic link leaves the app
  entirely and comes back on `/auth/verify`, which has no idea what the visitor originally wanted -
  so `AuthForm` stashes it when requesting the link and `/auth/verify` consumes it.
  `rememberPostAuthRedirect` is called on _every_ link request, including with no destination,
  precisely so it clears a stale one; `consumePostAuthRedirect` removes the key as it reads it,
  including on the onboarding branch. Without both of those, a destination abandoned earlier could
  silently hijack an unrelated later sign-in. If the link is opened in another browser the value
  simply isn't there and the visitor lands on `/dashboard`, which is the intended fallback, not a
  failure.

#### That storage has to be `localStorage`, and it carries an expiry

It was `sessionStorage` first, on the reasoning that a tab-scoped store is the tighter choice for a
value the tab itself put there. That reasoning skipped a step: `sessionStorage` is copied into a new
browsing context only from an _opener_, and a magic link is clicked in a mail client. A desktop mail
app hands the URL to the browser cold; webmail opens it with `noopener`. Either way `/auth/verify`
runs in a context whose `sessionStorage` is empty, so the destination was lost in the ordinary case
and `?next=` only ever worked for Google sign-in and for the contrived same-tab paste. Nothing about
it was visible in a test either, because jsdom hands one `sessionStorage` to the whole file.

`localStorage` is shared across the browser's tabs, which is exactly the hop that needs covering.
Two things follow from it outliving the tab, and both are in `lib/auth-redirect.ts`:

- **The entry expires**, stored as `{ path, expiresAt }`. The tempting value was the link's own life
  (`MAGIC_LINK_TOKEN_EXPIRE_MINUTES`), but that is read from the environment on the API side and 30
  minutes is only its default - matching it by hand means an operator who raises it to an hour
  silently reintroduces this very bug for every sign-in in the back half of the window. The
  asymmetry settles it: too short breaks the feature, too long costs essentially nothing, because a
  destination can only be _read_ by `/auth/verify`, which needs a live token, which needs a link
  request, which re-stamps the entry anyway. So it's a day - a backstop against a path living in
  storage forever, not a mirror of anything.
- **Anything unreadable is treated as absent, and cleared.** `consumePostAuthRedirect` removes the
  key before it inspects the value, so a stale, expired or non-JSON entry - the previous
  implementation's bare path, say - clears itself out instead of being re-rejected on every
  subsequent sign-in.

Requesting a link stamps the entry, and so does **resending** one. The reason isn't that the
destination would otherwise expire first - at a day against a 30-minute link the diver would have to
sit on the "Check your email" screen for the better part of a day for that to bite. It's that the
stored expiry is deliberately blind to the backend's link lifetime, per the point above, so
re-stamping on every mint is the only thing that keeps the destination alive for exactly as long as
whatever link the diver is actually holding.

Two consequences of an origin-wide store that a tab-scoped one didn't have, both acceptable, neither
obvious:

- **Concurrent link requests share one slot.** Ask for a link from `/signin?next=/dives/abc` in one
  tab and then from the landing page in another, and the second request clears the first's
  destination (`rememberPostAuthRedirect(undefined)`); the first tab's link then lands on
  `/dashboard`. The reverse leaks the other way - the second tab's destination is what the first
  tab's link honours. Both outcomes are a sanitized same-origin path or the default, so this is a UX
  edge and not a security one, and either way it beats the old behavior, which lost the destination
  in _every_ case.
- **Signing out clears it.** A leftover only exists if a link was requested and never clicked
  (signing in with Google instead, say), but `localStorage` would keep it for a day, across sign-out
  and across closing the browser - a legible `/dives/<uuid>` on a shared machine. So `signOut` calls
  `rememberPostAuthRedirect(undefined)`, on the same reasoning as the reload next to it.

This is not in tension with "Access token lives in memory only, never in `localStorage`" above. What
gets written here is a path the visitor's own browser was already pointed at, it is sanitized on the
way in and again on the way out, and it grants nothing. It's the same storage the three
remembered-view modules (`gas-use-view.ts` and friends) already use, for a related reason.

All four of those suites need a `localStorage` of their own, because under this runner Node's own
experimental global shadows jsdom's and `window.localStorage` reads back as `undefined`. The stub
now lives once in `test/memory-storage.ts` and each suite installs it in its own `beforeEach`. Not
auto-installed in `vitest.setup.ts`: sharing the _helper_ keeps the fresh-store-per-test property,
whereas sharing an _instance_ would hand all 44 test files one `Map` that nothing resets, and the
first component test to render a card that remembers its view would start leaking that view into its
neighbours.

`useAuthGuard` also switched from `router.push` to `router.replace`: the page it's bouncing away
from can't render while signed out, so leaving it in the history stack only gives the back button
somewhere to land that immediately bounces again.

### Signing out lands on `/`, and gets there with a page load

The guard above has one case it gets wrong on its own: signing out. `signOut` drops the user, every
mounted page's `useAuthGuard` sees an unauthenticated visitor, and the diver who just asked to leave
`/dives` is shown `/signin?next=%2Fdives` - a sign-in form asking them straight back into the page
they were leaving. So `AuthContext.signOut` names the destination itself.

It has to be a document navigation (`hardNavigate("/")`), not `router.replace("/")`. A client-side
navigation started from `signOut` _loses_ to the guard: the awaiting caller resumes on a microtask
while React's re-render - and therefore the guard's effect - is scheduled behind it, so the guard's
`replace` runs second and wins. A page load isn't something a later `history.replaceState` can
cancel, which makes the destination a decision rather than a race. It also takes everything the
session left in memory with it (the access token, fetched dives, blob URLs for private card images)
instead of leaving it in a signed-out tab.

Because `Header` is on public pages too, signing out from `/contact` or `/privacy` now reloads to
`/` rather than leaving the reader where they were. That's intended - the diver asked to leave, and
one destination for one action beats a rule about which page they happened to be on.

#### A failed logout must take none of that

The whole scheme above is safe only when the _server_ ended the session, and it is worth being
precise about why, because the obvious "clean up locally regardless" version of `signOut` is
actively harmful. `POST /auth/logout` is the only thing that blacklists the token pair and deletes
the refresh cookie. If it fails - offline, DNS, a 5xx before the handler runs - that cookie is still
live, and a page load hands it straight to `AuthContext`'s bootstrap: `refreshAccessToken()`
succeeds off the cookie, `getCurrentUser()` succeeds, and `/` (which gates on
`useRedirectIfAuthenticated`) forwards to `/dashboard`. The diver clicks Sign Out and lands on their
dashboard, signed in, with nothing said. Reproduced by failing just the logout XHR in the browser;
it is deterministic, not a race.

So `signOut` navigates only on success, and on failure changes nothing and rejects.

Not clearing the user in that case is the part that looks backwards, and was the other way round
before. The old reasoning was that "the local session is gone either way" since `authAPI.signOut`
drops the in-memory access token in a `finally`. It isn't gone: the response interceptor rebuilds it
from the surviving cookie on the very next 401. "Signed out" would be a display state painted over a
working session - the precise lie that matters on a shared machine, where someone walks away
believing they're out. Staying visibly signed in is honest, and `Header` turns the rejection into a
"Couldn't sign you out" toast so there's something to act on.

The guard's effect does still run, though, which raises two separate questions. Both were measured
rather than argued, by patching `fetch`, `history.replaceState` and a `MutationObserver` onto
`/dives` and stashing what they saw in `localStorage` so it survived the unload.

**Does the `replace` rewrite the history entry being left behind**, putting `/signin?next=%2Fdives`
one Back press under the landing page? No. No `replaceState` runs at all, and after pressing Back
`performance.getEntriesByType("navigation")[0].name` reports `/dives` - with and without a guard
that stands down. Back _does_ arrive at sign-in, but by reloading `/dives` while signed out and
being bounced on its own merits, exactly as typing that URL would be. Nothing to fix, and worth
knowing before anyone tries.

**Does anything happen at all, then?** Yes, and this is why `hardNavigate` raises `isLeavingPage()`
and `useAuthGuard` returns early on it. Without the check the guard opens a transition and gets as
far as an RSC request for `/signin?next=%2Fdives&_rsc=…` before the document dies. Nothing paints on
localhost, where a full document load beats it comfortably - but that request is the first half of
the flash, and a small RSC payload racing a full page load over a slow link is not a race worth
leaving open for a route the diver will never see. The flag is module state, not React state:
nothing needs to re-render on it, it's only read from an effect that runs after it's set, and it's
never unset because the document is being replaced.

`hardNavigate` living in `lib/navigation.ts` also makes this testable at all: `window.location` is
unforgeable, so a test can neither spy on `assign` nor replace the object, and calling it for real
under jsdom just logs "Not implemented: navigation". The wrapper is a module a test can mock, which
is what `AuthContext.test.tsx` does.

The `Header` no longer wraps the call: `signOut` already handles a failing logout and picks its own
destination, so the old `try`/`catch` there had nothing left to catch.

## The dashboard shows only what the app actually tracks

`app/dashboard/page.tsx` used to carry three things the app could not back up, and they are gone:

- **A "Species Seen" tile.** `user_dive_stats.species_seen` exists in the API's schema but is never
  derived from anything (see `services/dive_stats.py`), so the tile read "0" for every diver
  forever. It stays in `UserDiveStats` on the client - the field is really on the wire - but nothing
  renders it on the dashboard.
- **A "Quick Actions" card** whose "Find Dive Sites", "Find Dive Buddy" and "Plan Trip" buttons were
  plain `<Button>`s with no `href` and no handler. Two of those destinations exist (`/sites`,
  `/trips/new`) and are already one click away in the header's create menu; the third is not a
  feature. The card went, and the one action worth promoting - logging a dive - is now a single
  primary button in the page header.
- **A "Getting Started" checklist** hard-coded to "0/3", "Pending" and "Optional" regardless of the
  account, pointing at a "Join Community" step for a community page that was deleted.
  `SetupChecklistCard` replaces it with the same three-step shape driven by real counts
  (`/user/dive-stats`, `/gear-items`, `/certifications`, the last two fetched with
  `items_per_page: 1` for `total_count` alone), and it removes itself once all three are done.

`CertificationExpiryCard` is new, and is the certification twin of `ServiceDueCard`: certifications
were a whole feature the dashboard never mentioned, and an expired rescue or first-aid card is
exactly the kind of thing a diver wants to find out about before a trip rather than at a dive shop.
It follows the same rule as its gear twin - it renders `null` when nothing needs renewing and when
its fetch fails. Its rows all link to `/certifications` rather than to a card of their own, because
certifications are edited in dialogs on that page and have no per-certification URL.

The filtering and ordering live in `certificationRenewals()` in `lib/certification.ts`, not in the
component, so they can be tested independently of rendering - "expired cards sort above
expiring-soon ones" is a real behaviour worth pinning down. (This used to read "the app has no React
component tests"; it has `@testing-library/react` now - see below - but keeping the logic out of the
component is still the better shape.)

### The layout is a flat stack, so the cards that can vanish leave no hole

The page is one `space-y-6` column and `ServiceDueCard`, `CertificationExpiryCard` and
`SetupChecklistCard` are **direct children** of it. That is deliberate: `space-y-*` spaces rendered
siblings, so a card returning `null` costs nothing, while wrapping the three in a "needs attention"
`<div>` would leave that div's own gap behind on every day nothing is due. The same reasoning rules
out the old two-column grid - its sidebar held the two fake cards, and without them an established
diver with nothing due would have been looking at an empty third of the page.

Alerts sit above the stats rather than below: an overdue regulator matters more than a dive count,
and the setup checklist is the first thing a brand-new account should see.

The stat tiles and the air-consumption chart hide themselves at zero dives (but _not_ while the
stats request is in flight - `hasDives` stays true until the answer is in, so they don't pop in a
beat after everything else). A row of zeroes and an empty chart tell a new diver less than the
checklist and the "log your first dive" prompt already do.

Recent dives and recent trips now sit side by side at `lg`, which is why `RecentDivesCard`'s rows
grew a `min-w-0` on their left block and a `flex-shrink-0` on the metrics: at half a row wide, a
long site name would otherwise squeeze the duration/depth column instead of wrapping.

### The heading greets by time of day, and reads the clock during render

"Welcome back" is now "Good morning/afternoon/evening, {name}!". The buckets live in
`greetingForHour()` in `lib/date-time.ts` rather than in the page, so the boundaries are testable
without faking the clock: morning from 04:00, afternoon from noon, evening from 18:00 - and the
small hours fall in with the evening, because "Good night" is a farewell rather than a greeting and
there is nothing else to say to someone reading their logbook at 03:00.

`new Date().getHours()` is called during render, which would normally be a hydration hazard - the
server's hour is not the viewer's, and React would swap the text out after mount. It is safe here
only because the heading sits behind the auth gate: `AuthProvider` starts at `isLoading: true` and
only resolves in an effect, so the server (and the first client render) return `PageSpinner` and the
greeting never appears in the SSR markup. Anything that later renders a greeting _above_ that gate
needs the mounted-flag treatment `ThemeToggle` uses instead.

The greeting is fixed for the life of the mount - no timer ticks it over at midnight. A dashboard
left open that long is not worth an interval. `scripts/screenshots.mjs` pins the browser clock to
09:00 so the README image does not depend on what time it was retaken - see below.

## `/profile` is gone until there is someone else to show it to

The page was rebuilt one commit before it was removed (`324c1d6`), and rebuilding it is what made
the case against it legible. What was left after the five invented things came off was four blocks,
and three of them were already somewhere better:

- **The stats card** - total dives, max depth, total time - was the dashboard's three tiles, from
  the same `getDiveStats()` call, with the same `hasDives` gate and a near-copy of `StatCard` beside
  it. Two pages, one endpoint, one set of numbers, and every future change to them to make twice.
- **`RecentDivesCard`** was the same component with the same props as the dashboard's.
- **The identity header** - avatar, name, `@username`, email - was a read-only view of what
  `/settings` both shows _and_ edits, ending in an "Edit Profile" button whose only job was to send
  the diver to `/settings`.
- **`CertificationsCard`** was the one block not on the dashboard, and `/certifications` is the
  fuller version of it, in the main nav.

That is the whole page: a strictly weaker dashboard at a second URL, reachable only from the avatar
dropdown directly above the `/settings` item it kept pointing at.

The reason none of that could be fixed by rearranging is that a profile page exists to be _someone
else's_ view of a diver, and this API cannot do that yet. See "Current-user endpoints moved off
`/user/me`/`/user/{uuid}` onto a bare `/user`" above: the public profile endpoint for other users is
deliberately not built, and there is currently no way to fetch another user's data at all.
`/profile` had no `[username]` segment and could not have used one - it read the signed-in caller
and nothing else. Two URLs were answering the same question about the same person.

When the public endpoint lands, the page comes back as `/divers/[username]`, written fresh. This one
is not scaffolding for it: that page takes a username parameter, must not render `email`, and shares
no fetch with anything here.

### The certifications summary went with it rather than moving to the dashboard

`CertificationsCard` and `certificationsByRecency` (`lib/certification.ts`, with its tests) were
built for this page in the same commit and had no other caller, so they were removed rather than
left exported with nothing importing them. Both are recoverable whole from `324c1d6` when
`/divers/[username]` wants them.

The dashboard was deliberately _not_ given the card in exchange. It already carries
`CertificationExpiryCard`, which is the half of the subject that needs a diver to act; "here is
every c-card you hold, newest first" is not an alert, and `/certifications` is one nav click away
and shows all of them with their card images, dates and dialogs. A five-row read-only echo of a page
in the nav is the same duplication that took the profile page down, one page over.

`certificationsByRecency` is worth reading before writing that ordering again: `GET /certifications`
is newest-_row_-first, so a diver who types their Open Water card in last gets it above the
Divemaster it led to. `/certifications` itself still renders the API's order - it is a full table
with a sortable-looking date column and pagination, and reordering one page of it client-side would
be a lie about the pages either side.

### The Gravatar line moved to `/settings`, reworded

It was attribution under a picture on the profile page. `/settings` shows no avatar, so it would
have been attribution for nothing there; it is now a "Profile Picture" note in the profile form
saying where the avatar comes from and that changing it on Gravatar changes it here. That is the
question a diver actually arrives at `/settings` with.

The username hint under the same form used to read "used in your profile URL and for mentions".
Neither exists - there is no profile URL any more and mentions were never a feature - so it now
states the rule the field actually enforces (`profileSchema`: lowercase letters and numbers,
unique).

## Dive numbering: the suggestion follows the date, and only the diver renumbers

The API owns the rules (`services/dive_numbering.py`, and the corresponding section of its
`DECISIONS.md`): `dive_number` is a label, gaps in it are as often deliberate as accidental, and
nothing renumbers a log automatically. Three things here follow from that.

### The new-dive form's number tracks `start_time`, not the last dive

It used to be `lastDive.dive_number + 1`, where "last" meant most recent by date. That is right for
the ordinary case and wrong for the one that matters: back-filling a 2019 dive into a log that
reaches #212 suggested #213. `useSuggestedDiveNumber` refetches `GET /dives/next-number` whenever
the start time changes, which also covers importing a dive-computer file - the import rewrites
`start_time` to whenever the dive really was, and the number follows it there.

**Use `resetField`, not `setValue`, to write the suggestion.** This is the non-obvious part. The
hook stops suggesting once `dive_number` is dirty, which is how it knows the diver has taken the
field over. `setValue` without `shouldDirty` looks like the right call and isn't: react-hook-form
recomputes `dirtyFields` by comparing values against `defaultValues` on the next change to _any_
field, so a suggestion written over the default shows up as dirty the moment the diver touches the
date - which is precisely when the hook needs to run again. Symptom: the suggestion lands once and
then silently stops following the date. `resetField(name, { defaultValue })` writes the suggestion
_as_ the default, so "dirty" keeps meaning "the diver typed a number".

It is create-only. On the edit form, renumbering a dive because its date was corrected is the silent
renumbering the app avoids everywhere else - an existing number may be written in a paper logbook,
or on the back of a photo.

### The duplicate note is attached to a value, not rendered outright

`diveNumberNotice` is `{ forValue, message }` and `DiveFormFields` shows it only while the field
still holds `forValue`. Two reasons. A note about a number that isn't on screen any more is worse
than no note; and the alternative - a `form.watch("dive_number")` in the page to compare against -
opts that whole component out of React Compiler memoization (`react-hooks/incompatible-library`),
whereas the field's own render already has the current value reactively.

It is a `FormDescription`, never a validation error. Duplicate numbers are a normal state while
back-filling, reconciled later with Renumber, so nothing about them may block a save.

### The numbering line describes; it doesn't scold

`describeDiveNumbering` never says "should" and never phrases a gap as a problem - see its own
comment. A diver continuing a paper logbook has deliberate gaps forever, and a line that nags on
every page load is one they stop reading, including on the day it would have told them something.
That is also why there is no dismiss control: the line is muted and factual enough not to need one,
and hiding it would hide the way in to Renumber.

`RenumberDivesDialog` mounts its form as a child rendered only while open, so each visit starts from
clean defaults instead of inheriting the last run's inputs (and so the reset isn't a `setState` in
an effect). Its preview is tagged with the inputs that produced it and every branch is gated on that
tag matching the form - including the confirm button, so it can never apply a renumber the diver
hasn't been shown. The change list is rendered in full inside a scroll container rather than
truncated: "and 180 more" hides exactly the rows someone would want to check against a paper
logbook.

## "Due today" is overdue, and the certification boundary is deliberately the other way

`serviceStatus` treats a gear schedule with `next_due_on === today` as `overdue` (`days <= 0`), and
`formatServiceDue` now says "Overdue (due today)" to match. It used to say a bare "Due today", which
put reassuring prose directly under a destructive badge - the two are computed independently and had
drifted.

The badge is the side that was right, because the API has already picked it and has two consumers
depending on it: `service_status` in the API's `services/gear_service.py` uses
`today >= next_due_on`, and the reminder digest in `core/worker/functions.py` emails "overdue since
11 Aug 2026" about a schedule due that morning. Moving the _status_ boundary to `days < 0` would
have made the badge disagree with the email, so only the text changed.
`formatServiceDue agrees with serviceStatus` in `gear-service.test.ts` pins the pair together.

**`certificationExpiryStatus` uses `daysLeft < 0` instead, and that is not an inconsistency to
harmonise away.** A c-card is valid _through_ its printed expiry date - a diver whose card expires
today can still dive today - whereas a service interval that has arrived has arrived. The two are
different kinds of date and want different boundaries.

The certification side also has no API counterpart at all: no status field on any read schema, no
reminder job, no email. `CERTIFICATION_EXPIRING_SOON_DAYS` is a frontend-only constant, unlike
`SERVICE_DUE_SOON_DAYS`, which is deliberately named identically on both sides so one grep finds the
pair. Don't go looking for the certification twin; there isn't one.

## Service status is derived in the browser, and so is a timezone off the digest

The API returns only clock-stable facts about a schedule (`next_due_on`, `next_due_at_dive_count`,
`last_service_on`) and never a computed status - `ServiceStatus` is documented in the API's
`schemas/gear_service.py` as deliberately neither a stored column nor a field on any read schema.
Those routes are cached for 60 seconds, and a cached status is wrong the next morning. Duplicating
the derivation in `lib/gear-service.ts` is the intended cost of keeping the responses cacheable; it
is not drift, and moving it server-side would trade a correct badge for a cheaper one.

One consequence worth knowing before someone reports it as a bug: the browser computes "today" in
the _viewer's_ timezone (`todayIsoDate` uses local date parts on purpose), while the reminder digest
computes it in UTC (`core/worker/functions.py`, which notes that `User` has no timezone column). A
diver at UTC+13 can therefore see "Overdue" in the app up to a day before the email agrees. At a
30-day lead time that is cosmetic, and the fix on the API side would be to run the job hourly and
gate on the offset of the user's most recent dive - not worth it. Documented rather than fixed.

## One paging helper, and the dashboard cards no longer page at all

Four modules had their own `while (hasMore)` loop. They are now one `fetchAllPages` in
`lib/api/client.ts`, with a page cap, an abort signal and cross-page dedup.

They were never the infinite-loop hazard they looked like: the API clamps `items_per_page` to 100
and computes `has_more` as `page * items_per_page < total_count`, so `page` outruns any realistic
insert rate. The real hazard is subtler. List pages are cached for 60 seconds under a per-`page`
key, so a loop can stitch together _different snapshots_: an insert between page 1 and page 2 shifts
every later row down one and the boundary item arrives twice. That is what `keyOf` is for. The gap
half of the same problem

- an item pushed from page 2 to page 3 by a delete - cannot be fixed client-side at all, which is
  the argument for a single-shot endpoint rather than a better loop.

Truncation is `console.warn`ed rather than thrown. A card showing the first 2000 items beats a card
showing an error, but a short list that looks complete is how "my oldest certification stopped
appearing" becomes unexplainable.

The abort signal stops the loop _between_ pages; it does not cancel the request already in flight,
because the `lib/api/*` functions take no axios config. That is the useful 90%: a dashboard card
that unmounted mid-fetch stops walking the rest of a diver's history. `isAbortError` is exported
alongside so call sites can tell "navigated away" apart from "request failed" and skip the error
log.

**Both dashboard cards have since stopped paging entirely.** `ServiceDueCard` already had
`/gear-service-due`; `CertificationExpiryCard` now has `/certifications-expiring` (see the API's
`DECISIONS.md` for why that endpoint takes no `within_days` parameter). Each is one request.
`fetchAllCertifications` survives for any caller needing whole `Certification` records rather than
the four fields a renewals row renders - but nothing on the dashboard does.

Both cards now honour the `truncated` flag those endpoints return, via `TruncatedNote`. The cap was
previously invisible: a diver past it saw a card that looked like the complete answer while some
overdue gear simply wasn't in it. For a safety-adjacent list, silently under-reporting is the wrong
direction to fail in.

## Blob-wrapped error bodies are unwrapped in the interceptor, not at the call sites

Axios applies the request's `responseType` to _error_ responses too, so a failed
`responseType: "blob"` request (certification card images, dive source files) arrives with its JSON
error body wrapped in a Blob. `getApiErrorMessage` looked for `response.data.detail` on a Blob,
found `undefined`, and every binary call site showed its generic fallback - even though the API
sends a perfectly good `{"detail": "This dive has no profile"}`. Every binary route raises an
ordinary `HTTPException`, so the route's declared `media_type` never applies to a failure.

`unwrapBlobErrorBody` runs in the response interceptor, at the one place every rejection already
passes through. Doing it there rather than in `getApiErrorMessage` keeps all ~26 call sites
synchronous instead of forcing an async variant onto the handful that fetch binary. A body that
isn't JSON is left as the Blob and the caller's fallback is used - throwing from inside the
interceptor would replace the real error with a parse error.

`useAuthedBlobUrl` returns the raw `error` alongside `hasError` so callers can run it through
`getApiErrorMessage` themselves; the hook has no opinion about what the fallback message should be.

## The combobox will not clear a selection it cannot prove is gone

Two ways `CreatableCombobox` used to lose data, both now decided by pure functions (`commitAction`,
`clampActiveIndex`) rather than inside a blur or keydown handler.

**Tabbing through the Trip field cleared the trip.** `onBlur` calls `commit()`, which matched the
typed text against `remoteResult.items` - empty until the debounced search lands. Tab in and
straight out of Trip on `/dives/new` and the field held the selected trip's name, matched nothing,
and committed a clear. The dive saved with no trip.

The fix is to distinguish "the server says nothing matches" from "we never asked". `searchedQuery`
records which query the current results actually answer; until it equals the text being committed,
an empty result set is not evidence and `commitAction` returns `keep`. A _failed_ search
deliberately leaves `searchedQuery` untouched for the same reason - a 500 is not a statement that
the trip has been deleted. A second guard keeps a selection whose name the input still shows, which
covers the case where the selected item has dropped out of the current results entirely.

The guard is not "never clear in remote mode": once the server has answered that exact query with
nothing, the clear goes through, so deleting the text and typing a name that really doesn't exist
still takes effect.

**Enter could throw.** `activeIndex` was clamped when it _moved_, but the option list can shrink
underneath a stationary highlight - a debounced search narrowing, or a sibling pick changing
`excludeIds`. Enter then read `filteredItems[activeIndex - addNewOffset]`, got `undefined`, and
`handleSelect` threw on `item.id`. `clampActiveIndex` re-derives the highlight every render and
every read goes through it. Out-of-range collapses to -1 rather than clamping to the last row: the
row the user was looking at is gone either way, and -1 gives Enter its other, safe meaning (commit
the typed text) instead of silently picking whichever unrelated option now sits at that index.

## Fetch states are one settled value, not a pile of booleans

`DiveProfileCard` kept `profile` and `hasFailed` as separate state, and neither was reset when the
dive or the profile version changed. One failure was therefore permanent for the life of the page,
and a re-imported dive rendered the _previous_ version's chart under the new sample count. It is now
a single `ProfileResult | null` - `null` meaning "in flight" - cleared in the effect's cleanup,
which is the same shape `useAuthedBlobUrl` uses and which avoids a `setState` in an effect body.

It also branches on _which_ failure. A 404 ("This dive has no profile") is permanent and gets no
retry button, because re-asking returns the same 404 and offering the button implies otherwise. A
401/5xx/network failure gets one.

The dashboard's stats fetch had the opposite problem: it only `console.error`d, so all three tiles
sat on "—" forever, indistinguishable from a request still in flight. There is no legitimate empty
case to confuse it with - the API returns _zeroed_ stats for a diver with no dives rather than a
404 - so anything landing there is genuinely exceptional and now shows an error with a retry.

`usePaginatedResource` had no race guard. Paging faster than the network answers put several
requests in flight, and an earlier page's slower response would overwrite the newer one's rows _and_
set `currentPage` back to its own number - the footer saying "page 3" over page 2's rows. A request
id ref means only the newest is allowed to settle; superseded ones also leave the spinner alone,
since the request that replaced them is still running.

## Assorted fixes whose comments were lying

- **`useDragSort` did not remove its window listeners.** The unmount effect called `endDrag`, which
  only reset state - `handleMove`/`handleEnd` are closures created inside `startDrag`, so nothing
  outside it could name them. `endDrag` now calls a remover stored in a ref, which makes both the
  pointer-up path and the unmount path go through one place.
- **`use-toast` is vendored from shadcn/ui and shipped two upstream bugs.** Its subscribe effect had
  `[state]` where it means `[]`, so every toast unsubscribed and resubscribed; between the two, a
  `dispatch` from another subscriber's render could skip this one. `TOAST_REMOVE_DELAY` was
  `1000000` - ~16.7 minutes - which with `TOAST_LIMIT = 1` pinned every toast the app had ever shown
  in `memoryState`. It is 1000ms, which only has to outlast the exit animation.
- **Object URLs were revoked synchronously after `link.click()`.** Chrome has taken its own
  reference by then, so it looked fine; Firefox and Safari read the blob asynchronously and silently
  cancel the download. Both call sites now go through `lib/download.ts`, which also appends the
  anchor to the document (Firefox ignores a detached one) and defers the revoke.
- **`DateTimePicker` invented today's date.** Typing a time with no date picked committed against
  `new Date()` - and on a dive being back-filled from a paper logbook, today is the one date it
  certainly isn't. It now holds the time in local state until a date is chosen.
  `Number.parseInt(raw, 10) || 0` also snapped a cleared field straight back to "00", so the box
  could never be emptied to retype it.
- **`AuthContext` rebuilt its value and all seven methods every render**, re-rendering every
  `useAuth()` consumer - ~15 pages plus the header. It matters most for the methods: `signOut` and
  `refreshUser` are dependencies of downstream effects, so a fresh identity re-ran those rather than
  merely re-rendering.

## `useResource` for the detail pages, and one delete flow for everything

The four `[id]` detail pages plus the dive edit page each hand-rolled the same block: read
`params.id`, cast it, fetch, toast-and-redirect on failure, clear a loading flag in `finally`. Five
copies drift, and these had: some guarded against settling after unmount and some didn't, so
navigating away from a slow dive page still fired a toast _and_ a redirect on whatever page the
diver had landed on. `useResource` is that block, once.

It also absorbs the five `params.id as string` casts. The cast itself is unavoidable - Next types
the param as `string | string[]` and only a catch-all route can produce the array - but it is worth
making in one place rather than five.

`refetch` re-reads _without_ touching `isLoading`, which is what lets the gear page's archive toggle
and the dive page's file delete swap the one card that changed instead of blanking the page into a
spinner. Failures there are deliberately non-fatal and don't redirect: whatever prompted the refresh
already succeeded.

The dive edit page seeds its form through `onLoaded` rather than an effect watching the resource.
That callback is held in a ref, so passing an inline arrow - the obvious thing to write - doesn't
restart the fetch.

**The four detail-page deletes now go through `useDeleteResource` too.** They had diverged from the
list pages and from each other, and only `gear/[id]` ran the failure through `getApiErrorMessage`.
So a 409 on a dive, a site or a trip - "this dive site is used by 3 dives", the one message that
tells the diver what to do about it - was replaced by a generic "Please try again.", which is
exactly the wrong advice when retrying will fail identically. The hook now formats the message
itself, so every caller gets it. Its docstring claimed it covered detail pages long before it did;
that is true now.

## `PaginatedResponse` moved down a layer, and dialogs share their error state

`PaginatedResponse<T>` lived in `hooks/usePaginatedResource.ts` - a layer _above_ `lib/api/`.
Nothing in `lib/api/` will import upwards from `hooks/`, so all eight modules declared their own
identical copy instead. It now lives in `lib/api/client.ts`, beside the client that produces it, and
the eight are type aliases over it. `hooks/usePaginatedResource.ts` re-exports it for the pages that
import the type alongside the hook.

Seven create/edit dialogs each kept their own `apiError` state and cleared it inside the effect that
resets the form - each carrying its own copy of the `react-hooks/set-state-in-effect` disable.
`useDialogApiError` owns that state, leaving those effects doing nothing but `reset(...)`, which the
rule has no quarrel with. Thirteen disables across the app are now seven, and the five that remain
outside the two hooks are genuinely different patterns (theme mount, avatar fallback, the date
picker's external sync), not copies of one.

## `FormControl` only labels what it can reach

`FormControl` is a Radix `Slot`: it merges `id`/`aria-describedby`/`aria-invalid` onto whatever
element its child _renders_. That works automatically for a leaf `<Input>` or `<Textarea>`, and
silently does nothing useful in two other cases - both of which the dive form had.

**A custom function component that never spreads rest props.** `DiveStartTimeField`, `TripCombobox`,
`DiveSiteMultiSelect`, `DiveGearField` and `VolumeCombobox` each ignored what `Slot` handed them, so
`FormLabel`'s `htmlFor={formItemId}` pointed at an id that existed nowhere. They now extend
`FormControlSlotProps` (exported from `form.tsx`) and spread it onto their own focusable control.

**A wrapper `<div>`.** Six more fields - Duration, Max depth, Average depth, Bottom temperature,
Visibility, Weight - wrapped their input in `<div className="relative">` for an icon or unit
adornment. `Slot` put the id on the _div_, and `<label for>` only associates with labelable elements
(input, select, textarea, button, meter, output, progress), so the input inside had no accessible
name either. `FormControl` now sits _inside_ the wrapper, around the `<Input>`. It only needs to be
within the `FormItem` for the context, which it still is.

This second group was found by reading the accessibility tree rather than the code - the markup
looks correct, and the fields look labelled on screen. Checking that every `label[for]` resolves to
a _labelable_ element is what surfaces it:

    [...document.querySelectorAll('label[for]')]
      .map(l => document.getElementById(l.htmlFor)?.tagName)

For a composite field (two controls behind one label) the slot props go on the _primary_ control -
the date picker in `DiveStartTimeField`, the item picker in `DiveGearField` - and the secondary one
keeps its own `aria-label` ("UTC offset", "Load a gear set").

## `--coral-solid`, for the same reason as `--teal-solid`

`--coral` is tuned for the logo and for icons and active states against a light or dark surface.
Used as a filled button background with white text it reaches only 2.3:1, which axe flags on the
landing page's sign-in button. `--coral-solid` (`16 100% 40%`) is the same hue darkened until white
clears AA at 5.1:1 - exactly the split `--teal` / `--teal-solid` already documents, and for exactly
the same reason.

Two other contrast failures went with it. The landing page's stats strip used
`text-primary-foreground/70` on `bg-primary`, which is 3.4:1 in dark mode - the 70% was carrying
visual hierarchy the `text-4xl font-bold` figure above it already carries. And `text-primary` as a
_link_ colour is 3.67:1 on the dark background: `--primary` is a mid-grey in dark mode, which is
fine behind white button text and not fine as text. Those links now use the app's own in-copy
idiom - a plain underline inheriting the surrounding colour, which is why `contact/page.tsx` passed
axe when `terms` and `privacy` did not.

`npx @axe-core/cli` over `/`, `/signin`, `/contact`, `/privacy` and `/terms` reports 0 violations.
The `code-quality` workflow only scans `/`; the others were checked by hand here, and are worth
re-checking the same way after any change to `globals.css`.

## Metadata, and why the landing page is a Server Component

Only `layout`, `contact`, `privacy` and `terms` exported metadata, and the root description was a
generic "Open source diving platform".

The root layout now sets `metadataBase` (without it Next warns on every build and emits relative
`og:image` URLs that no crawler can fetch), a `title.template`, OpenGraph and Twitter cards, and the
README's actual pitch. `NEXT_PUBLIC_SITE_URL` lets a self-hosted instance point it at its own
origin; the localhost fallback is right for development and harmless elsewhere, since the only pages
worth unfurling are public.

Because of the template, a page exporting `title: "Contact"` renders as "Contact | OpenDiving" - so
the three pages that previously spelled the suffix out themselves had it removed. The landing page
opts out with `title: { absolute: ... }`, its title already naming the product.

The landing page itself is now a Server Component that renders `components/layout/landing-page.tsx`,
which carries the `"use client"`. That is the split `contact/page.tsx` already used, and it is the
only way to export metadata from a page that gates its whole render on `useRedirectIfAuthenticated`.
It is also the one page worth indexing: everything else is behind auth, renders client-side because
the access token lives in memory, and has nothing to say to a crawler.

Its hero headline was an `<h2>` and is now the page's `<h1>` - the header wordmark used to hold the
only `<h1>`, which gave every page two of them and made "OpenDiving" rather than the page's own
title the first entry in a screen reader's heading list. The wordmark is a `<span>` now, styling
unchanged, and the dashboard's greeting heading was promoted to `<h1>` to fill the gap it left.

## Component filenames are kebab-case

81 of 86 files in `src/components` already were; the five exceptions were the entire contents of
`components/auth/` and `components/settings/`. They are renamed (`AuthForm.tsx` -> `auth-form.tsx`
and so on), the _exported components_ keep their PascalCase names, and `google-icon.tsx` moved into
`components/icons/` where the other three icons live.

Nothing stated the convention anywhere, which is how five files drifted out of it. It is stated here
now: **files kebab-case, exports PascalCase.**

## One spinner component per shape, not per call site

Three separate styles were in use. `PageSpinner`/`SectionSpinner` used the `Loader2` icon; seven
pages hand-wrote a `min-h-[60vh]` version of `PageSpinner`; and `app/page.tsx` and
`app/settings/page.tsx` used a bordered CSS ring instead of the icon entirely. Five forms had a
fourth, `<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />`.

`PageSpinner` now takes `variant`. The `min-h-[60vh]` difference is deliberate and documented
above - a page rendering _below_ `AppShell`'s header and footer must not reserve a full viewport, or
the footer is pushed off the bottom of a page that was about to be shorter than one - so the variant
preserves it without preserving seven copies of it. `ButtonSpinner` covers the in-button case and
uses `currentColor`, which fixes a real bug: the hardcoded white was only correct on a filled button
and wrong on the outline and ghost variants.

## Theme tokens, and the three colours that needed a second variant

CONTRIBUTING.md asks for theme tokens; 124 raw Tailwind palette classes across 12 files said
otherwise. They are gone. What remains is a handful that are _correctly_ raw: the dialog overlay's
`bg-black/80` (a scrim is black in both themes) and the two chart tooltips' `border-white/10`
hairline over a dark surface.

Most of it was mechanical - `text-neutral-600 dark:text-neutral-400` is `text-muted-foreground`, and
so on. Three cases were not, and all three resolved the same way: **a colour tuned to sit _behind_
white text cannot also be read _as_ text, and vice versa.** The codebase already had one instance of
this (`--teal` / `--teal-solid`); it now has the rest of the family.

- `--coral-solid` for filled coral buttons (`--coral` is 2.3:1 under white).
- `--coral-text` for coral _as_ text - the header's active nav item was 2.5:1 on a light background.
  This one **is** redeclared under `.dark`, unlike `--coral` and `--coral-solid`: a coral dark
  enough to read on white is too dark to read on the dark theme's background. The brand mark still
  uses `--coral` in both themes, so the "reads the same everywhere" property that token exists for
  is untouched.
- `--destructive-solid` for filled destructive surfaces (button, badge, toast). White on
  `--destructive` is 3.6:1 - an AA failure on the most consequential control in the app - but
  `--destructive` itself has to stay light enough to read as text on the dark theme's background,
  which is the same tension from the other side.

Two new semantic tokens came with the inline-banner work: `--success` (five components each
hand-picked a `green-600`/`green-400` pair) and `--warning` (one use, the terms page's safety
notice, which is deliberately _not_ one of the informational callouts that became `bg-muted` - a
dive log disclaiming safety advice should not look like a footnote).

`--muted-foreground` was also darkened from shadcn's 46.9% to 40%. At the default it is 4.65:1 on
`--background` and only 4.34:1 on `--muted`, so every muted line on a tinted surface failed -
including the footer, which this work had just moved onto `bg-muted`.

**In-copy links are underlined, not coloured.** `text-primary` is a mid-grey in dark mode: correct
behind white button text, 3.67:1 as link text. Ten links across `signin`, `onboarding`, `terms`,
`privacy`, `verify`, `confirm-email` and `AuthForm` used it. They now use the idiom
`contact/page.tsx` already had - a plain underline inheriting the surrounding colour - which also
fixes axe's `link-in-text-block` (colour alone was marking them as links inside a paragraph).

## Outcomes go in toasts; `StatusMessage` is the documented exception

`app/settings/page.tsx` was the only page reporting outcomes as inline strings rather than toasts.
Its profile save now toasts like everything else.

Some inline banners stay, and `StatusMessage` is what they use: a form whose result the diver has to
be able to _re-read_ while fixing it - the sign-in form's "that link has expired", the email-change
card's "check your new address" - is worse served by a message that fades. It carries
`role="alert"`, and the state is signalled by the icon, border and tint rather than by the body
text, which stays `foreground`. `text-destructive` on `bg-destructive/10` is only 3.3:1; the old
hand-rolled `red-600`-on-`red-50` version actually passed, so standardising without this would have
been a regression.

## Verifying colour work

Reading the accessibility tree catches labelling; contrast needs measuring. Both themes, and don't
trust arithmetic over the rendered value - `bg-destructive/10` composites over whatever is behind
it, so the painted background is not the token's own colour.

`npx @axe-core/cli` covers the public pages; the authenticated ones have no session under it, so
those were swept with an in-page script that walks every text node, resolves the nearest opaque
background, and applies WCAG's large-text threshold. That is what found the footer regression and
the nav item. One caveat learned the hard way: a scan run while the dev server is mid-recompile
reads a half-updated stylesheet and reports dozens of phantom failures - re-run before believing a
sudden spike.

## Component and hook tests are possible now, and coverage says where the gaps are

`@testing-library/react` (plus `/dom`, `/jest-dom`, `/user-event`) is a dev dependency, and
`vitest.setup.ts` registers jest-dom's matchers along with the browser APIs jsdom lacks that Radix
reaches for on mount - `matchMedia`, `ResizeObserver`, `scrollIntoView`. Without those, anything
rendering a dialog or a select throws before it reaches its assertion.

The first tests are for the hooks this round of work created or fixed, because that is where the
bugs were. Each pins a specific failure:

- `useDeleteResource` shows the API's own message on a refused delete, not "please try again" -
  which is exactly the wrong advice when retrying will fail identically.
- `usePaginatedResource` ignores a superseded response that lands late. Both of those tests were
  checked by deleting the request-id guard and confirming they fail.
- `useResource` neither toasts nor redirects once unmounted, and `refetch` does not redirect on
  failure.
- `AuthContext` keeps its context value and methods referentially stable, clears the user on the
  session-expired event, and clears it even when the server-side sign-out fails.

Two things worth knowing before writing more:

**Mock `useRouter` with a hoisted object.** Next's real `useRouter` returns a stable reference and
`useResource`'s fetch effect depends on it; a mock that builds a fresh object per call re-runs the
effect forever. It looks exactly like an infinite-loop bug in the hook, and it isn't.

**`vi.mock` factories can't close over ordinary `const`s.** The call is hoisted above every other
statement in the file, so shared spies have to come from `vi.hoisted`.

Coverage was scoped to `src/lib/**` with no thresholds, which meant `hooks/`, `contexts/`,
`components/` and `app/` were invisible and nothing was enforced. All five are in scope now
(`components/ui/**` excluded - it is vendored from shadcn/ui and its number would measure how much
of someone else's library the app happens to render).

**The global thresholds look low on purpose.** With `components/` and `app/` in scope and almost
entirely untested, the headline figure is ~24%. Widening the scope was meant to make that gap
_visible_, not to flatter the number - so the global floors sit just under the current values as a
ratchet, and per-directory floors on `lib/`, `hooks/` and `contexts/` are what actually hold the
tested layers to account. Raise them as coverage grows; lowering one to make a build pass is the
thing they exist to prevent.

## The toast store is a real external store, and a lesson in measuring against a dev server

`useToast` uses `useSyncExternalStore` rather than the `useState` + `useEffect` subscription
shadcn/ui ships. The store is module-level - `toast()` has to be callable from anywhere, including
outside React - and that hook is the primitive for exactly this.

The effect-based version has a real gap. `dispatch` notifies whoever is in `listeners` at that
instant and nothing re-delivers, but the subscription is set up in an _effect_, so a toast raised
before that effect runs reaches nobody. It is observable: instrument `dispatch` and load a detail
page with a bad id, and you get `ADD_TOAST listeners= 0`. `<Toaster />` is a later sibling of
`<AppShell>` in the root layout, so a page's effects run first.

Upstream mostly gets away with it, because a subscriber mounting _after_ the dispatch seeds
`useState(memoryState)` from the store and picks the toast up anyway. What it cannot recover is a
subscriber that was already rendered when the toast landed. `useSyncExternalStore` closes that:
React reads the snapshot during render and re-checks after subscribing.

`TOAST_REMOVE_DELAY` came down from upstream's ~16.7 minutes to 1000ms, which is all the exit
animation needs. (It does not control how long a toast is on screen - Radix owns that, 5s by
default.)

### The measurement trap, which cost more time than the fix

An earlier pass through this file concluded that shortening `TOAST_REMOVE_DELAY` broke toasts
outright, and reverted it with a comment warning the next person off. **That was wrong**, and the
reasoning is worth keeping because the same trap is easy to fall into again.

Every "the toast never appears" reading was taken too late. Navigating the browser to a route the
dev server has to compile takes several seconds, and the tooling only hands control back once the
page has loaded - by which point `performance.now()` was already reading 8-11 seconds, and Radix had
auto-dismissed the toast at ~5.9s. The toast had been rendering correctly the whole time.

Two things make a measurement like this trustworthy:

- **Time from an event you control, not from when the tool returns.** Trigger the failure with a
  client-side transition on an already-loaded page (breaking the request rather than the URL), and
  sample from `t=0`. Done that way the toast is plainly visible from 831ms to 7.8s.
- **Print the page's own age.** A single `performance.now()` in the first sample would have shown
  the window had already closed.

This is the same class of error as the phantom axe failures noted above: a dev server mid-recompile,
or a page older than you think, will happily report a bug that is not there. When a result
implicates something as inert as a `setTimeout` constant, suspect the measurement first.

## Both charts' legends are the control for what they plot

Every mark on both charts can be turned off, and the toggle is the legend entry itself rather than a
separate row of checkboxes. The legend already names each mark and carries its swatch, so it is
where you look to ask "which line is that" - and "hide it" is the next thought. A control row above
the chart would say the same three words twice.

They are `<button aria-pressed>`, not checkboxes: these change the picture in place, and the pressed
state is what a screen reader needs to hear. The label stays the mark's own name in both states -
"Show Depth" on a control that is currently showing depth describes what the button _does_ rather
than what it _is_, and `aria-pressed` already carries the rest. A hidden mark keeps its swatch,
drawn in the button's own muted color instead of the mark's, so a grey line where the teal one was
says both "off" and "this is what it would be".

**Hiding everything is allowed**, and puts a one-line message where the plot was with the legend
still under it. The alternative - disabling the last enabled toggle - is a button that refuses to do
what it says, and the empty state is one click from recoverable.

**The profile chart toggles by _channel_, not by plotted line**, which is only a distinction on a
dive with two cylinders. Both pressure lines draw in the same `--pressure` violet, so listing them
separately never distinguished them by eye anyway, and the crosshair readout still names each one
("Tank pressure (gas 2)"). Toggling by channel is also what makes the choice worth remembering
across dives: "gas 2" means a different cylinder on the next dive, "tank pressure" doesn't.

**The labelled axes follow what's plotted.** With depth hidden, temperature takes the gridlines
(they were depth's, and gridlines that line up with no labelled value are just decoration); with
only pressure left, the right-hand labels are pressure's, which is the one case they aren't
temperature's. That needed `PlottedChannel` to carry the `domain` it was scaled against rather than
the axis code recomputing one - which would have been _wrong_ for pressure, where every cylinder
shares one domain across all of them. The `aria-label` is built from the visible channels too: a
summary naming a temperature range the diver has hidden describes a chart nobody is looking at.

**The gas chart's trend and its spread band are one mark**, so they share one toggle. The band is
what gives the line body and says how tightly the dives it averages were clustered; a chart with one
and not the other says less than either alone. The legend keeps saying "and spread" while the trend
is _off_ (`withSpread`, which is `scope !== "all"`, separate from `showSpread`, which also requires
the trend) - a control that drops the word exactly when you're deciding whether to bring it back is
describing the picture instead of itself.

## Remembered selections use `useSyncExternalStore`, and the handler uses the updater form

`lib/chart-series-view.ts` is the storage half, generic over the series keys because two charts want
it and their keys have nothing in common. Same `localStorage` reasoning as `gas-use-view.ts` (which
it took `subscribeToNothing` from): it has to survive the tab closing, and it has to work from the
bare `/dashboard` and `/dives/{uuid}` that the nav links point at, which a query string appearing
only after you touch a control can't do. Both keys hold nothing but a handful of series names the
charts themselves define.

The read is `useSyncExternalStore` with a server snapshot of `null`, for exactly the reason
`GasUseCard` already documents for its remembered period: `localStorage` doesn't exist on the
server, so a first client render that read it would disagree with the HTML Next rendered. The
snapshot stays the raw string, because `useSyncExternalStore` compares with `Object.is` and a
freshly parsed array each call loops forever.

`parseSeriesVisibility` **filters** through the allowed keys rather than rejecting on an unknown
one - a key this build no longer plots is stale, not corrupt, and dropping it leaves the rest of a
good selection intact. Two cases that look alike and aren't: a stored `[]` is restored as "hide
everything", because that is a choice someone made, while an entry naming _only_ unrecognized keys
falls back to null, because restoring it as "hide everything" would open on a blank plot for no
reason the diver could account for. The profile chart additionally intersects the remembered
selection with the channels _this_ dive recorded, and ignores it when the intersection is empty: a
dive that only carries what you'd hidden should open showing what it does have.

**The toggle handler uses `setChosen(current => ...)`, and this was a real bug first.** Computing
from the render's own `visible`/`marks` meant two toggles clicked inside one React batch both
derived from the pre-click value, so the second silently undid the first - reproduced by clicking
three legend buttons in one tick and getting one flip instead of three. The write to storage moved
into a `useEffect` keyed on the chosen selection, which is what keeps that updater pure; React is
entitled to call an updater twice.

## The hand cursor on buttons is restored once, in the base layer

Tailwind v3's Preflight shipped `button, [role="button"] { cursor: pointer }`. v4 dropped it to
match the browser default, and the result was an app whose cursor changed along a line that had
nothing to do with what the control did: `<Button asChild>` wrapping a `<Link>` got a hand, because
it renders an `<a href>` and the UA styles anchors that way, while the same component rendering a
real `<button>` - the same size, colour and hover state, sitting next to it in the same toolbar -
got an arrow. Roughly 18 call sites on one side and 100 on the other, plus every Radix trigger, so
it read as random rather than as a rule.

What made it worth fixing centrally rather than per component is where it had already got to:
`Checkbox`, the calendar's year/month dropdown and both chart legends had each grown their own
`cursor-pointer`, one file at a time, none of them aware of the others. That is the failure mode a
base rule prevents, so the four local patches came out with it.

The selector is Tailwind's own documented v4-compat snippet, widened to the native controls that had
accumulated patches (`select`, and checkbox/radio/file inputs - `Checkbox` is a plain `<input>`, see
the note on it there):

```css
button:not(:disabled),
[role="button"]:not(:disabled),
select:not(:disabled),
input:where([type="checkbox"], [type="radio"], [type="file"]):not(:disabled) {
  cursor: pointer;
}
```

Two things keep it from being blunt. **It lives in `@layer base`**, so every `cursor-*` utility
outranks it - which is what leaves Radix's menu and listbox items alone. Those carry an explicit
`cursor-default` on purpose, because a native OS menu doesn't show a hand, and they're
`role="menuitem"`/`role="option"` so the selector misses them twice over. The same precedence is
what keeps `disabled:cursor-not-allowed` on inputs and `cursor-grab` on the multi-select drag
handles working untouched. **And `:not(:disabled)`** stops a disabled control claiming a pointer;
`Button` sets `disabled:pointer-events-none` and so never needed it, but the inputs do.

`<label>` was deliberately left out. Only three labels want a hand - the ones paired with a
checkbox - and a bare `label` selector would put one over every text-input label too, where the
arrow is correct. Three explicit `cursor-pointer` classes are the cheaper answer.

## The README screenshots are generated, at one width that is a breakpoint

`scripts/screenshots.mjs` retakes every image in `docs/screenshots/`. Hand-cropped screenshots
drift: they get taken on whatever window happened to be open, at whatever scroll position looked
fine that day, against whatever account had data in it. The grid had ended up three page shots and
one bare chart card at a different size, which is exactly the kind of thing nobody notices until the
table looks lopsided.

**1024px wide, because that is where the cards stop stacking.** Every detail page lays out as
`grid grid-cols-1 lg:grid-cols-3`, and `lg` is 1024px. One pixel under it the sidebar drops below
the main column, so a screenshot of the dive page shows its profile chart with the site, the
conditions and the imported file a whole screen away - the page photographs as a narrow ribbon of
cards instead of as the two-column layout it is. 1024 is the _minimum_ that avoids it; going wider
only adds gutters, since the content is `max-w-6xl` centred, and shrinks the text further when
GitHub scales the image into a half-width table cell.

The dashboard was briefly shot narrower, on the theory that its `lg:grid-cols-2` would halve the
consumption chart. It does not - that grid holds Recent Dives and Recent Trips, and `GasUseCard` is
full width at every breakpoint, so the chart only gets wider and the trend easier to read. One width
for everything, and no reason to special-case the hero on that axis.

**Height is per page, and the cut lands on a card boundary rather than a round figure.** Cutting at
the _end_ of a card matters more than the exact number, and more than the three shots agreeing: a
frame that stops just shy of finishing a card reads as an off-by-one, while one that stops well
inside a card the reader can see continues reads as a page that goes on. 1086 is where the dive
page's profile chart finishes - it also clears the sidebar column beside it - and where the gear
page's service history does.

**The dashboard measures its own cut, because a written-down height goes stale quietly.** It was on
1086 too, back when consumption was its only chart and that was where the card ended. Dive activity
went in underneath, and the frame that had been cutting on a boundary was suddenly cutting through
the middle of a second chart - the one part of the hero image that has to look deliberate.
Re-measuring gave 1604, which survived exactly one retake: four words came out of `GasUseCard`'s
description, its header row stopped wrapping, 40px came out of the card, and the boundary moved
to 1564. Nothing failed either time. The frame just quietly stopped meaning what the comment above
it said.

Worse, the figure is not portable. Measuring 1564 in one Chromium and shooting in the Chrome
`playwright-core` drives produced a 3px sliver of the Recent Dives card along the bottom edge - the
same page, laid out four pixels apart. So `cutBelow()` reads the top of the row _after_ the named
card out of the page being photographed, moments before the shutter, and that is the frame height.
`CUT_BELOW` names the card; nobody maintains a number. Any page can opt in the same way, and the two
that still carry a literal do so because 1086 has never moved.

**`deviceScaleFactor: 2`**, because a 1x screenshot of a dark UI looks muddy on the displays most
people read a README on. Every image in `docs/screenshots/` is therefore twice its frame - a
1024-wide page is a 2048-wide PNG.

**One shot at a time, optionally.** `npm run screenshots -- you@example.com dashboard` takes only
the named images. None of the three are stable between runs - "due in 24 days" counts down, the
subjects are re-picked from whatever the log holds that day - so retaking all three to change one
puts two unrelated images in the diff.

**Selectors are scoped to the card they belong to, by heading.** `selectMonth` drove the consumption
chart's Year/Month toggle through a bare `getByRole("button", {name: "Month"})`, which was
unambiguous until dive activity landed with a toggle of its own and every retake died on a
strict-mode violation. The fix was to tell the two groups apart by `aria-label` - "Time range" on
consumption, "Bar size" on activity - which held exactly until activity grew the same three scopes
and the same, now equally accurate, "Time range". The discriminator is the card's `<h3>`
(`chartCard()`): the toggles and their prev/next buttons are otherwise identical between the two
cards, and the heading is the one thing they will never share.

Those labels are card-qualified again now ("Dive activity: previous period with dives"), for the
screen-reader reason above rather than for this script - so the walk matches the half of the label
the two cards _share_, as a `/previous period with dives/i` regex. Pinning the whole string here
would mean a wording improvement in the app breaks the screenshots, and the card scope is what makes
matching the shared half unambiguous.

**Two images, not four, and one frame per page.** The grid previously held two crops of the same
dive page at different scroll offsets - the top, and the profile chart further down - which reads as
a mistake rather than as two things. At 1024 that is moot: one frame of the dive page carries the
chart _and_ the sidebar. Filling the other two cells then meant reaching for list pages, and a table
of dive sites or trips is a screenshot of a table - it demonstrates nothing the feature list hasn't
already said. What's left is the two pages that show something you cannot describe in a bullet: the
profile charted out of a dive-computer export, and a gear item's service schedule with its history
under it.

**Nothing about the account is hardcoded.** The dive is whichever of the 30 most recent carries an
imported profile (only `GET /dive/{uuid}` says whether one exists, hence the probing), and the gear
item is whichever has the most service tracked on it. Those queries reuse the access token lifted
off the app's own requests via a Playwright `request` listener. The two alternatives are both worse:
verifying a second magic link server-side runs into the three-per-email-per-fifteen-minutes limit
within a single retake, and calling `/auth/refresh` from the page rotates the cookie out from under
the app.

**The clock is pinned to 09:00, so the dashboard greets the same way every retake.** The heading
reads "Good morning/afternoon/evening" off `new Date().getHours()` (see _"The heading greets by time
of day"_ above), which made the hero image a record of what time the maintainer happened to run the
script - three greetings for one page, flipping in the diff for no reason a reader can see. The
context's clock is fixed before the first page exists, so every navigation in the run agrees.

Only the _hour_ is decided: the pinned instant is 09:00 on the run's own date, which leaves
everything else the browser derives from the clock - the service card's "due in 24 days", the year
the two charts open on - exactly where an unpinned run would put it. `GREETING_HOUR` overrides it
for anyone who wants a different one. `setFixedTime()`, not `install()`: it freezes only what the
page reads out of `Date`, leaving timers and animations on the real clock, which the `networkidle`
waits depend on. The tokens do not care either way - they are checked against the API's clock, not
the browser's.

**`playwright-core`, not `playwright`.** The full package downloads ~130MB of browsers on every
`npm install`, for a script only a maintainer runs. `playwright-core` is the driver alone and takes
an `executablePath`, so it uses the Chrome already on the machine.

### `visit()` fails loudly when a navigation lands on `/signin`

Kept from a workaround that is no longer needed, because it is worth keeping on its own.

The script used to trip an API bug on almost every run: refresh tokens carried only
`{sub, exp, token_type}`, and JWT `exp` has one-second resolution, so two minted for one account
inside the same wall-clock second were _byte-identical_. `/auth/refresh` blacklists the token it was
handed before minting the replacement, so a collision handed back an already-revoked token and the
next refresh 401'd - sign in, navigate before the second ticks over, and the page after that lands
on `/signin` with no explanation. A `sleepPastTheSecond()` call waited out the boundary;
`opendiving-api` now puts a `uuid4` `jti` on every revocable token (see _"Every revocable token
carries a `jti`"_ in its `DECISIONS.md`), so the sleep is gone.

The `/signin` check in `visit()` stays. It cost nothing and it is the difference between a run that
fails with "signed out on the way to /dashboard" and a run that quietly produces four screenshots of
the sign-in form - which is the failure mode of _any_ future auth regression, not just the one that
has been fixed.

## "Due soon" is a `warning` badge, because `secondary` is invisible on a card

`serviceStatusBadgeVariant` mapped `due_soon` onto the `secondary` badge, which is `bg-secondary`
with a transparent border. In dark mode `--secondary` is `240 4% 16%` and `--card` is `240 4% 13%` -
**three points of lightness apart**, and every place that badge renders (the gear list, the gear
detail card, the dashboard's service-due card) is on a card. The chip effectively had no background:
1.2:1 against the surface behind it. WCAG has nothing to say about that - the _label_ was 13:1 and
passed every contrast scan - which is exactly why it survived the colour sweep. Non-text contrast is
the check a text-node walker doesn't make.

It's now `bg-warning`, a new `Badge` variant over the token that already means "take this seriously,
it isn't a failure" - 9.2:1 against the card in dark mode, and the escalation finally reads as one:
outline, then amber, then `destructive`'s red. It also stops "Due soon" being the identical chip to
"Rented", which is a fact about an item, not a status.

**`--warning` is dark and slightly brown in light mode (`32 92% 27%`), and that is deliberate** - it
carries white text, and the obvious mid-amber only reaches 3.9:1 under white. Same split as
`--coral` / `--coral-solid`, arrived at from the other direction. In dark mode it flips to
`38 95% 62%` with near-black text and reads as proper amber.

### And then the token itself, because every other secondary chip had it too

Recolouring one badge left the same 1.2:1 chip everywhere else `secondary` renders, which is a card
header in all eleven cases - the count chips on dives, sites, trips, certifications, gear and gear
sets, "Rented" in `gear-items-card`, `dive-detail-main` and `gear-item-multi-select`, and the
dashboard's `doneCount/steps` chip. So **dark `--secondary` moved 16% → 22%**, nine points above
`--card` instead of three.

Why lightness and not a border: the base `Badge` class already carries `border`, and `secondary`
sets `border-transparent`. Giving it a visible one delineates the chip beautifully - and makes it
look exactly like the `outline` variant, which on the gear table sits three rows above it as "In
service". Filled and outlined have to stay distinguishable, so the fill is the only channel left.

**The light theme's 4-point gap (`96%` on white) is fine and was left alone**, which looks
inconsistent until you notice the light `--secondary` is `210 40% 96%` - 40% saturation. It
separates by _hue_, not lightness. The dark palette is near-neutral on purpose (macOS system greys,
4% saturation), so it has no hue channel to spend and has to pay in lightness. Judged by eye at
16/20/22/25/28% against a real card; 22% is where the chip stops disappearing and before it starts
reading as a button.

Two non-badge consumers came along. `bg-secondary` is also the _selected_ segment of the
gas-consumption card's time-range control - at 16% you genuinely could not tell which of
All/Year/Month was active, so that one was a functional bug, not a cosmetic one. And it is the
`Button` `secondary` variant, which sounds risky and isn't: nothing in the app uses it. `--muted`
deliberately stayed at 16% despite having been the same value - it is a large-area wash (the footer,
callouts), and 22% over that much surface reads as a panel rather than a tint.

## One card-header shape: `space-y-1.5` only reaches `CardHeader`'s _direct_ children

`CardHeader` is `flex flex-col space-y-1.5 p-6`, and Tailwind's `space-y-*` is a `> * + *`
selector - so the 6px between a title and its description exists only while both are children of the
header itself. `GasUseCard` wraps them in a `<div>` so the period picker and the All/Year/Month
control can sit to their right, and that wrapper silently ate the gap: "Gas Consumption" and its
description were **0px** apart, the only card in the app where they touched.

`RecentDivesCard` and `RecentTripsCard` had the mirror-image version. They kept the description as a
direct child and wrapped only the title with its "View All" button - which works, except a
`size="sm"` button is 36px against a `leading-none` 24px title, so centring the two left 6px of
slack under the title _inside_ the row, on top of the row's own 6px. Measured **12px**, twice every
other card.

So the shape for a card whose header carries a control is now the one `GasUseCard` uses, in all
three:

```tsx
<CardHeader>
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="space-y-1.5">
      <CardTitle …>…</CardTitle>
      <CardDescription>…</CardDescription>
    </div>
    {control}
  </div>
</CardHeader>
```

`items-start`, so the control aligns with the top of the title block rather than the middle of a
two-line column. Every title/description pair in the app now measures 6px at both 1100px and 375px -
checked by walking the rendered cards and diffing `description.top - title.bottom`, which is the
only way this class of bug shows up at all.

**Card-title icons are `gap-2` on the title, never `mr-2` on the icon**, so the header has one idiom
to match. And they inherit the title's colour: `text-primary` was on five of them (`settings`,
`email-change-card`, and three on `contact`) and is a mid-grey in dark mode - the same fact that
took it off in-copy links above. On the settings page that put two dim icons next to
`Notifications`' bright one; the dim ones were also dimmer than the muted description text beneath
them. `contact`'s `text-success` shield and `text-destructive` heart stay: those two are semantic
and read as deliberate.

## The dive page's gear list is a table, and its columns lead with Type

`DiveDetailMain`'s Gear card used to be a `<ul>` of `gearItemLabel(item)` - brand and name glued
into one string, one item per line. That reads fine for two items and badly for seven, which is what
a real dive carries: the eye has nothing to scan down, and "Fourth Element Hooded Vest" gives no
hint where the brand stops. It's now a `Table`, same shape as the Gas Mixtures card two cards above
it, so the main column has one idiom.

**Type first, then Brand, then Name** - deliberately _not_ the gear page's Name/Type/Brand. The two
tables answer different questions. `/gear` is a list of things you own, looked up by the name you
gave them; the dive page is a kit list, read to check what you were wearing, where Type is the thing
you scan for ("what suit? what computer?") and the name is the answer. Leading with the closed
vocabulary also gives the column a short, repeating left edge instead of ragged free text.

Splitting brand into its own column is what retires `gearItemLabel` here (it stays in the five
places that need a one-line label: the picker, the sets card, and the archive/delete confirmations).
The Name cell keeps the link and the Rented/Archived badges.

**The whole Type column is `text-muted-foreground`, not just its empty cells.** Leading with Type is
what makes the table scannable, but a full-strength column of category names competes with the item
names for the eye - and the type is the _question_, the name is the answer. Muting it also removes
the odd case where a missing type rendered a dimmer dash than the value next to it. Brand stays at
full strength: it's part of the item's identity, and a diver reads "Apeks XTX50" as one thing.

## The activity chart is bars over the same three scopes as the gas chart

`DiveActivityCard` answers "how much am I diving" where `GasUseCard`, directly above it, answers
"how well". They deliberately share a shape - same header, same stat row, same
prev/next-and-dropdown in the same corner, same remembered view, same All/Year/Month toggle over the
same `lib/chart-period.ts` - because two charts on one page that work differently cost more to read
than either does alone. What is genuinely different is a decision rather than an omission.

**Bars, not dots, and therefore an axis anchored at zero.** A count has no meaning between its
values: there is no such thing as 4.5 dives in August, so a line joining August to September would
draw a fortnight of diving that didn't happen. A bar's _height_ is the quantity, which is also why
`countDomain` exists next to `niceDomain` rather than being it: `niceDomain` is deliberately not
zero-based (RMV lives in a narrow band and anchoring it at zero squashes real variation into the top
third), and on a bar chart a floating baseline would draw four dives as twice the block of three.
Its 1/2/5/10 ladder also includes 2.5, which on a scale of dives labels the axis 2.5 and 7.5 - half
a dive is not something anyone can log.

**The scopes name the window, and the bar size follows from it.** All is one bar per calendar year
across the career, Year is twelve months of one year, Month is every day of one month. That is the
same window each label means on the gas card, which is the point: a control that reads the same in
both places has to mean the same thing in both.

This card used to carry Year/Month for the first two of those, with no "All" - defensible while
"year" _was_ everything, and wrong the moment a third, finer window existed, because the same word
then named two different spans on one page. Renaming rather than adding a fourth button is what
keeps the two cards' toggles identical. It costs the remembered view: an entry from the old build
stores `{scope, year}`, which the new parser rejects whole rather than migrating (see
`DiveActivityView.anchor`), so a returning diver lands on the default once. The default is `all` -
deliberately not the gas card's `year` - because a bar per year is legible at any career length
where a dot per dive over the same span is a smear, and "how has my diving gone" is the question
this card exists for.

**The anchor is the start of a day with diving in it.** The gas chart anchors on one of the dives'
own timestamps, so switching scope lands on the period _containing_ the dive you were reading; this
one anchors on a day bucket and gets the same behavior from the same code. That is what changed when
the API moved from month buckets to day buckets: the old argument for two separate modules was that
a bar is a calendar bucket with no instant to anchor on, and a day _is_ an instant. So
`periodRange`, `periodLabel`, `availablePeriods`, `stepPeriod` and `resolveAnchor` moved out of
`dive-gas.ts`/`gas-use-view.ts` into `lib/chart-period.ts` - the same move `niceDomain`/`axisTicks`
made to `chart-scale.ts` - and `resolveYear` went with them, replaced by `resolveAnchor`.

**The day scope needs no new request.** `GET /user/dive-activity` returns one row per day dived and
the client sums days into months and months into years (`activityBars`), so All/Year/Month are three
views of one cached fetch and switching between them is instant. A `granularity` parameter would
have been a second round trip for a toggle that has to feel immediate. The API's own reasoning is
under _"Dives-per-day is counted in Python"_ in `opendiving-api/DECISIONS.md`.

**The x axis labels per scope, because label width differs.** `MAX_X_LABELS` is 20 for years (a
four-digit year is ~24 units against 33-unit slots), 12 for months, and 31 for days - a one- or
two-digit day is ~12 units against 21-unit slots, so a full month labels every day rather than
counting down from the 31st in twos, which is how a thinned day axis reads.

### Every chart control names its own card, because the two cards draw the same row

Making the toggles identical made their accessible names identical too, and that is a regression
rather than consistency: both cards render on `/dashboard` at once, `Card` is a plain `div` with no
role, and nothing scopes one card's controls to it. Read in place the heading above is all the
context anyone needs. A screen reader's controls list is not read in place - it is flat names and
nothing else, and four arrows all reading "Previous period with dives" in it are four coin flips.

So each `aria-label` leads with its card: `Dive activity: previous period with dives`,
`Gas consumption: time range`. Leading rather than trailing, so the list groups by chart when it is
scanned or sorted. This is the same ambiguity `screenshots.mjs` hit from the automation side, where
the fix was to scope by the card's `<h3>` - and a heading is exactly the context a controls list
drops, which is why the two needed separate fixes.

**The period dropdown is described, not labelled**, and the distinction is load-bearing.
`aria-label="Dive activity period"` on the `SelectTrigger` would _replace_ its accessible name, and
that name is its own value - "September 2025" - which is the one thing a diver needs read back from
it. An `aria-describedby` pointing at a visually-hidden span is announced after the name instead, so
the control keeps saying which period it is on and gains which chart it drives.

That hidden span is why `screenshots.mjs` waits on `getByRole("heading")` rather than
`getByText("Gas Consumption")`: `getByText` matches case-insensitive substrings, so a bare card
title now also matches the span reading "Gas consumption period" and fails Playwright's strict mode.

### Empty buckets are the point, and the ceiling comes from the whole logbook

`activityBars` fills the gaps - every day of the month whatever the trip covered, twelve months
whatever the year held, and every year between the first dive and the last. A chart of only the
months that had diving would space three trips evenly across the plot and quietly say the year was
busy throughout; the gaps are what make a season read as a season, and at the day scope they are
what tells a fortnight's liveaboard apart from four weekends. It's the same call the gas chart makes
by plotting a period's _calendar_ bounds rather than the extent of what's in it. Nothing is drawn
before the first dive or after the most recent one, where the answer is "no data" rather than "no
diving".

`barCeiling` scales the y axis to the tallest bar the scope can produce **across the whole
logbook**, not across the period on screen - the same reasoning as the gas chart's fixed domain, and
load-bearing here in a way it isn't there. Bar height is the quantity, so a per-year axis would draw
a four-dive August exactly as tall as a forty-dive one and the arrows would compare nothing.

Empty _periods_, though, are not offered: `availablePeriods` lists only the years - or months - that
contain dives, so the dropdown has no dead options and `stepPeriod` skips the fallow ones. Both
cards get that from the same functions, which is why a card with a season's gap in it steps from
April straight to October in either.

### What the bars can't be, and what that costs

The bars aren't links, so the svg is `role="img"` (like the profile chart) rather than the gas
chart's `role="group"` - there is nothing focusable inside it to browse to. That leaves a
`role="img"` label as the only channel, and a sentence can say "34 dives, busiest 2025" but not what
every bucket held, which is exactly the rounding a sighted reader doesn't have to accept. So the
figures follow the chart as an `sr-only` list, one entry per bar. Cheap at this size - a month's
days, twelve months, or one line per year of a career. Its counts are pluralized where the chart's
tooltip always was: a bucket of exactly one dive is the common case at the day scope and was nearly
unreachable when a bucket was a month, and "1 dives" read aloud is worse than it looks written down.

**The hover target is the whole column, not the bar.** A quiet January is a few units tall and an
empty one has no bar at all, and "how many dives was that?" is exactly the question you would point
at those to ask. The bar itself is `pointer-events-none` so it can't steal its own column's hover
and flicker along the top edge. `barPath` draws it with only the top corners rounded: `<rect rx>`
rounds all four, which lifts the bar off the axis it's measured from and leaves a visible notch
either side of the baseline.

**The change figure is in dives, not percent.** These are small whole numbers a diver can hold in
their head, and "+16 vs 2023" says something "+178%" doesn't. Uncolored, for the reason the gas
card's already documents - and one more: a light year can be a house move rather than a slump, so
nothing here should editorialize about the direction.

**`ChartStat` moved out of `gas-use-card.tsx`** when this card wanted the same row - the same move
`niceDomain`/`axisTicks` and `subscribeToNothing` made before it. The two cards sit one above the
other, so "the same shape" isn't a nicety: a label size or baseline gap drifting a couple of pixels
between them would read as a rendering fault.

### The two chart cards stack, and gas leads - both measured, not assumed

Side by side is the obvious layout for two cards that mirror each other, and it was tried and
reverted. Each plot carries `min-w-[560px]`, which is what keeps twelve month labels and a y axis
legible; a `lg:grid-cols-2` on the dashboard's `max-w-6xl` gives each card 482px, and widening the
page to `max-w-7xl` only gets to 546px. Three things break at once, all of them measured in the
browser rather than reasoned about:

- **Both charts clip and grow their own horizontal scrollbar.** Dive Activity loses the current year
  mid-bar, Gas Consumption loses December - so reaching this year's diving means scrolling sideways
  inside a card.
- **The axis text halves, 16.6px to 8.6px.** The svg scales uniformly inside its wrapper, so a
  narrower box shrinks the labels rather than dropping them.
- **The gas card's header goes from 50px to 114px.** Its description, its All/Year/Month toggle and
  its `‹ 2026 ›` stepper cannot share a 546px line, so the controls drop below it - and the two
  cards' controls stop lining up, which is the thing the activity card's one-line description exists
  to preserve.

Clearing all three needs about 1220px of content width, past anything else in the app's layout, and
the gas header still wraps there. `RecentDivesCard`/`RecentTripsCard` pair up fine directly below,
which is the shape that grid is right for: cards whose content reflows instead of scaling.

**Gas consumption leads the pair.** It's the card that can change how you dive tomorrow, where
activity is a record of what already happened. That reverses the order this feature shipped in,
which put activity first on the grounds that it expands the "Total Dives" tile above it and always
has something to draw - true, but a card being reliably non-empty is a weaker claim on the top slot
than a card being reliably useful.

## `npm run format` covers the docs at the repo root, not just `src/`

The format scripts globbed `src/**/*.{ts,tsx,js,jsx,json,css,scss,md}`, and there has never been a
markdown file under `src/` - so the `md` on the end matched nothing, while `DECISIONS.md`,
`README.md`, `CONTRIBUTING.md`, `CLAUDE.md` and `CODE_OF_CONDUCT.md`, which are all of the markdown
this repo actually has, sat outside the formatter entirely. The cost landed on `DECISIONS.md`, which
grows by a section on most PRs: each one had to guess the wrapping of the sections around it, and
editing a paragraph in the middle meant rewrapping it by hand or leaving a short line behind.

The scripts now take a second glob, `"**/*.md"` - recursive rather than root-only, so markdown that
later lands in `docs/` or anywhere else is covered without another edit here. Prettier skips
`node_modules/` on its own and `.prettierignore` handles `.next/` and `coverage/`, so the whole
sweep costs about a second. Nothing in `.prettierrc.json` changed: the `*.md` override there
(`printWidth: 100`, `proseWrap: "always"`) was already written, just never applied to a file that
existed. opendiving-api wraps its markdown at 100 too, via mdformat, so the two `DECISIONS.md` files
stay visually alike.

`code-quality.yml` runs `npm run format:check` instead of repeating the globs inline. It is still
`continue-on-error: true`, like most of that workflow - the check tells you what drifted,
`npm run format` before pushing is what keeps it from drifting.

Two things Prettier does to markdown beyond wrapping, both cosmetic and both applied across the docs
in one commit: `*emphasis*` becomes `_emphasis_`, and a `*` list bullet becomes `-`. That commit
also means `git blame` on any line of `DECISIONS.md` points at the reflow rather than at whoever
wrote the sentence - blame its parent, or use `git log -L`.

## Breathing-gas maths lives in `lib/dive-mixtures.ts`, client-side, and is only ever a label

`gasName`/`mod`/`endDepth`/`ead`/`ppO2AtDepth`/`modWarning` went into the existing
`lib/dive-mixtures.ts` rather than a new `lib/dive-mix.ts`: two modules a hyphen apart, both about
mixtures, is a name collision waiting to send an import to the wrong one.

**Client-side, deliberately.** `services/dive_gas.py` draws the line at values derivable purely from
stored columns, and `gear_service.py` already has a web twin because the browser holds an input the
server lacks. This is that case: the decisive input is live form state - the O₂ a diver is halfway
through typing, which has not been saved and may never be - so an API round trip could not answer
the question, and a server-side twin would exist only to duplicate this one. The trigger for lifting
it is written in the module header: the moment a non-browser consumer needs the same labels.

**Names round to whole percent; the recorded fractions do not.** `gasName(32.4, 0)` is `"EAN32"`,
because the shorthand is integer shorthand - that is what goes on the cylinder sticker. That would
contradict the earlier decision to stop `toFixed(1)`-ing the mixtures table (which hid a real second
decimal), except the badge sits in its own `Gas` column _beside_ the untouched `O₂`/`He` columns.
The rounding is a label, never the value, and the exact number is one column away.

**An impossible mix gets no plausible name.** Parsed previews are not validated and a half-typed
form field is not either, so `gasName(50, 60)` returns `"O₂ 50% / He 60%"` rather than `"50/60"`.
Same reason `oxygen: 0` falls back: `"EAN0"` is a well-formed label for a gas nobody can breathe.
Either fraction being `null` returns `null` outright - a gas whose helium content is unknown cannot
be told apart from air by any honest label.

**Air gets neither END nor EAD.** For air both equal the depth itself, and `EAD 30.0 m at 30 m` is
noise dressed as information. Helium mixes get END (the figure the mix exists to improve), nitrox
gets EAD (a nitrogen-load figure that means nothing once helium is in the gas - `ead` returns `null`
rather than understating it).

**`modWarning` returns two distinct sentences, not one with a threshold.** Past 1.4 the gas is still
right where a diver is decompressing but not where they are working, which is a planning note. Past
1.6 there was no point in the dive where it was appropriate. Collapsing them would either cry wolf
over a legitimate deco gas or stay quiet about an over-rich bottom mix. `PPO2_WORKING`/`PPO2_DECO`
are function parameters and not a user setting, on purpose - a preference here is an edit that turns
a warning into silence.

**`modWarning` takes the depth the gas was _breathed_ at, and callers holding a dive must use
`diveModWarning` instead.** The first version of this compared every mixture against
`dive.max_depth` and shipped, which meant a two-cylinder dive - air to 45.91 m plus an EAN54 deco
bottle - reported "Max depth 45.91 m is past this mix's 19.6 m limit at ppO₂ 1.6" against the EAN54.
That is the normal, correct shape of a staged decompression dive: the bottle is carried down
unbreathed and used on the ascent. The warning fired on every properly planned technical dive, which
is precisely the cry-wolf failure the paragraph above claims to avoid - splitting the two ppO₂
thresholds addressed _which_ limit was crossed and never questioned whether `max_depth` was the
right depth to compare against at all.

A dive does not record which cylinder was breathed when - the same gap that stops
`gasUseUnavailableReason` deriving RMV for a multi-tank dive. So `diveModWarning` splits on what is
actually knowable:

- **One cylinder logged** - it was breathed throughout, `max_depth` is a depth this gas genuinely
  saw, and `modWarning` applies directly with both thresholds.
- **Several cylinders** - no single mix can be judged. The one sound inference left is that if the
  deepest-capable gas on board still cannot reach `max_depth`, none of them could have, in any
  order. That is reported against the dive rather than blamed on a cylinder, and only at 1.6: a deco
  gas exceeding 1.4 somewhere on the dive is the intended state of affairs.

The same rule governs the form hint. Gas name and MOD are properties of the gas alone and always
show; END and EAD are claims about a depth the gas was breathed at, so they are suppressed once
there is more than one cylinder - `EAD 22.6 m at 45.91 m` under a deco bottle describes a breath
nobody took. Per-tank warnings against each gas's own depth become possible when gas-switch events
and per-tank attribution land.

**The warning is spelled out under the table, not in a `title` tooltip.** The amber MOD cell says
which cylinder to look at and is useless alone; a tooltip would put the only copy of a safety note
behind a hover, and out of reach entirely on touch.

`text-warning`, not `text-warning-foreground`: the latter is the white that sits _on_ `bg-warning`
(that is what the `warning` badge pairs), and as text on a card it is invisible in light mode.

## The `o2 + he <= 100` rule was missing from the form, and only the DB CHECK caught it

`diveMixtureSchema` bounded oxygen and helium individually at 0-100 but never their sum, so a 50/60
trimix passed the form, reached the API and came back a 500 from
`ck_dive_mixture_oxygen_helium_sum` - a stack trace where a field error belonged, with nothing for
the diver to act on. The refine mirrors that CHECK.

Reported on `path: ["helium"]` rather than `oxygen`: helium is the box being filled in second on the
trimix entries where this happens at all, so the message lands under the field being looked at.

## The Exposure card renders stored numbers and derives nothing

`components/dives/dive-exposure-card.tsx` shows CNS, OTU and surface pressure exactly as the API
sends them. That makes it the odd one out on a page where the mixtures card computes gas names and
MODs, the consumption card explains a missing RMV, and the profile chart rescales everything it
draws — so the absence of maths here is worth stating rather than leaving to look like an oversight.

There is nothing to derive from. CNS and OTU are the output of whichever decompression algorithm the
device ran, over an exposure history that includes dives this log may not hold. The browser has no
model to recompute them with and no second source to check them against, and a "corrected" figure
that disagreed with the number on the diver's wrist would be worse than useless. Surface pressure is
the same kind of value: a barometer reading, not a function of anything else stored.

Which is also why the fields are **read-only and absent from the dive form entirely** — the API
keeps them off its create/update schemas (see its DECISIONS.md), so there is no input to add here.

Three smaller choices inside it:

- **Start → end, not just the end.** A repetitive dive that went CNS 8 % → 9 % added almost nothing,
  and one that went 0 % → 9 % is a different dive with the same final number. A missing half renders
  as an em dash rather than collapsing the pair, because "recorded only the end" is the normal shape
  for a FIT file — the format has no start-OTU field at all.
- **Renders nothing when the dive has none of the three**, unlike the gas-consumption card next to
  it, which stays and explains itself. That card can be empty _despite_ the diver having filled in
  the pressures, so silence would read as a bug; these are readings a diver never had the option to
  enter, so an absent card cannot read as something they forgot.
- **Titled "Exposure & Pressure", not "Oxygen Exposure"** — which is what only two of the three
  readings are. The card shows on any one of them, and **42 of the 384 XML exports in the corpus
  record a surface pressure with neither CNS nor OTU**, so the original title headed a lone
  barometer reading for 11 % of a real log. Retitling rather than gating the card on CNS/OTU: that
  gate would have dropped a stored reading for those 42 dives, and moving surface pressure to the
  conditions block is a bigger change into a component this feature otherwise doesn't touch.
- **Past 100 % CNS is emphasis on the number, not a warning sentence.** The limit is a conservative
  table value rather than a physiological edge, and the diver already saw it on their computer —
  this is their log agreeing, not advice. `text-warning`, not `text-warning-foreground`: the same
  trap the MOD warnings hit, where the `-foreground` token is the white that sits _on_ `bg-warning`
  and vanishes as text on a card in light mode.
- **The emphasis needs a second channel, and it is `sr-only` text rather than an icon.** Colour on
  its own reaches neither a screen reader nor a greyscale or red/green-deficient reader — WCAG 2.1
  SC 1.4.1 — so "CNS 8 % → 105 %" arrived with nothing marking the second number. Everything else in
  this feature pairs `text-warning` with an `AlertTriangle` (the mixtures table, the form's gas
  warning), and that is deliberately _not_ what this does: a visible icon is visible advice, which
  is the thing the bullet above argues the card should not give. An `sr-only` span says the same
  sentence to a reader who cannot see the colour and nothing at all to one who can, which is the
  only version that keeps both properties. Carried as `alert?: string` on `Reading` rather than a
  boolean plus a hardcoded message, so a caller cannot light a value up without saying why — and so
  the CNS constant stays at the call site instead of leaking into a helper that also renders OTU.

  It is asserted through the accessible name in `dive-exposure-card.render.test.tsx`, not through
  the class. A test that checked for `text-warning` would have passed against the version that
  reached no screen reader at all, which is precisely the bug.

## A recorded ppO₂ limit moves the MOD, and pointedly not the warning

`DiveMixture.po2_limit` is what the dive computer planned a gas to — a Suunto writes 1.4 on the back
gas and 1.6 on the deco bottle of the same dive — so `ppO2Limit()` feeds it into every MOD the app
displays, falling back to `PPO2_WORKING` when a dive doesn't record one.

It deliberately does **not** reach `modWarning`/`diveModWarning`. Those judge against the
`PPO2_WORKING`/`PPO2_DECO` constants, whose own comment says they are constants precisely to prevent
"the edit that turns an over-MOD warning into silence". A limit arriving from a file is that edit,
just through a different door: a cylinder recorded at ppO₂ 2.0 would otherwise become unwarnable.

The two are different claims and both are true at once — the column says what the diver planned this
gas to, the sentence below says what the gas can physiologically take. `OxygenFractions` declares
`po2_limit` and never reads it, so the answer to "does the limit feed the warning?" is visible in
the type rather than surviving as an excess-property error at one call site.

**The MOD column's header is conditional**, which is the one piece of cleverness here and earns its
place: `sharedPpO2Limit()` returns the single limit when every cylinder agrees — every recreational
dive, and every dive imported before the column existed, since an unrecorded limit counts as the 1.4
default rather than as _different_ — and the header stays the compact `MOD @ ppO₂ 1.4`. Only when a
dive genuinely mixes limits does it drop to a bare `MOD` and move the qualifier into the rows. A
header naming one limit above a column computed from two is the failure being avoided, and the shape
that would cause it is exactly the two-gas technical dive this work is for.

`DEFAULT_MIXTURE` leaves `po2_limit` blank rather than seeding 1.4, and the field's placeholder
reads `1.4 (default)`. Pre-filling it would make every hand-added cylinder claim a limit the diver
never chose; the fallback is the same number either way, but naming it as a fallback keeps the
printed "@ ppO₂ 1.4" describing where the figure came from.

## `gas_number` round-trips through the form untouched, and 0 is a real value

`DiveMixture.gas_number` is on `diveMixtureSchema` and `normalizeMixtures` but has **no input** —
the form's whole job is to carry it through a save unchanged. It is the source export's own
identifier for a cylinder and the join key to that cylinder's pressure curve on the profile chart;
retyping it could only break the pairing, and an edit form that silently dropped it would strip the
numbering off every imported dive the first time the diver fixed a typo in their notes.

It is also the one field in `mergeMixture` where `??` versus `||` matters. A Suunto Ocean numbers
its cylinders **from 0** (7 107 readings on gas 0 across the 2026 corpus), so `||` would treat a
perfectly good gas number as absent and fall through to whatever was on the form. The zod rule is
`min(0)`, mirroring the API's `ck_dive_mixture_gas_number_non_negative` — which was itself `>= 1`
until the backfill's first run rejected the real corpus on it.

`role` is the opposite case: a plain `<select>` rather than the shadcn `Select` used elsewhere on
this form, because it needs "unset" as a real selectable option and Radix reserves `""` for
clearing. Expressing that through `Select` would need a sentinel value mapped back to `undefined` on
both edges — more machinery than a four-option optional field is worth, on a field most cylinders
will never set.

**And that selectable option then didn't work**, which is the part worth recording. The `<select>`'s
`onChange` mapped its empty value to `undefined` (`e.target.value || undefined`), and
react-hook-form re-displays a field's default whenever the current value resolves to `undefined` —
so on a cylinder imported with `role: "deco"`, choosing **Not recorded** snapped straight back to
Deco. The one thing the plain `<select>` was chosen for.

This is the trap `diveMixtureSchema` already documents and the numeric fields already dodge: `""` is
the live cleared state, converted to `undefined` by `normalizeMixtures` at the edge. `po2_limit`,
added in the same block on the same day, used `""` and was fine. The rule generalizes past numbers —
**any** optional form field needs a non-`undefined` empty value, and a `<select>` with a real
"unset" option is exactly as exposed as a text box. `role` is now
`z.union([z.literal(""), z.enum(GAS_ROLES)]).optional()` for that reason and not for symmetry.

`MixtureFields role input > lets an imported role actually be cleared` pins it, and fails on the
`|| undefined` version.

## `mod()` returns null below the surface, where `end`/`ead` floor at zero

`mod()` had no floor, which was unreachable until this phase: it was only ever called with the
1.4/1.6 constants, and oxygen would have to exceed 140 % to drive the result negative. A
diver-editable `po2_limit` across the schema's `[0.4, 2.0]` band puts it one plausible cylinder away
— `mod(50, 0.4)` is **−2.0 m**, and an EAN50 bottle planned to 0.4 rendered `-2.0 m` in the mixtures
table under a `MOD @ ppO₂ 0.4` header, and `MOD -2.0 m @ ppO₂ 0.4` in the form hint. Both values
pass `diveMixtureSchema` and the API's `ck_dive_mixture_po2_limit_range`, so nothing upstream stops
them.

`null`, deliberately **not** the `Math.max(0, …)` that `endDepth` and `ead` use, though those two
sit twenty lines away and floor for what looks like the same reason. It isn't the same reason: 0 m
is a real answer for an END or an EAD — a rich mix in shallow water genuinely is equivalent to the
surface — whereas "MOD 0.0 m" reads as a depth the gas may be breathed at, which is the opposite of
what a negative result means. A gas already past its limit at the surface has no operating depth at
all, and both call sites already render `-` for `null`. Exactly 0 stays a number: `mod(40, 0.4)` is
0 m and that is the honest boundary, so only strictly negative becomes `null`.

## The role badge costs the mixtures table 73 px it did not have

Measured on the two-gas verification dive at a 1280 px viewport, where the table's card gives it 667
px:

|                          | table width | over its slot |
| ------------------------ | ----------- | ------------- |
| Phase 1 (Gas badge only) | 719 px      | 52 px         |
| with the role badge      | 792 px      | 125 px        |

So the table was **already** overflowing before this work — the `overflow-x-auto` wrapper and the
`whitespace-nowrap` rows were doing real work, not sitting idle — and the role badge roughly doubled
it. That matters more than the raw number, because MOD is the last column: past ~117 px of overflow
it is off-screen by default, on exactly the multi-gas dives it exists for.

Two cuts were made and both are improvements on their own terms, not just width savings:

- **`GAS_ROLE_LABELS` lost the word "gas"** — "Bottom gas" inside a column headed _Gas_ was saying
  it twice. Worth 0 px on the dive measured above, whose widest row happens to carry the
  already-short "Oxygen", and up to ~30 px on one carrying "Bottom".
- **The per-row ppO₂ suffix is `@ 1.6`, not `@ ppO₂ 1.6`** — 36 px, and only rendered at all when a
  dive mixes limits, since the header carries it otherwise. "@" in a MOD column is not ambiguous.

That leaves ~125 px of overflow, and it is **left there deliberately** rather than paid for by
re-opening a Phase 1 decision. The candidates were all worse: moving `bar` out of the pressure cells
into the headers reverses a choice that section explicitly argues for, and dropping `O₂`/`He` would
lose the unrounded fractions that exist because the `Gas` badge is rounded shorthand. Eight columns
in a two-thirds-width card is the actual problem, and narrowing it is a change to the table as a
whole — worth doing on its own, with its own before/after, not smuggled in behind a badge.

**If this is revisited, the thing to reconsider is the column set, not the badge.**
`Volume`/`Start`/ `End` are the gas-consumption inputs and `Gas`/`O₂`/`He`/`MOD` the planning facts;
they may simply be two tables, or one table with the consumption columns folded into the card below
that already consumes them.

**It was revisited, and the answer was mostly elsewhere** — see "Both gas tables finally fit their
slot" below. The column set did change (`He` is dropped on a dive with no helium, which is most of
them), but the ~125 px recorded above came off chiefly through cell padding, which no one had
counted: at `p-4` a seven-column table spends 224 px of its width on it. Merging the `Gas` column
away was also tried and reverted — worth only ~26 px, and it cost the badge alignment down the
column.

## The API sends `null`, the form schema only understood `""` — and the save button did nothing

Three fields were added to `diveMixtureSchema` in this phase, and all three rejected the value the
API actually sends. `DiveMixtureBase` declares them `X | None` with no `exclude_none` anywhere, so
an unrecorded field arrives as an explicit `"po2_limit": null`, not as an absent key — and every
mixture stored before this branch is unrecorded for all three. `null` is a member of no field's
union: `po2_limit` and `role` spell their empty state `""`, and `gas_number` has no empty state at
all.

The edit page seeded the form with `{ ...m, start_pressure: …, end_pressure: … }`, coercing exactly
the two fields that had needed it before, so the three new ones went in as `null` and `zodResolver`
refused the submit. **The form did not report this.** `handleSubmit`'s valid callback never fired,
so there was no request, no toast and no error — the diver pressed **Save Changes** and watched
nothing happen. `gas_number` is the reason it stayed invisible rather than merely confusing: it has
no input, so its `FormMessage` had nowhere to render. The create page had the same bug by a
different door, its prefill-from-last-dive writing a bare `role: m.role` one line below a correctly
coerced `po2_limit: m.po2_limit ?? ""`.

None of the 760 tests caught it because **every mixture fixture in the suite was form-shaped** —
`""` and `undefined`, the shape the form produces, never the shape the API returns. A suite can be
green over an unusable form if nothing in it has ever seen a real response body.

Three changes, and the order matters:

- **`DiveMixture`'s optional fields are `| null`.** They always were on the wire; the type was
  vouching for a promise the response never made. This is the load-bearing one — with it, the bare
  `role: m.role` on the create page is a compile error rather than a runtime rejection.
- **`toDiveMixtureInput` in `lib/validations/dive.ts`** is now the one API→form conversion, sitting
  beside `normalizeMixtures`, which is the form→API direction. Field-by-field, no spread: a spread
  is what let three new fields join the response and reach the resolver unconverted.
- **A fixture written the way the API serializes it**, with the `null`s spelled out, parsed through
  `diveMixtureSchema` and round-tripped back through `normalizeMixtures`.

The general rule this leaves: **a field arriving from the API needs a conversion at the boundary the
moment the form gives it a sentinel empty value**, and a spread cannot be that conversion, because
it silently admits whatever gets added next. (The `name` field that used to illustrate this — same
position, surviving on luck, since every path that wrote it happened to coerce it first — is gone;
see "The mixture `name` is gone, and position is what a cylinder is called now" below. The rule
stands without it.)

## The deco ceiling rides depth's axis, and hiding depth hides the water, not the scale

`ceiling` is a fourth entry in `PROFILE_CHANNELS` with `scale: 100` and `inverted: true` — depth's
own numbers, mirroring `CEILING_SCALE = DEPTH_SCALE` in the API's `schemas/dive_profile.py`. What is
new here is `depthDomain(depthValues, ceilingValues)`, which replaced the inline
`niceDomain([0, ...depth.values])` at the first of the chart's three domain call sites. Temperature
and pressure keep theirs.

**One domain across both channels, and it is computed from both whether or not either is plotted.**
A ceiling is a bound _on_ the depth curve, so an axis of its own could put a 3 m ceiling below a 40
m depth — the picture saying the opposite of the dive. Feeding it the hidden channel's values too is
what keeps the axis still when the ceiling is toggled; on real data it changes nothing, because a
ceiling is always shallower than the depth it was computed at, but an axis that depends on what is
visible is a needless way for the plot to move under the diver's eyes.

That makes `leftChannel` "depth, or the ceiling if depth is off" while `depthChannel` stays the one
that gets the teal fill. A deco dive with depth hidden is then a readable chart — same 0–50 m scale,
labelled in red instead of teal — rather than an unscaled one, and the split is why the fill didn't
follow the axis over to the ceiling.

**The forbidden zone is shaded, not the safe one.** The area runs from the surface _down_ to the
ceiling: that is the water the diver may not ascend into, and the dashed line alone says where the
limit is without saying which side of it is the problem. It is drawn over the depth fill rather than
under it, since it is a subset of the water column by construction and would otherwise be invisible.

**One shaded region per segment**, from the same `segmentByTimeGap` every other channel uses, and
here the gaps carry more meaning than anywhere else on the chart: a break in this series is a
stretch of dive with _no_ decompression obligation, not a sensor dropping out. On
`Dive_2025-06-03-1215.xml` the channel starts at 730 s, so spanning the gap would shade the first
twelve minutes of a no-decompression descent as if the diver had been held to a ceiling.

**The dash is load-bearing.** It is the only curve on this chart that was never measured — depth,
temperature and pressure are readings, a ceiling is a computed limit that moved as tissues loaded —
and a solid line would present the two as the same kind of fact. It also carries the channel's
identity where colour alone would be asking too much of 22 degrees of hue; see the `--ceiling` note
below.

## Adding a channel meant bumping the remembered-selection key

`DIVE_PROFILE_SERIES_KEY` gained a `-v2` suffix. `parseSeriesVisibility` filters a stored selection
down to the keys the current build plots, which is exactly right for a key that has _gone_ — stale,
not corrupt, drop it and keep the rest — and exactly wrong for one that has _arrived_. Every
selection written before this branch names `depth`, `temperature`, `pressure`; all three are still
available, so it restores cleanly and leaves the ceiling switched off, with a legend entry sitting
right there implying the diver turned it off themselves. The feature would have been invisible to
precisely the people who had used the chart before.

Bumping drops those selections and opens on everything plotted — what a first visit already does.
The cost is one diver's hidden temperature line coming back once.

**The alternative was to skip the toggle**, drawing the ceiling with depth and never listing it.
That is what _"Both charts' legends are the control for what they plot"_ forbids: the legend is the
only thing on this chart that says what the red means, and an entry that isn't a control breaks the
pact that makes the legend readable as one. So the ceiling is a toggle, and the key gets a version.

**The general rule: adding a key to a `parseSeriesVisibility` list needs a key bump; removing one
does not.**

**The old entry is deliberately left behind rather than deleted.** `opendiving:dive-profile-series`
now lingers in every returning diver's `localStorage`, holding about forty bytes nothing will ever
read. Removing it costs one `removeItem` — and buys a list of dead key names that has to be carried,
kept correct, and grown by one on every future bump, in code whose whole job is to be forgotten. The
leak is bounded and inert; the cleanup is unbounded and load-bearing. Written down because "why is
there a stale key here" is a fair question with a real answer, not an oversight.

## `--ceiling` is one value for both themes, and the plan asked for two

The rev-3 plan said to define light and dark values. The three chart accents already there —
`--teal`, `--coral`, `--pressure` — are each declared once and deliberately never redeclared under
`.dark`, and the recorded reason is that a per-theme pair has to be tuned twice and drifts.
Following the plan would have made the fourth accent the odd one out, so it is a single `0 80% 55%`,
and the contrast was computed rather than assumed: **4.3:1 against the light card and 3.8:1 against
the dark theme's 13% one**, clearing the 3:1 WCAG asks of a graphical object in both. The web
`accessibility-check` job would not have caught a failure here in any case — it runs axe against the
landing page only, and with `|| true`.

It is not `--destructive`, which is the app's other red: that one is a light/dark pair tuned for
text and for white label text on a fill, and neither job is this one.

**Red at hue 0 sits closer to `--coral`'s 16 than a chart accent normally should**, and temperature
is the channel most likely to be plotted beside a ceiling. An earlier revision of this branch used
amber at hue 38 to buy that separation; red is what every dive computer and every other dive log
uses for a ceiling, and matching the convention divers already read is worth more than the hue gap.
What separates the two in practice is lightness and saturation rather than hue — coral is a pale
salmon at 66%, this is a saturated red at 55% — plus the ceiling being the only mark on the chart
drawn as a dashed line over a shaded region. **Colour is doing the least of the work here, and that
is the condition that makes the overlap acceptable**; a fifth accent that had to be told apart from
coral by hue alone would not get the same answer.

## Markers are annotations, so they have no axis

`events` renders as a tick standing on the x-axis with a glyph on top, at `x(t)` — where a dive
computer's own display puts them, and the only anchor that still works with depth toggled off. They
are deliberately **not** a fifth channel: no scale, no unit, nothing to invert, and a
`PROFILE_CHANNELS` entry would have had to invent all three. They sit at 0.9 opacity until the
crosshair reaches one, which is where a dive with a dozen of them stops reading as a picket fence in
front of the curves they annotate without the marks becoming too faint to aim at — see the contrast
note further down for why that number is 0.9 and not the 0.55 it started at.

This section also said **"and no toggle"**, on the argument that a handful of ticks on the baseline
is the same order of visual noise as the gridlines, which nobody offers a switch for either. They
now have one; see _"The markers got a switch, and it is not a fifth channel"_ below for why that
argument did not survive contact with a dive that has a dozen of them. Everything else here still
holds — having a switch in the legend did not make them a channel.

**Three glyph families, not five.** At this size a shape is worth about one bit, and spending it on
"gas plan / a stop / the computer talking" beats five outlines nobody can tell apart. The readout
says which in words.

**Colour answers a narrower question than shape does: does this marker join to something else on the
chart?** A gas switch is `--pressure` violet because that is the cylinders' colour here and the
marker carries the `gas_number` that joins it to one. Nothing else joins to anything, so nothing
else is coloured.

**A stop is deliberately not drawn in the ceiling's red**, which an earlier version of this branch
did on the stated grounds that "a stop _is_ the obligation the ceiling describes". That claim is not
true of either type this build can receive. Both arrive through `_STOP_TYPE_BY_NOTIFY` in the API's
`suunto_json.py`, which maps them from Suunto `Notify` values — the computer _recommending_ a pause,
not a ceiling forbidding an ascent. A safety stop is the clearest case, being precisely the stop
that is not an obligation: a red triangle in the forbidden zone's exact colour would put an
obligation on a recreational no-deco profile that never had one, which is the same overstatement
this branch works to avoid in every number it prints. **Red means the ceiling, and only the
ceiling.**

**`describeEvent` passes an `other`'s label through unchanged**, because that is the whole point of
the type — the API's `_validate_events` rejects an unlabelled `other` precisely so the device's own
wording survives, and rephrasing "Mandatory Safety Stop Broken" into something tidier would be
inventing a claim about a dive. `gas_number` is tested with `== null`, not for falsiness: **0 is a
real cylinder on a Suunto Ocean**, the same trap `gas_number` sprang on the mixtures form.

**`label` is the first parser-derived free text the app renders.** Everything else an import
produces is a number or a member of a closed vocabulary. React escapes it and the API caps it at 120
characters, but 120 characters on one line is several times the plot's width, so the event line in
the tooltip overrides the card's `whitespace-nowrap` with a `max-w-64 whitespace-normal` and wraps —
the card sits inside a container that clips, so an unbounded line would be cut off rather than
merely ugly.

The chart's `aria-label` **names the markers rather than counting them**, unlike every channel
beside it. A curve's shape genuinely cannot be read aloud, so its extremes are the honest summary; a
list of five markers can be, and hovering — which is how a sighted reader gets them — is exactly
what that label stands in for. Capped at eight with an "and N more", since the API allows 200.

**A sixth event type must not take out the page, and the first version of this would have.**
`EVENT_GLYPHS` is keyed by the five-member union and the marker destructured the lookup directly, so
a type this bundle had never heard of made it `undefined` and the destructure a `TypeError` inside
render. There is no `error.tsx` anywhere under `src/app`, so that reaches Next's default
client-error page and takes the whole dive detail route with it — for one tick on a chart.
`describeEvent` had the quieter half of the same hole: an exhaustive `switch` with no `default`
falls off the end and returns `undefined` from a function typed `: string`.

`ProfileEventType` is closed _today_; the two repos deploy independently, so "closed" is a fact
about the API's current build and not about the string in this browser's hands. `glyphFor` takes a
`string` and falls back to a neutral grey circle, and `describeEvent`'s `default` degrades to the
device's own wording. **A closed vocabulary from another deployable is an open one at the boundary**
— the exhaustiveness TypeScript checks is over the union you declared, not over the bytes that
arrive.

**Resting opacity is 0.9, not the 0.55 it started at.** Opacity composites away exactly the contrast
`--ceiling` and `--pressure` were picked for, and a marker is the one mark here where faintness
fails the reader it matters to — you cannot hover what you cannot see. Against the card the markers
sit on, 0.55 puts `--ceiling` at **1.94:1** and `--pressure` at **2.01:1** in dark, and
`--muted-foreground` at **2.37:1** in light: all under the 3:1 asked of a graphical object, while
every one of those tokens clears it on its own. 0.9 brings the worst case to **3.27:1**; 0.85 would
clear at 3.05:1, near enough the line that a compositing rounding difference could put it under. The
picket-fence worry the dimming existed for is answered by the marks being thin ticks on the
baseline, and the hover still reads — it takes the tick to full strength _and_ thickens it, which
was always doing more of that work than the opacity was.

**The general rule: a token's contrast is a property of the token _and_ the opacity it is drawn
at.** Checking the token alone is checking a colour that never reaches the screen.

## The crosshair quoted readings from stretches the chart refused to draw

`nearestSampleIndex` clamps at both ends, which is right for finding a neighbour and wrong for
captioning one, and adding the ceiling turned a cosmetic flaw into a safety claim. On dive #493 the
ceiling channel begins at 730 s; hovering at 300 s reported **"3.0 m Deco ceiling"** five minutes
into a dive that was still well inside no-decompression limits — an obligation the diver never had,
on the one curve where an invented number is not merely untidy. The same clamp had been quoting tank
pressure straight through a transmitter dropout all along, which was a lie too, just a quieter one.

`sampleIndexAt(t, seconds, maxDeltaSeconds)` is `nearestSampleIndex` plus the channel's own
`gapThreshold` — the same number that decided where to break the line, so the plot and the readout
cannot disagree about the same stretch of dive. Beyond it the channel simply drops out of the card,
exactly as its line drops out of the plot: no line, no dot, no readout. `PlottedChannel` carries
`gapSeconds` for it, and the four call sites that were each computing
`segmentByTimeGap(t, gapThreshold(t))` now go through one local `runs(t)` that returns both, so the
two can only ever be cut at one threshold.

Nothing changes for a well-covered channel: a 10 s cadence gives a 30 s tolerance, and the crosshair
moves about 7 s per viewBox unit on a 72-minute dive.

**And the first version of that guard was inert on exactly the dives it was written for**, which is
worth recording because the mistake looks like the fix. `gapThreshold` answers `Infinity` for a
series of fewer than three samples — correct for segmenting, where it means "there is no cadence
here, so never break this line". Handed to `sampleIndexAt` the same value reads as "no distance is
too far to quote", so the guard fell straight back to the clamping it replaced.

The ceiling is precisely the channel that produces short series, because the API drops zero ceilings
and the channel therefore exists only while an obligation did. A dive that tips into deco for one or
two 10-second samples is a two-point series and nothing else — and it reported that ceiling at
_every instant of the dive_. The one-sample case was worse: `segmentByTimeGap` yields a single-point
run that draws neither a line nor an area, so the chart showed no ceiling at all while the tooltip
insisted on one, with the dot parked at 730 s and the crosshair at 60 s. **The guard failed on the
short, unexpected obligations and worked on the long obvious ones** — the opposite of the order you
would want to find out in.

`readoutTolerance(t)` is `gapThreshold` with the infinity replaced by `MIN_GAP_SECONDS`, and
`runs()` now feeds the two separately: `gapThreshold` to the segmenter, `readoutTolerance` to the
readout. They are the same number wherever a cadence exists, and the divergence is the point rather
than a wart — "never break this line" and "no distance is too far" happen to be the same value and
are opposite instructions.

The floor errs toward refusing: on two samples 70 s apart the line spans the gap while the readout
answers only within 15 s of either end, so there is a stretch with a curve and no number. Silence
where a curve exists is cosmetic; a number where no obligation existed is not, and this channel is
the one where that asymmetry is worth paying for.

**The general rule: a sentinel that means "unbounded" is safe in a predicate that asks "should I
split here?" and dangerous in one that asks "is this close enough?"** — the same constant, opposite
defaults.

### And fixing the readout half left the drawing half wrong for another round

The paragraph above concluded that `gapThreshold` was right for segmenting and only the readout
needed the floor. **That was wrong, and wrong in the direction the whole branch is about.** For a
ceiling of two isolated samples — deco at 1 400 s, cleared, deco again at 2 600 s — the infinite
threshold joins them into one run, and `ceilingAreas` shades a continuous twenty-minute forbidden
zone across nineteen minutes the diver owed nothing. The same false safety claim as the tooltip bug,
expressed in pixels instead of in words, and on the same corpus shape the fix's own comment had
already named.

Worse, the two halves then contradicted each other: `readoutTolerance` was 15 s there, so hovering
mid-span showed no ceiling while the chart shaded one — the precise disagreement `gapSeconds` was
introduced to make impossible. `runs()` now derives both from `readoutTolerance`, which restores
that property rather than merely claiming it.

Two samples ten seconds apart still join and still draw, which is the brief obligation worth seeing.
Two samples twenty minutes apart become two single-point runs, and **single-point runs are now
dropped** rather than emitted: a one-sample `<polyline>` has no line and `buildAreaPath` turns one
point into a degenerate zero-width shape, so they were only ever markup that rendered nothing.
Dropping them makes "no ceiling is drawn here" true of the DOM as well as the pixels, which is what
lets a test assert it. The dive is not thereby recorded as owing nothing — `max_ceiling` still puts
the obligation in the card's description.

### Third round: a tolerance cannot express "was this drawn?", and a sample is always near itself

The paragraph above ended by saying the crosshair "still quotes it within 15 s of a sample", and
treated that as the fix landing. It was the same bug once more. `gapSeconds` answers _is there a
sample near enough to quote_, and **a sample dropped for sitting in an undrawable run of one is
trivially near enough to itself** — so hovering within 15 s of an isolated ceiling sample named a
3.0 m ceiling, planted a red dot on it, and put "deco ceiling to 3.0 meters" in the `aria-label`,
over a chart that had drawn no ceiling at all. Verbatim the failure this guard was written to
remove, narrowed from the whole dive to a band about 5 px wide at the chart's minimum width — and
narrow enough that the regression test walked straight past it by hovering mid-span instead of on
the sample.

The fix is to stop asking a distance a membership question. `PlottedChannel.drawn` is the set of
sample indices that reached the picture, and a readout now needs `sampleIndexAt` **and**
`drawn.has(index)`. Those are different questions and only the second one is "is there anything here
to quote".

**And a channel with nothing drawable left is no longer a plotted channel at all.** `channels` is
filtered on `segments.length > 0`, which is what makes the rule hold everywhere at once — legend,
both axes, crosshair, summary. Before it, a two-sample series claimed a toggle reading "on", a fully
labelled axis in its own colour, and a line in the `aria-label`, over a plot with no curve; a
two-sample depth series additionally drew its area fill with no line over it, because `depthArea` is
built from the whole series rather than from `segments`.

### Fourth round: the same disagreement, one granularity down

The round above filtered `channels` on `segments.length > 0` and called the invariant restored. It
wasn't. **That gate asks "is this _channel_ on the chart"; runs are dropped a level below it, per
_sample_.** A ceiling that keeps one drawable run passes the gate and then hands its whole raw
series to everything that reports an extreme. On `t = [600, 610, 620, 2000]`, where 2000 s is an
isolated 9.0 m sample that draws nothing, the summary announced **"deco ceiling to 9.0 meters"**
over a chart whose deepest drawn ceiling was 3.0 m — an invented deeper obligation, which is the
safety claim this whole guard exists to prevent, now reachable through the `aria-label` rather than
the tooltip. The shared vertical axis read the same array and stretched to fit a curve nobody can
see.

`drawnValues(series, drawn)` is the fix, and both `depthDomain` and `describeProfile` take their
input through it. `describeProfile` now accepts plain `number[]` per channel rather than
`ChannelSeries | null`: it only ever computed extremes, an empty array already means "not on
screen", and taking values rather than a series makes it impossible to pass the raw one by habit.

**And a nearer _undrawn_ sample could mask a drawn one.** `sampleIndexAt` returned the nearest index
and the `drawn` check then rejected it outright, so on `t = [1000, 1010, 1020, 1060]` with 1060
dropped, hovering at 1045 s went silent — with 1020 only 25 s away and inside the tolerance.
`drawnSampleIndexAt` walks outward from the nearest sample and takes the first drawn one, which
collapses two rules into the sayable version: _the nearest drawn sample within tolerance_.

### The third round also broke two-sample measured channels, and `gapsAreMeaningful` is the fix

Segmenting everything at `readoutTolerance` was ceiling-shaped reasoning applied to all four
channels. Below three samples the two thresholds diverge totally — `Infinity` (always join) becomes
15 s (split, then drop both singletons) — so **any** channel with two samples more than 15 s apart
silently stopped plotting. Where that channel was depth and the only one, the component fell through
to `available.length === 0` and rendered "this dive's imported file recorded no samples to plot"
over a dive that recorded two.

`ProfileChannel.gapsAreMeaningful` splits the two cases on what a gap actually _means_. For a
measured channel it means "not recorded", there is no cadence to judge two samples by, and joining
them is the only honest option left — which is exactly what `gapThreshold`'s `Infinity` says. For
the ceiling it means **no obligation existed**, a fact about the dive rather than the sensor, and
joining draws a forbidden zone over water the diver was free to be in. Only the second is worth
refusing to draw for, and only it pays the cost. It coincides with `dashed` today and says something
different: that one is how the curve is drawn, this is what its absence means — so reusing `dashed`
as the proxy would have been a rendering flag standing in for a semantic one.

**Four rounds on one invariant, and the shape of the mistake never changed**: each fix was applied
to the consumer that had been caught, and the next consumer of the same value was left holding the
old behaviour — segmenter, then readout, then legend and axes, then the summary and the shared
domain. Twice the fix itself introduced the next round, once by narrowing the window instead of
closing it and once by generalising a ceiling-specific rule to channels it was wrong for. The thing
that would have ended it sooner is asking _which code reads this, and at what granularity_, rather
than _where did the symptom appear_. Worth noting the `lib` tests caught none of the four: every one
lived in how the component wired well-tested helpers together, which is what
`dive-profile-chart.render.test.tsx` now exists for.

## Markers are clipped to the plot, because the API says in so many words that they aren't

`_rebase_events` clamps an event's time at zero — an XML export records the opening gas selection at
`GasChangeTime 0` while numbering samples from `Time 1`, so the naive rebase is -1 and dropping it
would lose which gas the dive started on — and **deliberately leaves the high end alone**, because
`duration_seconds` is the span of the _samples_ and a device goes on recording after the last one. A
FIT `user_marker` can be pressed after surfacing. It closes with: "A chart that draws past its x
domain is the chart's to clip."

This chart wasn't clipping. `x(6000)` on a 3 000 s dive is 1 304 in a 720-unit viewBox, so that
marker vanished; `x(3200)` is 716, which is _inside_ the viewBox but in the right-hand axis-label
gutter, aligned with no time on the axis at all. Meanwhile `describeProfile` named both. **A marker
invisible to the eye and announced to a screen reader is the two views disagreeing about what the
chart contains**, which is worse than either dropping it or drawing it.

One filtered list now feeds all three consumers — the glyphs, the crosshair and the summary — so
they cannot disagree. Dropped rather than clamped to the last second: clamping would invent a time
to keep a marker on screen, which is the same class of lie as quoting a ceiling that hadn't started.
And not left to the SVG's own clipping, which isn't clipping at all — it hides what leaves the
viewBox and happily draws what merely leaves the plot.

**The general rule: when an upstream contract says "this is yours to handle", that sentence is the
requirement.** The API's comment was load-bearing documentation of a boundary, not a remark.

## A dive-wide bar/min is not a rate, so multi-tank `sac_bar_per_min` is null

Every other figure on the Gas Consumption card survives being summed across cylinders. Litres are
litres, and RMV is defined at surface pressure precisely so a 22 L twinset and an 11 L stage produce
comparable numbers. SAC does not: bar/min is a rate of _pressure_, and 10 bar out of the stage is
half the gas that 10 bar out of the twinset is. Adding the two, or averaging them, produces a number
with no referent — not an approximation, a category error.

So `DiveGasUse.sac_bar_per_min` is `number | null` on the wire and null on exactly the multi-tank
dives, where each entry in `tanks` carries its own instead. A per-tank SAC _is_ meaningful, because
a tank has one volume, and it is the figure a diver reads off a pressure gauge — which is why it
stays in the table rather than being dropped as derivable.

The nullability is cheap to carry. The only other reader of the field is nothing:
`gas-use-chart.tsx` and `gas-use-card.tsx` plot `rmv` and label with `gas_used`, so the dashboard is
untouched by this even though multi-tank dives now enter `gas_use_history` for the first time.

The total row renders `-` rather than omitting the cell, and greys it. An absent cell in a column
five other rows fill reads as a layout bug; a dash reads as "there is no answer here", which is the
claim being made.

## The multi-tank branch now splits three ways, and tests attribution first

Before this phase, `gasUseUnavailableReason` had one thing to say about several cylinders: the model
can't tell them apart. Now it can, given gas switches the dive computer recorded — so the branch has
several outcomes and the order they're tested in is the whole decision.

`compute_multi_tank_gas_use` gives up for five distinct reasons: no attribution at all; two mixtures
claiming one `gas_number` (which refuses the whole dive, since the ambiguity poisons every join, not
just theirs); a cylinder the attribution never names; a cylinder failing the same pressure
arithmetic `compute_gas_use` applies; and a tank whose per-tank RMV comes out past
`MAX_PLAUSIBLE_RMV`.

**Only the fourth is a plain skip.** The third splits on whether that cylinder's own pressures show
a drop: none, and it is passed over as the corpus's ordinary deco bottle with no transmitter; a
drop, and it refuses the whole dive, because the time it was breathed for is sitting inside another
tank's stretch and the surviving figures are wrong rather than incomplete — with a coverage fraction
whose two halves agree and read as the whole dive. The fifth refuses for the same reason arriving by
another route, a switch recorded late rather than not at all. And if every cylinder is skipped by
the fourth, nothing survives and the dive comes back empty anyway.

**That is why the attribution sentence cannot claim the import records no gas switches**, which is
what it said first. Three of the five refusals are attribution faults and share it, and two of those
three happen on dives that demonstrably _do_ record switches — where `DiveProfileCard` is drawing
their markers ten lines further up the same page. A card asserting an absence the chart above it
disproves is the same failure `gasAttributionNote` spends four words avoiding. It says the switches
don't account for every cylinder instead: true of all three, including vacuously the no-switches
case, which is what all 18 un-derivable multi-gas dives in the corpus actually are.

The wider lesson is the mirror-comment pact's own failure mode. The comment saying "if either
function's conditions change, this list has to change with it" is not self-enforcing, and the API
grew two conditions in the hour before this branch's tip. What made it visible was not the pact but
the _sentence_ the stale list produced — so where a guard list drives user-facing copy, phrase the
copy against what the app can still see (a chart full of switch markers) rather than against the
guard it is mirroring.

The API's outer gate is attribution: it reaches the pressure arithmetic only after the attribution
exists. The browser can't see `dive_profile.gas_attribution`, so the inference runs backwards. **If
a cylinder's pressures would have produced a figure and the dive produced none, the attribution is
what was missing** — that cylinder would otherwise have survived as a partial result. Only when no
cylinder could have produced one do the other two sentences apply: no pressure drop anywhere (they
are recorded, and adding more wouldn't help), or no pressures at all.

The duplicate-`gas_number` case deliberately gets no sentence of its own. It isn't reachable through
this app — `gas_number` is carried, never edited, and a hand-added cylinder has none — so a phrase
for it would be untestable wording for a state the UI cannot produce. It lands on the generic
attribution sentence if it ever arrives.

Two phrasings that the one-tank branch uses are deliberately not reused. Not "this tank's" — it
points at a row the diver isn't looking at when there are four. And not a word about average depth,
which the single-tank sentence asks for and the multi-tank path genuinely does not need: it takes a
mean depth per cylinder from the profile, so `dive.avg_depth` is not one of its inputs and sending a
diver to fill it in would change nothing.

## Attribution comes from gas switches only, and the litres never come from the profile

Two plausible-sounding sources are not in play, and both are worth naming because the obvious guess
is wrong in each case.

**Per-cylinder pressure activity is not an attribution source.** Watching each tank's pressure curve
for the stretch where it falls looks like the natural signal, and it was rejected on two independent
grounds: the exports carry one pressure channel per file, so there is usually nothing to compare,
and a cylinder's pressure keeps moving with its temperature long after the diver switched away from
it. The column is named `gas_attribution`, not `gas_usage`, precisely because it carries no
pressures — only which cylinder, for how long, at what mean depth.

**The litres come from the form's `start_pressure`/`end_pressure`, not the profile's curve.** On the
showcase dive the two disagree by 4.6 bar, for the same cooling reason. The recorded header is the
diver's own number and the one the mixtures card prints directly above; deriving consumption from a
different number than the one on screen would make the table unreconcilable with the card above it.

## The consumption table is six columns wide and scrolls, like the mixtures table above it

Measured on dive #493 in a 680 px pane: the table lays out at 648 px inside a 582 px card, so it
overflows by 66 px — 11 px more than the mixtures table's 55 px in the same card. Both scroll inside
their own `overflow-x-auto` wrapper and the page body never scrolls sideways, which is the same
resolution Phase 2 recorded. On a full-width desktop the main column is around 800 px and neither
table overflows at all; this is a narrow-pane artifact, not the target viewport.

The columns were measured before accepting it: Tank 175, Time 74, Avg Depth 84, Gas Used 90, RMV
109, SAC 117. The two widest are driven by their **content** — `18.24 L/min`, `0.82 bar/min` — not
their headers, so the header-shortening that bought Phase 2 its 73 px back has almost nothing to
give here. Moving the units into the headers would reclaim it, and is exactly what this card's own
rule forbids: "Units stay with the values, never doubled in the label."

"Avg Depth" survives at full length for a reason worth stating, since it is the one header short
enough to trim: it is a **mean** depth over the stretch a cylinder was breathed, and "Depth" beside
a per-tank row invites reading it as that gas's deepest point. That misreading is the one this
feature must not encourage — see `diveModWarning`, which refuses to warn per tank precisely because
a mean depth is the wrong input for a MOD.

**Both figures are superseded** — see "Both gas tables finally fit their slot" below. `Tank 175` was
the widest column here and it was the _label_ driving it, not the figures: `Tank 1` plus two badges.
Split into a `#` of 29 px and a `Gas` of 100 px, and with the cell padding halved, the table fits.

The paragraph above is still right that `RMV` and `SAC` are content-driven and have nothing to give
— but it reasons entirely about text, and the lever it never considers is the padding around it.
That is the general lesson worth carrying: **before shortening a header, check what fraction of the
table is `p-4`.** Here it was over a third.

## The tank↔mixture join applies the API's duplicate rule rather than trusting it

`compute_multi_tank_gas_use` refuses a whole dive whose mixtures share a `gas_number`, so a
duplicate reaches the browser as `gas_use: null` and `tankGasUseRows` is never called on one. **The
guard here is belt-and-braces, and stays anyway.** It is the cheap half of a pair whose expensive
half is a table showing one cylinder's litres twice under a total that counted them once — a table
that visibly doesn't add up, which is worse than one that says less.

The two sides can drift, which is the whole argument for keeping it. `gas_number` round-trips
through the form untouched today; the day an edit path opens, or the day a response cached before
that API guard existed is served, this is what stands between a duplicate and that table. A pure
exported function whose output is only sound because of a server-side check somewhere else is a
function whose contract can't be stated.

So a gas number naming more than one cylinder names none of them: both rows come back unattributed.

**The same rule applies to the tank side, and the first version only guarded the mixtures.** That
asymmetry was the more damaging of the two. A `Map` keyed by gas number keeps the last writer, so
two tanks sharing a number left the earlier one matched to nothing — and the append loop tested the
_number_ rather than the tank, saw the number already claimed, and skipped it. The tank disappeared
from the table while its litres stayed inside the dive-wide total: not a total contradicted by its
rows, but a total silently larger than all of them, which is harder to spot and just as wrong. Both
tanks now fall through to rows of their own, keyed by position in `tanks` rather than by the gas
number they share.

The invariant that fixes it is worth naming, because two other decisions on this page lean on it:
**every tank reaches exactly one row.** A test pins it directly.

The two asymmetries around it are deliberate and pull in opposite directions:

- **A mixture with no matching tank keeps its row**, marked "Not attributed". A pony carried and
  never breathed belongs in this table saying exactly that, and dropping it would leave this table
  quietly shorter than the mixtures table directly above it.
- **A tank matching no mixture is appended**, labelled `Gas N` from the device's own number. Its
  litres are already inside the dive-wide total, so hiding the row would leave a total the visible
  rows don't sum to — the same failure as the duplicate case, arriving from the other end.

`Gas 3`, not `Tank 3`: the mixtures card numbers cylinders by 1-based _position_, and the whole
point of this row is that it matches no position at all. Reusing that word would invite reading it
as the third cylinder. The row keys follow the same rule — built from `mixture.id` or list position,
never from `gas_number`, which is neither unique nor always present.

Every `!number` shortcut in this join would have dropped the entire first cylinder of a Suunto Ocean
export, which numbers from 0. There is a test pinning that, as there is on the form side.

## Attribution coverage is stated when it's short, and silent when it isn't

Per-tank figures are an inference from the profile, not a recorded fact, and the inference can leave
a remainder — a file recording gas switches but not the gas the diver entered the water on has
nothing to assign the descent to. Presenting figures that describe 38 of a dive's 42 minutes as
though they described the dive understates every one of them.

`gasAttributionNote` says so, from the `attributed_seconds`/`duration_seconds` pair, and says
nothing below a one-minute remainder — which is rounding, and would also print a sentence whose two
spans render identically at the minute resolution the note is phrased at. The denominator is the
profile's span rather than `Dive.duration` because that is what the attribution actually ran over;
`Dive.duration` is the diver's own record and may have been hand-edited, which would make the
fraction unfalsifiable.

It also returns null when `attributed >= total`, rather than printing "covers 45min of the 40min
recorded". That is unreachable from a correct API but is the exact shape a degenerate profile or
self-overlapping attribution would take, and the failure mode of trusting it is a sentence that
destroys confidence in the numbers above it.

**The denominator names the dive computer, because the page prints a different number for the same
thing.** `duration_seconds` is the profile's span and routinely outruns the dive's logged duration —
4300 against 4001 on dive #493, five minutes of a computer still sampling after the diver surfaced.
The note first read "38min of the 42min recorded", which on real data became "35min of the 1h 12min
recorded" sitting a card below a header reading **Duration 1h 7min**. Two right numbers for two
different spans, presented as if one of them were wrong. "the 1h 12min _the dive computer recorded_"
costs four words and says whose span it is. This is the cost of choosing the profile's span, and it
is still the right choice — it is what the attribution actually ran over — but the choice has to be
visible in the sentence, not just in this file.

## The total row is dropped when it would restate the only row above it

The API attributes what the gas switches support, and the corpus supports one cylinder: **19 of 19
multi-gas dives yield exactly one `tanks` entry**, because a diver carries one transmitter on the
back gas and the deco bottle records no pressures to derive anything from. This is the normal shape,
not a degenerate one.

On it, an "All tanks" row is worse than nothing. It repeats the single filled row's time, litres and
RMV verbatim, and prints a dash under SAC — where the row directly above it prints `0.56 bar/min`.
The dash is correct in the abstract (there is no dive-wide bar/min) and actively misleading in
context: it reads as "no SAC available" two cells from a SAC.

So the total renders only when two or more cylinders were attributed, which is the only case where
it reconciles anything.

The condition is "how many rows carry figures", counted after the join — and it is worth being
precise about what that does and doesn't buy, because it is easy to overclaim. **For this condition
`tanks.length > 1` would be exactly equivalent**, and provably so: every tank reaches exactly one
row, matched to a mixture or appended as `Gas N`, so the count of rows carrying figures _is_ the
count of tanks. (There is a test pinning that invariant, and before the tank-side duplicate guard
above it did not hold — a collapsed duplicate was the one way a tank could reach no row at all.)
`attributedCount` is preferred for saying the reason directly rather than through an invariant that
has already been broken once, not because it decides differently.

Where the two genuinely part company is **the layout switch**, which is `rows.length > 0`. There
`tanks.length > 1` would be a real bug rather than a stylistic choice: it would send this entire
corpus back to the single-tank headline figures and hide the deco bottle's row, since one attributed
tank is what all 19 of these dives produce.

The "Not attributed" row stays regardless. On a one-transmitter dive it _is_ the second piece of
information the card has: the diver carried a deco bottle, and this log can't say what it cost.

## The dashboard chart stopped naming a depth the rate wasn't divided by

Multi-cylinder dives reach `GET /user/gas-use-history` for the first time in Phase 4, and their RMV
is normalized against each cylinder's own mean depth over the stretch it was breathed for. The chart
predates all of that and framed every dot the single-tank way —
`{avg_depth}m average · {gas_used} L used` in the tooltip, and `at {avg_depth}m average` in the
dot's accessible name.

On dive #493 that renders "12.4 liters per minute at 20.87m average" for a figure derived at **33.99
m**. The depth is a true fact about the dive and a false claim about the number beside it, which is
the worst of both: quoting the denominator is exactly what made this tooltip checkable on a
single-tank dive, so a wrong one is trusted for the same reason the right one was.

The litres are understated in the same breath — `gas_used` on a multi-tank point is the sum over
_attributed_ tanks only, so a partly-attributed dive reads low against whole-dive points on the same
trend line. Both are dropped together rather than leaving one quietly wrong beside the other, and
what replaces them is the one thing needed to read the dot correctly: this rate is per cylinder, and
the dive page has the split.

`point.gas_use.tanks?.length` is the switch, the same one the consumption card uses. **The
accessible name gets the same treatment and not a simplified version of it**, because it is the only
form of this sentence a screen-reader user ever gets; a visual fix alone would have left them with
precisely the claim that was wrong. Both are covered by `gas-use-chart.render.test.tsx`, which
asserts the absence of `20.87` as directly as it asserts the presence of the replacement.

**The general shape, and the reason this was missed once:** a derivation that changes what a number
_means_ has to be chased to every consumer of that number, not just the one being built. The card
was where the work was, so the card is where the two paragraphs of explanation went — while a second
consumer kept rendering the old meaning for the new figure, in a file this branch never opened.

## No profile, no attribution — and that is 18 of the 19 multi-gas dives

`gas_attribution` is a column _on_ `dive_profile`. A dive without a profile therefore cannot reach
the multi-tank derivation whatever the diver types, and `gasUseUnavailableReason` tests that before
anything else.

This was found late and is not an edge case. Of the 19 multi-gas dives in the corpus, **18 have no
profile and no source file at all** — they were logged by hand. Every one of them was being told
"needs an import whose gas switches account for every cylinder on the dive", about an import that
does not exist; and the bare-pressures branch would have sent the ones missing pressures off to fill
in fields that change nothing, to be met with a different refusal on the next render. The one
imported dive is #493.

The browser can see this for itself: `dive.profile` is on the detail response, and the `mixtures`
guard higher up has already returned for a list dive, so a missing `profile` here is a real absence
rather than a field the endpoint withheld.

**The lesson is about which fixtures a message gets tested against.** Every test for this branch was
built from the imported shape, because that is the shape the feature is _for_ — and the sentence was
wrong for the overwhelming majority of dives that would actually see it. A user-facing string wants
a fixture drawn from the corpus's ordinary case, not from the case the code was written for.

## "Not attributed" named one of the two states behind an empty row

`TankGasUseRow.use` is null for two different server outcomes: the attribution never mentioned the
cylinder, or it did and `_tank_arithmetic` declined it — no pressures, no drop, or a degenerate
stretch (`seconds <= 0`, `mean_depth_cm <= 0`, which a gas switched to at the surface at the end of
a dive really produces). The label said "Not attributed", which is the first of those, and on the
second it is flatly contradicted by the coverage note three lines below reporting that cylinder's
seconds as attributed.

The row now says **"No pressures recorded"** where the mixture carries no pressure pair — which the
browser can check for itself, is certain, and is the corpus's deco bottle with no transmitter, the
only unattributed row any real dive here renders — and **"No figures"** otherwise, which claims only
what is known. `TankGasUseRow` carries a `hasPressures` flag for the purpose, read only when `use`
is null.

The general rule: when a null collapses several upstream states, a label naming one of them is a
guess wearing a fact's clothing. Either distinguish them or say less.

## One dot, two sentences, one predicate

The gas chart describes each point twice — the visible tooltip and the dot's accessible name — and
after the multi-tank split those two had to agree on whether the RMV was derived per cylinder. Both
computed `(point.gas_use.tanks?.length ?? 0) > 0` independently, with a comment on the second saying
they "have to" agree and nothing enforcing it. `isPerTankPoint` is now the single predicate.

Worse than the duplication was where the tests sat. The accessible name was pinned in both
directions — the presence of the replacement _and_ the absence of `20.87` — while the tooltip, which
is the path almost every diver takes, had none. A regression putting `avg_depth` back into the
tooltip and leaving the aria label alone would have shipped green. Confirmed by breaking the
predicate on purpose: the aria tests stayed green and only the new tooltip test failed.

**Testing the accessible name is not a proxy for testing the visible one**, even where both come
from the same data. They are two renderings, and a test that covers only the one you had to think
hardest about covers the one users are least likely to hit.

## The dive's clock went up to the header, and two cards became one

The detail page opened with a `Time & Duration` card holding the start time and the duration, then a
`Depth Information` card holding the maximum and average depth. Between them that is four figures,
two card headers, and a scroll position separating "45min" from "30.5 m" — two numbers nobody reads
apart.

**The start time belongs with the date, and the date was already in the page header.** `Dive #21`'s
subtitle read `Sunday, April 4, 2021`, and the clock time for that same instant sat in a card below
it. `formatDiveStartTime` now prints all three parts — date, wall-clock time, and the offset that
clock was on — as one line, and the card is gone. The offset stays because dropping it would make
the time unverifiable: this app deliberately shows a dive in its own timezone rather than the
viewer's (see _"A dive's `start_time` displays/edits in its own timezone, never the browser's"_),
and `10:04` with nothing after it is a number the reader cannot check.

It is composed from `formatDiveDateTime` + `formatDiveTimeOnly` rather than asking `Intl` for the
date and the time in one call. en-US does join them with `" at "`, but which separator a locale
picks is an ICU detail, and the offset has to be appended by hand at the end regardless — so either
the whole line is assembled here or half of it is inherited from a formatter that could change it.

What is left is one `Duration & Depth` card of three stat blocks at one weight. Duration was
previously body text beside a clock icon while the depths were `text-2xl font-bold`; they are all
figures about the same dive and there was no reason for two typographic ranks. The grid is
`md:grid-cols-3` and the depths stay individually conditional, so a hand-logged dive with no depths
leaves the duration on its own rather than stretching one number across the card.

## The ppO₂ limit is picked from a list, and an unlisted one is added to it

`po2_limit` was a `<input type="number" step="0.1" min="0.4" max="2">`. The band is the schema's,
which is deliberately wide because it exists to catch a unit error — a Suunto JSON export writes
140000 Pa for 1.4 bar — and not because a diver picks from all of it. Every value in it anyone would
actually choose is one of seven: 1.4 for a back gas, 1.6 for a deco bottle, and the conservative
steps below them. What free entry bought over those seven was typos, `1.45` from a slipped keypress,
and a save that comes back 422 on `ck_dive_mixture_po2_limit_range` with nothing the diver can act
on.

So it is a `<select>`, for the same two reasons `role` beside it is one: it needs "unset" as a real
selectable option, which Radix's `Select` reserves `""` for, and `""` has to reach react-hook-form
as the live cleared value rather than `undefined` — the trap _"The API sends `null`, the form schema
only understood `""`"_ documents, and which `role` shipped with before it was found.

**The options are strings, not numbers**, and that is the one non-obvious line in it. An
`<option>`'s value is a string either way, so a numeric list has to be formatted on the way out and
parsed on the way back — and `String(1.0)` is `"1"`, so an option labelled `"1.0"` would never match
its own stored value and the box would render blank on a cylinder holding 1.0. Written as the tokens
they are displayed as, the label, the value and the round trip are all the same characters. The
selected option is likewise found by `Number(option) === value` rather than by formatting the value,
so the comparison happens in one direction only.

**A limit that isn't on the list is inserted into it**, sorted, rather than dropped. Anything in the
0.4–2.0 band can arrive from a file, and a `<select>` whose value matches no option renders blank
while the form goes on holding the value: the box would read "Not recorded" over a cylinder that
records 1.45, and the only way to find out would be to save and watch the MOD not move. The same
class of bug as the blank-looking role field, arrived at from the other end.

**That rescue only lasts while the value is still selected, and the narrowing is a one-way door we
are accepting.** Change the imported 1.45 to 1.4 and there is no route back to it, and nothing in
the form reaches the 0.4–0.9 the DB constraint allows. The floor is 1.0 by decision rather than by
inheritance: below that a figure is a CCR _setpoint_ rather than a ceiling a MOD is computed at, and
this field feeds a MOD. Written down because "why can't I type 0.8" is a fair question with an
answer, and because the trade is asymmetric — a diver who needs an unlisted number has lost
something real, while a diver who fat-fingers `14` into a free text box gets a 422 they cannot read,
and there are many more of the second.

## The profile's left edge always carries a scale, and an all-hidden chart is still a chart

Two reports about the same block of code, and they turn out to be the same mistake made twice: the
chart derived what it drew from the channels it had, and treated "none of the ones I was thinking
of" as "nothing".

**The left-hand axis was `depthChannel ?? ceilingChannel`.** Switch both off — a perfectly
reasonable thing to do on a dive where you want to read the temperature curve — and the left margin
went blank while the gridlines went on running out of it, because they take their positions from the
left axis. Meanwhile pressure, which shares the right-hand side with temperature and deliberately
goes unlabelled there, had no scale on the chart at all.

The plot holds at most **three scales** however many curves are on it, because depth and the ceiling
are one — the same meters on the same domain, see _"The deco ceiling rides depth's axis"_ — and the
rule is now stated over those rather than over channels:

**Sides are fixed while there are two scales to tell apart.** Meters on the left, temperature on the
right, pressure taking whichever of the two the others left free. A diver reads this chart across a
logbook of dives, and an axis that changed edges with the channel mix would make them re-read the
colour of the numbers every time — the labels are coloured, but hue is a slower thing to check than
position. Pressure is the one that moves, and it is the right one to move: on a full three-scale
plot it is the channel that goes unlabelled anyway, since three sets of numbers on one edge is
unreadable and the crosshair gives the exact figure for any instant.

**A single scale goes on the left, and the right edge stays empty.** Nothing shares the plot with
it, so there is no side to protect; the left is where the eye goes for a primary axis and where the
gridlines are already anchored. This is the one case where "temperature is always on the right"
gives way, and it gives way because the reason for fixing the sides has evaporated.

Mirroring the single scale onto both edges was tried in between and is wrong: two columns of
identical figures either side of a plot invite exactly the reading that they are two scales.

So, as an invariant: **the left edge is labelled whenever anything is plotted, and the right edge
exactly when the plot holds a second scale.**

`DiveProfileChart vertical axes` sweeps all fifteen non-empty selections and asserts both halves,
seeded through the remembered selection rather than through fifteen click sequences. The expected
right-hand answer is computed rather than listed — `distinctScales` counts the domains a selection
puts on the plot, collapsing the ceiling into depth — so the test states the rule instead of
restating the implementation's fifteen outcomes. Six more tests pin _which_ edge each scale lands on
by reading back the colour class on the labels, which is the half a count can't see. Confirmed by
restoring the old `depth ?? ceiling` rule: four cells of the sweep fail, and the one everybody would
have hand-written — depth plus temperature — is not among them.

**And switching the last channel off returned a bare sentence in place of the whole chart.** The
card collapsed to two lines, which dragged the legend — the only way back — up the page after the
cursor that had just clicked it. The plot now stays: same box, same elapsed-time axis (which no
channel was holding up), same event markers, with the sentence over the middle of it and
`pointer-events-none` so the crosshair underneath still works. Neither edge carries numbers there,
and that is the honest rendering — with no channel on screen there is no domain to label one with.

The general shape, for the next `??` chain in this file: a fallback list that runs out is a case,
not an absence. Both of these were written as though the tail of the chain could not be reached.

## The depth fill was built from the whole series while its line was built from segments

`segmentByTimeGap` cuts every channel into runs so no line is drawn across data that isn't there —
_"The profile's line breaks are derived from the series' own cadence"_ — and the depth polylines
have always honoured it. The teal fill underneath them did not: `depthArea` was a single
`buildAreaPath` over `depthChannel.series.t` entire, every sample the channel carried, dropouts
included. So on a dive with a real mid-dive hole the curve broke where the recording stopped and the
shaded water went straight on across the gap beneath it.

That is worse than an untidy shape. The fill is the thing that says which side of the curve is
water; spanning a dropout with it is a claim that the diver was down there through a stretch the
device recorded nothing about — the same claim the broken line above it is refusing to make, in the
same picture.

It is now one path per segment, from the same `segments` the polylines use, which is exactly what
the ceiling has done since it was added. Two consumers of one segmentation, and the one that came
first was the one that got it wrong.

The tests assert the geometry rather than only the count: two fills that happened to overlap would
pass a count and reproduce the bug, so `leaves the dropout unfilled rather than spanning it` reads
the `d` attributes back and checks that the first ends at x(900) and the second starts at x(2400).

## The markers got a switch, and it is not a fifth channel

_"Markers are annotations, so they have no toggle"_ argued that a few ticks on the baseline are the
same order of visual noise as the gridlines. That holds for a dive with three markers and fails for
one with a dozen, which the corpus has: the row of ticks becomes a picket fence in front of the
curves it is annotating, and the diver had no way to put it down. The 0.9 opacity was already the
compromise reached for that problem, and it is the wrong instrument — it trades legibility of the
marks against legibility of the plot, and the contrast note two sections down is the record of how
little room there was to move.

**The switch does not make them a channel.** `ProfileChannelKey` stays "a thing with a domain",
which is what every axis, readout, domain and segmenter in `lib/dive-profile.ts` is written against
and none of which can say anything about a marker. What the legend switches is a wider set,
`PROFILE_VIEW_KEYS = [...PROFILE_CHANNEL_KEYS, "events"]`, and `parseSeriesVisibility` is already
generic over its key list, so the stored entry carries both without either type learning about the
other. `ChannelToggles` became `LegendToggles` to stop the name claiming otherwise.

**It goes in the legend, and nowhere else.** That follows from _"Both charts' legends are the
control for what they plot"_: a marker switch anywhere else on the card would be the first thing on
this chart you could turn off from outside its legend, and the pact that makes the legend readable
as a control is that it is the only one.

**The swatch is an uncoloured dot**, which is two decisions. A circle rather than the diamond or the
triangle, because those mean "gas switch" and "a stop" specifically and one entry standing for all
five types has no business claiming to be one of them — the circle is what the two general types
already draw. And uncoloured in both states, unlike every swatch above it: marker colour answers the
narrow question _does this join to something else on the chart_, true only of a gas switch, so a
violet legend swatch would be making that claim on behalf of the four types for which it is false.

**Hiding them hides them everywhere.** The glyphs, the crosshair readout and the accessible summary
all read one `eventsShown`. This chart has been talked out of the "drawn in one view, named in
another" disagreement four separate times — see _"The crosshair quoted readings from stretches the
chart refused to draw"_ and its three follow-ups — and a toggle is a fifth way in, so the two tests
that matter most here are that a hidden marker stops being announced to a screen reader and stops
being quoted by the crosshair.

**Adding the key cost a version bump**, per the rule this file already states: every stored
selection names only channels, all of them still available, so it would restore cleanly with the
markers switched off — hiding annotations that have always been drawn, with a legend entry sitting
right there implying the diver turned them off themselves. `-v2` became `-v3`, and the `-v2` entry
is left behind for the same reason `-v1` was.

**The empty-plot message now checks the markers too.** "Every channel is hidden. Pick one below to
plot it." is held back while the markers are up: with every curve off and the markers on, the plot
has content, and printing that sentence across a row of them describes a chart nobody is looking at.

## A remembered selection is held over every key, not over the keys one dive has

`available` is per-dive — a no-deco dive offers no ceiling toggle, a dive whose computer logged
nothing offers no markers switch — while the stored selection is **one entry for the whole app**.
The chart narrowed the selection to `available` before storing it, in two places at once:
`rememberedHere` filtered the restored value, and `toggleSeries(current ?? visible, key, available)`
passed the narrowed list as its `order`, which is also what the result is rebuilt from.

So every toggle click re-emitted a selection stripped of whatever this dive happens to lack. Hide
the temperature curve on a dive with no markers, and the entry written back says nothing about
markers — which `parseSeriesVisibility` reads as "off". The next dive that has markers opens with
them hidden and the legend entry rendering `aria-pressed="false"`: the chart telling the diver they
turned something off that they never touched.

That is exactly the failure a `DIVE_PROFILE_SERIES_KEY` version bump exists to fix — and the bump
fixes it **once, at migration**, while this reopened it on every dive missing a key. It was already
live for the ceiling before the markers existed; markers merely made it common, since dives without
events vastly outnumber dives without a deco obligation.

The selection is now held at full width (`chosen ?? remembered ?? PROFILE_VIEW_KEYS`) and
intersected with `available` only to decide what to draw. Four things fall out of that and each
needed saying:

- **`visible` is the intersection**, and everything that describes the chart — `shown`,
  `eventsShown`, `shownValues`, the empty-plot overlay — reads it rather than the selection, or a
  stored `"events"` on a dive with none would suppress the "Every channel is hidden" message.
- **An empty `chosen` is still honored** where an empty remembered selection is not. The test is
  `chosen !== null`, not truthiness or length: `[]` is a choice just made on this dive ("hide
  everything"), while a _remembered_ selection that plots nothing here means the dive recorded only
  what you'd hidden, and it should open showing what it does have.
- **The "plots nothing here" test asks whether a _curve_ survives, not whether a key does.** The
  markers are in `available` now, so `selectedHere.length > 0` was satisfied by them alone: a stored
  `["temperature", "events"]` opened on a depth-and-markers dive came through as `["events"]` — no
  curve, no vertical axis, no gridlines, and no message either, since the overlay stands down while
  the markers are up. Precisely the blank chart this fallback exists to prevent, let through by the
  one key that cannot draw a curve.
- **And the fallback restores the curves only**, carrying the markers choice through untouched.
  Falling back to `available` wholesale is the obvious fix and is wrong in the other direction:
  under this key a marker preference's absence is a real "off", so sweeping it up would switch
  markers back on for a diver who had switched them off — the same class of erasure as the leak this
  section is about. Nothing about that preference caused the blank plot, so nothing about it needs
  overriding to fix one.
- **The toggle's base is `visible` lifted back over the full list**, not the raw selection. In the
  fallback case above the chart is showing everything while the stored selection names none of it,
  so flipping a key against the stored value would _add_ the curve the diver just clicked to hide.

`DiveProfileChart selection across dives` pins the leak, including the ceiling case that predates
the markers, by rendering one dive, toggling, `cleanup()`, and rendering another — the two-dive
session the single-render tests could never have caught.
`DiveProfileChart remembered selection that plots no curve here` pins both halves of the fallback,
and the second of its two tests fails against the naive fix as well as against the bug.

## The mixture `name` is gone, and position is what a cylinder is called now

`DiveMixture.name` is being dropped from the API, so it is dropped here: the schema field, the form
input, the column, the label fallbacks, and `getDefaultMixtureName` with them. Nothing is left
behind for a future re-add — a `name` still typed on this side would be a field the API rejects.

**What names a cylinder instead is its 1-based position**, which is not a downgrade so much as an
admission of what was already happening. The name was never parsed out of any export
(`ParsedDiveMixture.name` was always `null`), so every imported cylinder got
`getDefaultMixtureName(index)` — "Back Gas", "Deco Gas 1" — which is position with prettier words on
it. Both display sites already fell back to `Tank ${index + 1}` for a cylinder without one, so the
fallback is now simply the only case.

Three things follow from that:

- **The mixtures card's first column is headed `Tank`, not `Name`**, and its cells read `Tank 1`,
  `Tank 2`. That is the consumption card's header and cell format exactly, which is the point: the
  two tables are meant to be read against each other row by row, and `TankGasUseRow.label` derives
  the same string from the same position. A cylinder that matches no mixture is still `Gas N` from
  the device's own number — unchanged, and still deliberately not `Tank N`, so it cannot be misread
  as the Nth row of the table above.
- **The column stays rather than being dropped for the width**, and it turns out not to cost
  anything. Dropping it was tempting — the role-badge section above names the column set as the
  thing to reconsider — but the identifier column is the one the consumption card joins to, and the
  per-cylinder pressure channels on the profile chart are numbered against it too. Keeping it is
  free because `Tank 1` is so much narrower than the `Deco Gas 1` it replaces: **the same two-gas
  dive at 1280 px now measures 667 px in its 667 px slot, so the table finally fits and
  `overflow-x-auto` has nothing to scroll.** Against the 719 px that section records for this
  configuration (gas badge, no role badge — which is what this dive carries), that is the 52 px of
  overflow gone. The before figure is quoted from there rather than re-measured: the API has already
  dropped its column, so there is no longer a local state that renders a name.
- **`mergeMixture` lost its `index` parameter**, which existed only to name the cylinder. The two
  remaining tiers — the file, then whatever the form held — are both keyed on the caller's pairing,
  so position is no longer this function's business.

The form loses its **Name** field, leaving seven inputs in the per-tank card. `DEFAULT_MIXTURE` is
now complete on its own, so `append({ ...DEFAULT_MIXTURE })` and the two pages' seeds no longer
spread a name over it — which also removes the one place a hand-added cylinder and an imported one
were seeded differently.

**Seven boxes in a two-column grid needs one of them widened, or every pair below it breaks.** The
eight fields paired up (name/volume, O₂/He, start/end, ppO₂/role); removing one shifted all of them
by a slot, splitting O₂ from He and start from end, and leaving Role alone on a half-empty last row.
Volume takes `md:col-span-2` — it is the field with no partner to be split from, having spent its
life beside the name — which restores every remaining pair to a row of its own. Measured at 1280 px:
Volume 556 px full width, then O₂ | He, Start | End, ppO₂ | Role at 270 px each.

## The export filename is the server's, with a local mirror behind it

The plan for the settings export card said, in as many words: "Filename comes from the server's
`Content-Disposition` — parse it rather than re-deriving." That is what runs: `lib/api/export.ts`
calls `filenameFromContentDisposition` on the response and saves what the API named the file.

It took a change in the other repo to get there, and the trap is worth keeping because nothing about
it is visible from this side. The API always sent the header, correctly:

```
content-disposition: attachment; filename="opendiving-aleskiontherun-20260814.zip"
```

and `fetch` from `http://localhost:3000` still read it as `null`. `Content-Disposition` is not one
of the CORS-safelisted response headers, so a browser hides a header that is plainly there in the
network tab — the only three JS could read off an export response were `cache-control`,
`content-length` and `content-type`. The fix is one line of `expose_headers` on the API's
`CORSMiddleware` (`core/setup.py`), shipped as opendiving-api #33; the API's own DECISIONS.md
carries it under _"`Content-Disposition` has to be named in `expose_headers` or the browser hides
it"_. Anything else the web app ever needs to read off a response has the same shape of problem.

Behind the parser, `exportFilename` mirrors `export_filename` in the API's
`services/export/naming.py` — same `opendiving-<username>-<YYYYMMDD>.<ext>` shape, same `[^a-z0-9]+`
scrub, same `"export"` substitute when the username scrubs to nothing. It shipped as the live path
while the header was unreadable and is now a genuine fallback, kept rather than deleted because a
self-hosted API behind a proxy that strips the header would otherwise save every export as the
browser's guess.

Two things follow from keeping a naming rule in two languages:

- **The date is stamped in UTC**, from `getUTC*`, not local time. The server names the file from
  `datetime.now(UTC)`. A diver in UTC+13 downloading at 09:00 would otherwise get a name a day ahead
  of the one `curl` saves from the same request, and the two would look like different exports.
- **`export.test.ts` is the coupling**, and its job is to fail when the API's rule moves. There is
  nothing structural keeping the two in step, so the tests spell out the scrub cases (`Alex.Vesnin`,
  a username that scrubs to nothing) rather than only the happy path.

Verified end-to-end against a real Chrome: all three buttons save
`opendiving-aleskiontherun-20260814.{uddf,csv,zip}`, and the CSV the browser saves is hash-identical
to the one `curl` fetches. The UDDF differs by nine bytes between any two requests — the timestamp
in its `<generator>` — and the zip likewise, so those two are equal modulo the clock, not
byte-equal.

## The whole export is buffered in browser memory, and the escape hatch is a signed URL

All three exports are fetched with axios `responseType: "blob"` and saved through `downloadBlob`,
which is the same path the dive source file and the c-card images take, and for the same reason: the
endpoints require an `Authorization` header, and a plain `<a href>` cannot send one because the
access token lives in memory rather than in a cookie.

The difference is size. Those two are bounded by the API's own upload limits — 5 MB for a dive
computer file, 10 MB for a card scan. **An archive is bounded by the size of the account.** The dev
corpus, 44 dives with imported profiles and c-card scans, comes to 3.5 MB; a diver with a decade of
imports and two-sided scans of eight certifications could reach hundreds of MB, and every byte is
held in browser RAM before the file is written, then held for another 60 seconds while
`REVOKE_DELAY_MS` runs out.

Accepted rather than solved, because the fix is not a frontend one. The escape hatch, recorded here
and deliberately not built: a short-lived signed download URL, served as a plain `<a href>` with no
`Authorization` header, which streams straight to disk and never enters a JS heap. That needs a new
API endpoint and a token scheme, which is a great deal of machinery for a ceiling nobody has hit —
but it is the thing to build when someone does, rather than reaching for a streaming-download
library on this side.

## Three buttons named "Download" need three accessible names

The export card's rows are visually distinct — an icon, a title, a sentence of prose — and its
buttons are not: all three read `Download`. A screen reader listing the page's buttons gets
"Download, Download, Download" and no way to tell which file is which, so each carries an
`aria-label` naming its row. The visible label stays one word, because the row above it has already
said which file this is.

**The label has to change with the busy state, not just name the row.** An `aria-label` _overrides_
the button's own text, so a static one hides the switch to "Preparing..." completely — the only
thing left for a screen reader user to notice is the button going disabled, on the slowest control
on the page. So the name is `Preparing Full archive export` while fetching and
`Download Full archive` otherwise, with `aria-busy` backing it up rather than carrying it alone
(support for announcing `aria-busy` on a button is inconsistent). The render tests query by
accessible name for exactly this reason: finding the idle name _is_ the assertion that the row is
idle.

**And then the busy button has to be `aria-disabled`, not `disabled`, or none of that is audible.**
This is the one place in the repo where a busy button departs from the `disabled` every other form
here uses, so the argument is worth spelling out: a real `disabled` attribute drops focus to
`<body>` in Chrome and removes the button from the tab order. The diver who just pressed it is left
standing nowhere, and the name change written for them is announced to no one — `disabled` eats the
exact announcement the paragraph above exists to produce. That costs nothing on a Save button that
resolves in 200 ms, and quite a lot on an archive that can take many seconds.

`aria-disabled` is advisory, so the button still receives clicks, and three things carry what the
attribute no longer does: an early `if (busy.has(row.format)) return` in the handler (the part that
actually makes the row inert), `aria-disabled:opacity-50` in the class list (Tailwind's `disabled:`
variant keys off the real attribute and would never fire), and a render test that clicks a busy
button and asserts a second request was never made. Worth knowing before copying this pattern
elsewhere: it is three moving parts where `disabled` is one, and it only pays for itself on a
control slow enough that the announcement matters.

**The busy state is a `Set<ExportFormat>`, and the two simpler shapes are both wrong.**

- A **boolean** disables all three buttons because one of them is running. The archive is the
  slowest of the three by an order of magnitude, so it is precisely the one that would make the
  other two look broken for the length of its request.
- A **single `ExportFormat | null`** — which this shipped as, briefly — looks right until a diver
  does the thing the enabled buttons invite: start a second export while the first is still
  fetching. Both handlers' `finally` blocks run `setBusy(null)`, so whichever request lands first
  clears the _other_ row's spinner and re-enables its button, leaving a row that is still fetching
  looking idle.

Both updates are functional (`setBusy((current) => ...)`), because concurrent handlers reading the
same stale `busy` would each write a set missing the other's format — the same race one level down.

**What a click on a row that looks idle but isn't actually costs is a second _save_, not a second
request** — worth being exact about, because the obvious guess is wrong and this file is where the
wrong guess would have survived. `apiClient.get` is wrapped in an in-flight dedupe keyed on url +
params + `responseType` (see the map above `getRequestKey`), so a duplicate `GET /export/archive`
while one is pending joins the pending promise: no second request reaches the API and no second unit
of the caller's hourly export budget is spent. Both callers then resolve with the same blob and both
call `downloadBlob`, so what the diver gets is the same file written twice and a second copy of a
possibly-large blob pinned for `REVOKE_DELAY_MS`. Annoying rather than expensive — but it is what
the `Set` and the handler's early return are for, and naming the wrong cost here would have sent the
next person looking for a rate-limit bug that the client layer already prevents.

Letting all three run at once is deliberate. The API rate-limits exports per user, so a diver firing
all three is spending their own budget, which is their call to make rather than a state for this
card to prevent.

## `<` is the earlier dive, which is the opposite of what the log list would suggest

The dive page's date line got a chevron on each side, stepping to the chronologically adjacent
dives. The direction is the whole design decision, and it is the one thing that renders perfectly
while being wrong: `GET /dives` lists newest first, so on the log page the dive _above_ the current
one is the later one. Inheriting that would have made `>` mean "up the list", i.e. backwards in
time. The arrows read as a timeline instead — `<` is the earlier dive, `>` the later one — so
stepping through a trip goes in the order the trip happened.

**Neighbours come from `GET /dive/{uuid}/neighbors`, not from the list.** Finding "the dive just
before this one" against the paginated list means either paging through the log (N/100 requests, and
every page carries each dive's sites and gear) or binary-searching it with `items_per_page=1` and
leaning on the sort order being stable. Both were considered and neither survives a diver with a few
hundred dives. The endpoint answers with two indexed `ORDER BY start_time LIMIT 1` queries and
`{previous, next}` carrying only the uuid, number and date — enough to label a link and follow it.

**They are keyed by `start_time`, never by `dive_number`.** `DiveNumberingSummary` exists because
logs have gaps, duplicates and runs that don't follow the dates; `#213` is a label, not a position.

**Stepping to a neighbour no longer blanks the page, and that is what makes the arrows usable more
than once.** The detail page returned a `SectionSpinner` for any `isLoadingDive`, which is a
same-route id change here — so every click tore down the header, the date line and the arrow that
had just been clicked, then rebuilt them a fetch later. A mouse user saw a flash per step; a
keyboard user got focus dumped on `<body>` and had to tab back to the arrow on every single dive,
which is precisely the flow this control exists for. The spinner is now the _first_ load only
(`isLoadingDive && !dive` — `useResource` keeps the dive being left, it never nulls `resource`), and
a step dims the card grid to `opacity-50` under `aria-busy` instead. The page keeps its height and
its scroll position, and what is dimmed is honestly what is on the way out.

**The fetched neighbours are stored with the uuid they were fetched for**, and read back only when
that uuid still matches. This is what the fix above makes load-bearing: the component now stays
mounted across a step, so plain `neighbors` state would leave the _previous_ dive's neighbours on
screen from the moment the new dive lands until its neighbours do — beside a header already naming
the new dive. That window is long enough to click, and the click would land two dives from where it
appeared to point. Nulling the state in the effect would also work, at the cost of a second render
and an eslint suppression.

**The neighbours are fetched for the dive being _displayed_, not for the route param**, which costs
a round trip: the component only mounts once `getDive` has resolved, so the two requests run in
series rather than together. Reading `params.id` instead would overlap them, and would also aim the
arrows at the incoming dive while the date beside them still reads the outgoing one — a `>` click in
that window skipping a dive relative to everything on screen. The arrows and the date they sit
around have to describe the same dive; a second round trip on a control this small is the cheaper
side of that trade.

**An end of the log leaves its arrow dead rather than dropping it.** Dropping it slides the date
sideways exactly as the diver arrives at the oldest dive, and says nothing about why stepping
stopped; a dead arrow says "this is the end" without moving anything.

**Each arrow is one `<a>` that swaps its `href`, which is why this doesn't use `next/link`.** The
obvious build — `<Button asChild><Link>` when there's a neighbour, `<Button disabled>` when there
isn't — alternates two element types at one position, and React answers that by replacing the DOM
node. Every step goes through that state: the new dive lands, `diveUuid` changes, the uuid guard
above nulls the neighbours, and both arrows are unavailable until a second round trip. So the node
holding focus is destroyed on _every_ step, the browser drops focus to `<body>`, and a keyboard
diver tabs back to `>` for each dive in a trip — the exact cost the page-blanking fix was supposed
to remove, one layer further in. `disabled` on a focused `<button>` loses focus the same way, so the
unavailable state is `aria-disabled` plus `pointer-events-none`, not `disabled`.

Two things follow from hand-rolling the anchor. A plain click has to `router.push` (and a
cmd/ctrl/shift/alt-click has to be left alone, so a dive still opens in a new tab), and the
unavailable arrow needs an explicit `role="link"` — an `<a>` with no `href` is `generic` to the
accessibility tree, and a generic node has no accessible name, so without it the arrow would go from
"unavailable" to unannounced. `dive-date-nav.render.test.tsx` pins the node identity and the focus
directly, because nothing else about the rendered output changes when this regresses.

The one thing the shared node costs is that its accessible name and `aria-disabled` both flip on
every step, so a screen reader announces the arrow as unavailable each time — indistinguishable from
genuinely reaching the oldest dive. `aria-busy` separates the two: dead-because-unknown carries it,
dead-because-there-is-nothing-there doesn't.

**A failed neighbours fetch is silent**, the same call as `DiveNumberingStatus` makes: this is a
shortcut to the rest of the log, not part of the dive the diver came to read, and a toast on top of
a page that loaded fine would claim otherwise. Both arrows stay dead, which is also what they look
like before the fetch lands — deliberately the same state, since "loading" and "unavailable" are the
same thing from the diver's side for a control this small.

**The line is inline flow, not a flex row.** As a flex row the date is a single item that stretches
to the full width of the line before it wraps, so on a phone `>` ends up pinned to the right edge of
the header, a screen-width from the date it belongs to. Inline, it follows the last word wherever
that word lands. The arrows take `align-middle`, since an `inline-flex` box baselines on its bottom
edge and would otherwise hang below the text.

`PageHeader`'s `subtitle` widened from `string` to `ReactNode` for this. It stays inside the same
`<p>`, so whatever a caller passes has to be phrasing content.

**The header is still cramped on a phone, and that is knowingly left alone.** `PageHeader` puts the
title block and the actions in one `justify-between` row at every width, which leaves the title
block about 150 px on a 375 px screen — so this date wraps over about five lines with Edit and
Delete beside it. Stacking that row below `sm` fixes it and was tried, but it moves every detail
page's header and belongs to whoever takes that on rather than to this control. Inline flow is what
keeps the arrows tolerable in the meantime: they wrap with the text instead of stranding at the
edges of a five-line block.

## Both gas tables finally fit their slot

The mixtures table had eight columns and the consumption table six, in a card that gives them 582 px
at the width where the main column is narrowest. Both scrolled. Measured on dive #493 — the corpus's
two-gas, one-transmitter dive, and the same dive both sections above measure — at a 1024 px
viewport:

|                 | before | after  | slot   |
| --------------- | ------ | ------ | ------ |
| Gas Mixtures    | 648 px | 471 px | 582 px |
| Gas Consumption | 596 px | 497 px | 582 px |

Both figures are the table's minimum width, which is what "before" was too — a table that overflows
is already at its minimum, so the two columns compare like for like. After, each has ~85–110 px of
slack in the slot rather than 14–66 px of overflow.

Two levers got them there, and the second is the one that did the work: **the cells went from `p-4`
to `px-2`**, worth ~112 px per table on its own. The column changes below are worth far less than
that, and are made for what they say rather than for what they save.

**1024 px is the pinch, and it is a ceiling rather than a floor.** The page is `max-w-6xl` with the
main column at `lg:col-span-2`, so the card gets 582 px at 1024 px and 667 px at 1280 px — but one
pixel _below_ `lg` the grid collapses to a single column and the same card jumps to ~925 px. So the
tables are at their narrowest just _above_ the breakpoint, and going down to `md` makes them wider,
not narrower. Anything measured "at md" is measuring the roomy case.

**The scroll container is shadcn's, not the card's — and both cards used to add a second one.**
`Table` wraps itself in a `relative w-full overflow-auto` div (`ui/table.tsx`), and each card then
wrapped _that_ in its own `overflow-x-auto`. The inner one is what actually scrolls; the outer never
did. Both outer wrappers are now gone, and the phrasing in the two sections above — "both scroll
inside their own `overflow-x-auto` wrapper" — was describing the div that wasn't doing it.

**No `Table` in the app carries one any more.** The other seven call sites — the `/dives`, `/sites`,
`/trips` and `/certifications` tables, the gear table on the dive page, and both gear cards —
dropped theirs too, verified at 375 px as byte-identical screenshots with the inner div still
scrolling by the same amount. The `overflow-x-auto` wrappers that remain in
`dive-profile-chart.tsx`, `gas-use-chart.tsx` and `dive-activity-chart.tsx` are **load-bearing**:
they wrap an SVG, which brings no scroll container of its own.

**This is a live trap when measuring.** `closest('[class*="overflow-x-auto"]')` used to find the
outer div, whose `scrollWidth` equals its `clientWidth`, and so reported a comfortable **0 px
overflow for a table that was visibly scrolling** — which is exactly the reassuring, wrong number to
get while deciding whether a table fits. `table.scrollWidth` against
`table.parentElement.clientWidth` is the pair that tells the truth, and with the extra div removed
the parent is now unambiguously shadcn's own.

**`px-2`, and how much of the table was padding.** `TableCell` is `p-4` and `TableHead` `px-4`, so
every column spent 32 px on padding — on a seven-column table, 224 px, well over a third of its
width. `[&_th]:px-2 [&_td]:px-2` on the two `Table` elements halves that and clears ~112 px, more
than every column change here put together.

**Those two local overrides are gone; `px-2` is the default in `ui/table.tsx` now.** They were
scoped to these two tables at first, which left the dive page carrying two tables at one density and
the gear table below them at another — parked as a known inconsistency, and since measured across
every table in the app and resolved in favour of `px-2` everywhere. See "Cell padding is `px-2`
app-wide" at the end of this file. Every figure in this section still holds: it was `px-2` that was
measured, and `px-2` is what the tables get.

Five changes, and only the padding above was made for the width:

- **The gas keeps a column of its own, in both tables.** It was briefly merged into the identity
  cell — one cell holding number, gas badge and role badge, which is how the consumption card had
  always written it — and that did fit the mixtures table in its slot without any padding change. It
  was reverted after seeing both: a badge that starts wherever the number ended puts every pill at a
  different offset down the page, where a column of its own keeps them in one line. Merging was
  worth only ~26 px anyway, not the ~94 px the header widths suggest — the identity column simply
  grows to hold the badge, so the saving is the column gap, not the column. **The consumption table
  gained the same column** rather than the mixtures table losing it, which puts the gas name on the
  page twice. That is the price of the two tables agreeing, and this one has to be legible on its
  own: "which of these is the deco bottle" is the question its rows exist to answer.
- **`Gas Used` → `Used`.** Only once the Gas column existed: two headers three apart both leading
  with the same word, one naming a mix and one a volume. The unit is in every cell under it, so the
  noun was never doing the work. The single-tank layout's headline stat keeps the full `Gas Used` —
  it has no Gas column beside it to collide with.
- **`He` is dropped when no cylinder on the dive has any.** Air and nitrox record a flat 0, so on
  most dives it was a column of zeroes. It returns for every row the moment one cylinder carries
  helium, including the 0 of an air cylinder beside it — that 0 is a real contrast on a trimix dive
  and noise on a dive that has no helium anywhere.
- **`Tank` → `#`, and the cells lost the word and the weight.** `Tank 1` under a header saying
  `Tank` said it twice; the number is how a row is addressed rather than anything it says, so it is
  muted and the badge beside it carries the emphasis. `TankGasUseRow.label` is now `"1"` rather than
  `"Tank 1"`, since the two tables have to keep naming the same cylinder identically. **A tank
  matching no mixture keeps its `Gas 3`** — the distinction was never "tank" versus "gas", it was
  numbered-by-position versus named-by-the-device, and only the second needs saying now. The
  consumption footer says `Total` rather than `All tanks`, which was answering a question the `#`
  header no longer asks.
- **Every MOD states the ppO₂ it was computed at; the header stays bare.** This reverses the "-36 px
  per row" saving the role-badge section records, and it is worth paying. The header could only
  carry the qualifier on a dive where every cylinder shared one limit, so `MOD @ ppO₂ 1.4` and a
  bare `MOD` alternated depending on the dive, and the same column looked like two different
  columns. The suffix is muted, so the depth stays the figure and the limit reads as the condition
  on it. `sharedPpO2Limit` existed only to choose between those two spellings and is deleted with
  them.

**The worst case is now a rounding error rather than a scroll.** A trimix dive with a role on both
cylinders — `He` back, role badges on every row of both tables — synthesized into the live DOM at
1024 px puts the mixtures table 6 px over its 582 px slot and the consumption table exactly on it.
Before any of this, the same shape was roughly 721 px, 139 px over. No such dive exists in the
corpus, so the 6 px is measured on a constructed row rather than seen; it is recorded so the next
person knows the margin is thin there and nowhere else.

**Mobile still scrolls, and always did.** Minimum widths are 471 px and 497 px against a ~308 px
card at 390 px, so both tables scroll inside their own container on a phone while the page body does
not scroll sideways. That is the same resolution the two sections above record, and no column
arrangement gets seven columns of figures onto a phone.

**Three smaller things landed with it**, all consistency rather than width:

- `tabular-nums` on both tables, since most of their columns are figures read down rather than
  across.
- Muted dashes in the mixtures table, which wrote absences at full contrast while the consumption
  table below already muted its own. The mute goes on the `TableCell`, not round a `-` in a span —
  that is how the consumption card had been spelling it, and one pattern spelled two ways in two
  tables being read against each other is the thing this whole change is about.
- **The `#` header spells its word out for a screen reader**: a visible `aria-hidden` `#` beside an
  `sr-only` "Tank". `#` is punctuation, read aloud as "number sign" or skipped entirely, so heading
  the column with it alone left every row's first cell a bare number with nothing naming what it
  counts. The `sr-only` captions name the table; this names the column. Both tables do it
  identically, and the render tests query that header by the name "Tank".
- **A fixed-width gas badge**, `GAS_BADGE_CLASS` in `lib/dive-mixtures.ts`, so every pill is 72 px
  and its label centred. A badge that shrank to fit `Air` and grew for `EAN54` put the role badge
  pinned to its right at a different offset on every row. 4.5 rem is measured against `Oxygen` at
  66.8 px — the widest label `gasName` can return for a real gas, and deliberately not `EAN100`,
  which looks wider and cannot occur (anything at or above `OXYGEN_MIN` is named `Oxygen`, so EAN
  tops out at `EAN99`). It is a `min-width`, so the one label that can exceed it — the spelled-out
  `O₂ 50% / He 60%` of an impossible mix, at 122 px — still fits and breaks the alignment, which is
  correct for the row that isn't a gas.

**The two tables' badges do not line up with each other, and the gap is not three pixels.** The `#`
column sizes itself in each table against different neighbours, so the pills below start at
different offsets. On dive #493 that is 64 px against 61 px and easy to dismiss — **and #493 is
exactly the dive that hides it.** It has one attributed cylinder, so the consumption table renders
no `tfoot`; the moment a second cylinder is attributed, that column has to hold `Total` under
`whitespace-nowrap` and jumps from 29 px to 53 px. Measured with the footer forced in: **the badges
diverge by 22 px**, on precisely the multi-tank dives the whole alignment argument is about.

The general trap, since it cost a wrong number here: **a table's column widths are set by its widest
row, and `tfoot` is a row.** Measuring a conditional footer's table on the dive that doesn't render
one measures a different table.

A shared `w-16` on that header does line the two up, and was tried and reverted. It costs the
mixtures table ~22 px of whitespace to carry a `Gas 12` and a `Total` that only the other table has,
and it silently collapses to 25 px under narrow-pane pressure anyway, since a width on a
`table-layout: auto` column is a preference rather than a rule. So the choice was between two
imperfect answers and the imperfection was left visible; it is recorded here with the honest 22 px
rather than the flattering 3 px, so whoever revisits it is deciding against the real number.

`GAS_BADGE_CLASS` is unaffected by any of this — it fixes the role badge's offset _within_ a row,
which holds whatever the column beside it does.

**The edit form still heads each block `Tank 1`, and that is not an oversight.** It is the third
surface naming a cylinder, so it looks like a straggler — but the two tables dropped the word
because a `#` header was already carrying it, and the form has no header to carry anything. A block
of inputs under a bare `1` says nothing about what the 1 counts. The rule is "don't say it twice",
not "never say tank".

**A note for whoever tests the MOD cell.** The depth and its ppO₂ are two elements so the limit can
be muted, and the separating space lives at the front of the muted span's own string rather than as
JSX text between them, where a reflow could drop it. `dom-accessibility-api` trims each node before
joining, so the _accessible name_ comes out `56.7 m@ 1.4` while the DOM and the screen both have the
space. The render test asserts on `textContent` for that reason — `getByRole("cell", { name: … })`
pins a quirk of the accname implementation rather than anything about the card.

## Cell padding is `px-2` app-wide

`ui/table.tsx` diverges from shadcn: `TableHead` is `px-2` rather than `px-4`, and `TableCell` is
`px-2 py-4` rather than `p-4`. It arrived as a local override on the two gas tables — see "Both gas
tables finally fit their slot" — and was promoted after measuring every table in the app rather than
just those two. Vertical padding is untouched throughout: the row height was never the problem, and
halving it would have changed how the tables read on every page for no width at all.

**Measured, not eyeballed**, and the method matters because the obvious one lies.
`table.scrollWidth` against `table.parentElement.clientWidth` is the pair that tells the truth — the
previous section records why `closest('[class*="overflow-x-auto"]')` reports a comfortable 0 px for
a table that is visibly scrolling. All three paddings were forced into the same live DOM at the same
width with an injected `table th, table td { padding-inline: Npx !important }`, so the numbers below
compare one page against itself rather than three builds against each other. Nine tables across
seven pages, at 375 / 640 / 768 / 1023 / 1024 / 1280 / 1440 px.

**Overflow in pixels, `px-4` → `px-3` → `px-2`.** Zero means the table fits its container.

| table               | 375 px          | 640 px        | ≥ 768 px               |
| ------------------- | --------------- | ------------- | ---------------------- |
| Dive Log            | 292 · 244 · 196 | 43 · 0 · 0    | 0 (1024 px: 117 slack) |
| Your Certifications | 364 · 316 · 268 | 115 · 67 · 19 | 0 (768 px: 10 short)   |
| Your Gear           | 335 · 287 · 239 | 86 · 38 · 0   | 0                      |
| Gear Sets           | 98 · 66 · 34    | 0             | 0                      |
| Trip List           | 154 · 122 · 90  | 0             | 0                      |
| Dive Site List      | 91 · 67 · 43    | 0             | 0                      |
| Gas Mixtures        | 290 · 234 · 178 | 41 · 0 · 0    | 1 · 0 · 0 at 1024 px   |
| Gas Consumption     | 316 · 260 · 204 | 67 · 11 · 0   | 27 · 0 · 0 at 1024 px  |
| Gear (dive page)    | 1 · 0 · 0       | 0             | 0                      |

Three bands, and only the middle one is an argument:

- **At 1024 px and above, nothing overflows at any padding.** Slack at `px-4` runs from 84 px on the
  mixtures table to 521 px on the site list, so padding there is taste rather than fit, and the
  visible change is a few pixels of column drift. The one exception is Gear Sets, whose `Gear` cell
  is a list of item names and wants ~213 px more at 1440 px whatever the padding — it wraps by
  design and no padding fixes it.
- **640–768 px is where it earns its keep.** At 640 px, `px-2` clears every overflow but the
  certifications table's, which goes from 115 px over to 19 px. At 768 px nothing overflows either
  way, but the dive log's table drops from 878 px to 774 px tall: `Date & Time` stops wrapping in
  the header and `Apr 16, 2026, 12:59` stops breaking across three lines in every row. That is the
  clearest single before/after in the app, and it is invisible in an overflow number.
- **At 375 px everything scrolls regardless.** `px-2` shortens the scroll by ~100 px per table and
  removes it nowhere. No padding gets six columns onto a phone; that resolution is a card layout,
  not a padding value.

**`px-3` was the obvious compromise and it buys less than it looks.** It fixes the dive page at 1024
px too — both gas tables land at 0 px over — but leaves the consumption table 16 px of slack there
against `px-2`'s 72 px, and 16 px is one longer gas name from scrolling again. It also leaves
certifications 67 px over and gear 38 px over at 640 px, which is most of what the change was for.
So it is the gentler edit that solves the smaller half of the problem.

**The cost, in full: one gutter.** Cell padding between two columns is the sum of both cells', so a
right-aligned column butted against a left-aligned one loses 32 px of separation rather than 16.
That happens exactly once — `Dives` beside `Service` in `gear-items-card.tsx`, where `40 —` now sits
noticeably tighter. Every other table puts its right-aligned `Actions` column last, where the gutter
has no neighbour to collide with. If that pair ever reads as one number, the fix is a `pr-` on that
column, not 8 px back on every table in the app.

**Nothing hugs a card edge, because the card is doing that job.** `CardContent` is `p-6`, so the
first column's text sits 32 px from the card border rather than 40 px — against a card title at 24
px, which is slightly closer to lining up than before rather than further.

**No table anywhere overrides cell padding**, so changing the default was the whole change; grepping
`TableCell`/`TableHead`/`TableRow` for padding utilities returns nothing. Upstream shadcn ships
`p-4`/`px-4`, so re-adding this component from the registry silently reverts all of it — hence the
comment in `ui/table.tsx` saying the divergence is deliberate.

**Two caveats for whoever re-measures.** The figures come from one account's data, so a longer dive
site name or a trimix cylinder moves the list-page numbers by more than the padding did — treat the
band boundaries as the finding, not the individual pixels. And the five list pages still wrap their
`Table` in an `overflow-x-auto` div of their own, the inert second scroll container the gas cards
dropped; it is what makes the wrong measurement so easy to take on exactly these pages.

## Dive site coordinates are two free-typed strings, validated as a pair

`latitude`/`longitude` are `number | null` on the API but plain strings in the form, converted by
`parseFormCoordinate()`/`formatCoordinateForForm()` right at the API boundary. That is the same
shape as the dive form's "MM:SS" duration and for the same reason: a `z.preprocess()`/`.transform()`
coercing the string to a number would collapse the `z.input<>`-derived form type (see the Zod rule
above). `""` is the live "cleared" value, never `undefined`, per the RHF quirk above.

**Both-or-neither is enforced as two separate `.refine()`s, not one.** A refinement carries a single
`path`, so one combined check would have to park its message on a fixed field — and half the time
that is the field the diver already filled in. Splitting it into "latitude is required when
longitude is given" and its mirror puts the message on the empty one. So the client rule is a better
error message, not the enforcement — the API rejects the same bodies on its own.

**The API's rule is about the request body, not the stored row**, which is worth knowing before
reasoning about what a PATCH will do. `WholeCoordinatePair` 422s a body that names one coordinate
without the other (`{"latitude": 27.7}`) and a body that names both with only one value
(`{"latitude": 27.7, "longitude": null}`), and it never reads the existing row — so "nudge one
coordinate of a pair that is already whole" is a 422 too, and moving a site means sending both
numbers even when only one changed. A body naming _neither_ coordinate is untouched by the rule,
which is what keeps a site holding a half pair renameable. The dialog always submits the pair, so
none of this constrains it.

**Paste splits a pair across both fields.** Divers copy `27.8506, 34.3136` out of a map as one
string far more often than they type two fields, so `parseCoordinatePair()` recognises a
comma/semicolon/whitespace-separated decimal pair on paste into _either_ input and fills both.
Anything else — a DMS string like `27°51'02.2"N`, a lone number — falls through to a normal paste
and the per-field validation rejects it. Degrees-minutes-seconds is deliberately not parsed; it has
enough variants that guessing wrong silently misplaces a site.

**The same reasoning forced one shape back out of the parser: a bare comma between two dot-less
integers.** Across most of Europe `-16,5` is how you write `-16.5`, so splitting it into the pair
`(-16, 5)` moves a Bali site to the Atlantic off Angola — and nothing catches it, because both
halves are in range and the pair is complete. That is a silent misplacement, the exact failure DMS
was excluded for, and it is the one shape where a plausible reading of the input disagrees with the
parser's. `AMBIGUOUS_DECIMAL_COMMA` refuses it so the raw text stays in the field and the per-field
regex rejects it with a message. Nothing else needs the guard: a decimal point anywhere settles the
question (`27.8506,34.3136`), and so does a space after the comma (`1, 2`), because a decimal comma
is never followed by one.

**A half pair loaded from the API can't be saved until it's resolved, and that is the one deliberate
difference from the API.** Nothing enforces the pair at the database level, so a half-set row can
exist — only raw SQL can produce one, since every application path in goes through a write schema
that inherits the rule. The API leaves such a row renameable, because a body naming neither
coordinate never trips its check. The dialog always submits the pair, so it asks the diver to
resolve the half before any save goes through, a rename included. Kept that way on purpose: filling
the missing half or clearing both is one keystroke and either repairs the row, whereas preserving
half a position keeps a site that can never be mapped. Worth knowing before "fixing" the dialog to
match the API.

**Coordinates format with `String()`, not `toFixed()` — with one guard.** JS already prints the
shortest round-tripping representation of a double, so `27.8506` comes back as `"27.8506"`; the
float noise `toFixed()` looks like it guards against only arises from arithmetic, and there is none
here, while blanket rounding would drift the value every time a site was opened and saved. The
exception is that `String()` switches to exponent notation below 1e-6 — `String(5e-7)` is `"5e-7"`,
which `COORDINATE_REGEX` rejects — so `toDecimalString()` falls back to fixed notation for those.
Without it, a stored sub-1e-6 coordinate nobody typed makes every save of that site fail validation,
a rename included. There is a round-trip test asserting that anything the API can return survives
format → validate → parse unchanged.

**The pair-level hint is rendered twice, and the obvious single-copy version is a trap.**
`<FormDescription>` calls `useFormField()` and throws outside a `FormField`, so the hint under the
lat/lon row is a plain `<p>` — but a plain `<p>` is announced to nobody. The fix that looks right is
to give that `<p>` an `id` and point both inputs at it with `aria-describedby`; it silently breaks
error announcement. `<FormControl>` already sets `aria-describedby` to `formDescriptionId` (plus
`formMessageId` once there is an error), and the Radix `Slot` lets the child's props win, so the
child's value replaces it and the validation message stops being read. What works instead: the
visible `<p>` is `aria-hidden`, and each field carries its own `sr-only` `<FormDescription>` with
the same sentence, which `FormControl` wires up for free and composes with the error message.
Verified in the browser — with a half pair submitted, longitude's `aria-describedby` resolves to
both the hint and "Longitude is required when latitude is given".

The inputs also deliberately carry **no** `inputMode="decimal"`/`"numeric"`: iOS renders those as a
keypad with no minus key and no way to switch to one, which makes every southern-hemisphere latitude
and western longitude impossible to type — most of the Caribbean, Indonesia and the Pacific.

## The map picker is hand-rolled, and `img-src` is the whole bill

`components/sites/map-picker.tsx` draws a slippy map out of `<img>` tiles and about ninety lines of
Web-Mercator arithmetic (`lib/map-tiles.ts`), rather than pulling in a mapping library. The reason
is the CSP, not the bundle.

**MapLibre GL JS** — the best-looking option, vector tiles, restyleable for dark mode — runs its
renderer in a web worker created from a blob URL. That needs `worker-src blob:` (and
`child-src blob:` for older browsers) in a policy whose entire point is that nothing executes
without the per-request nonce. Upstream's own security note describes a blob-worker allowance as
equivalent to `unsafe-eval`, which would undo `proxy.ts` wholesale. **Leaflet** wants only
`img-src`, and at ~40 kB would have been the sane default in most codebases — it stays the fallback
if this picker ever grows past its weight. What made it unnecessary is that
raster-plus-a-dark-tileset is exactly what the hand-rolled version already gives, and the repo has
hand-rolled its SVG charts, its drag-reorder and its combobox for the same kind of reason.

What the hand-rolled version actually costs is smaller than it looks, because the interesting half
is pure arithmetic that belongs in a tested module either way: projection, its inverse, which tiles
a viewport touches, and which copy of a repeating world to draw a marker in. The tests pin those
against analytic anchors — the null island at the centre of the map, ±180° at its edges, and
`atan(sinh(π/2))` = 66.51326°N a quarter of the way down, which is _not_ the Arctic Circle at
66.56°N. Checking against a second implementation would only have proved the two agree.

**The tile host reaches `img-src` from the same function that builds the tile URLs.** `proxy.ts`
calls `tileOrigins()` out of `lib/map-tiles.ts`, next to the `apiOrigin` derivation and subject to
the same origin-not-path caveat documented there. A tile host named in the renderer but missing from
the policy does not fail as a wrong URL — it fails as a blocked request with a console line nobody
reads, which is a far worse thing to debug. A malformed `NEXT_PUBLIC_MAP_TILE_URL` yields no origin
rather than throwing: this runs in middleware on every request, and a typo in an optional map's env
var must not take the site down.

Carto's Positron/Dark Matter are the keyless default over OSM's own standard tiles, for two reasons:
there is a dark variant matching the app's theme, and the OSMF tile policy discourages pointing a
broad user base at their servers by default. The bare `basemaps.cartocdn.com` host is used rather
than the documented `{s}.` subdomain rotation — sharding is an HTTP/1.1 workaround, and one fixed
host is one exact CSP source instead of a wildcard. Verified in the browser: tiles render and the
console reports **zero** CSP violations, which is the single check that says this approach paid off.

## The map writes into the coordinate fields, and can tell its own echo from a diver typing

The picker holds no position of its own. It reads `latitude`/`longitude` off the form and writes
back through `setValue`, so the pair stays typeable, pasteable and clearable exactly as it was
before there was a map, and there is one source of truth for what gets saved.

That round trip creates the one genuinely fiddly bit. A click emits a position, the form stores it,
and it arrives back as a prop — which is indistinguishable, at the props level, from the diver
having typed it. Treating it as an outside change re-centres and zooms the map on every single
click, dragging it out from under the cursor. So `emit` records what it handed out, and it rounds to
five decimals _there_ rather than in the caller, precisely so the value that comes back is identical
to the one that went out. Coordinates typed into the fields by hand still recentre the map, because
nothing recorded those.

Recording that is deliberately _separate_ from remembering the previous props, and collapsing the
two into one "position last accounted for" looks equivalent but is not. The emitting render commits
before the form's value reaches these props, and in that intermediate render the single piece of
state would already have been overwritten with the stale props — so the echo arrives unrecognised.
It only worked as long as the parent happened to update in the same batch.

Two narrower traps sit inside the same mechanism, both found by review rather than by use, and both
now pinned by tests that go _through_ the intermediate state instead of stepping over it. **A
recorded placement has to be spent once it is matched**, or returning to that position by hand much
later reads as an echo: place a pin, type your way to Bali, type the first pair back, and the map
stays over Bali with the pin off-screen behind `overflow-hidden`. **And it must not be recorded at
all when it changes nothing** — Enter pressed twice without panning emits the same position, no
props change is coming to consume the record, and it stays armed with exactly the same consequence.

**Whether the site has ever had a position is latched, not inferred from the previous render.** The
zoom is raised only on a first placement, and the tempting test for that is "were the previous props
null?". Half-typed text is not a position: `parseFormPosition` rejects `34.` mid-backspace and the
field passes `(null, null)` for that render, so the very next keystroke would read as a first
placement and zoom a deliberately wide view back to street level — the exact thing the rule exists
to prevent.

The comparison is against the last _props_ seen, not against the current view: the view moves every
frame during a pan, and comparing against it would yank the map back to the pin mid-gesture. It runs
during render rather than in an effect — React re-runs the render before committing, so the map
never paints at the old centre first, and `react-hooks/set-state-in-effect` rejects the effect
version outright. The same rule is why the geocode suggestion's staleness is _derived_ rather than
cleared in an effect; a pleasant side effect is that retyping the original coordinates brings the
suggestion back instead of having silently lost it.

**The geocoded place name is written straight into the Location field.** It was first built as a
suggestion with Use/Dismiss buttons, on the reasoning that "Dahab, Egypt" is usually better than
whatever a geocoder returns for open water. In use that reasoning did not survive: the confirmation
was a step on the happy path for a value that was almost always right, and the field is an ordinary
text input, so anyone who disagrees types over it. The cost of the reversal is real and worth
stating — moving the pin overwrites a name the diver typed themselves — and it is accepted because
the name is answering the pin, so a new pin means a new answer.

**A name fills the field, "no name here" empties it, and "we could not ask" leaves it alone.** The
first cut had only the first two, clearing whenever the API answered with no result, on the
reasoning that whatever is in there describes where the pin used to be. That reasoning is right and
the implementation was still wrong, because `null` was four things over one wire: no name for the
position, geocoding switched off, the instance over its provider cap (one request a second, counted
across _everybody_), and the provider timing out. Only the first would justify emptying a field, and
the client could not tell them apart — so nudging a pin twice inside a second silently wiped a
location the diver had typed, a round trip after they had scrolled on to Notes. The premise had also
quietly expired: the API names open water from vendored marine polygons now, so `null`
overwhelmingly meant "could not ask" rather than "nowhere I can name". The interim fix was to never
clear, which lost a small convenience and removed a mode that destroyed a diver's own typing.

The API now spends a second status code on the difference — `204` for "we asked, and this position
has no name", a `200` with `null` for "we never got to ask" — and `reverseGeocode` returns a
three-way `ReverseGeocode` rather than `GeocodeResult | null`, because a two-valued return is
exactly what lost the distinction the first time. **The branch is on `response.status`, not on the
body**, and that is the whole trap: axios gives a 204 a `data` of `""`, not `null` and not
`undefined`, so the natural `response.data ?? null` reads a nameless position as an unavailable
geocoder and the bug survives the fix that was made for it. A `200` with `null` is also what an API
older than the 204 answers for a nameless position, and reading that as "could not ask" is the safe
direction to be wrong in.

Clearing runs the same guards as naming — the request counter, the coordinates as they stand when
the reply lands, and the location as it stands — since emptying a field is the more destructive of
the two ways to get this wrong, not the more casual. It gets its own announcement too: a field that
empties itself a round trip after a click, with nobody watching, is worse unremarked than one that
fills itself.

And it carries one guard the naming path does not need: **a nameless position with an empty field
does nothing at all**. That is the commonest flow there is — a new site, Location untouched, a pin
dropped in open water — and writing `""` over `""` is invisible on screen but not in the status
region, which would announce a clearing that cleared nothing. Being wrong only to a screen reader is
what makes it worth a guard rather than a shrug: the sr-only text is exactly the text nobody
reviewing the page can see is wrong.

The result is keyed to the coordinates that were **clicked**, not to the result's own — a reverse
geocode answers with the matched _place's_ position, which for a point offshore is a headland
kilometres away, so comparing against that would drop the credit the instant it arrived. The
out-of-order guard matters more now than it did as a suggestion: a cached answer returns far faster
than one that reaches the provider, so a late arrival would overwrite the right name rather than
merely offering a stale one.

Because the field fills on its own, a round trip after the pin was placed and with nobody looking at
it, that is announced through a `role="status"`.

**The map is an enhancement, and the fields are the accessible path** — but the map is still
operable without a pointer (arrows pan, `+`/`-` zoom, `Enter` places at a crosshair that appears on
focus), because a control that only answers to a mouse is a dead end. `role="application"` is there
so a screen reader hands those arrow keys to the map instead of spending them on its own reading
cursor, which is only defensible _because_ the same position can always be typed into the fields
beside it. Pan, pinch and tap live in `hooks/useMapGesture.ts` rather than in the component, which
the pinch work pushed past the length where that stops being a choice; its listeners go on `window`
and `setPointerCapture` is unused, for the reasons `hooks/useDragSort.ts` already documents. The
crosshair follows how the map is being driven right now, not how it was focused. The gesture hook
focuses the surface itself so the keys work straight after a drag, so `:focus-visible` read once in
`onFocus` is wrong in both directions — click then arrow-key and there is no crosshair to place
against, Tab in then click and one lingers beside the pin the click just placed. Any handled key
turns it on, a pointerdown turns it off.

Placing from the keyboard also announces the coordinates through a visually-hidden `role="status"`.
Nothing else confirms it: the numbers land in two inputs elsewhere in the dialog, silently, and the
geocode suggestion that would otherwise have said something never arrives when the geocoder is
switched off, unreachable, or older than the endpoint — the exact degradations the rest of this code
handles on purpose.

**One finger belongs to the page, two fingers to the map.** `touch-action: none` is what a map wants
— it is the only way a one-finger drag reaches a pan handler instead of scrolling — and it is what
`useDragSort` correctly uses for a drag handle a few pixels tall. A map is not a drag handle. This
one sits inside a `max-h-[90vh] overflow-y-auto` dialog and covers a large share of it on a phone,
so claiming the vertical axis leaves a thumb landing on the map unable to reach Notes or Save at
all. Scrolling _past_ a control beats panning _within_ it. So the surface keeps
`touch-action: pan-y`, a lone finger scrolls the dialog, and two fingers pan and pinch-zoom — the
bargain every embedded map makes. A one-finger drag is not silently ignored: it raises a brief "use
two fingers to move the map", because a gesture that does nothing and says nothing reads as broken.

That needs two mechanisms, not one. `touch-action` cannot express "one finger yes, two fingers no",
so `pan-y` alone would let a two-finger vertical drag scroll the page out from under a pinch — hence
`useMultiTouchScrollLock`, a native non-passive `touchmove` listener that calls `preventDefault()`
only once a second touch is down. Native because React attaches `onTouchMove` passively, where
`preventDefault()` is ignored.

**Ctrl/⌘ + wheel zooms; a plain wheel is left alone**, for the same reason and with a bonus. The
plain wheel is how a diver scrolls to Save, and swallowing it would trap them exactly as
`touch-action: none` would. The pairing is not arbitrary: a trackpad pinch already arrives as a
ctrl+wheel, so this one branch is also what makes pinch-to-zoom work on a laptop without a line of
gesture code. It needs a native non-passive listener too — React attaches `onWheel` passively, and
without a `preventDefault()` the _browser_ zooms the whole page, which is what ctrl+wheel means to
it.

**Zoom is continuous; tiles are not.** A zoom level _is_ a doubling, so a pinch's level count is the
log base 2 of how far the fingers spread, and a wheel's is its pixels over a constant — both
fractional, both applied on every event. Two earlier attempts are worth keeping because each was
wrong in a different way. Spending a whole level per event is unusable for exactly the gesture the
ctrl+wheel branch exists to serve: a trackpad pinch fires continuously, so one flick crossed the
entire range and left everything between the two ends unreachable. Banking the movement and spending
it a level at a time fixed the speed and still read as a series of jumps — because the jumps were
the problem, not their rate.

So the fractional part is carried by the render instead. The grid is drawn at `Math.round(zoom)` —
computed in that level's own pixel space, with the centre and the viewport both divided down — and
the whole tile layer is then CSS-scaled by `2 ** (zoom - tileZoom)` to make up the difference.
`visibleTiles` never learns that zoom can be fractional, and the geography (`project`, `unproject`,
`clampCenter`, the marker) needed no change at all, since `2 ** zoom` was always happy with a float.
Rounding rather than flooring keeps that scale within `[1/√2, √2]`, so a tile is never stretched by
more than ~41% in either direction; flooring would only ever magnify, up to 2×, and look softer for
it. One `origin-top-left` on the layer is what lets each tile keep its offset in tile-level pixels
and still land in the right place once scaled.

**A two-finger event is a zoom _and_ a pan, and both are reported for it.** Handling the zoom and
returning — the obvious shape, and what the first continuous version did — silently killed
two-finger panning altogether: `pointermove` fires once per pointer, so only one finger moves per
event and the spread changes on essentially all of them, which meant the pan branch was never
reached. On touch that is the only way to pan at all, since one finger belongs to the page; a 100px
drag moved the map about 2px. The suite missed it because the pinch test moved the fingers
symmetrically, holding the centroid exactly fixed — the one two-finger case where dropping the pan
is invisible. There is now a case that moves both fingers the same way and asserts the _magnitude_
of the result.

Composing the two correctly is the fiddly part, and it is why the gesture's baseline is held as a
whole view rather than as a centre. The zoom is anchored on the centroid the gesture _started_ at,
not the live one, because the pan is measured from there too; the pinch zooms that baseline rather
than the live view, and the pan is then applied to the result. Zooming the live view instead counts
the previous event's pan twice. Only the spread is re-based between events, so successive zooms
compose while the pan stays an absolute delta from one fixed origin — no accumulated rounding, and
nothing to lose when a zoom is refused at a limit, since the baseline is only replaced when the zoom
actually happened.

**Each event composes onto the last, so the zoom is read from a ref rather than from the render.**
Wheel and pointer events arrive faster than React commits — a 120 Hz trackpad against a 60 Hz render
— and every one of them computes the next view from the current one. Taken from the render closure,
a burst of thirty pinch events all start from the same stale zoom and twenty-nine are thrown away:
measured in the browser at **0.04 levels where 1.2 were asked for**, which is precisely the "not
smooth" that the fractional rendering was supposed to have fixed. `viewRef` is written by the same
helper that calls `setView`, so it is current for the next event whether or not React has
re-rendered — and everything that composes onto the current view reads it, the gesture baselines
included, or a wheel zoom followed straight away by a drag baselines the drag against the pre-zoom
view and snaps back a step.

The pan path never had the bug, because it measures an absolute delta against a snapshot taken at
the start of the gesture instead of composing one change onto the last. That is the general lesson,
and why zoom was the only mover affected.

This is not pinned by a test. `fireEvent` commits between events, and batching them inside one `act`
does not reproduce it either — jsdom's scheduling is not the browser's. It was found, reproduced and
verified in the browser instead, and the numbers above are from there.

`deltaMode` is normalized before any of that, since Firefox reports whole lines and Safari can
report pages — a raw `deltaY` means three different speeds in three browsers. At 100px per level a
mouse notch is one level, which also keeps the wheel consistent with the buttons and the `+`/`-`
keys. Those still step by a whole level instantly rather than animating: a discrete control should
answer immediately, and there is no gesture in flight for the motion to be continuous with.

**Zoom is always about a point that must not move.** The anchor is the cursor under a wheel, the
centroid of a pinch, and — for the buttons and the keyboard, which have no pointer — the pin, or the
crosshair when there is no pin. One formula, four callers. **The pin is only the anchor while it is
on screen:** anchoring on one the diver has panned away from inverts the intent, holding the _old_
position still and throwing whatever was under the crosshair — the bay they panned to in order to
zoom in on it — twice as far out, doubling again on every press.

**The view centre is clamped against the viewport, not just against the poles.** `unproject` already
holds latitude inside Mercator's ±85.0511, which is not the same thing: the _centre_ can sit exactly
on the world's top edge with half the viewport hanging above it, where `visibleTiles` rightly
refuses to ask for tiles that do not exist and the overhang renders as bare background. At the
widest zoom the whole world is 512 px tall against a 224 px surface, so a short downward drag
reaches it. The clamp lives in `lib/map-tiles.ts` where it is testable, and is applied both before a
moved centre is stored — clamping only at render would let a drag keep pushing an invisible centre
past the pole, with an equal amount of dead movement on the way back — and at render, because a
latitude typed into the field arrives through neither mover.

**Attribution is parsed into parts, not injected as HTML.** Every mapping library ships attribution
as an HTML string and every consumer hands it to `innerHTML`; `react/no-danger` is an error in this
repo, and this particular string comes from an environment variable, which is exactly how a
self-hoster's typo would become an injection. `parseAttribution` reads the one piece of markdown
worth supporting — `[label](href)` — into text runs and links that render as React elements, and
drops any href that is not `http`/`https` while keeping its label, since a credit that cannot be
followed is still a credit. The links open in a new tab because the map sits in a dialog holding a
half-filled form, and they force `pointer-events-auto` on that corner, which costs a drag that
happens to start there — the same trade every map makes. The gesture hook ignores a pointerdown on
an anchor or button for a subtler reason than "don't pan": its `preventDefault` suppresses the
compatibility mouse events, so swallowing that pointerdown would leave the link silently dead.

**The default tile host sees your divers' IP addresses and roughly where their sites are.** Tiles
are fetched by the browser, so opening the picker discloses the caller's IP and the z/x/y of the
area being browsed to `basemaps.cartocdn.com`. It is the tile coordinates only — the
`Referrer-Policy: strict-origin-when-cross-origin` in `next.config.js` keeps the site UUID out of
the `Referer` — but for a private dive log that is still location data about the user. It is an
accepted trade for a feature that has to work with no account and no configuration — said out loud
in `/privacy` §4.4 as well as here, since it is the only outbound flow in the app a diver could not
guess at — and it is the one place where self-hosting buys real privacy: `NEXT_PUBLIC_MAP_TILE_URL`
points at your own tile server and the CSP follows it automatically.

## A trip's locations are self-describing objects, so nothing has to be resolved

The trip picker looks like `DiveSiteMultiSelect` and is built on the same `CreatableCombobox`, but
roughly a third of that component is missing here, and the missing third is all label resolution. A
dive site multiselect holds uuids: the form state is `["a1b2…", "c3d4…"]`, which means the component
has to fetch the sites those ids name in order to draw a row, keep a cache so an id already seen
isn't fetched twice, and handle the render where an id has arrived but its name has not.
`TripLocationMultiSelect` holds `{name, display_name, latitude, longitude, bbox_*}` objects, because
that is exactly what the API stores — a snapshot of what the geocoder said, not a pointer into a
shared gazetteer — so a row already contains everything it renders. There is nothing to fetch, no
loading state on an already-picked place, and no way for the list to be momentarily wrong.

The cost is that rows have no id, and a `<ul>` needs keys, a menu needs to hide what has been
picked, and a blur that re-commits the same place needs to be recognised as a duplicate.
`locationKey` derives one from the content: `geo:{lat}:{lon}:{display_name}` for a geocoded place —
the position plus the provider's full label, specific enough that "Moalboal, Cebu" and "Moalboal,
Negros Oriental" never collide — and `txt:{name}` lowercased and trimmed for a typed-in one, so
"moalboal" and "Moalboal " are one place typed twice. Identity from content is also why
`mapSearchResults` collapses results that key identically: Nominatim occasionally returns the same
place twice, and two menu rows sharing a React key is both a warning in the console and a row that
cannot be excluded once picked.

The _selected_ rows are keyed by position instead, which is where this diverges from
`DiveSiteMultiSelect` — and the reason is that a dive cannot hold the same site twice while a trip
_can_ hold the same place twice. The API allows it deliberately, and although this picker will never
produce one (appending dedupes on the key), an already-saved trip can arrive holding it. Two rows
sharing a key would then remove as one — the X on either taking both — and reorder ambiguously.
Position is unambiguous, and these rows carry no state of their own for React to lose by reusing
them.

They do carry one thing, though, and it took a round of review to see it: **focus**. Keyed by
position, React reuses the `<li>` and the drag handle inside it and only swaps their content — so
after a keyboard reorder the focus ring sits on a handle that now belongs to the _neighbour_. The
next Up/Down moves that one back, and the row being moved can never travel more than a single step,
while a screen reader quietly re-labels the button mid-gesture. `useDragSort` now moves focus to the
destination handle after a keyboard reorder (marked by `data-drag-handle`, a frame later so React
has committed the new order). For the id-keyed lists that is already the focused element and the
call is a no-op; here it is what makes the keyboard path work at all, and the keyboard path is the
only reordering anyone without a pointer has.

## An unmatched query is addable as text, and that is an outage hatch as much as a long tail

Pressing Enter on a query the geocoder didn't answer adds the place as plain text, with a name and
nothing else. The obvious reading is the long tail — a house reef with a local name no gazetteer
carries — and that is real, but it is not why this is load-bearing. The API's geocode proxy answers
`[]` when it is over the provider's instance-wide one-request-a-second limit, which is
indistinguishable from "no such place" by design. Without the escape hatch, a throttled minute would
be a picker that silently refuses to accept anything the diver types, at the exact moment they are
typing fastest.

A search can come back empty-handed in two ways, and the first attempt at this got the second one
wrong. A search that _resolves_ empty sets `searchedQuery`, so `commitAction` reaches its create
branch and Enter adds the text — the ordinary case, and the throttled-provider case with it. A
search that _rejects_ — the per-user 429, a network blip — deliberately leaves `searchedQuery`
stale, because an unanswered query is no evidence that a single-select's loaded value has gone. The
empty menu, however, was labelled from `inputValue` alone, so it showed "No places found — press
Enter to add as text" in that state too: an instruction that no-oped, and then erased what the diver
had typed when the field closed. The menu was telling them to do something the component had decided
not to allow.

Both halves are now explicit. `CreatableCombobox` remembers the _query_ whose search threw — not a
flag saying that one did, for the same reason `searchedQuery` is a query: an answer, "we couldn't
ask" included, is only ever about the text it was asked for, and a flag would still be reporting an
outage while the diver typed the next place, and letting Enter file that one as name-only text on
the strength of it. It renders a `searchErrorLabel` for that third state rather than folding it into
"nothing matches", and accepts a create from an unanswered query when the caller passes
`createWithoutSearch` — which the picker opts into via `keepOpenOnSelect`, the flag that already
means "this field appends". That restriction is the point: the stale-query guard exists to stop a
blip clearing a value, and a field that only ever appends has no value to clear, while the cost of
refusing is a diver whose quota just ran out being unable to add any location at all. No other
caller combines `onCreate` with `keepOpenOnSelect`, so nothing else moved.

**Typed text is committed by Enter, not by leaving the field** — and that is a change from what
every other combobox in the app does. A single-select's input _is_ its value, so blurring has to
commit or the typing is lost. An append-only picker inverts the odds: the diver's usual intent is to
pick the row they can see, and the near-miss is typing "phil", seeing **Philippines** in the menu,
and clicking Save instead of the row — which under blur-commit files a place called "phil" in the
same gesture that closes the dialog, showing the added row for exactly as long as the dialog is
open. `keepOpenOnSelect` now decides this too: an append-only field reaches `onCreate` from Enter
only. Which is also what makes the menu's "press Enter to add as text" the whole truth rather than
one of two ways.

And that Enter is answer enough by itself, whatever the search is doing. Gating it on the query
having been answered looked right and lost data: Enter blurs, the blur closes the menu, closing the
menu runs the search effect's cleanup — so the in-flight query is cancelled by the very keystroke
waiting on it, `commitAction` compares against whatever the _previous_ query answered, and the text
is dropped with the field cleared and nothing said. That is exactly the diver who types a house reef
no gazetteer carries and presses Enter inside the 450 ms debounce, without waiting for a menu they
know will be empty. The cost of the other direction is a name-only row where a geocoded one was a
moment away, which is visible and one X away from being fixed; a location that silently never
existed is neither.

Review raised the other side of that trade twice — a fast typist loses the geocode for a place the
menu was a heartbeat from finding — and it was weighed and kept both times. The alternative on the
table was to let Enter commit only for a search that actually _failed_, and to wait for one still in
flight; the reason it stays as it is, beyond the added latency, is that Enter blurs, the blur closes
the menu, and closing the menu cancels the search through the effect's cleanup — so "wait for the
answer" is not a small change to this code, and what it buys is a better outcome in the case that is
already visible and reversible.

**An empty menu has four things it might mean, and saying the wrong one talks a diver into the wrong
action.** The message is chosen in this order: below the search's minimum length, the field is still
inviting you to type; a failed search says the search is down; a query still waiting on an answer —
_including_ the 450 ms debounce, which `isSearching` misses entirely, since it only rises once the
timer fires — says "Searching…"; and only what is left is "No places found — press Enter to add as
text". Two of those were originally folded into the fourth, and both fold the same way: the menu
asserted a negative nobody had checked, and then invited Enter to act on it. A diver typing "Bohol"
briskly and pressing Enter got a name-only row for a place the geocoder knows, one that never
reaches the confirmation map. `minSearchLength` and `searchPending` are the two branches that stop
the field reporting on a search it never ran.

**A row is only ever added by a deliberate act, and there turned out to be three doors, not one.**
Enter and a click on a menu row are the deliberate ones. Leaving the field is not: an append-only
combobox now commits _nothing_ on blur — not a create, and not the exact-match select either, which
was quietly filing "Phil, Casey County, Kentucky" for a diver who typed "phil" on their way to the
Philippines and then clicked Save. And typing is not choosing: `handleInputChange` fired
`onChange(exactMatch?.id)` on every keystroke, which in a single-select fills the one field (this is
how you pick a trip without a mouse) but in an append-only field _appends a row_ — so "Bohol" was
added the instant the "l" landed, and stayed there while the diver finished typing "Bohol Sea". Both
are now gated on `keepOpenOnSelect`, so `DiveSiteMultiSelect` and `GearItemMultiSelect` lose the
same two surprises, and every single-select keeps its behaviour exactly.

The flip side of that rule is that a deliberate act must always be _answered_. A picked row leaves
the field ready for the next one — filter cleared, menu open, cursor in the input — and a typed row
now does the same, which it did not get for free: Enter has to blur to reach `commit` at all, so it
was landing the row and then leaving focus on `<body>` behind a closed menu, with a click needed
before a second place could be typed and Tab restarting at the top of the dialog. And an act that is
_refused_ says so: typing the name of a place already in the list adds nothing while the combobox
clears the input on its way through, which is indistinguishable from the field having eaten the
text. It now answers "The Boat is already in the list." in a `role="status"` line — status rather
than error, because nothing has gone wrong.

Typed-in rows carry a muted "not on the map" for a related reason: the map below draws only what has
a position, and its absence should be explained rather than read as the map having missed one.

Two consequences of all this are known and chosen rather than overlooked, and both were raised in
review, so they are written down here to stop the next reader deciding them again from scratch.
**Enter files a single character as a place** even though the menu above it is saying "Type to
search places" — the one point where the menu's text and Enter's behaviour disagree. It is the
mirror of the bug `minSearchLength` fixed, and the opposite call: the menu must not report on a
search it never ran, but Enter is a deliberate act on text the diver typed, a one-character name is
legal to the API, and refusing it would be the field overruling them about their own house reef.
**And a place added as text does not collide with the same place added from the geocoder** —
`txt:moalboal` and `geo:9.94:123.39:…` are different keys by construction — so a diver who types
"Moalboal" during a throttled minute and picks the geocoded row once the provider recovers ends up
with two rows reading "Moalboal". Both are visible, and one X fixes it. The alternative is matching
text keys against geocoded _names_, which would silently refuse two genuinely different places that
share one — the worse error, and the harder one to see.

**A location row truncates, and carries its full label on `title`.** "Ko Tao, Ko Tao, Ko Pha-ngan
District, Surat Thani Province, Thailand" is an ordinary answer from the geocoder, and one row of it
was widening the dialog's form to 888px — pushing the name field, the dates and the buttons out past
the edge of a 512px dialog, with no horizontal scrollbar to say so. It took two `min-w-0`s in two
different places, and the interesting one is not where the problem appears:

- On the row's text, so `truncate` can do anything at all. A flex item's default `min-width: auto`
  resolves to its min-content, and min-content of a nowrap string is the whole string, so the row
  simply refused to shrink.
- **On the `<form>`**, because `DialogContent` is `display: grid` and the form is its grid item —
  where the same `min-width: auto` rule applies and is the one actually holding the dialog open. A
  grid item is allowed to overflow a definite-width container when its own min-content is wider, and
  nothing further down the tree can overrule that: `min-w-0` on the picker, the `<ul>` or the row
  each changed nothing, measured in the browser. Only the item can say it may be narrower than its
  contents.

The `title` matters more than it looks: the long tail of a display name is precisely what tells
"Moalboal, Cebu" from "Moalboal, Negros Oriental", so an ellipsis that hides it needs somewhere to
put it back.

**On a saved trip, the geocoder's credit comes from the map's tile attribution — which is a coupling
worth knowing about.** The API says the client should render a result's `attribution` wherever it
shows that result, and the picker does, for the live search. But `trip_location` deliberately does
not store it, so a location loaded from the API has no credit of its own to render. It works out
today, and by luck rather than design: `display_name` is the only geocoder-derived field these
surfaces show, it only exists on geocoded locations, and a geocoded location always has coordinates
— so both places that render one (the detail page's location rows, the dialog's picker rows) also
render `LocationsMap` right beneath, whose tile credit already names OpenStreetMap. Anything that
breaks that pairing — making the map collapsible, gating it on something else, or a path that
produces a `display_name` without coordinates — drops the credit silently, with no test to catch it.

**Both of the API's ceilings are enforced as the list is built, not at submit** — the 20-location
cap by closing the search field, the 255-character name by truncating what was typed. Leaving them
to the schema is the obvious thing and is wrong twice over. A 21st location is rejected only once
the diver has filled in the rest of the dialog and pressed Save, and then they are told they have
too many and left to work out which of twenty-one identical-looking rows is the extra one. And a
name over 255 characters — reachable only by pasting, since geocoded picks are truncated by the API
— is worse than a rejection: react-hook-form reports that error at `locations.0.name`, so
`errors.locations` is an _array_, and `FormMessage` renders `String(error.message)`, which for an
array is the literal word "undefined" in red under the field. The diver would be told nothing at all
by a form that had also silently stopped saving. This is the first field in the repo to put an array
of objects under a single `FormField` — `mixtures` renders a `FormField` per element — which is why
the hole hadn't surfaced before.

## The picker types more slowly than the rest of the app, on purpose

`searchDelayMs` gained an optional override and `CreatableCombobox` a `searchDebounceMs` prop so the
trip picker can wait 450 ms where every other remote combobox waits 250. Our own list endpoints are
happy to be asked four times a second; Nominatim is behind a proxy that enforces one request a
second across the whole instance and answers `[]` rather than queueing once that is exceeded. A fast
debounce there does not merely waste requests — it converts them into empty menus, so the diver
types "Moalb" and watches the list go blank. The empty query fired on menu-open still skips the
debounce entirely, since there was no keystroke to coalesce.

`searchPlaces` answers a query outside the endpoint's own `2..200` without calling the API at all.
Both ends would be a 422, and a 422 arrives as a _rejection_ — the one answer the picker cannot
treat as "no match" — where returning `[]` locally leaves Enter-to-add-as-text working. The lower
bound is the one that fires constantly, since the combobox probes with `""` the moment its menu
opens; the upper is a pasted paragraph, and it is in the guard because the two are the same mistake.

One line in the combobox's create branch changed with this:
`setInputValue(keepOpenOnSelect ? "" : created.name)`. For a multi-select the created item has moved
into the list above and the input is a filter, which belongs empty — and this was the one path
filling it back in behind the component's own back, since closing the menu clears the input
synchronously and the awaited `onCreate` then resolves a render or two later and writes the stale
name into a field the diver is done with. No existing caller combines `onCreate` with
`keepOpenOnSelect`, so the fix is inert everywhere else.

## Coordinates that were picked, not typed, are numbers

`lib/validations/dive-site.ts` validates coordinates as strings against a regex, and the reasoning
above is still right for that form: a diver typing a latitude passes through "-" and "-17." on the
way to "-17.9", and a numeric field would reject or mangle those intermediate states. None of that
applies here. A trip location's coordinates arrive whole, inside an object the diver picked from a
menu, or they are absent because the place was typed in by hand — there is no half-entered state to
be tolerant of, and no text field they could be typed into. So `tripLocationSchema` uses plain
`z.number()` with the API's own bounds, and a nonsense object is caught before the round trip rather
than after it. No `z.preprocess` or `.transform` anywhere in it either, which is what keeps
`z.input<>` inference working and `TripLocationFormValue` usable as the form's own type.

## The confirmation map is not `MapPicker`, and that is most of why it is short

`MapPicker` is 705 lines; `LocationsMap` is about 250 and shares only `lib/map-tiles.ts` with it.
The difference is not restraint, it is that nearly everything in the picker exists to serve
write-back — telling a position the map emitted apart from one the diver typed into the coordinate
fields, and the gesture handling that lets them place a pin at all. This map emits nothing. Give it
locations, it draws them; there is no echo to disambiguate because there is no output, and no
gestures because there is nothing to aim. Reaching for `MapPicker` with its interactivity disabled
would have inherited all of that machinery in order to switch it off.

Whole zoom levels only, for the same reason. Fractional zoom exists in the picker so a pinch glides,
and there is nothing here to pinch; tiles are drawn at their own level and never CSS-scaled, which
is also the sharpest they can be. Pins are `bg-coral` rather than `bg-primary` — primary is
near-black in light and mid-grey in dark, and mid-grey on Dark Matter's near-black tiles is an
invisible marker. Coral is the one accent held constant across both themes.

The attribution overlay sits _outside_ the `role="img"` surface rather than inside it, which is why
the frame is two nested elements instead of one. A link inside an image role is dropped from the
accessibility tree, and a licence credit nobody can follow is not much of a credit.

The surface is measured through a **callback ref**, not the usual ref plus a mount-only effect. This
map renders `null` when nothing it was given has a position, so the element it needs to observe is
not always there at mount — and an effect that found no element then would never look again, leaving
a caller who renders the map before its locations load with a frame measured at 0×0 for good. Tying
the `ResizeObserver` to the element appearing rather than to the component mounting is what lets the
component keep its promise that callers need not gate on having something to draw.

## The read-only map lives in `components/map/`, not in `components/trips/`

It was `TripLocationsMap` under `components/trips/` while a trip was the only thing being drawn. The
dive site page wants the same picture of a different subject, and a dive site is not a trip
location, so it moved to `components/map/locations-map.tsx` and lost the `Trip` from its name rather
than being imported across feature folders — which would have read as the site page depending on the
trips feature for something neither of them owns.

Nothing about the drawing changed, and exactly one thing became a prop: **`subject`**, the
aria-label's fallback, which was the hardcoded string `"Map of the trip's locations"`. It is only
ever read when the places have no usable names between them — but the trip's wording on a dive
site's map would then be wrong in exactly the place nobody looking at the screen can see it. Names,
when there are any, are still the label, and they are still joined by `formatTripLocationNames`,
which despite its name is the general "drop the blanks and join what's left" rule.

`subject` is **required**, despite having an obvious default, for the same reason it exists: the
path that reads it has no visual tell. A caller who omitted it would get a plausible-sounding label
on a screen-reader-only path that no screenshot and no test of theirs would ever exercise, so the
mistake is worth spending three words at each call site to make a type error instead.

What did _not_ become a prop is the frame's height, which lives in the component and is duplicated
once in the `next/dynamic` skeleton beside it — deliberately, because a caller free to set it is a
caller free to disagree with the skeleton and make the page jump when the chunk lands.

The site page gates the map on the same `formatCoordinates` result the Coordinates line uses, rather
than on the map's own "nothing to draw" behaviour. The map would render `null` either way; the gate
is what keeps a site with no position from fetching the chunk at all. Both are the both-or-neither
pair — a half-set position, which only raw SQL can produce, draws nothing and shows no coordinates.

## `fitBounds` unwraps longitudes before it unions them

A trip to Fiji and Samoa spans about six degrees — across the antimeridian. Unioning the raw
coordinates instead describes the 354 degrees of ocean going the other way round the planet, which
fits at exactly one zoom: the whole world, with both pins at opposite edges of it. So every box is
unwrapped against the first one before the union, the same trick `nearestWrappedX` plays for a
marker — pick the copy of the place that is nearest, not the one whose number is smallest. Each
box's width is taken as a signed span first, so a box whose east edge folds back behind its west
stays one interval rather than becoming a negative one, while a genuinely zero-width point stays a
point.

Two smaller choices in there are worth naming. The vertical centre is the midpoint of the
_projected_ extent rather than the average of the two latitudes: Mercator stretches towards the
poles, so on a view spanning hemispheres those differ by degrees, and it is the projected midpoint
that puts equal amounts of map above and below. And zoom is capped at `MAX_FIT_ZOOM` (10) rather
than running to `MAX_ZOOM`, because a single location fits at any zoom you like and the deepest one
is useless — a trip location is a town, an island, a sea, so it should open where the surrounding
coast is recognisable, not at the street level where a lone dot sits in a grid of house numbers.

## A dive site's map opens further out than the picker that placed its pin

`MapPicker` opens at zoom 12 for a site that already has a position; the map on the site's page fits
to `MAX_FIT_ZOOM` (10), the same cap a trip location gets. Matching the picker is the obvious thing
and was tried first — a site should not look like a different place on its page than it did while
its pin was being placed — and it is wrong for one reason: **the picker can be zoomed out and a
static map cannot.**

The evidence is what settled it. Rendered at zoom 12 in the sidebar's ~300px column, an offshore
site — Chumphon Pinnacle off Koh Tao, Kimud Shoal off Cebu — is a featureless grey square with a
coral dot in it: about 11km across, and no land, no coastline, no labels anywhere in frame. The same
two at zoom 10 show the island and the named towns opposite. A shore site (Dahab) reads well at
either, gaining street names at 12 and losing nothing at 10. So the deeper zoom is better for some
sites and useless for others, while the shallower one is never useless — and roughly half of dive
sites are offshore, which is the half a dive log cannot afford to draw as blank water.

That is also why `fitBounds` kept its single cap instead of taking one per caller. A `maxZoom`
argument was written and then removed: with both maps wanting 10, the parameter had one value, one
caller passing it explicitly, and a second plausible-looking number (12) sitting in `MapPicker`
inviting somebody to pass that instead.

## Locations are always sent on edit, never omitted

The API's PATCH treats an omitted `locations` key as "leave them alone" and any provided list —
including `[]` — as a wholesale replace. `TripDialog` always sends the list. The form shows the
whole set of locations every time it opens, so there is no state in which the field is unknown to
it, and omitting the key when nothing changed would buy one skipped re-insert at the price of making
"remove them all" inexpressible — an empty form field and an untouched one would send the same
request.

This was written as a decision about locations and is now the rule for every list field the app
edits: a dive's sites, a dive's gear, a dive's cylinders and a gear set's members are all sent on
every save, on the same reasoning. It only ever read as an exception during the window when the API
hid soft-deleted rows from a read, which made the _other_ forms' seeds untrustworthy while this one
stayed whole — see "The edit form submits the whole dive, because the read is the whole dive" and "A
gear set's members are sent on every save, like a trip's locations". The condition the argument
actually turns on is the form knowing the whole set, and nothing is hidden from a read now.

The map beneath the picker is driven by `useWatch` rather than `form.watch()`. `watch()` re-renders
the whole dialog on every change to any field, which would mean re-fitting and re-rendering a tile
grid on each keystroke in the notes textarea. It is gated on there being at least one location with
a position, which also keeps the map's chunk unfetched — it is a `next/dynamic` import with
`ssr: false`, since it measures its own element and reads the resolved theme, neither of which
exists on the server. (The gate is gone — the trip form's map is on screen from the moment the
dialog opens, and so is its chunk. See "The trip form's map is always on screen, and its fields are
asked in a different order" below. Everything else here still holds, `useWatch` most of all: an
always-mounted tile grid is more expensive to re-render needlessly, not less.) The dynamic wrapper
lives in its own file rather than at each of the two call sites, so the skeleton's height cannot
drift from the map's and make the page jump when the chunk lands.

## A "+N" is a promise that hovering will say what N was

`Moalboal, Bohol +2` and `Pescador Island +1` compact a list to fit a table cell, and until now the
only way to read the rest was to open the trip or the dive. The names are already in the payload
that drew the row — nothing is being fetched to reveal them — so the compaction was hiding data the
page was holding.

Both surfaces now carry the full list as a `title`. Three details that are easy to get wrong:

**The hint sits on the whole label, not on the "+N" itself.** `DiveSitesLabel` used to title the
badge alone, with the text `Also: …` listing only the hidden tail. That is a smaller hover target
than it looks — a two-character superscript — and it splits the answer in two, so a diver reading
`Pescador Island +1` had to know that hovering the name and hovering the badge were different
gestures. The tooltip is now the expansion of what is on screen: every name, from the same element
the whole label occupies. A `title` on the wrapper still shows over the primary site's `<Link>`,
because the link carries none of its own.

**A hint that repeats the label is worse than no hint.** Neither surface titles a label that already
shows everything, which is why `formatTripLocationNamesHint` exists beside `formatTripLocationNames`
rather than callers simply calling the formatter twice with and without `max`. It answers
`undefined` when nothing is hidden, and — the part that makes it more than a string comparison — it
decides that against the same blank-dropping rule the label uses, so a trip carrying
`["Moalboal", " ", "Bohol"]` under `max: 2` shows no "+N" and gets no tooltip. A hint computed
against a different limit than the label would either repeat the cell or withhold a name the "+N"
says is there, and neither would look wrong at the call site — so the two are no longer computed at
the call site at all. `TripLocationsLabel` owns the limit and calls both functions with it, the way
`DiveSitesLabel` already owned the dive half; the trips table and the dashboard's recent-trips card
pass locations and a fallback and nothing else. The dive label joins its names unfiltered, because a
dive site is a saved row whose `name` the API holds to `min_length=1` while a trip location is a
geocoder snapshot that can arrive as free text.

**`title` answers a mouse and nobody else, and that is the accepted limit here.** There is no hover
on a touchscreen, and a `title` on a non-focusable `<span>` is not reachable by keyboard either — so
on the phone a diver logs from, the "+2" is still unexplained. It is not a regression (the old
`Also: …` title had the same limit on a smaller target), and the alternative is turning a label
inside a table row that already links out into a `Popover` trigger — an interactive element nested
in a link, for a hint whose whole content is one tap away on the trip's own page. Hover-only is the
deliberate answer for now; a real tooltip primitive would change it, and this app has none yet.

## `DialogFooter` is one row at every width, and its gap is `gap-2` not `space-x-2`

shadcn's footer is `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2`. Below `sm:` that
is a column with no spacing rule at all — `space-x-2` only applies from `sm:` up, and it separates
siblings horizontally regardless — so on a phone the Cancel and submit buttons sat flush against
each other with no gap, which is the bug this fixes.

The fix is not to add `space-y-2` to the column. Every dialog in this app ends in Cancel plus one
action, and the widest pair is `Cancel` (80.5px) beside `Create Certification` with its `Plus` icon
(186.9px) — 275.4px with the gap, against a dialog content box of viewport minus 50px (`p-6` and a
border on each side). So one line needs about 326px, and measured in Chrome the certification dialog
lays out on one row at 360, 375, 390 and 414 and wraps at 320. The column was spending a second row
on something that never needed one, at every width a phone sold this decade reports.

`gap-2` rather than `space-x-2` because the gap has to survive that wrap. `space-x` puts a margin
between siblings on a line and knows nothing about the line breaking, so a footer that _did_ wrap —
320px, a longer action label, a diver running a larger text size — would lose the spacing entirely,
which is the same failure this section opened with. `flex-wrap-reverse` is what handles the rest of
that case: the buttons stay on one line whenever they fit, and when they cannot, the action lands on
the row _above_ Cancel exactly the way the old `flex-col-reverse` put it there, now with 8px between
the rows.

## The dive's duration and depths lost their card title

The `Duration & Depth` header (see _"The dive's clock went up to the header, and two cards became
one"_) is gone. Each figure under it is already labelled `Duration`, `Maximum Depth`,
`Average Depth`, so the title restated the two labels beneath it in a heavier weight, and the
`Timer` icon beside it named a dive property rather than a section of the page. What is left is a
card of three stat blocks — the first thing on the page after the header, and legible without being
told what it is.

The `CardContent` takes an explicit `pt-6`. `CardContent`'s default is `p-6 pt-0`, which assumes a
`CardHeader` supplied the top padding; without one the numbers would otherwise start hard against
the card's top border. The dashboard's stats-error card (`app/dashboard/page.tsx`) already restores
it the same way, so this is the second headerless card rather than the first — and two call sites is
not enough to earn a `headerless` variant in `ui/card.tsx`, which would have to guess whether the
next one wants the same padding or a tighter one.

## Pages hold their shape while they load, instead of collapsing into a spinner

Every page in this app is a client component that fetches on mount, and client-side navigation is
instant, so the new route mounted and immediately early-returned a centred `Loader2`. The complaint
that started this was that switching pages "looks jerky", and the jerkiness was never the spinner
itself — it was that the spinner takes up almost no room. Each navigation went content → an empty
column with a small mark in the middle of it → content, which is two layout changes and a flash, on
every link, however fast the API answered.

The fix is placeholders shaped like the thing they replace, so there is one layout, not three.
`Skeleton` (`components/ui/skeleton.tsx`) is the primitive; `CardSkeleton` and `ListRowsSkeleton`
sit beside it, `TableRowsSkeleton` goes inside a real `<TableBody>`, and
`DetailPageSkeleton`/`FormPageSkeleton` (`components/ui/page-skeleton.tsx`) assemble whole page
shells out of them. The page-level ones build on the _real_ `Card` and `PageHeader` primitives
rather than re-describing their padding, which is the only way the header can be guaranteed the same
height before and after the record lands.

### The 150ms delay is what keeps a skeleton from being worse than a spinner

A content-shaped placeholder that appears instantly trades a layout jump for a grey flash: against a
local API most of these loads finish in well under 100ms, and a skeleton that paints and repaints
inside that window is its own kind of jitter. So `animate-skeleton` (`tailwind.config.mts`) is two
animations — a `skeleton-in` fade held at `opacity: 0` for 150ms by `both`, then `skeleton-pulse`
breathing from 350ms on.

The delay is on the _opacity_, deliberately, not on whether the skeleton renders. It takes up its
full space from the first frame while being invisible, so a fast response swaps straight from the
old page to the new one and a slow one has already reserved the layout it will need. Gating the
render itself on a timer would put the collapse-then-grow back, just 150ms later.

The delay has to cover the _chrome_ too, and at first it didn't. `Skeleton` is only the grey bar;
the card outlines and row borders around it are real `Card`s and `TableRow`s, so they painted
instantly and a sub-150ms response still flashed a grid of empty ruled boxes — the exact thing the
delay exists to prevent, with the mechanism only half applied. `animate-skeleton-reveal` is the fade
without the pulse, and it goes on those containers. Traced in the browser, a placeholder row now
sits at opacity 0 from mount (~85ms after the click) until ~240ms and reaches full opacity at
~440ms. Using the full `skeleton` shorthand there instead would nest one pulse inside another and
dip the bars to a quarter opacity rather than half.

`motion-reduce:animate-none` drops both animations, which also drops the `both` fill and so leaves
the skeleton visible from the start — correct for that setting: no delay is better than a delay you
can't see coming.

### What renders for real, and what doesn't

`DetailPageSkeleton` draws the actual back button rather than a bar where one will be. Where that
link goes is known before the record is, and it is the one control on the page someone might want
_during_ the wait — a stale or mistyped URL otherwise leaves them looking at grey boxes with nothing
to click. For the same reason the list pages keep their `<TableHeader>` and its column labels on
screen and put the skeleton rows in the body: the columns are static, and the table then has its
real width from the first frame instead of snapping to it later.

That restructure inverted each list page's branch. It used to read
`isLoading && empty ? spinner : empty ? placeholder : table`; it now reads
`!isLoading && empty ? placeholder : table`, with `items.length === 0` inside `<TableBody>` choosing
skeleton rows. The four cases resolve identically — the point is that "loading" and "loaded" now
differ by the contents of one element rather than by which subtree exists.

`TableRowsSkeleton`'s bar widths cycle by `(row + column)` rather than being random. Random widths
would differ between the server render and the client's and trip hydration; a fixed cycle still
breaks up the grid.

Its row count is `itemsPerPage`, not a fixed five. The page size is known before the first
response - it is the hook's own configured value - so drawing five placeholders and then receiving
ten put a card-height jump back exactly where this work removed one. It overshoots on a last page
that isn't full, but the first load is always page 1.

### Holding the shape means the header can no longer claim a count it doesn't have

`totalCount` is 0 until the first response, and the list cards' title badges read straight off it.
That was invisible while the body was a spinner and nobody looked at the badge; over ten placeholder
rows, a badge saying "0 total dives" is the page stating something false. `CountBadge`
(`components/ui/count-badge.tsx`) shows a placeholder instead, and keys on
`isLoading && count === 0` rather than `isLoading` alone, so paging through a list that has already
loaded keeps the total it knows instead of blinking it away and back.

The pagination footer under the table is the same class of problem, left unsolved: it renders
nothing while `totalCount <= itemsPerPage`, so it appears when the data lands and adds ~52px at the
bottom of the card. Reserving that space would be a guess - a list of exactly ten items never
paginates - and guessing wrong shifts the layout the other way instead.

### The dashboard's chart cards, and the enter animation

The two chart cards were the worst single offender: a `720 x 240` SVG drawn at `w-full h-auto`
collapsing to a spinner and then growing back is most of the page's height moving twice.
`ChartSkeleton` reserves the same `3:1` box, plus - behind a `legend` prop - the 24px the gas
chart's `text-xs` legend occupies under its plot and the activity chart has nothing in. That one
prop is the difference between the gas card measuring 560px in both states and measuring 560 loaded
against 536 loading.

`app/template.tsx` was the other half of it. Next remounts it on every navigation, and it ran
`fade-in slide-in-from-bottom-1` over 300ms — which meant it spent the entire animation sliding a
`Loader2` up the screen and then cut hard to the real content, putting the motion on the throwaway
state and none on the swap that mattered. It is now a 150ms fade with no travel: what it animates is
real page structure, so it only needs enough to mark that the route changed.

### The placeholders are hidden from assistive tech, rows and all

`Skeleton` carries `aria-hidden`, but that only hides the bar - the `<tr>`/`<td>` and the bordered
row `<div>`s around them stay in the accessibility tree, so a screen reader opening `/dives` would
be told the table has eleven rows, ten of them empty cells, where the spinner it replaced announced
nothing at all. `TableRowsSkeleton` hides each placeholder row and `ListRowsSkeleton` its whole
container — the latter as a busy wrapper around a hidden inner element, because the two attributes
cancel out on one node: `aria-busy` says nothing to a reader already told to skip the subtree.
`page-skeleton.render.test.tsx` asserts that `getAllByRole("row")` finds none of them, which is the
assertion that fails if a later change drops the attribute.

### Measured, not eyeballed

Every height above came from `getBoundingClientRect()` on the real pages with the API held back by a
patched `XMLHttpRequest.prototype.send`, comparing the loading and loaded geometry of the same
element. That is worth repeating rather than trusting a screenshot, because three of the four
placeholders were wrong on the first attempt and none of the errors were visible by eye: the
subtitle bar was `h-5` against a 24px line box, the table's skeleton row count disagreed with the
page size, and the gas chart's legend was unaccounted for.

`ListRowsSkeleton` is the same story as the table's row count: its bars are `h-5`/`h-4` against the
real row's `text-base` over `text-sm`, and its count comes from the card's own
`RECENT_DIVES_COUNT`/`RECENT_TRIPS_COUNT` rather than a default. At three shorter rows the two
dashboard cards painted 186px and settled at 350px - a 164px jump on the page this work exists to
fix. They now measure 522px in both states.

Two shifts survive deliberately. The dive detail page still moves 4px, because its subtitle is
`DiveDateNav` - buttons, so 28px rather than the 24px every other detail page's subtitle occupies -
and parameterising the shared skeleton for one page costs more than the 4px. The dashboard moves
~134px when a gear-service reminder is due, which is not a placeholder problem at all: whether that
card exists is one of the things the request answers.

### Not done here

Two things were considered and left out. A GitHub-style top progress bar is the natural next step
but it is a _signal_, not a fix — GitHub's reads well because the old page stays on screen
underneath it, and until these pages stopped blanking a bar would only have sat above the same
flash. And nothing here caches: returning to `/dives` still refetches and still shows skeleton rows,
where a stale-while-revalidate layer under `usePaginatedResource` would show the previous rows
immediately and never enter a loading state at all. Both are worth doing; neither is worth doing
before the layout stops moving.

## The project instructions live in AGENTS.md, and CLAUDE.md is an import

`CLAUDE.md` used to hold everything. It now holds a `@AGENTS.md` import and the handful of lines
that are genuinely about Claude Code; the instructions themselves moved to `AGENTS.md`. Two reasons,
and the second is the one that forced it.

One: `AGENTS.md` is the cross-tool convention, so one file serves every coding agent instead of a
copy per tool that drifts apart. Claude Code does not read `AGENTS.md` on its own — the documented
bridge is exactly the import used here, so nothing is lost by moving the content out.

Two: `next dev` writes to these files. Next 16 ships
`node_modules/next/dist/server/lib/generate-agent-files.js`, and `start-server.js` calls it on every
dev-server start, gated on `agentRules !== false` in `next.config.js` and on `@vercel/detect-agent`
finding an agent in the environment (`CLAUDECODE`, `CURSOR_AGENT`, `CODEX`, `GEMINI_CLI` and
friends). Started from a plain terminal it does nothing; started from an agent session it appends a
managed block delimited by `<!-- BEGIN:nextjs-agent-rules -->`. It prefers `AGENTS.md` when that
exists and falls back to `CLAUDE.md`, which is how the block kept landing in a file we author. Now
there is a file for it to write to that nobody hand-maintains.

Deleting the block is not a fix — the write is an upsert keyed on those markers, so removing it only
restores the precondition for the next dev-server start to add it back, in every worktree
separately. `agentRules: false` would stop it outright, and was rejected because the advice it
carries is real: `node_modules/next/dist/docs/` is the shipped Next 16 documentation, and this app
is on a version whose conventions predate most training data.

### The Prettier override is load-bearing

`.prettierrc.json` gives `AGENTS.md` `proseWrap: "preserve"`, against the `*.md` default of
`"always"` at 100 columns. Without it the two tools fight forever: Prettier rewraps the block's long
lines, `hasCurrentAgentRules` compares the installed block against the expected text **exactly**,
the comparison fails, and the next dev-server start rewrites it unwrapped — so `npm run format` and
`next dev` each undo the other, and whoever runs `format:check` after a dev server fails on a file
they never touched. `preserve` keeps the file in the formatter for everything else and costs only
hand-wrapping the prose, which is noted at the top of `AGENTS.md`.

## A recorded fix is a location with a different marker, not a second map

The dive page draws three kinds of position at once — the pin of each site the dive was logged
against, where the diver entered the water, and where they surfaced — and only the first is a place
somebody chose. Two maps side by side was never seriously on the table, but a second component (or a
`sites`/`fixes` pair of props on this one) was, and it is the wrong shape: everything about drawing
them is identical, and only the marker differs.

So `MappableLocation` gained one optional field, `variant?: "pin" | "fix"`, defaulting to the pin
every existing caller already draws. That keeps the prop minimalism recorded above in "The read-only
map lives in `components/map/`" — it still knows about positions and names and nothing about dives —
while making the distinction visible. A domain-shaped `kind: "site" | "gps"` was rejected for the
same reason `subject` is a string: the map has no business knowing what a dive site is.

The fix inverts the pin's two colours rather than changing its size, shape or hue: same coral, same
12px, `border-coral` with a `bg-background/80` centre against the pin's `border-background` over
`bg-coral`. One accent reads as one legend where a second colour would read as a second meaning, and
the tinted rather than transparent centre is what keeps the ring legible over a busy coastline on
both Positron and Dark Matter. What this buys is the failure case: a site pinned a few kilometres
from where the dive computer says the dive happened is a mis-pinned site, and the two shapes are
what make that visible at a glance instead of arithmetic.

## The drift between entry and exit is a line of text, not a line on the map

Drawing a segment between the two fixes is the obvious rendering and it cannot work here. This map
is capped at `MAX_FIT_ZOOM` (10) for reasons that have nothing to do with dives — see "A dive site's
map opens further out than the picker that placed its pin" above — and at zoom 10 a pixel is about
100 m of ocean — so a surface swim, which is what a diver's entry-to-exit separation usually is, is
a sub-pixel line between two overlapping markers. Lifting the cap for this one case would trade a
drawable line for the blank grey square that cap exists to avoid.

`lib/geo-distance.ts` answers the same question in text instead: `haversineMeters` between the two
pairs, `formatDistance` to whole metres below a kilometre and one decimal above. Haversine rather
than projected-metre subtraction because it needs no antimeridian special case — it works on the
difference between the longitudes, so 179.9999°E to 179.9999°W is the 22 m it looks like on a globe.
Whole metres because a consumer GPS fix is good to something like five of them and "212.4 m" claims
a precision the reading never had; the rounding happens before the unit is chosen, so 999.6 m
renders as "1.0 km" rather than as a "1000 m" that looks like a different unit from the "1.0 km" a
millimetre further on.

The map still answers "where in the world was this", which is the question it is good at. The
coordinate rows and the distance answer "what happened", and metres is the only unit they come in —
nothing in this app has a unit preference to consult (the same sidebar hardcodes °C and m two cards
down), and inventing one for a single row was not the place to start.

## The dive's location card renders on GPS alone

The card was gated on `trip || dive.dive_sites.length > 0`, which is exactly wrong for the dives
this feature is for: an imported file carries fixes whether or not the diver ever attached the dive
to a site, and that dive is the one whose position is most worth showing. The gate now also admits a
dive with either coordinate pair, and the map inside it is gated separately on there being at least
one position among the sites and the fixes — the same two-level arrangement the site page uses,
where the inner gate's job is keeping the `next/dynamic` chunk unfetched rather than keeping an
empty frame off the screen.

Both gates use `!= null` per coordinate, never truthiness. A dive off West Africa exits at longitude
0 and one in the Galápagos at latitude 0; `formatCoordinates` already guards this way and the map's
own `placedLocations` does too, so the trap is only in code that reaches for the numbers directly,
which is why the pair is turned into a point once at the top of the component and read from there.

The card is now titled **"Location"** rather than "Trip & Dive Site", which is the other half of the
same change: a heading naming the two things that used to be its whole contents is wrong on a card
whose contents may be a map and two coordinate rows. One title for every combination rather than a
conditional one — a heading that changes between two dives reads as two different cards, and every
block inside is labelled anyway ("Trip", "Dive Site", "Entry", "Exit"), so nothing is lost by the
heading getting shorter.

## The edit form submits the whole dive, because the read is the whole dive

`PATCH /dive` is a partial update, and for a while the edit form used it as one: `buildDiveUpdate`
took react-hook-form's `dirtyFields` and dropped every field the diver had not touched. That
machinery is gone. The form sends everything it holds on every save.

The filter existed because the API soft-deleted trips and dive sites and then hid them from a dive
read, which made the form's own seed a lie. A dive whose trip had been deleted came back with
`trip_uuid: null`; the form echoed that null, `patch_dive` read it as "the diver cleared the trip",
and the link was gone. A dive whose site had been deleted came back one entry short, and echoing
that list back put it through the same delete-and-reinsert the picker uses. Pressing Save on a dive
nobody had edited destroyed both, with no undelete path and no trace left in `export.json`.

**The API stopped hiding rows, so the echo stopped being a lie.** Trip, DiveSite, GearItem, GearSet
and GearServiceSchedule are hard-deleted now, and the `ON DELETE` rules already declared on every
referencing FK do the cleanup — a dive whose trip is deleted has `trip_id` set to null in the
database, not merely rendered without one. A read is therefore the whole truth about the dive, and
sending it back says exactly what the dive already holds.

What is worth keeping from the argument, because it is what made the fix land here rather than in
the API: **"the diver cleared the trip" and "the client echoed back a null it was handed" are the
same PATCH on the wire.** The API could not tell them apart and never will be able to. That is not
an argument for filtering — it is an argument for never letting a read differ from the record, which
is what the API change did. The client-side filter was the expensive way to live with a read filter,
and it only ever covered the untouched save; the diver who edited the very list a hidden row was
missing from lost it anyway, and no browser could have prevented that.

`buildDiveUpdate` keeps its one real rule, which predates all of this: `undefined` means "not sent",
`null` means "the diver cleared it". Collapsing those two is what once made a trip impossible to
remove.

### Seeding the edit form has to be faithful, and `mixtures` is where that bites

Sending the whole form is only safe if the form holds the dive. It did not, in one place: the edit
page seeded `mixtures` with a synthetic `DEFAULT_MIXTURE` row when the dive had none —
`diveData.mixtures?.length ? … : [{ ...DEFAULT_MIXTURE }]`. A dive with zero cylinders is a real
record (`DiveCreate.mixtures` is `default_factory=list`) and `patch_dive` replaces the list
wholesale on presence, so unfiltered that seed writes an 11.1 L cylinder of air to a dive whose only
edit was to the notes — and `compute_gas_use` then derives an RMV from it. A new instance of exactly
the class of bug this change exists to close.

The fix is to seed from the dive faithfully, in an exported `diveToFormValues` beside
`toDiveMixtureInput`, so the seeding is testable at the seam where it lives rather than inline in a
page component. No synthetic row, and therefore no special case anywhere downstream.

**The obvious narrower fix is wrong, and worth recording as wrong.** It was a guard in
`buildDiveUpdate`: omit `mixtures` when the dive arrived with none _and_ the field still holds one
pristine `DEFAULT_MIXTURE`. `DEFAULT_MIXTURE`'s `volume: 11.1` is the `"11.1 L (S80)"` preset — an
aluminium 80 of air, the most common recreational cylinder there is. A guard keyed on value-equality
with it makes exactly that cylinder unsavable: leave the row alone and it is dropped, type 11.2 and
back to 11.1 and it is still dropped. It would also put a page-specific question back into
`buildDiveUpdate` in the same change that took one out, and its natural unit test compares
`DEFAULT_MIXTURE` against `DEFAULT_MIXTURE`, so it cannot detect the drift that would break it.

**Two things this needed were already here.** `MixtureFields` renders `mixtures: []` cleanly and
says "No cylinders recorded for this dive." over it, and its per-tank Trash button has no
`index > 0` gate, so the last cylinder is removable and zero is reachable by hand. Both arrived with
"The create form proposes no cylinder, and the last one is removable", which needed exactly the same
two changes for its own reasons and landed first. Had it not, this change would have had to make
them: a diver who clicks "Add Mixture" on a cylinder-less dive and cannot get back to zero
reintroduces the phantom cylinder by hand.

**Create and edit reach the same place by different arguments, which is worth keeping straight.**
The create form starts empty because a form must not write gas the diver never entered, and because
`diveModWarning` would raise a depth-safety warning derived from it. The edit form starts empty
because it represents a stored record, and a row invented here is written back to the dive on the
first save. Neither argument implies the other - this plan expected the create form to go on
proposing a cylinder, and it would have been coherent for it to.

### If `dirtyFields` ever comes back, it has to be read during render

Nothing in the app reads it any more, and the trap is a property of the library rather than of this
app, so it is recorded here rather than demonstrated by a test.

`formState` is a Proxy. React Hook Form only starts maintaining a key once something has read it
**during render**, and `useFieldArray`'s `replace` checks that flag before recomputing dirty state
at all. Read from inside a submit handler, `dirtyFields` is still `{}` after a file import has
replaced every cylinder — so a filter keyed on it drops `mixtures`, and the import is discarded by a
save that reports success. Scalars set through `setValue(..., { shouldDirty: true })` are marked
either way, which is what made it so easy to miss: the notes field, the depths and the trip picker
all behaved, and only the one path through the field array silently didn't. The subscription is
`useFormState({ control })` **plus the destructuring**, in the render body; calling the hook alone
is not it.

`useSuggestedDiveNumber`, `dives/new/page.tsx` and `dive-form-fields.tsx` read react-hook-form's own
`isDirty` for unrelated UX ("don't overwrite what the diver typed") and are untouched by any of
this.

### What this closed that the filter could not

The filter left a residue, recorded here at the time: a dive linked to sites A (live) and B
(soft-deleted) seeded the form with `["A"]`, and a diver who added C sent `["A", "C"]` —
legitimately dirty, and the only list the browser had — destroying B's link on an edit where B was
never on screen. "There is no client-side fix" was correct: the browser cannot preserve a reference
it was never handed.

It is gone, and not by being fixed. There is no hidden reference left to lose, because a deleted
site is deleted and its join row went with it. The same applies to `gear_item_uuids`, which had the
same shape and was reachable only as a 422 from `resolve_gear_item_ids_for_user`.

The generalization that survives all of it belongs to the API and is stated there: **a read filter
is not a local change.** Hiding rows from a read reshaped two client repos, cost a form-level filter
and a shared `isDirty` helper, and still did not close the case it was introduced against.

## A deleted trip or dive site can hand its dives to another one on the way out

Deleting either used to leave its dives behind. The API soft-deletes the row, and every dive that
pointed at it now reads back with the reference simply gone — so the diver who noticed they had
logged the same reef under two names, or split one trip into two, got a confirmation dialog that
would strand every dive attached to the loser. Re-attaching them meant opening each dive's edit form
in turn. The confirmation now offers to move them, and the whole feature lives in that offer: same
button, same dialog, one dropdown that is always on screen.

**Moving and deleting are one request.** `DELETE /trip/{uuid}?move_dives_to={uuid}` re-points the
dives and deletes the trip in a single transaction: either the log ends up on the replacement and
this trip is gone, or nothing happened. There is no ordering for the browser to get right and no
half-done state for it to report.

That is worth stating because the browser-side version of this feature was written first, and it
could not offer either. It paged `GET /dives?trip_uuid=`, sent one `PATCH` per dive, then deleted —
which meant a failure partway left some dives moved and the trip standing, forty round trips for a
liveaboard, and a race against any dive added between the last page fetch and the delete. All three
are gone, along with the ~320 lines that implemented them. The lesson worth keeping is the
sequencing one: the client-side version was complete, reviewed and verified against a live stack
before it was deleted unmerged, because the API change it should have waited for was already
written. Check what the other repo is holding before building the compensating half.

### The dialog says what deleting does, and stopped asking whether to count

The first version of the offer was a checkbox — "Move 2 dives to another trip first" — that revealed
the picker when ticked. Getting that "2" on screen cost a request
(`GET /dives?trip_uuid=X&items_per_page=1`, read for `total_count`), a five-second timeout race
against a hang that `apiClient` sets no axios timeout for, a "couldn't check" failure state, and a
rule holding the Delete button shut until one of the three landed. Roughly 200 lines and one async
subsystem, in a dialog whose only decision was whether to show a dropdown.

All of it existed because the consequence of deleting was ambiguous, and it no longer is. The API
hides soft-deleted trips, dive sites and gear from every dive read — `get_trip_uuids_by_ids` and
`get_dive_sites_for_dive(s)` both filter `is_deleted` — so "deleting removes this trip from every
dive logged on it, and the dives themselves are not touched" is plainly true at any number of dives,
**including zero**. Once the dialog says that, the count has no job left: it was only ever there to
phrase the checkbox and to suppress a zero-dive offer, and both went with the checkbox.

So the picker is unconditional and its empty state is the "just delete it" option — no synthetic
"None" row, the same shape `TripCombobox` already uses for a dive with no trip.
`divesAPI.countDives` went with the rest; nothing else was calling it.

The general form, worth keeping: **a confirmation that has to ask the API a question before it can
word itself is a sign the wording is wrong.** A sentence that is true unconditionally needs no
request, no loading state, no failure state, and no disabled button — and the diver reads it a beat
sooner than the old dialog could even render.

### The toast names the destination, and the call site is where both halves are known

"Trip deleted successfully. Its dives moved to Cebu 2026." is assembled at the four `onConfirm` call
sites, from the name the dialog hands back beside the uuid. `useDeleteResource.confirmDelete` takes
an optional `successOverride` for exactly this — a message only the caller can write, for the one
call it is written for.

It used to be harder, and the shape it used to have is instructive. The sentence was "12 dives moved
to Cebu 2026", and its two halves came from opposite sides of a round trip: the count from the API's
`moved_dives`, which only `useDeleteResource` saw, and the name from the picker, which only the
diver's click saw. A whole hook — `useDeleteWithReassign`, 82 lines plus 166 of tests — existed to
smuggle the name across in a map keyed by the id being deleted, keyed rather than held singly
because two rows of a list can be deleted at once and their responses need not come back in order.

Dropping the number from the sentence dissolved all of that: the name is known synchronously at
confirm time, so there is nothing to carry and nothing to key. The concurrency hazard the map
existed to avoid cannot arise, because no state outlives the call.

Three things went with it, in the same change rather than left as follow-ups. `moved_dives` and its
`DeletedWithMovedDives` type are gone from `lib/api/client.ts`, and both deletes are typed
`{ message: string }` like every other delete on the API. Nothing here reads a delete response any
more, so whatever the API puts in one, this side is indifferent to it. Its test in
`delete-with-move.test.ts` went too, and that one had to be removed deliberately: it asserted
against a _mocked_ axios response, so it would have kept passing long after the field stopped
existing, which is the failure mode of every test that mocks the thing it is checking. And
`successMessage`'s function form — `(result, id) => string`, whose only caller was the deleted hook
— is gone from `useDeleteResource`, along with the `TResult` generic that existed to type its first
argument. A response nobody reads does not need a shape, and a hook that reads no response does not
need to be generic over one.

### The confirm button reports only its own delete

`isDeleting` was briefly wired to `deletingId !== null`, which is true while _any_ row is being
deleted - so deleting one trip and then opening the dialog for another showed the second one
disabled, spinner and all, for a request that had nothing to do with it. `deletingId === pendingId`
is the scoped version. The dialog is closed for the duration of its own delete anyway, since
`confirmDelete` clears `pendingId` before it starts.

`deletingId` in `useDeleteResource` is still a single value across all seven call sites: starting a
second delete overwrites it, so the first row's spinner stops and its trash button comes back while
its request is still out. Left alone deliberately. The cost is cosmetic and the worst case is
bounded — firing the same delete twice gets two success toasts, because both routes are idempotent.
The fix is a `Set<string>` and an `isDeleting(id)` helper across every caller, which is a wider
change than the symptom justifies. Written down rather than left for the next person to rediscover.

### The picker, and what it deliberately does not do

It excludes the resource being deleted, which is the one choice that cannot work — and the API
answers that choice with a 422 rather than a silent no-op, so leaving it in the list would be
offering an error.

It is a bare `CreatableCombobox` rather than `TripCombobox`/`DiveSiteMultiSelect`: those carry
name-lookup machinery for a uuid handed to them by a form, and this field only ever holds something
the diver just picked out of its own menu. It offers no "Add new..." either — a brand-new empty trip
is not what "move these somewhere" means, and the create dialogs are one page away.

`ConfirmDialog`'s `children` slot is what keeps this a single dialog instead of a second one layered
on top, and its `confirmDisabled` — separate from `isLoading` on purpose, because an unfinished
choice must still be cancellable — is what blocks Delete while the field holds something that is not
yet an answer. Which is the next section.

The title and description live in the component's own `COPY` table beside the placeholders and the
search functions, rather than arriving as props. They are kind-specific wording, the four pages had
no say in them, and passing them in meant `useDeleteResource`'s `confirmMessage` was being threaded
through two files to reach a `DialogDescription`. `confirmMessage` is optional on the hook now, and
these two callers omit it.

### An empty picker is an answer; a half-typed one is not

Dropping the checkbox took `confirmDisabled` with it, and that was one step too far. The offer is a
`CreatableCombobox`, and it has three states, not two: nothing typed, something _chosen_, and text
in the field that has not resolved to either. The third one is where the diver is while they type.

`handleInputChange` clears the selection on every keystroke and re-fills it only on an **exact**
match, so "Ceb" with "Cebu 2026" sitting in the open menu leaves the dialog's `replacement`
`undefined`. Clicking Delete from there blurs the field first, and the blur commit (`commitAction`)
resolves a prefix to `{ type: "clear" }` — it only ever selects on an exact match, and this caller
passes no `onCreate` for it to fall through to. So the confirm fired the plain `onConfirm()`: the
trip deleted, the move silently dropped, and the only tell was a toast missing its second sentence.
Neither half is undoable from the UI.

It is blocked rather than guessed at. A prefix can match several trips, and resolving it on the
diver's behalf would move a log somewhere they did not choose — a worse failure than the one being
fixed, and a silent one too. An _empty_ field stays a valid answer, because that is the plain delete
this dialog replaced; a disabled Delete gets a line saying which of the two to do, since a disabled
button with no explanation reads as broken rather than as waiting.

Knowing about the third state costs the shared component one optional prop: `onTextChange`, reported
from an effect on `inputValue` rather than beside each of the six places that write it. `value`
cannot answer this from outside — typing clears it, so a diver mid-word and a diver who chose
nothing are indistinguishable. Tracking the query through this dialog's own `onSearch` wrapper
looked like the way to avoid the prop and is not: that call is debounced by 250 ms, so a fast click
lands while the tracked text is still the previous one, and the guard is off exactly when the diver
is quickest.

**A disabled button is not a guard on its own, and this one nearly wasn't.** Disabling it is
`disabled:pointer-events-none` in the shared `Button`, so a press over it never reaches the button —
it lands on the `DialogFooter` behind, and the _default action_ of that press moves focus, blurring
the picker. The blur clears the unresolved text, `onTextChange("")` flips `unresolved` to `false`,
and the button is enabled again — while the same gesture is still in progress. `disabled` is re-read
at each event's own dispatch rather than latched at `mousedown`, so the `click` that follows lands
on a button that was blocked when the press began. One gesture, erasing the text and confirming on
the way past: the exact bug the guard was added for, now reachable _through_ the guard.

The fix is one `onMouseDown={(event) => event.preventDefault()}` on `DialogFooter` in
`ConfirmDialog` — the same thing `CreatableCombobox` does on its own menu rows, and for the same
reason. It suppresses only the focus change and text selection; clicks are untouched. A press can no
longer quietly re-qualify itself.

Verified with a real mouse in a real browser rather than in jsdom, because jsdom does not perform
that default focus change at all — the bug is invisible there, and so is the fix.
`confirm-dialog.render.test.tsx` pins the only part that _is_ observable in jsdom: that the footer
calls `preventDefault` on a press.

The general form, twice over: **removing a disabled-button rule is safe only when the states it
covered are gone** — the count went, the checkbox went, and "asked for a move without finishing it"
quietly stayed, wearing different clothes. And **a guard whose input the guarded gesture can change
is not a guard.** Ask what the click itself does on its way in.

### The confirmation focuses Cancel, because its `children` may open a menu

Radix focuses the first tabbable descendant of `DialogContent` on open. That was harmless while a
`ConfirmDialog` held only prose and two buttons — focus landed on Cancel, which is where it belongs
for a destructive confirmation. Putting an always-rendered field in the `children` slot changed it:
the field is now first, `CreatableCombobox` opens its menu `onFocus`, and the menu is
`absolute z-50`, so it does not push the footer down — it paints over it.

Every trip and dive-site delete confirmation therefore opened with a list of trips covering its own
Cancel and Delete buttons. A click aimed at Delete hit an option, which filled in a destination the
diver never chose and closed the menu — so the _next_ click deleted and moved every dive onto it. It
also fired a `getTrips`/`getDiveSites` search on every confirmation, including the plain deletes
that never wanted one.

`onOpenAutoFocus` with a `preventDefault` and an explicit `cancelRef.current?.focus()` puts it back.
Cancel is both where focus used to go and the right answer on its own terms: Enter should not be the
destructive key.

Worth generalising, because the trap is in the composition rather than in either piece. **A slot
component inherits the focus behaviour of whatever it is given**, and a control that reacts to focus
by opening an overlay turns "first tabbable" into "covers the buttons". `ConfirmDialog` now names
its own focus target instead of letting the tallest thing in the room take it.

### `excludeIds` hides a row; it does not make the item unpickable

The replacement picker has to keep the trip being deleted out of its own options, and
`CreatableCombobox` has a prop that looks like exactly that. It isn't. `excludeIds` is applied in
`visibleItems`, which builds the _rendered menu_ - while the exact-match paths (`findExactMatch` on
every keystroke, `commitAction` on blur or Enter) read the unfiltered result list.

So the row was gone and the item was still pickable by name. Typing "Blue Hole" while deleting one
of two dive sites called "Blue Hole" resolved to the one being deleted, lit up Delete, and sent
`move_dives_to` equal to the uuid in the path - which the API answers with "A dive site cannot be
moved onto itself." Two sites sharing a name is not a corner case here; it is the duplicate-merge
this feature exists for.

The fix is to filter in this dialog's own `search` wrapper, so the target never enters the result
list, the exact-match lookup, or the map of seen options. `excludeIds` then has nothing left to do
and is gone from the call.

The other repair - teaching `CreatableCombobox`'s exact-match paths about `excludeIds` - would cover
every future single-select consumer, and was not done. Its only two existing consumers are
append-only multi-selects whose `keepOpenOnSelect` branch never reaches the blur commit, so the
change would be all risk and no current benefit. If a second single-select ever passes `excludeIds`,
that is the moment to move the fix down into the component; the test here
(`will not resolve a typed name to the target itself`) is what will catch it if nobody does.

### Per-target state resets during render, not in an effect

The chosen replacement belongs to the trip it was picked for, and has to be gone when the dialog
opens on another — otherwise confirming would send the old trip's destination for the new one's
dives. Doing that in an effect means the dialog paints one frame of the previous answer first; doing
it in a `useLayoutEffect` avoids the frame but trips `react-hooks/set-state-in-effect`, which is an
error here and is right to be.

The fix is React's own
[adjusting state when a prop changes](https://react.dev/learn/you-might-not-need-an-effect): compare
the target against the one the last render was for, and reset during render when they differ. React
re-runs the component immediately, before anything reaches the screen.

One thing had to go to make that legal: the map of options the picker has seen is a ref, and
touching a ref during render is its own lint error — correctly. It is no longer cleared at all,
which turns out to be safe rather than merely tolerable. An entry is only ever read for an id the
_current_ menu just offered, and offering it means the search that produced it has already written a
fresh entry under that id, so the leftovers are unreachable rather than stale.

## A gear set's members are sent on every save, like a trip's locations

`PATCH /gear-set` treats an absent `gear_item_uuids` as "leave the members alone" and any present
one — `[]` included — as a wholesale replace: `replace_gear_items_for_set` deletes every
`gear_set_item` row and reinserts the submitted list. `GearSetDialog` sends the key on all three of
its flows, so that guard is once again never exercised from this client.

It was briefly filtered, and the reason is the gear half of "The edit form submits the whole dive,
because the read is the whole dive". While the API soft-deleted gear items and hid them from a set
read, a set holding a deleted item seeded the picker one entry short, and pressing Save on a
_rename_ — or a weight change, or nothing at all — replaced the membership with the shortened list
and destroyed the hidden row. The dialog subscribed to `dirtyFields` and omitted `gear_item_uuids`
unless the picker had been touched.

Gear items are hard-deleted now, `gear_set_item.gear_item_id` is `ON DELETE CASCADE`, and a set read
carries every member the set has. The picker shows the whole set, so echoing it back replaces the
membership with itself — and the filter, its shared `isDirty` helper (`lib/form-dirty.ts`, deleted
along with `buildDiveUpdate`'s use of it) and the three-way `replacesItems` expression all go with
it.

### Why `TripDialog`'s argument now applies here too

"Locations are always sent on edit, never omitted" reached the opposite conclusion about a field the
API replaces the same way, and while gear was being hidden the two genuinely differed: that argument
rests on the form knowing the whole set, and the gear dialog did not — that was the entire bug.

Both halves hold now. The form knows the whole set, and `[]` is expressible and means what it says:
the diver emptied the picker. There is no state left in which an empty or short list means "the API
hid the rest", which is the property `TripDialog` always had for free by having nothing hidden from
it. Two fields, one rule.

### The three flows no longer need telling apart

`replacesItems` was `!gearSet || isDirty(dirtyFields.gear_item_uuids)` because `dirtyFields` was the
right question for exactly one of the dialog's three flows, and would have quietly turned the other
two into renames. Editing a set on the gear page, creating a set, and saving a dive's gear over an
existing set now all send the list; the two that arrive via `reset` rather than the picker
(`initialItemUuids`, and the set's own read) are no longer distinguishable from a diver's edit, and
no longer need to be. `gear-set-dialog.render.test.tsx` still covers all three, asserting what each
one sends rather than which one omits.

### What this closed that the filter could not

The same residue the dive form had, and gone for the same reason. A set holding a live item and a
soft-deleted one seeded the picker with just the live one; a diver who added a third sent two uuids
and destroyed the hidden row on an edit where they never saw it. The browser could not send back a
uuid it was never handed. There is no hidden membership row left to lose.

### The API's docstring was true, then wasn't, and is true again

`get_gear_items_for_set` documents that a rename or weight change leaves the membership rows alone.
It describes the API accurately and has never described the system: no client exercised the
absent-key path before the filter, and none does after it. Worth saying on the API side — a guard
that reads as load-bearing while nothing reaches it is the same shape as the 422 from
`resolve_trip_id_for_user` that was quietly holding a class of client bug up until it wasn't.

## The create form proposes no cylinder, and the last one is removable

`dives/new/page.tsx` seeded `mixtures: [{ ...DEFAULT_MIXTURE }]` in `defaultValues` and again in
`prefillFromLastDive`'s fallback, `mixture-fields.tsx` gated its remove button on `index > 0`, and
`onSubmit` sends `normalizeMixtures(data.mixtures ?? [])` unconditionally. Each is defensible alone.
Together they made "this dive records no gas" unreachable: a diver who never opened the gas card
still logged an 11.1 L cylinder of air, tank 1 had no way off the form, and the next dive's prefill
carried the phantom forward.

The state they made unreachable is one the API supports outright - `DiveCreate.mixtures` is
`default_factory=list` - and one this app's own code already expected to meet:
`dive-mixtures-card.tsx` says it "renders nothing when the dive has none, which is the common case
for a dive logged by hand", describing something the web app could not produce.

**Why a proposal is not the same as a default elsewhere on this form.** A create form proposing
sensible starting values is ordinary, and `plans/hard-delete-instead-of-hiding.md` drew the line at
the edit form for exactly that reason. Gas is the exception, on one ground: `diveModWarning`
computes a MOD from whatever cylinders the form holds, so a hand-logged dive past ~56.7 m raised an
oxygen-exposure warning about air the diver never entered. A safety warning derived from invented
data is the worst kind of wrong - it is either believed, or it trains the diver to ignore the real
ones. Nothing else this form pre-fills carries a consequence like that.

`DEFAULT_MIXTURE` itself stays. It is the right proposal for the "Add Mixture" button and for the
pressure/role placeholders; the only question was whether one is present before the diver asks for
one. The convenience argument for the seed survives too, in the place it was actually doing work:
`prefillFromLastDive` still copies the previous dive's cylinders, so a diver who logs gas gets it
back. What it no longer does is invent one when the previous dive had none.

**The remove button lost its `index > 0` gate**, which is required rather than cosmetic: without it
a diver who clicks "Add Mixture" on an empty form can never get back to zero and reintroduces the
fabrication by hand. It also fixes the same thing on the edit form, where no dive's cylinders could
be cleared at all even though `DiveUpdate.mixtures` accepts an empty list.
`plans/hard-delete-instead-of-hiding.md` PR 2 carries the same change - whichever lands first, the
other should not redo it. The button gained an `aria-label` naming its tank while it was being
touched: the icon is the whole button, and one per tank with no accessible name reads as a row of
identical "button"s.

**`[]` on the wire, not an omitted key.** The submit path already sent whatever the field held, so
`mixtures: []` reaches the body as a real value rather than an absent one. On create the two amount
to the same thing - `DiveCreate.mixtures` is `default_factory=list`, so an omitted key is also an
empty list - but the explicit one is what the form sends and what was checked against a live
`POST /dive`: 201, and the dive reads back with `mixtures: []` at 60 m, the depth that used to raise
the phantom warning. The distinction only bites on the edit form's `PATCH`, where present-and-empty
replaces and absent leaves alone; that is `plans/hard-delete-instead-of-hiding.md`'s territory.

**Tested at the page, not just at the component.** The seeding lives in `defaultValues` and in the
prefill's `form.reset`, and neither is reachable from a unit test - so
`app/dives/new/page.render.test.tsx` renders the real page with the API stubbed and asserts what
`createDive` is called with: `[]` for an untouched gas card, `[]` again after adding and removing a
cylinder, and the cylinder itself when the diver enters one. Six of its eight cases fail against the
old seed, which is the property that makes it worth its weight.

## A dive-level select carries the same three states, and the two submit paths disagree about the third

`water_type` is the first `<select>` on the dive form that is not inside a mixture row, and it
inherits the whole `""`/`null`/`undefined` tri-state the cylinder `role` field already carries - see
"The 'cleared field resets to default' React Hook Form quirk" and "The API sends `null`, the form
schema only understood `""`". Restated for a dive-level field, because the boundaries it crosses are
different ones:

- **`""` is the live cleared state**, the value of the "Not recorded" option, and it is what
  `diveToFormValues` seeds from an unrecorded `null`. Never `undefined`: react-hook-form re-displays
  a field's default whenever the value resolves to that, so clearing an imported water type would
  snap it straight back.
- **`undefined` means "the diver never touched this"** and is dropped from a PATCH.
- **`null` means "the diver cleared it"** and must be sent.

The part that is genuinely new, and the reason this is a section rather than a line: **the two
submit paths convert `""` differently, and both are right.** `buildDiveUpdate` turns it into an
explicit `null`, because on the edit form the dive may already hold a water type and dropping the
key would leave it there while the toast says otherwise - the `trip_uuid` bug, one field over. The
create page omits the field instead, because there is nothing to clear on a dive that does not exist
yet; `trip_uuid` makes the same collapse in the same place for the same reason. What neither may do
is send the `""` itself: the API's `WaterType` is a `StrEnum` and `DiveCreate` is `extra="forbid"`,
so an empty string is a 422 rather than a no-op.

Two smaller things worth not re-deriving:

- **The altitude box is not a copy of the Visibility box**, though it is styled as one. Visibility
  is `min="0"`; altitude is `min="-450" max="6500"`, mirroring the API's `ck_dive_altitude_range`.
  Copying the `min="0"` would fight the negative values the bound exists to admit - the Dead Sea is
  ~430 m below sea level and is a real dive site.
- **Both fields carry over from the last dive**, decided rather than inherited by omission. The
  create page's prefill is an explicit per-field policy, and the argument the weight carry-over
  already makes - consecutive dives, same configuration - holds at least as strongly for "the same
  water at the same elevation". `bottom_temperature` sits right beside them on the form and
  deliberately does not carry: it is a reading taken on the day, not a property of the place.

## A start pressure of 0 is not a low reading, it is a missing one

`diveMixtureSchema` has always rejected a non-positive `start_pressure` and always accepted a
`end_pressure` of 0, and the inconsistency between two adjacent boxes reads as an oversight until it
is written down. It isn't one, and the reason is a single sentence of diving: **you cannot start a
dive on an empty cylinder, but you can finish one on an empty cylinder.** A regulator's first stage
needs supply above ambient and ambient at the shallowest point of any dive is already 1 bar, so
there is no dive whose first breath came from a cylinder reading 0. An out-of-gas ascent, a drained
stage or bailout and an SPG pegged at zero are, by contrast, all things that happen and are worth
logging honestly. So the domains are `start_pressure ∈ (0, 350]` and
`end_pressure ∈ [0, start_pressure]`, each also admitting the blank box.

What changed here is not the rule but the **message**, which is where the user-visible half of this
lives. _"Start pressure must be positive"_ was accurate and useless: it named the constraint and
left the diver to guess the way out. The one thing a diver will not guess is that **blank means
unknown** - so the message says it, and it is the escape hatch for anyone who ever does meet a
stored 0.

The `max(350)` is new, and mirrors the API's `gt=0, le=350` and the `ck_dive_mixture_*_range` checks
that ship alongside it. Framed like `po2_limit`'s band: it exists to catch a **unit error**, not to
have an opinion about how hard someone fills a cylinder. 350 sits above any real 300 bar DIN fill,
so what it can reject is a psi reading typed into a bar box, the millibar-for-bar error the DM5 XML
parser once shipped (`start_pressure ~ 205203`), and a sidemount pair whose two pressures were
summed as if they were one cylinder - the last of which is the interesting one, because every
individual number in it was positive, correctly ordered, and inside every other constraint the table
had. Only an upper bound could catch it.

**The ceiling sits on both fields, and the `end <= start` rule is not a substitute for the end
one.** That refinement returns early when the start box is blank, so a lone `end_pressure` would
otherwise be bounded only from below - and a psi reading typed into an end box with no start beside
it is exactly the shape this band exists to catch. Left off, it would reach the API and come back a
422 toast rather than a message under the field, which is the failure this change was written to
remove.

**`toDiveMixtureInput`'s `??` stays a `??`.** Coercing a stored `0` to `""` on the way into the form
was considered and rejected: it would silently repair exactly the data the API-side bound makes
impossible, and on the day a 0 did arrive - from a database an `ALTER` never reached - it would hide
it rather than show the diver a field with a message telling them what to do. The API's read schema
stays unbounded for the same reason: the fallback has to be a legible form error, not a 500 that
makes the dive unviewable.

**The tests assert the message string, not `success: false`.** The message is the deliverable, and a
`toBe(false)` would stay green through a rewrite that made it useless again. `dive.render.test.tsx`
grows a second harness for this: unlike the round-trip one it renders the real `MixtureFields`, so a
rejected value reaches its own `<FormMessage />` the way it does on the page. They are deliberately
separate - with every cylinder input mounted, a `replace()` of a partial row leaves the omitted
fields' old values in place, which is the page's real behaviour but not what the round-trip tests
are pinning.

## Units convert at the edges: metric state, one formatter module

Every measurement the app stores, sends, caches and exports is metric, and stays metric. What the
`units` preference on the user row changes is _display and entry only_, at exactly two places: the
formatters in `lib/units.ts` and the `UnitNumberInput` built on them. The rest of the app never
learns which system the diver picked.

**Form state is metric, whatever the box says.** `UnitNumberInput` renders feet and commits metres.
That single choice is what keeps the rest unit-blind: the live MOD/END/EAD maths in
`lib/dive-mixtures.ts` reads form values directly and its `METERS_PER_BAR = 10` is a fact about
water rather than a display choice; `prefillFromLastDive` copies numbers between dives; the
import-apply path writes parsed file values straight in. None of them changed. Neither did any
validation logic - `lib/validations/dive.ts` validates the same metres it always did, and the only
Zod edits in this work are message strings.

The rejected alternative was form state in display units. It would have pushed unit-awareness
through safety-adjacent gas maths, required per-system Zod schema factories (the bounds mirror DB
`CHECK`s written in metres), and multiplied the places a conversion can be forgotten. A conversion
can only be forgotten somewhere that has to remember it, and this design leaves two such places.

**Whole imperial units are what makes entry stable.** 98 ft is 29.8704 m, committed as 29.87 and
re-rendered as 98 ft, because `toCommittedMetric` inverts the conversion _before_ it rounds. A 2 dp
metric commit is off by at most 0.005 of a unit, which is far under half an imperial display unit
for every dimension here - 75 °F round-trips through 23.89, 3000 psi through 206.84. `units.test.ts`
walks every whole imperial value across each dimension's plausible range rather than spot-checking,
because the guarantee is the design and a counterexample is a bug in it.

**Metric entry now rounds to two decimals, and that is the one deliberate metric-side change.** It
generalizes what the temperature box already did (`Math.round(val * 100) / 100`) to its float
siblings, and it is invisible for anything typed at the field's own `step`.

**`visibility` and `altitude` lose something, on purpose.** Both are `Integer` columns, so imperial
entry commits whole metres: 50 ft becomes 15 m and reads back as 49 ft. Widening them to `Float` was
considered and rejected - whole-metre resolution is the recorded entry convention (`.int()`,
`step=1`), visibility is an estimate, and altitude is bucketed into 300 m bands by the computers
that care about it. Common values survive anyway (1,220 ft ↔ 372 m), and the loss is pinned by a
test in both `units.test.ts` and `unit-number-input.render.test.tsx` so it cannot quietly become
something worse.

**The box keeps a draft of what is being typed, and the reason is not the obvious one.** A
`<input type="number">` sanitizes its own value - a lone `-` or a trailing `.` arrives as `""`
whatever state we keep - so the draft is not what makes those typeable. What it prevents is the
_committed_ value being written back under the cursor on every keystroke: 50 ft commits 15 m, and 15
m is 49 ft, so the "0" of "50" would turn into a "9" as it was typed. The same happens in metric the
moment entry rounding bites. The correction belongs on blur.

**Native `min`/`max` are declared in metres and converted inward.** The schema and the DB `CHECK`
behind it are written in metric, so callers keep declaring them that way and `displayBound` rounds a
minimum up and a maximum down: -450 m becomes -1476 ft (which is -449.9 m back), never the -1477 ft
that would be -450.2 m. The spinner must never offer a value the schema rejects.

**Bounded messages name both systems, computed rather than typed.** An imperial diver who enters
5,500 psi has it stored as ~379 bar and would otherwise be told about a bar ceiling they never
typed, so the pressure and altitude bound messages carry both figures. They are one static string
each, not a per-system factory - the schema stays unaware of the preference, and the rare violation
reads correctly in either mode. The imperial figures are derived from `PSI_PER_BAR` and
`displayBound` at module load rather than written out, because a hand-typed 5,076 is a second place
for the number to be wrong. Two adjacent metric-worded layers stay deliberately: altitude's
`.int("…whole number of meters")`, which imperial entry cannot reach because the box commits whole
metres itself, and the API's own constraint messages, which only direct API callers see and which
speak metric by contract.

**Deliberately not converted.** ppO₂ (`po2_limit`) and `surface_pressure_bar` are bar in both
systems, as they are on every dive computer. O₂/He percentages, CNS/OTU, coordinates and duration
have no imperial counterpart. **Tank volume is the interesting one**: litres is a cylinder's _water
capacity_ while cubic feet is the _gas it holds at a rated pressure_ - converting between them needs
a rated-working-pressure column the mixture does not have (cuft = litres × rated bar × expansion),
so a conversion factor here would be fake maths. Imperial mode only relabels the presets, leading
with the cu-ft name a diver already uses: "11.1 L (S80)" becomes "S80 (11.1 L)". Adding that column
is the revisit point.

**Spacing and precision were unified as a side effect, and both were previously inconsistent.**
Display sites split between `{v}m` and `{v} m` - the Environment sidebar rendered both, two cards
apart - and max depth appeared at three different precisions on three screens. Everything now goes
through `formatDepth` and its siblings: value, separator, unit, with the separator a property of the
dimension so degrees attach (`24°C`) and nothing else does. The profile chart's crosshair was the
app's one _spaced_ degree symbol and now matches. Metric renders at up to two decimals with trailing
zeros trimmed, which leaves every API-recorded value untouched and changes exactly two things:
imported values carrying more decimals (`18.288` → `18.29 m`) and the corpus's float noise
(`28.000000000000004` → `28 m`). Both align display with the API's recorded precision. Sites that
genuinely want a coarser metric figure - the Recent Dives row's whole metres, the MOD/END/EAD
strings' one decimal, the gas card's period-average RMV - pass `{ decimals }`, which tunes the
**metric** side only: a whole foot is already finer than a tenth of a metre, and a hundredth of a
cubic foot finer than a tenth of a litre, so there is nothing left to coarsen on the imperial side.

**The charts convert once, where the wire scale is divided out.** `PROFILE_CHANNELS[*].scale` is a
pair with `schemas/dive_profile.py` and describes how the API encodes an integer, not how a diver
reads one - folding a unit conversion into it would make this app's idea of a centimetre disagree
with the API's. So `toChannelSeries`/`toPressureSeries` divide by `scale` and _then_ convert, and
everything downstream - `niceDomain`, `axisTicks`, the crosshair, the accessible extremes - is
already in display units. That is what makes the axis land on round feet rather than round metres
rescaled, and it leaves no per-use conversion to forget. `GasUseChart` does the same with its one
RMV axis. **Depth and the deco ceiling share a dimension** in `CHANNEL_DIMENSION`, exactly as they
already share a `scale` and a domain: a shaded deco region converted by any other factor would drift
off the curve it bounds. The remembered-selection localStorage key does **not** bump - the channel
set is unchanged and only its labels moved.

**The accessible descriptions spell the units out.** "ft" read aloud is a word and "°C" is skipped
entirely, so `unitWord` carries a second vocabulary for them - "feet", "degrees Fahrenheit", "psi",
"cubic feet per minute" - and the chart summaries use it while the visible legend keeps the short
labels.

**Every component that renders a measurement now needs an `AuthProvider`.** `useUnits` reads
`useAuth`, which throws outside one. In the app that is always true (`AppShell` wraps everything),
but it made several render tests fail with an error about auth in a file that has nothing to do with
auth. They each mock `@/contexts/AuthContext` now; where a test wants to switch systems the mock
closes over a `vi.hoisted` box, since `vi.mock`'s factory is hoisted above the file and cannot see
an ordinary `let`.

**Metric is the default everywhere.** `useUnits` falls back to it when `user` has not loaded, which
is also the column's server default and so the right answer for every existing row.

## The trip form's map is always on screen, and its fields are asked in a different order

`TripDialog` used to gate the confirmation map on `mappedLocations.length > 0`, which also kept the
map's chunk unfetched until there was something in it to see. It now renders unconditionally, with
`showWhenEmpty` - a new opt-in prop on `LocationsMap` - drawing the whole world until the first
place is picked. Two reasons, and the second is the one that decided it: a frame that appears with
the first place shoves everything below it down the dialog while the diver is mid-edit, and an empty
map makes it obvious that the field above it is asking for somewhere on a map at all, rather than
for free text. The dive site form has always worked this way (`DiveSiteMapField` renders `MapPicker`
whether or not the site has a pin), so this is the two forms agreeing rather than a new idea.

`showWhenEmpty` is **opt-in, not the new default**. Everywhere else the map answers "where is
this?", and there an empty world is a worse answer than no map at all - the trips list, a trip's own
page and a dive's sidebar all still gate on having something to draw, which is also what keeps them
from fetching the chunk. What changes for the empty frame is the label:
`Map of the trip's locations` over a blank world is wrong in exactly the place nobody looking at the
screen can see it, so the aria-label becomes `Map of the world, awaiting ${subject}`. That is a
third reading of `subject`, which until now was only the fallback for places with no usable names
between them; the phrasing works for all three subjects in use because each is already a definite
noun phrase ("the trip's locations", "the dive site", "the dive's location").

The empty view itself is `WORLD_CENTER` at `MIN_ZOOM`, and `WORLD_CENTER` is new only in the sense
that it was already there twice: `MapPicker`'s `DEFAULT_VIEW` and `fitBounds`'s answer to an empty
box list. Those two disagreed - the picker opened at 20°N, "where the land and most of the world's
diving is", while `fitBounds` returned the equator - and nothing noticed, because until now the only
caller of `fitBounds` with no boxes rendered `null` and threw the view away. Hoisting the constant
into `lib/map-tiles.ts` and having both read it is what makes "like the dive site form" true by
construction rather than by two matching literals.

**The field order changed with it**: name, then the dates, then the place and its map, then notes.
The dates are what a diver knows without thinking; the place is picked from a search whose answer is
the map, so the two belong together, and putting them last-but-one keeps the block that grows -
twenty location rows and a map frame - away from the fields above it.

One consequence outside the component: `/privacy` said that apart from the dive site form, "a page
with nothing to show loads no map and contacts nobody". The trip form now loads one too, so that
paragraph names both forms. A privacy page that is stale is worse than one that is vague.

## A location's full label is trimmed of the name it sits beside, at render time

Nominatim's `display_name` opens with the name it matched, and every surface that has room for the
label shows the name first and the label after it. So the picker's rows, its menu hints and a trip
page's location list all read "Dahab, Dahab, South Sinai, 45214, Egypt" and "Ko Tao, Ko Tao, Ko
Pha-ngan District, Surat Thani Province, Thailand". `formatLocationContext` in
`lib/trip-locations.ts` drops the leading parts of the label that the name itself repeats, and
returns `undefined` when that leaves nothing - so a caller drops the element with `&&` rather than
rendering an empty one.

**Aligned part by part, never as a substring.** "Dahab" is a duplicate at the front of "Dahab, South
Sinai" and a genuine piece of context in "Blue Hole, Dahab, South Sinai" - a `startsWith` on the
whole string gets the first right and the second wrong, and a "does the label contain the name"
check gets both wrong. Comparing whole comma-separated parts also stops "Ko Tao" from eating the
front of "Ko Tao Island".

**At render, not in `geocodeResultToLocation`.** Trimming on the way in would have been one line and
is wrong twice over. `display_name` is stored on the trip's location rows, so every already-saved
trip would keep its untrimmed label and only new picks would look right - the surfaces would
disagree with each other by age of data. Worse, `locationKey` derives a row's identity from the
position plus that label: a location saved before the change and the same place picked again after
it would key differently, and the picker's "already in the list" check would let the duplicate
through. Trimming at the point of display leaves identity, storage and the API contract untouched,
and fixes old rows and new ones in the same breath.

The trim is deliberately not applied to the `title` attribute's _shape_ - the row's `title` is still
"name, context", because what an ellipsis hides is exactly the context that tells two places of the
same name apart. It is the same trimmed context, just with the name back in front of it, which is
what the row would read if it had the width.

## The geocoder's attribution is a wire format, not display copy

`GeocodeResult.attribution` used to arrive as prose with a bare URL on the end -
`Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright` - and both places that show
it printed it. The API now folds that trailing URL into the one markdown shape `parseAttribution`
reads, `[label](href)`, which is the same shape `DEFAULT_TILE_ATTRIBUTION` has always used. So the
string is part of the contract rather than free text, and the client parses it: printed raw, a diver
reads `[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)` under the place
picker and again under the dive site map.

**The client change is safe in either merge order**, which is the only reason it could be made
without coordinating two repos in one sitting. `parseAttribution` on a string with no markdown in it
returns a single text run, so an unmigrated API renders exactly as it did before, and a migrated one
renders a link. Nothing has to land first.

Two measurements drove the fold, both taken in the browser at the 10px the credit is drawn at. The
old string needed **341px** and a 375px phone leaves the dialog **325px**, so it wrapped to two
lines, and the literal URL was **118px** of that; the linked label needs **223px** and fits with
room to spare. The second reason is better than the first: a URL printed as characters cannot be
followed, and the OSMF guidelines ask that there be a way to reach the origin and licence
information, "for example by making the text a clickable link".

`Attribution` (`components/attribution.tsx`) was extracted at the **fourth** copy of the same
render-the-parts loop, not the second. Both maps had written it out by hand and neither was wrong
to; what tipped it was the two geocoder credits needing the identical thing, plus the fact that the
loop is the enforcement point for `react/no-danger` - the value comes from an environment variable
or from whatever `GEOCODER_URL` answers, and a credit line is exactly the sort of "it's only markup"
HTML that gets waved through. It renders inline elements and no styling: the four frames around it
(a chip over a map corner, a line of fine print under a field) agree on nothing but what the string
means.

## The place-search credit holds its line open, and does not chase the dropdown

The picker's credit is rendered from the first search that returns results, and the menu -
`absolute z-50`, up to `max-h-60` - covers it. Measured with a one-row menu open: the credit at y
335-367, the listbox at 331-369, and `document.elementFromPoint` at the credit's own midpoint
returning the menu option. It therefore looks like it appears only after a place is added, which is
when the menu finally closes.

**That is not a licence problem, and a footer inside the dropdown was the wrong fix.** The OSMF
attribution guidelines say, under _Geocoding (search)_: "Geocoders that use OpenStreetMap data must
credit OpenStreetMap. Applications that incorporate such a geocoder must credit OpenStreetMap. A
group of geocoding results need not maintain attribution attached to the results, as long as it does
not form a Derivative Database." The obligation is on the application, once; the carve-out is about
not having to glue a credit to each result as it flows through. So the menu rows never needed one,
and putting a sticky footer in `CreatableCombobox` would have bought compliance we already had, at
the price of: `scrollIntoView({ block: "nearest" })` parking the last option under an overlay it
knows nothing about, an anchor inside `role="listbox"` - the mistake `locations-map.tsx` documents
avoiding for `role="img"` - a link racing the blur that closes the menu, and a new prop on a
component with six other consumers for a concern exactly one of them has.

What _was_ wrong is that the credit materialised. It grew the field and shoved the map, and the
Notes field under it, down the dialog mid-edit - reintroducing 16px lower the exact defect that
making the map unconditional had just removed. Its line is held open with `min-h-4` instead, so the
field never changes height. The cost is a blank 16px above the map when a saved trip is opened
without searching, which is the honest price of a field that does not move under the diver.

It is also sized to match the tile credit drawn over the map 8px below it, and lost its
`Place search:` label. The label was most of what made it wrap, and it was never load-bearing - each
credit names its own provider. **The two credits stay separate** rather than being merged into one
OSM line: tiles are configured by `NEXT_PUBLIC_MAP_TILE_URL`/`_ATTRIBUTION` and place names by the
API's `GEOCODER_URL`, so a self-hoster can be running two different providers, and one merged credit
would then be a false statement about one of them.

## Three roads to a position, so the geocoding moved above the map

The dive site form used to place a position one way, on the map, and `DiveSiteMapField` owned both
the map and the reverse geocode that named what it placed. There are three ways now — the pin, the
place search above it, and a coordinate pair pasted into the latitude/longitude inputs — and the
paste one never passes through the map at all. Only `DiveSiteDialog` can see all three, so the
lookup and every guard around it moved into `hooks/useGeocodedLocation.ts` and the field went back
to rendering: search, map, credit.

Nothing about the guards changed, and they are the reason the hook is 200 lines for what looks like
one `await`: newest-request-wins, the reply re-checked against the fields as they stand when it
arrives rather than as they stood when it was sent, `unknown` never clearing a field while
`nameless` does, and a nameless answer staying silent when there was nothing to clear. Their
reasoning is in "The map writes into the coordinate fields" above and has not moved with the code.

**Pasting a pair is placing the site**, which is the actual behaviour change and not merely a
refactor. A diver who copies `27.8506, 34.3136` off another map has done exactly what a diver
clicking the map has done, and until now was the only one of the two left to type the location out
by hand. Typing the coordinates in by digit still asks nothing — `useWatch` fires per keystroke, and
a lookup per keystroke is both useless and a fast way through an instance-wide rate limit of one
request a second.

**One thing the lift broke and had to be said out loud.** This state used to unmount with
`DialogContent`, so it was clean on every open; the dialog component itself is always mounted, so a
credit earned on the last site the dialog showed would sit waiting for the next site that happened
to share its coordinates. The hook takes `open` and resets on it, in an effect with the same
`react-hooks/set-state-in-effect` disable and for the same reason `useDialogApiError` carries one:
synchronising state to an external prop flipping is the case the rule's escape hatch is for. It also
bumps the request counter there, since a reply still in the air was asked about a form that no
longer exists.

## The dive site form searches for a place too, and the map shrank to make room

`PlaceSearch` is the trip picker's field with everything a trip needs taken out: no list, no
reordering, no free-text creation, and no value of its own. What is left is a search that hands back
one `GeocodeResult` whole, because the caller has three fields to fill from it rather than one — the
pair, and the name.

**It is the second way in, not the only one**, which is the whole difference from the trip form. A
trip location is a _name_ — a country, an island, a sea — so searching is all that form does. A dive
site is its exact point, and the geocoder knows where Dahab is, not where the Blue Hole's north
entry is. So the search drops the pin in the right bay and the map does the last hundred metres,
which is also why the search sits above the map rather than beside the Location field.

**It holds no value.** After a pick the box goes back to empty, because what was found is on the map
and in the Location field a moment later, both on screen — and a search box still naming a place
after the pin has been dragged off it would be the one thing on the form claiming something untrue.
Nothing is creatable either: the trip picker's Enter-to-add-as-text hatch exists because a trip
location that the geocoder cannot answer has nowhere else to go, whereas here the map is the hatch
and the Location field beside it is ordinary text.

**Holding no value is exactly why it needs `keepOpenOnSelect`, and that is not what the prop's name
says.** A `CreatableCombobox` without it is a single-select, and a single-select does two things
this field must not: `handleInputChange` picks on an exactly-typed name as you key it in, and
`commit()` picks the same match again on blur. Both are right where the input _is_ the value —
typing a trip's name into the trip picker is how you choose it without a mouse, and dropping the
text on blur would lose the edit. Neither holds here, where a pick writes two coordinate fields and
a Location and moves the map, and where the field is explicitly not the value.

It was caught in review and settled in the browser, because the two readings — "an unconsidered gap"
and "the documented single-select behaviour every other consumer inherits" — are indistinguishable
from the code. On a fresh form, with "Ko Tao" typed into the search and no row ever clicked,
blurring left the site at 10.0921822, 99.8395362 with a Location of "Ko Pha-ngan District,
Thailand". Clicking Save is a blur. So the next click would have filed a dive site at a place nobody
chose, and the general rule about single-selects is true and does not reach this field.

The prop costs one thing: the menu stays up after a pick, over the top of the map, until the next
click anywhere closes it. That is the cheaper end of the trade — a dropdown briefly covering the pin
is visible and one click from gone, and an unchosen position is neither. A deliberate Enter still
commits an exactly-typed name, so the keyboard route in survives; what goes is only the two ways it
happened by itself. Both are pinned by tests that fail with the prop removed.

**A searched place is not rounded, and the map's own picks are.** `MapPicker` rounds to five
decimals in `emit`, and has to: the value that comes back through the form must be identical to the
one that went out, or the echo arrives unrecognised. A searched place is an outside change either
way, so rounding would buy nothing there — and the trip form stores what the geocoder said, so
leaving it alone is what "like the trip form" means. It does mean the latitude field can read
`28.4963633` after a search and `28.49636` after a click, which is the honest price of two different
questions being answered.

**The credit line is `PlaceSearch`'s own, and does not merge with the one under the map.** They say
different things: this one credits the results that were _shown_, the other credits the name that
was _written into the field_. Both are the same provider today and need not be tomorrow, which is
the same argument the tile credit and the place credit already settle between them. Its line is held
open with `min-h-4` for the reason the trip picker's is — a credit that materialises with the first
search grows the field and shoves the map down the dialog mid-edit.

**The map is `h-40 sm:h-48` now, the same as `LocationsMap`.** Two maps in two forms disagreeing
about their height by 64px reads as an accident rather than a decision, and the search field plus
its credit had to come from somewhere. The picker's skeleton in `dive-site-map-field.tsx` duplicates
the new height and has to keep agreeing with it — a placeholder of a different size makes the dialog
jump when the chunk lands, which is the same duplication `locations-map-lazy.tsx` documents.

**`/privacy` said two things that stopped being true.** "Type or paste coordinates instead of using
the map and nothing is sent" — the paste half of that is exactly what changed. And a search sends
_what the diver types_, which is a different kind of data leaving than a coordinate pair and was
undisclosed for the trip form too, so §4.5 now covers both forms rather than describing half of one.
A privacy page that is stale is worse than one that is vague.

## The species picker resolves a pick into a catalog row before form state sees it

The species catalog is global — a species is a fact about the ocean, not about a diver — and it is
filled one pick at a time rather than bulk-imported (the licensing findings are in the API's
`DECISIONS.md`). So a search returns two kinds of row: species the catalog already holds, which
carry a `uuid`, and species that exist only upstream at WoRMS or Wikidata, which carry an `aphia_id`
and nothing else. Only the first kind is addable to a dive.

`SpeciesMultiSelect` closes that gap at **pick time**, not at save time. Picking an upstream row
calls `POST /species/resolve`, and the uuid that comes back is what goes into form state. The
alternative — putting a synthetic `aphia:278400` in `value` and resolving on submit — was rejected
for two reasons. It puts a value in the form that is not a uuid, which the submit path would have to
know about and every future reader of `species_uuids` would have to be told about; and it makes
saving a dive depend on a third party being reachable, which is exactly the property the dive write
path does not have anywhere else. Resolving at pick time means that by the time a dive is saved,
every uuid on it already exists locally.

What that costs is a moment where the diver has picked something the form does not yet hold, and the
**pending rows** are that moment made visible: local state, not form state, rendered with a spinner
and no drag handle, with their `aphia:` ids added to the combobox's `excludeIds` so the same species
can't be picked twice while its resolve is in flight. On success the row is dropped and the real
uuid appended; on failure it is dropped and a toast says so, leaving form state untouched. A diver
who never looks at the field sees an ordinary picker.

**A save has to wait for a pending resolve, and that is the one thing the pending rows could not
express on their own.** They are local state by design, so a diver who picks a species and hits Save
inside the second or two a cold resolve takes would have written the dive without the sighting — no
error, no toast, the pending row vanishing with the navigation and the late `appendUuid` landing on
a form that no longer exists. `SpeciesMultiSelect` therefore reports the state through
`onPendingChange`, `DiveFormCard` holds it, and `DiveFormActions` disables submit and says "Adding
species..." while it is set. Kept apart from `isSubmitting` because the save has not started, so the
button names what it is waiting for rather than claiming to be saving; a disabled submit button is
also what stops implicit submission (Enter in a text field), which is the other way a save could
outrun a resolve.

**Two resolves can be in flight at once**, and that is why `appendUuid` reads a ref rather than the
`value` prop. The combobox has `keepOpenOnSelect`, so a diver picks the second species while the
first is still resolving; `value` captured in the first pick's closure is the list as it stood
_before_ either, so whichever resolve landed second would append to it and drop the first. The ref
is claimed eagerly on append — not merely mirrored in an effect — because both can land before React
has re-rendered either. There is a test that fails if it reads the prop.

**No free-text hatch, unlike the trip location picker.** A global table has no owner to attribute a
made-up row to, and a per-user overlay is a different feature with a different ownership model. The
consequence is real and accepted: with both providers down and the species not yet in the catalog,
the picker comes up dry, and the diver logs the dive and adds the species later. The dive's own
`notes` field is where "weird translucent blob, 10 cm" goes meanwhile.

**Species are deliberately excluded from prefill-from-last-dive.** `app/dives/new/page.tsx` carries
the previous dive's gear, weight, water type and cylinders over, because those are properties of how
the diver is configured and where they are. Sightings are not: they are observations, and copying
yesterday's turtle into today's dive would fabricate a record of having seen it. The field is still
listed in the prefill's `form.reset` — that call enumerates every field, so one left out of it comes
back `undefined` rather than `[]`.

**The attribution line is a wire-format consumer**, the same as the geocoder's (see "The geocoder's
attribution is a wire format, not display copy"): the API sends the credit per result, the picker
dedupes what it has seen this session and renders it through `Attribution`. Its line is held open
with `min-h-4` for the reason the trip picker's is — a credit that materialises with the first
search would grow the field and shove Notes down the form mid-edit.

**Display names are English-only while the search index is multilingual.** `common_name` is a single
English name and is often `null`; `speciesDisplayName` falls back to the scientific name, which is
the normal case rather than an error path — WoRMS carries one vernacular for _Amphiprion ocellaris_
and it is Japanese. The API's search index keeps every vernacular it gets in every language,
so カクレクマノミ finds the clownfish; nothing in the UI ever shows it. That asymmetry is deliberate
and lasts until the app has an i18n story.

**A rank of `"unknown"` is not shown at all.** Most of the rank vocabulary is WoRMS's, passed
straight through, but `"unknown"` is not a rank — it is the API's placeholder for "no rank to
report", and it has **two** writers. `_wikidata_result` writes it for a Wikidata-only hit, which has
no WoRMS record behind it to take a taxonomy from; `_worms_taxon` writes it for a WoRMS record that
arrived without the field, because `rank` is `NOT NULL` and the API would rather store the sentinel
than refuse an otherwise good record. Rendered as-is, the picker read "Manta americana, unknown",
which sounds like a statement about the animal rather than about how much is known.
`speciesRankLabel` drops it alongside the blank, and both the picker hint and the detail card's
suffix go through it — a row with nothing else to add simply gets no hint.

**The second writer is the load-bearing half.** It is tempting to reason that resolve refuses to
invent a row without the authoritative record — which is true, it 503s — and conclude that anything
reaching the catalog therefore has a real rank, making the detail card's guard unreachable. It does
not follow: the authoritative record itself may omit `rank`, and the API stores `"unknown"` rather
than refusing. A catalog row can carry the sentinel, the detail card's `speciesNameWithRank` is a
live guard, and anyone who deletes it as dead code will be wrong. This paragraph exists because that
inference was written down here first and had to be corrected against `species_service.py` — a
Wikidata-only framing of the sentinel also misdirects anyone troubleshooting a rank-less row that
really did come from WoRMS.

**How much of a page carries it deliberately gets no number.** It is most of a typical page rather
than a rare edge case, but the proportion is not a property of the data: search answers with
whatever arrived inside its fan-out budget, so a slow minute at WoRMS leaves more of the page
Wikidata-only and therefore rank-less, and two consecutive searches for the same word legitimately
disagree. Two sessions measured 7-in-10 and 9-in-10 on the same query hours apart and both were
right, which is how the cause surfaced.

**Sightings are not restricted to species rank.** "A moray eel" is an honest log entry and resolves
to the family _Muraenidae_, so `speciesNameWithRank` appends the rank whenever it isn't "Species" —
a binomial is self-evidently a species, and "Muraenidae" alone would read as one.

### The Species Seen tile is back, because the number is real now

"The dashboard shows only what the app actually tracks" above records deleting this tile: the API
had the column and the wire field but never derived either, so it read "0" for every diver forever.
The API now derives `species_seen` as the distinct species over a diver's live dives, recomputed on
every dive write, so the figure returns to the dashboard.

**Adding the fourth is what collapsed the four cards into one.** Three cards in a row worked; a
fourth either strands itself on its own row at `md:grid-cols-3` or forces a breakpoint shuffle, and
either way four separate cards spend four headers and four borders on four numbers that are read
together as one answer — "what my logbook amounts to". They are now one `Card` with no header
holding a four-cell grid, exactly as the dive page holds duration and both depths (see "the three
numbers that describe the shape of the dive"): each figure is already labelled, so a title above
them would only restate the labels underneath.

`grid-cols-2 lg:grid-cols-4` — one row wherever four fit, a 2×2 below that rather than a single
column, since four short figures stacked would run the card down the page for no gain. The icons
moved from opposite the label to in front of it: in a quarter-width column there is nothing for a
right-aligned icon to push against, so it just floats away from the words it belongs to. The
per-width measurements are in the component's own comment rather than repeated here.

`StatCard` became `Stat` in the process, because it renders a cell and no longer a card — a name
that still said "Card" would be the next reader's first wrong assumption.

## What actually keeps a species search from leaving is the cache, not the catalog

`/privacy` §4.6 discloses the species picker's two upstream providers, and the obvious way to write
its reassurance is wrong. The catalog is global — a species is a fact about the ocean, shared by
every account on the instance — so the natural sentence is "once any diver has picked a species,
later searches for it are answered locally and nothing leaves". `search_species` does not work that
way: it runs `_local_search` and `_remote_search` _both_, every time, and merges them. A catalog hit
changes what the diver is offered (a row with a `uuid`, attachable without a resolve) and never
whether the providers are asked.

Two separate mechanisms, and the policy names both rather than blurring them into one:

- **The shared cache** is what stops a search leaving. `_cache_key("search", query)` is keyed on the
  normalized query and nothing else, so it is instance-wide rather than per-diver, and a complete
  answer is held for thirty days (`_HIT_TTL_SECONDS`). A partial fan-out gets an hour instead, which
  is why the claim is "a month" and not "a month, always".
- **The shared catalog** is what stops a _resolve_ leaving. `resolve_species` returns early on
  `_species_by_aphia_id`, so the second diver to pick a clownfish sends nothing at all.

Getting this backwards would have put a false statement in a privacy policy — the one document where
a plausible-sounding simplification is worse than no sentence.

**Resolving a species contacts both providers, not just WoRMS.** The paragraph reads like a single
fetch of a taxonomic record, and `resolve_species` does begin with `AphiaRecordByAphiaID` — but its
enrichment fan-out also runs `_wikidata_by_aphia_id`, which searches Wikidata for
`haswbstatement:P850=<aphia_id>` and then fetches the entity, and that is where `wikidata_qid` and
the common name come from. So Wikidata is contacted at pick time too, and the section says so;
naming only "the marine register" there would have let a reader who had just read the search
paragraph conclude Wikidata is asked only while typing. The AphiaID itself leaves _only_ at pick
time — `_wikidata_search` sends the typed query plus the bare `haswbstatement:P850`, a "has some
value" filter with no id in it, and the follow-up fetch is keyed on QIDs — which is exactly the
split the two policy paragraphs draw.

Two more traps the same section walks past. **Self-hosting does not buy the escape hatch it does for
map tiles**: §4.4 can say "point it at your own tile server and none of this leaves your machine",
but emptying `WORMS_API_URL`/`WIKIDATA_API_URL` degrades search to the local catalog and makes
resolving a new species fail outright — a diver can type a place name by hand, and cannot invent an
AphiaID. And **WoRMS is the taxonomy, Wikidata is the common names**, not the other way round;
saying it backwards would misdescribe what each provider receives and why there are two.

The section is a sibling of §4.5 by design — same three points in the same order (what is sent, that
our servers send it so the provider never sees the diver, and that it only happens while a form is
being filled in) — because a reader who has just read the geocoder paragraph should recognize the
shape. Adding it renumbered Legal Requirements from 4.6 to 4.7; nothing links to these by number
except this file.

## Web config is read at runtime, and the browser is handed it

`NEXT_PUBLIC_*` values are inlined by the compiler wherever they appear as a literal, so every one
of them is frozen at build time. That is the same trap the API address was in before the proxy route
(previous sections), one layer down: `SITE_URL`, `CONTACT_EMAIL`, `GOOGLE_CLIENT_ID` and the three
map-tile variables were all build-time, so a published image could only ever carry whatever the
build machine happened to have. `lib/runtime-config.ts` reads them on the server instead, and
`contexts/ConfigContext.tsx` carries the browser's share down as an ordinary prop from the root
layout. Build once, configure per instance.

Things that are load-bearing:

- **The `NEXT_PUBLIC_` fallback is read through a computed key**, `env["NEXT_PUBLIC_" + name]`,
  never as a literal. Written as `process.env.NEXT_PUBLIC_SITE_URL` the compiler substitutes the
  build machine's value, and the published image is built with none of these set — so the fallback
  would be frozen to `undefined` while still reading like a fallback. It exists so a deployment that
  already sets the old names keeps working; the unprefixed name wins where both are present, and a
  blank value counts as unset at both levels (`GOOGLE_CLIENT_ID=` in a compose file has configured
  nothing, and reading that as "explicitly empty" would suppress the fallback instead of falling
  through to it).
- **The root layout's metadata is a `generateMetadata()` function, not an exported `metadata`
  object.** A module-level constant is evaluated while the page is being built, which is exactly the
  thing being avoided; the function runs per request. Every route already renders dynamically
  (`headers()` in the layout, see the CSP section), so this costs nothing that was not already
  spent.
- **`metadataBase` is a `new URL(...)` in the request path**, so a malformed `SITE_URL` would throw
  on every page. It is validated where it is read and falls back to `http://localhost:3000` with a
  named warning — the same fail-closed trade `lib/api-base.ts` and `lib/map-tiles.ts` make for the
  CSP, and for the same reason: an optional feature must not be able to take the site down.
- **`runtimeConfig()` memoizes, and reads lazily rather than at module load.** Lazily because a
  module-scope read is a read at whatever time the module is first evaluated, and the point is that
  it happens in the container; memoized because the environment cannot change while the process
  lives and the diagnostics above should be said once rather than on every request. `src/proxy.ts`
  memoizes its derived CSP sources on top of that for the same reason — `tileOrigins` warns on a
  malformed template, and that warning is worth one line, not one per request.
- **`tileSource()` no longer reads the environment**; it takes what was configured and applies the
  defaults. It is called from client components, where a non-`NEXT_PUBLIC_` variable does not exist
  at all, so the values have to arrive as data. Its light-set-means-both rule is unchanged.
- **`useConfig()` has a real default rather than throwing on a missing provider**, unlike
  `useAuth()`. The provider is mounted in the root layout so every render in the app has one; the
  default matters for component tests, which render one component with no layout around it — and
  what they should see is exactly what an instance that configures nothing shows, which is what the
  default is. There is no meaningful default session for `useAuth()` to return, which is why the two
  differ.
- **The CSP follows the configuration.** `www.gravatar.com` is in `img-src` only where Gravatar is
  enabled, and the three `accounts.google.com` entries (`style-src`, `connect-src`, `frame-src`)
  only where a Google client ID is set. An instance that uses neither now advertises neither.

## Gravatar is off unless an instance turns it on, and the privacy page stops inventing analytics

`UserAvatar` fired a `new Image()` at `https://www.gravatar.com/avatar/<md5(email)>?d=404` on every
mount for every signed-in user — the account menu is in the header, so that is every page — which
made it the app's only unconditional third-party call from the browser, disclosing a hash of the
user's email address along with their IP to Automattic. `GRAVATAR_ENABLED` now gates it and defaults
to **off**: nothing leaves the browser until somebody asks for it to. The weaker reading of the bar
— disclosed, default-on, switchable — would also have passed; this is the owner's call, and the cost
of it is one environment variable on the instances that want avatars.

The gate is not just the request. The URLs are `null` when it is off, so nothing downstream can
reach for one and the MD5 is never computed; the settings copy switches from "your avatar comes from
Gravatar" to what actually happens; and the privacy page's Gravatar section renders only where there
is something to disclose. That section sits **last in §4**, after Legal Requirements, rather than
next to Map Tiles where it belongs topically: it is the one heading that appears on some instances
and not others, and anywhere earlier it would leave a gap in the numbering of the headings that are
always there.

Separately, and not a taste call: the page described analytics that have never existed. "Usage Data:
pages visited, features used, time spent", "Improvement: analyze usage patterns", "Analyze usage
data" among the service providers, "some anonymized data may be retained for analytics", and an
"Analytics Cookies" bullet — five claims, no implementation, and a CSP that structurally forbids one
(`connect-src` names the API and nothing else). They are gone. A privacy policy that overstates what
is collected is not the safe direction to be wrong in: it is the document a reader uses to decide
whether to trust the rest.

## HSTS is decided per request, and no longer asks for `preload`

`Strict-Transport-Security` used to be a static entry in `next.config.js`'s `headers()`, with the
value `max-age=63072000; includeSubDomains; preload`. Both halves of that were wrong once the image
became something other people run.

`headers()` is evaluated during the build. In a repo that deploys its own build that is invisible;
in a published image it means the build machine decides a security header for somebody else's
domain, and no environment variable can move it. So the header moved into `src/proxy.ts`, which
already runs per request for the CSP nonce and already reads `lib/runtime-config.ts`.

What being per-request buys is the condition: it is sent only when the request arrived over HTTPS. A
LAN instance on `http://192.168.1.4:3000` was previously handed a two-year pin it has no way to
honour, and a browser that recorded one stops being able to reach the instance at all — the failure
is total, delayed, and looks like the network. `x-forwarded-proto` is the evidence, read at its
_first_ entry because a proxy chain appends and the client-facing hop is the one that matters; with
no forwarded header at all the request's own scheme decides. `WEB_HSTS=off` is the escape hatch for
an instance that wants the header owned by the proxy in front, or not at all.

`preload` is gone regardless of any of that. Submitting a domain to the browsers' preload list
commits every host under it to HTTPS for years and is deliberately slow to undo — a reasonable thing
for an operator to choose for their own domain, and not a thing an application should quietly choose
on their behalf by shipping the token. `includeSubDomains` stays: it is scoped to the host actually
serving the app, and it is undone by letting the max-age lapse rather than by a form submission and
a browser release cycle.

Two consequences worth knowing. The header now only rides responses the middleware matcher covers —
documents and their data requests, not `_next/static` — which is enough, because HSTS is recorded
per host and the first navigation is a document. And `next.config.js` keeps the headers that
genuinely are the same for every request of every deployment (`nosniff`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`); the split is "static fact" versus "instance decision", not
an accident of where each one was first written.

## `WEB_NOINDEX` is two mechanisms, because `Disallow` is not `noindex`

`app/robots.ts` answers `Disallow: /` when the flag is set, and `src/proxy.ts` adds
`X-Robots-Tag: noindex, nofollow` to every page. Doing only the first is the common mistake:
`robots.txt` asks a crawler not to _fetch_, which is not a promise not to _list_. A URL a crawler
learned about somewhere else can be indexed without ever being fetched — and a page it never fetches
is a page whose `noindex` it never sees, so the two directives are not redundant, they cover
disjoint cases.

`robots.ts` needs `export const dynamic = "force-dynamic"`. It is a route handler like any other,
and Next prerenders one that reads nothing request-scoped — which would resolve `WEB_NOINDEX` on the
build machine and freeze the answer into the published image. That is the same trap
`lib/runtime-config.ts` exists to avoid, arriving through a file convention rather than through a
variable, which is exactly why it is easy to miss.

The default is "allow", which is what the app did before this existed: no `robots.txt` at all is
read as no restriction.

## `/healthz` is shallow on purpose

The container healthcheck (`Dockerfile`) asks this route and nothing else, and the route reports
only that this process is serving HTTP. It deliberately does not check Postgres or Redis: the web
container does not talk to either, and a healthcheck that failed because a database it never uses
was slow would have Docker restart a container that was perfectly able to render its sign-in page.
The API owns that question and has its own readiness probe.

Two smaller choices. `force-dynamic`, because a route handler with no request-time API is
prerendered and served from disk — still evidence the process is up, but a health endpoint that
answers without running any of the app's own code is a strange thing to trust, and the cost of
running it is a string. And the matcher in `src/proxy.ts` excludes it, for the same reason it
excludes `api/`: a policy about scripts and styles has nothing to say about two words of plain text,
and the exclusion keeps a fresh nonce off a path that is hit every thirty seconds for the life of
the container.

The check itself is a `node -e` one-liner rather than `curl`, because `node:24-alpine` ships neither
`curl` nor `wget` and adding one to ask a question the runtime can already ask is a package and a
CVE surface for nothing. It is written in exec form, so no shell is involved and the builder
performs no substitution — `process.env.PORT` is read by node at run time, which keeps the check
correct for an instance that moved the port.

## The image builds once per architecture, and a `v*` tag is checked against `package.json`

`.github/workflows/publish-image.yml` publishes `ghcr.io/opendiving/opendiving-web`. Its shape is
decided by four things.

- **Native runners, not QEMU.** `linux/amd64` and `linux/arm64` build on `ubuntu-latest` and
  `ubuntu-24.04-arm` respectively, each pushing an untagged image and reporting its digest; a
  `merge` job turns the pair into one manifest list. Emulating arm64 is the one-job alternative and
  it is not close here — `npm ci` plus `next build` under QEMU turns a three-minute build into a
  twenty-minute one, on every release. arm64 is not optional: "low-powered device" is a top-two
  hardware answer among self-hosters, and a missing arm64 image is a bounce rather than an
  inconvenience.
- **Every tag created in one call.** `docker buildx imagetools create` receives the whole tag list
  at once, so `X.Y.Z`, `X.Y`, `X` and `latest` cannot end up on different digests. That is what
  makes the CVE-rebuild story work: rebuilding a released version means recomputing its _full_ alias
  set, and a hand-typed subset would leave everyone following `X.Y` on the vulnerable image. The
  major alias starts at `1.0.0` — a bare `0` invites pinning to "any 0.x", which is precisely the
  range whose minors are allowed to break.
- **The tag is guarded against the manifest.** Every `v*` tag push fails the build, before anything
  is pushed to the registry, unless the tag is a plain `vX.Y.Z` equal to `v` + `package.json`'s
  version. A two-repo release ritual will eventually tag the wrong commit, and the failure is
  otherwise silent — images published under a version whose manifest says something else. Recovery
  is cheap precisely because the guard fires first: nothing was pushed, so delete the tag, fix,
  re-tag. The two halves of that condition matter separately. `vX.Y.Z` is the only shape this
  pipeline knows how to alias, so `vnext` or a pre-release has to be refused rather than sail past
  the version check and publish as a bare `sha-` image — which is what an "is this a version?" test
  written as `^v[0-9]` quietly does, since the trigger glob is `v*` and not every `v*` starts with a
  digit. The tag-push path therefore enters the guard unconditionally; only a dispatch, where a
  human is naming an arbitrary ref, uses a heuristic to decide whether they meant a version at all.
- **A version typed into the extra-tag input is refused, with or without the `v`.** That input
  exists for names like `staging`, and a version put there never reaches the guard above at all:
  `-f ref=main -f tag=0.4.0` publishes `:0.4.0` off whatever commit `ref` names, unchecked against
  `package.json` and without any of the other aliases that version is supposed to carry. The two
  spellings fail differently and the bare one is the worse of them — `0.4.0` and `0.4` are exactly
  what a release publishes, so it _overwrites_ a real alias, where `v0.4.0` only invents a name
  nothing else in the repository uses. Hence `^v?[0-9]`: the whole leading-digit namespace belongs
  to the release path, and reserving it costs a `staging`-shaped input nothing. The error names the
  fix rather than just the refusal — point `ref` at the tag, which is the path that computes the
  whole alias set and checks it.

Labels go on the per-architecture images and the same values go on the index as annotations — an
index carries no labels, and `org.opencontainers.image.source` is what GHCR reads to decide which
repository a package belongs to and inherits access from. One of them is conditional:
`org.opencontainers.image.version` is stamped only when there is a version to state, because on a
branch or `sha-` build it would carry the empty string, and a label reading `version=` is a claim
about the version rather than the absence of one.

**The api repo's workflow of the same name is this same policy said twice.** The two repos release
in lockstep on one version, so an alias rule or a guard added to one has to be added to the other,
and both are written in one idiom — tags assembled by hand rather than by `docker/metadata-action` —
so that making the change twice reads as a diff rather than an archaeology session. What differs
between them is only what has to: the manifest is `package.json` read by `node` rather than
`pyproject.toml` read by `tomllib`, the title and description name this image, and the cost of QEMU
is `next build` rather than compiling wheels without an aarch64 build. Anything else that differs is
a port owed in one direction or the other, and worth resolving as one.

Alongside it, `.github/release.yml` and a labelling job in `pr-title.yml` are the release-notes
plumbing. The job reads the same conventional title the check above it validated, applies one of
`breaking`/`feat`/`fix`, and — the half that is easy to forget — removes the other two, so a PR
retitled from `feat!:` to `fix:` does not stay in the Breaking section forever. It is gated to
same-repo PRs: on a fork PR the token is read-only whatever the workflow asks for, and an ungated
step would turn a _required_ check red on every external contribution, which is exactly the wrong
week for it when the repos go public.

## The self-hosting docs live in the API repository, and this README points at them

An install is one compose file, and that file belongs to `opendiving-api` — it names the `web`
service, so it could never have lived here without the API repository holding a second copy of the
same thing. Everything downstream of it follows: the configuration reference, the
bring-your-own-proxy instructions, backup, restore, upgrade and troubleshooting are written once, in
`opendiving-api/docs/self-hosting/`, and this README links there rather than paraphrasing. Two
copies of install instructions do not stay in agreement, and the one that is wrong is always the one
the reader found first.

What stays here is what the API repository has no reason to know: building this image yourself, and
`NEXT_PUBLIC_API_URL` as a build arg for a split-origin deployment. Both are properties of _this_
Dockerfile, and neither appears in the bundle at all — the bundle pulls a published image, and the
browser talks to the origin that served it.

**The README was written ahead of what it describes, and has since been checked back.** When this
section first landed none of it could be run: no deploy bundle, no `docs/self-hosting/`, no
published images, and the API's own README still filing the whole thing under "Planned". That was
the owner's call, taken with the state named — `plans/self-hosting-one-command.md` sequences this
web docs pass (W4) ahead of the API-side bundle (A5), and nothing is public yet. The API side has
since shipped, and the re-check is the point: the quickstart was corrected against the bundle that
actually exists rather than the plan that predicted it, which is how its asset names came right. The
environment template ships as `example.env`, not `.env.example`; `Caddyfile` is a third download the
first draft omitted entirely; and a verbatim copy of that draft would have produced a broken install
the day the first release was cut.

One gap is still open, and it is the same one for both repositories: no `v*` tag has been cut, so
`releases/latest/download/...` resolves to nothing and neither image is on GHCR. Every command in
that section runs the moment the first release exists — until then the quickstart is documentation
of a thing that works, not a thing you can do.

The "One-command self-hosting" roadmap bullet was removed rather than reworded, on the same
forward-dated basis: it and the new section describe one feature, and keeping both would leave the
file promising in one place what it documents in another.

## The landing page can only claim what the instance can back up

The page shipped with four headline figures — "1,000+ Active Divers", "5,000+ Logged Dives", "50+
Countries", "100% Open Source" — App Store and Google Play badges wired to `href="#"`, a Community
feature card promising dive-photo sharing and buddy-finding, and a closing "Join thousands of divers
who are already using OpenDiving". Exactly one of those eight things was true.

What makes them worse than ordinary placeholder copy is who ends up saying them. This is not a
marketing site for a hosted product; it is the unauthenticated view of _somebody's server_, rendered
by whatever image they pulled. A visitor count is not merely unverified, it is uncountable — there
is no central service to count, and the number would have to be a per-instance figure that says
"1,000+" on a household Raspberry Pi with one diver on it. The store badges were worse still: two
prominent, correctly-branded buttons that did nothing, on a project whose iOS repo is explicitly
parked. Every one of them makes a liar of the self-hoster, not of the project.

So the constraint the rewrite works under is narrower than "don't exaggerate": **each claim has to
be checkable against this repository or the running instance.** That is what decided the
replacements, and the shape of the page follows from it:

- **The band that held the fake stats now carries the argument they were standing in for.** It is
  the same coloured section, and the vendor-shutdown case (Movescount, Deepblu, Diveboard; AGPL; the
  original dive-computer file kept behind every import) is what the numbers were there to imply. The
  three facts under it — the licence, no trackers, the three export formats — are the only figures
  left, and each one is a `grep` away. Note the contrast constraint documented under `--coral-solid`
  still applies to this band: full `text-primary-foreground`, never `/70`, which is 4.90:1 on
  `bg-primary` in dark mode against 3.4:1 for the faded version.
- **The store badges became a line of prose that answers for them** — there are no mobile apps, the
  iOS companion is parked, and this web app is built for a phone in the meantime — with the source
  and the self-hosting docs as inline links. The absence needed stating outright rather than being
  left as a silence, because the badges had already advertised it. `icons/apple-logo.tsx` and
  `icons/google-play-logo.tsx` went with them; they had no other caller.
- **The Community card became Computer Import**, which is a thing the app does. Sharing is on the
  roadmap and the "Run your own" section says so by name, alongside Subsurface/UDDF import and
  statistics. A landing page that lists what is _not_ built is a strange artifact until you remember
  the reader may be about to run this on their own hardware.
- **The hero sells the log, not the deployment.** The subheading carries the mixes, the imported
  profile, the gear and c-cards, and the export button. The `<h1>` above it is the one exception to
  everything in this section, and the next two paragraphs are about that.

That last one is a correction, and the mistake behind it is worth keeping. The first rewrite led
with "A Dive Log You Own" and "Every instance runs on hardware its owner controls — this page is
served by one of them", and put two large buttons — _Browse the source_, _Run your own instance_ —
directly under the sign-in form. Every word of that was true, which is exactly why it slipped
through: the honesty constraint above says nothing about **which** true thing goes at the top.
Self-hosters are a small part of the audience, and most people reaching this page are divers signing
in to a log someone else already runs. Leading with the deployment story pitched the hero at the
minority, and a visitor who does not intend to run anything reads "hardware its owner controls" as a
caveat about someone else's server rather than a promise about their data.

**"The Ultimate Diving App" stays, and stays on purpose.** The replacement headline was "Log Every
Dive / In Full"; the owner's call was to keep the original for now, and it is recorded here rather
than left to look like something the rewrite missed. It is a superlative on a page whose whole
argument is that every other claim on it can be checked, so it is the one line that a future reader
should assume is deliberate before "fixing" it — hence the comment on the `<h1>` pointing back here.
`app/page.tsx`'s `title` was moved to match it, on the narrower point that a search result promising
one headline and delivering another is a mismatch nothing downstream can paper over; the two now
change together or not at all. Nothing else was reverted with it — the subheading, the band, and the
cards stay as above.

The data-ownership argument did not get weaker, it got moved to where it lands: the `#features` card
("Yours To Keep"), the coloured band, and the "Run your own" section, which is where the one
prominent self-hosting button now lives. The band's own phrasing moved with it — it used to say the
data sits "in a Postgres database you back up yourself", which is only true for the person running
the instance. The diver-facing form of the same guarantee is the export: if the instance goes away,
the export still opens in something else.

The header's unauthenticated nav had to move with it. `/#community` pointed at the section that is
now `#self-hosting`, and `/#about` had been pointing at an `#about` that never existed on any
version of this page — a dead anchor that scrolled nowhere. They are now Features, Self-hosting and
a `Source` link out to the repository, which is three destinations that exist.

The footer's "Open source diving platform for the global diving community" stays, and it is worth
saying why it is _not_ another instance of the above — an earlier draft of this section filed it as
"the same species of claim", which was pattern-matching on the word "community" rather than reading
what the sentence asserts. It is a statement of **audience**, not of traction. The global diving
community does exist; the software is for it; being AGPL and self-hostable by anyone, that is true
in the only sense the sentence means. What this section removed were claims of a different kind:
"1,000+ Active Divers" is countable and about _this instance_, "Join thousands of divers who are
already using OpenDiving" is about existing users, and "Find dive buddies" is about features. Each
of those asserts something checkable and false. An audience does not.

The reason it ever looked guilty is that it used to sit beside a Community nav item and a Community
feature card that really did promise sharing and buddy-finding, and in that company it read as part
of the same promise. Deleting those is what changed it. So this is a note against finishing a job
that does not need finishing: the line is fine, and the mislabel is the thing that was wrong.
(Nearest real target in it is "platform" for what is a web app plus an API — a question of register,
not of honesty.)

## `scroll-padding-top` on `html`, because the sticky header eats anchor targets

The header is `sticky top-0 z-50`, so it paints over the top of whatever an in-page anchor scrolls
to. Clicking **Features** in the nav put `#features` at `top: 0` and hid its first 69px — exactly
the header's height — behind it, which on that section is the top edge of all three cards. The fix
is one declaration in `globals.css`:

```css
:root {
  --header-height: calc(4.25rem + 1px);
}
html {
  scroll-padding-top: var(--header-height);
}
```

Three things about it are deliberate.

**`scroll-padding-top` on the container, not `scroll-mt-*` on each target.** The property belongs to
the scroll container and moves the line the browser aligns to, so it applies to every anchor at once
— `#features`, `#self-hosting`, `#get-started`, and anything added later — instead of being a
utility that has to be remembered on each new `id`. It also covers the scroll that happens when
focus moves to an element near the top of the page, which had the same defect and no anchor to hang
a utility on. It goes on `html` rather than `body` because `html` is the element that scrolls.

**Exactly the header's height — and the first attempt got the safe direction backwards.** It shipped
as a flat `5rem` against a 69px header, on the reasoning that spare clearance is harmless and reads
as deliberate spacing above the heading. It is not harmless. The extra 11px is not blank page, it is
a strip of whatever sits immediately _above_ the target, and above `#self-hosting` is the full-bleed
`bg-primary` band — so jumping there rendered an 11px black bar (grey in dark mode) welded under the
header, which looks exactly like a rendering fault. Overshooting is the bad direction.

Undershooting is the harmless one, which is the useful half of this to remember: a value a pixel or
two short only ever hides empty padding. If this number is ever wrong, wrong-low is the way to be
wrong.

**But header-height alone is only enough where the section has top padding, and one does not.**
`#features` is `pb-20` with no `pt-` — the hero's `py-20` above it already spaces the cards on a
normal scroll through, so none was ever needed. Landing on it from the nav is the case that was
never considered: the cards' top edge came to rest flush against the header with nothing between
them. It carries `scroll-mt-20` for that, which stacks on top of the container's
`scroll-padding-top` and buys the same 5rem the other two sections give their own content — all
three anchors now settle with 80px between the header and the first thing the eye lands on.

That is safe **here specifically** because what sits above `#features` is the hero, on the same
`bg-background`, so the band the offset exposes is invisible — verified by pixel-comparing a slice
of the band against a slice of the section interior in both themes; the two are byte-identical. The
same utility on `#self-hosting` would re-create the black strip, because what sits above that one is
the `bg-primary` band. The rule is not "add scroll-mt where it looks tight" but "an anchored section
needs top padding of its own, and where it has none, only borrow the offset if the section above
shares its background".

That makes exactness worth having, so the value is derived from the header's own construction rather
than measured off a screenshot: `py-4` twice, the `size="sm"` action button at `h-9`, and the 1px
`border-b` — `calc(4.25rem + 1px)`. Being rem-based, it tracks the root font size the way the header
itself does; a `69px` literal would not. Verified: at a 20px root the header measures 86px and
`scroll-padding-top` computes to 86px with it. This is the same lesson as `CUT_BELOW` in
`scripts/screenshots.mjs`, where written-down heights went stale twice in an afternoon — except the
fix there was to measure at runtime and the fix here is to derive from the same inputs, because CSS
can do that and a screenshot script cannot.

**The comboboxes are not affected, and the reason is worth knowing before "simplifying" this.**
`volume-combobox.tsx` and `creatable-combobox.tsx` call `scrollIntoView({ block: "nearest" })` on
their active option. That scrolls the listbox's own `overflow-y-auto` element, which is a different
scroll container with its own unset `scroll-padding` — so a rule on `html` cannot reach it and
cannot push a highlighted option out of view. Moving this to `*` or to a shared utility would.

The header height is 69px at every breakpoint; the mobile menu expands the header downward when
open, but it is closed at the moment a nav link is followed, so the collapsed height is the one that
matters. `header.tsx` caps that menu at `calc(100dvh-4.5rem)`, which is a _different_ number on
purpose and was left alone: it is slack on a max-height, where a few px either way is invisible, so
unifying it with `--header-height` would tie together two quantities that only look alike.

Worth being clear that this was a pre-existing bug and not a regression from the landing-page
rewrite: `#features` was already there and already clipped. What changed is that the nav now points
at two sections that exist instead of one that existed and two dead anchors, so it is exercised
enough to notice.

## `ci.yml` and `code-quality.yml` run on a read-only token, with nothing left in `.git/config`

Neither workflow had a `permissions:` block, and the absence of one is not "no permissions" — the
run inherits whatever the repository default grants, which is read _and_ write across every scope
unless somebody has narrowed it in the Actions settings. Neither workflow has ever needed any of it:
between the four jobs they check out, `npm ci`, lint, type-check, test, build, run `npm audit`, and
upload reports as artifacts. Nothing writes to the repository, comments on a PR, or touches a
package. Both now declare `contents: read` at workflow level, which is what `publish-image.yml` and
`pr-title.yml` were already doing.

Narrowing the scope is only half of it. `actions/checkout` writes the `GITHUB_TOKEN` into
`.git/config` in the workspace unless told not to, and every job here then spends its time executing
third-party code in that same workspace: linting, testing and building all run whatever the
dependency tree ships. A compromised transitive dependency therefore finds a credential on disk
without having to go looking for one, and the scope above is all that decides what it is worth.
`code-quality.yml` has the sharpest version of this — four of its steps are `npx --yes` fetching a
tool at run time (`depcheck`, `@next/bundle-analyzer`, `madge`, `@axe-core/cli`), so the code
running next to that credential is resolved fresh on each run rather than pinned by the lockfile.
`persist-credentials: false` on every checkout is the other half, and it costs nothing here: none of
these jobs push, fetch a second ref, or use git at all after the checkout step.

`fetch-depth: 0` on the `code-quality` checkout stays. The two inputs are independent — the full
history is still fetched, just without the credential kept afterwards.

One step here would want more than read, and it is commented out: "Comment PR with quality report"
calls `issues.createComment` and needs `pull-requests: write`. Reviving it means a block on that job
rather than a wider workflow-level one — and the job would have to re-state `contents: read`
alongside, because a job-level `permissions:` block _replaces_ the workflow's rather than adding to
it. `pr-title.yml` is the worked example: `permissions: {}` at the top, and the labelling job asking
for exactly the two scopes it uses. The commented-out `dependency-review` job needs nothing extra;
`contents: read` is what that action reads the PR's dependency diff with.

The api repo's `linting.yml`, `tests.yml` and `type-checking.yml` had the same gap, and have since
been given the same two lines — the same way its `publish-image.yml` and `pr-title.yml` already
mirror this repo's. Every CI workflow across both repos now starts from `contents: read` and a
checkout that persists nothing, so a new one has a shape to copy rather than a repository default to
inherit. A workflow that genuinely needs to write asks on the job, which is what `pr-title.yml` does
in both repos.

## `SECURITY.md` has two channels, and both of them exist

The repo had a `CODE_OF_CONDUCT.md` and a `CONTRIBUTING.md` and no way to report a vulnerability
privately, so a finder's only option was a public issue — on a project that invites strangers to
self-host it. `SECURITY.md` closes that. What is worth recording is which channel is primary, why
the other one is safe to publish when a near-identical address was deleted from this repo once
already, and which parts of the boilerplate a template would have supplied are missing on purpose.

**The primary channel is GitHub's private vulnerability reporting** — `security/advisories/new` on
this repository — because it is private by construction, keeps the thread and the eventual advisory
in one place, and credits the reporter without anyone having to remember to. It is a repository
setting rather than a file (Settings → Code security), and it gets switched on when these repos go
public. That ordering is fine and not a gap: while the repo is private, nobody who would read
`SECURITY.md` can reach it either.

**`security@opendiving.app` is the second channel, and it is a real inbox.** It has to be, which is
the whole point of writing this down. `security@` was literally one of the three invented addresses
deleted in the contact-form rebuild (see "The contact form posts to the API, and the page it lives
on claims only what exists"), and `lib/runtime-config.ts` leaves `CONTACT_EMAIL` unset by default
for the same reason: an address nobody reads routes someone's report to a stranger, which is worse
than no address at all. So the test an address has to pass here is not "does it look plausible" but
"has a maintainer created it and agreed to read it" — this one has, which is exactly what separates
it from the deleted one. Don't add a third by pattern-matching on this one; `conduct@opendiving.app`
in `CODE_OF_CONDUCT.md` carries conduct reports and nothing else.

Two near misses, for anyone tempted to revisit them. The app's own contact form has a `security`
category in `CONTACT_CATEGORIES`, but it only exists on a _running instance_ and there is no hosted
instance of this project — `SECURITY.md` mentions it only as the thing a self-hoster's own users
would use to reach _that_ operator. And the file briefly had no mailbox at all, offering "open an
issue saying only that you have a security report" as the fallback for a reporter without a GitHub
account: that was incoherent, since filing an issue needs an account just as much. A second channel
that shares the first one's precondition is not a second channel.

**No supported-versions table and no SLA.** The boilerplate template wants a matrix of version
ranges with ticks and crosses, and this project has one release line: `publish-image.yml` publishes
`X.Y.Z`, `X.Y`, `X` and `latest` off one tag, nothing is backported, and the version moves in
lockstep with the API. "The latest release" is the entire honest answer, so it is one sentence
rather than a table that would be wrong the moment it was written. The same reasoning kills the
48-hour acknowledgement and the 90-day disclosure clock: there is no rota to keep either, and a
published promise nobody can meet is worse for a reporter than being told plainly what to expect.
What the file does instead is tell them to nudge the thread after a couple of weeks — a suggestion
to the reporter costs nothing to honour — and to name their own deadline in the first message if
they have one.
