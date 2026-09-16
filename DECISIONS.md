# Frontend Decisions & Gotchas

Non-obvious choices in the web app and the pitfalls behind them, one short section each. Grep for
the symbol you are touching. The bar for a new entry is in `AGENTS.md`.

## Dive/trip/dive-site API calls take `uuid` strings, not `username`/numeric ids

`divesAPI`/`tripsAPI`/`diveSitesAPI` in `lib/api/*.ts` identify users and resources by string
`uuid`, never by `username` or a numeric `id`, matching the API's flat routes (`/dive`, `/dives`,
`/dive/{id}`). Every caller (`RecentDivesCard`, `RecentTripsCard`, `TripCombobox`,
`DiveSiteMultiSelect`, `NewTripDialog`, `NewDiveSiteDialog`, `DiveFormFields`, the
`dives/`/`sites/`/`trips/` pages) reads `user.uuid` from `AuthContext`, not `user.id` or
`user.username`.

- Create calls (`createDive`/`createTrip`/`createDiveSite`) take the full request object as a single
  argument, with `user_uuid` in its body.
- List calls (`getDives`/`getTrips`/`getDiveSites`) take `userUuid` as their first argument and send
  it as the `user_uuid` query param.
- Single-resource calls (`getDive`/`updateDive`/`deleteDive` and the trip/dive-site equivalents)
  take only the resource `uuid`; the backend authorizes by comparing the fetched object's owner to
  the caller.

`authAPI.updateProfile` and `diveStatsAPI.getDiveStats` take no user identifier at all — see
"Current-user endpoints live on a bare `/user`, not `/user/me`/`/user/{uuid}`" below.

## Never use `z.preprocess()`/`.transform()` on fields feeding `z.input<>`-derived types

Form pages derive their form-data type from Zod via `z.input<typeof schema>` (`DiveCreateInput`,
`DiveUpdateInput`). `.preprocess()`/`.transform()` collapse the input type to `unknown` or to the
output type, which breaks `useForm<T>()`'s binding to `onSubmit` with "two different types with this
name exist, but they are unrelated" errors — and only during a full `next build`, not under
`diagnostics`/editor type-checking.

Keep each schema's input and output types identical (`z.union([z.literal(""), z.number()])`, no
`.transform()`) and do real conversion (`"" -> undefined`) in a plain TS helper called right before
the API call (`normalizeMixtures`, `normalizeTripDates` in `lib/validations/*.ts`). Always run
`npm run build` after touching a form-bound Zod schema; `diagnostics` alone misses this class of
bug.

## The "cleared field resets to default" React Hook Form quirk

Setting a live RHF field value to `undefined` mid-edit makes RHF display that field's default value;
it cannot distinguish "explicitly cleared" from "never set". This affects every optional
numeric/date field with a non-empty-string default.

Use the empty string `""` as the live "cleared" sentinel, never `undefined`, and convert
`"" -> undefined` only in a normalize helper called right before the API call.
`diveMixtureSchema.start_pressure/end_pressure` (numeric) and `tripCreateSchema.start_date/end_date`
(date-string) are the reference call sites.

## Explicit field construction beats spread-then-override for generics

`normalizeMixtures()` lists every output field explicitly rather than
`{ ...mixture, start_pressure: ... }` over a generic `mixture` parameter. With a generic source type
TypeScript does not reliably narrow the overridden property away from the original wider union, so
the `""` placeholder type leaks into the inferred return type and breaks assignability to the API's
`DiveMixture[]`. No spread and no generics is the default for any "normalize before submit" helper.

## Bare `YYYY-MM-DD` dates must not go through `new Date(dateString)`

`new Date("2024-06-01")` parses as UTC midnight, which a negative-UTC-offset timezone (most of the
Americas) displays as the previous day. Every date-only field (trip `start_date`/`end_date`) is
formatted via `formatDateOnly()`/`formatTripDateRange()` in `lib/date-time.ts`, which split the
string and construct a local `Date(year, month-1, day)`. `Dive.start_time` is a full ISO datetime
and has no off-by-one-day problem, but displaying and editing it still cannot go through
`new Date(dateString)` and local getters — see the next section.

## A dive's `start_time` displays/edits in its own timezone, never the browser's

`Dive.start_time` is an ISO 8601 string whose offset, if any, is the dive's own timezone, not the
viewer's (an imported dive may carry none — see "An unknown UTC offset is a third state, and
`new Date()` never sees an offset-less string"). `new Date(start_time)` with
`.getHours()`/`toLocaleString()` converts to the browser's zone. `lib/date-time.ts` uses the
embedded offset:

- `parseUtcOffsetMinutes()` extracts it, or `null` for a naive string.
- `formatDiveDateTime()`/`formatDiveTimeOnly()` shift the instant by that offset and format with
  `timeZone: "UTC"`; a `null` offset parses the string as UTC.
- `splitStartTime()`/`combineStartTime()` convert between the string and a `"YYYY-MM-DD HH:mm:ss"`
  string plus offset minutes or `null`.

`formatDateTime()`/`formatTimeOnly()` show browser-local time: for `created_at`, never `start_time`.
The form has one `start_time` field; `DiveStartTimeField`
(`components/dives/dive-start-time-field.tsx`) alone calls `splitStartTime()`/`combineStartTime()`,
around `DateTimePicker` + `UtcOffsetSelect`. New dives use `nowStartTime()`
(`getBrowserUtcOffsetMinutes()`); `normalizeParsedStartTime()` keeps an imported file's offset and
falls back to the browser's for naive ones.

## Date fields are typed into, and settle only when the field is left

Every date field is a text box with a calendar button in it (`ui/date-picker.tsx`,
`ui/date-time-picker.tsx`); `lib/date-input.ts` reads it. Separators are loose (`2024/6/1`,
`20240601`), the order always year-first: `01/06/2024` is two different days depending on who typed
it. `parseDateTimeInput()` refuses a trailing `Z` or `+02:00`, since the offset belongs to
`UtcOffsetSelect` and dropping a pasted one moves the dive in silence.

The box holds a draft and commits on blur or Enter, never per keystroke, because a half-typed date
passes through other real ones. Unparseable text is discarded; a date typed without a time takes the
time the popover holds, as a picked one does.

Focus opens the calendar, which follows the draft as typed; `onClick` reopens it, since `focus` does
not fire on a focused input. Only the icon button hands the grid focus, or the first keystroke lands
on a day cell.

## FastAPI 422 errors can be an array, not a string - never render `detail` directly

Pydantic validation errors return `detail` as an array of `{type, loc, msg, input}` objects; other
errors (duplicate name, etc.) return a plain string. Rendering the array in JSX crashes React
("objects are not valid as a React child"). Every error-handling call site goes through
`getApiErrorMessage()` (`lib/api/error.ts`), which normalizes both shapes into a displayable string;
never read `error.response?.data?.detail` directly.

## The generic `CreatableCombobox` pattern

`components/ui/creatable-combobox.tsx` is a generic "pick existing or create on the fly" combobox.
`TripCombobox` is a single-select wrapper supplying the fetch/create calls. `DiveSiteMultiSelect`
wraps it for several dive sites per dive (a drift dive can cross named sites): `CreatableCombobox`
is the "add a site" input, always rendered with `value={undefined}` so it clears after each pick,
above a reorderable list of added sites. `GearItemMultiSelect` and `SpeciesMultiSelect` follow the
same shape. Wrap `CreatableCombobox` this way for any further "pick or create" entity rather than
copying the interaction logic (filtering, commit-on-blur/Enter, mouse-down-prevents-blur for option
clicks). Read "The species picker resolves a pick into a catalog row before form state sees it"
before writing the next wrapper: it is the only one whose pick needs a round trip before it has a
value, and what follows from that is not visible here.

## Every dive form picker searches server-side

`DiveSiteMultiSelect`, `TripCombobox` and `GearItemMultiSelect` pass `CreatableCombobox`'s
`onSearch`: one request on open, one per debounced query. The full list grows without bound and
never reaches the browser.

`CreatableCombobox` takes `items` (local name filter) or `onSearch`. Remote results are never
re-filtered: the server may match fields a name filter cannot. `excludeIds` hides picked items
immediately; `selectedItem` backs `value` in remote single-select; `noMatchesLabel` is not
`noItemsLabel`; `hasMore` shows a keep-typing footer; `onSearch` is ref-held (an inline arrow must
not restart it); the empty on-open query skips the debounce.

Selection records live apart from the dropdown, from a `known*` prop (read through, never copied by
an effect), every `onSearch` result, and last a per-uuid fetch (for `/dives/new?dive_site_uuid=...`
and archived gear). That fetch fires once per uuid (`requestedRef`) with no `cancelled` flag: under
StrictMode the in-flight request is the discarded mount's, and map writes are idempotent.
`fetchAllGearSets` pages everything; sets are few and client-filtered.

## Duration is a free-typed, regex-validated "MM" or "MM:SS" string in the form

`Dive.duration` is seconds on the API types (`Dive`/`DiveCreate`/`DiveUpdate`); the form field holds
a plain string (`"45"`, `"45:30"`) — see `dateTimeField()`/`durationField()` in
`lib/validations/dive.ts` (no `.transform()`). `durationField()`'s regex (`^\d{1,3}(?::[0-5]\d)?$`)
is the only validation, via `<FormMessage />`, with no live reformatting. The seconds half is
optional: dive computers report whole minutes. A colonless value is minutes (`"130"` is 130 minutes,
never 1:30), so the minutes half is capped at three digits and a mistyped `"1030"` is refused, not
stored as a 17-hour dive.

Seconds convert right before submit and after fetch via
`parseFormDuration()`/`formatDurationForForm()` in `lib/date-time.ts`; a missing seconds half parses
as zero, and the formatter always writes `"MM:SS"`. Reuse them elsewhere; a "total minutes" number
input loses sub-minute precision.

The `<FormLabel>` is a bare `Duration`. Two prose strings move with `DURATION_REGEX`: the
placeholder in `dive-form-fields.tsx` and `durationField()`'s default message; a test pins the
message, the placeholder has no guard.

## Occasional `.next` cache corruption during builds

`npm run build` intermittently fails with errors unrelated to the diff (`ENOENT` on `.nft.json`
trace files, `Cannot find module for page: /some-route`) while TypeScript and lint pass. Remedy:
`rm -rf .next && npm run build`. Try it before assuming the code is broken whenever a build failure
does not match the change just made.

## Layout width convention

Every page inside the shared chrome uses `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8` for its content
container (the profile page is the reference). Two exemptions: the landing page (`/`), built from
full-bleed alternating sections, and the dive/trip/dive-site "new"/"edit" forms, which are
single-column and use a narrower `max-w-2xl`. This is a content-width choice only; `Header`/`Footer`
come from `AppShell` (next section), so the forms still sit inside the shared chrome and merely
constrain their own inner content.

## `Header`/`Footer` live once in `AppShell`, not per-page

`components/layout/app-shell.tsx`, mounted near the root of `app/layout.tsx`, renders
`Header`/`Footer` around `children` for every route except the hardcoded `NO_CHROME_ROUTES` list.
Rendering them per page duplicates the chrome JSX and unmounts/remounts `Header`/`Footer` on every
navigation (visible jank, header-local state reset), so pages never import them.

`Header` takes no `currentPage`/`showDashboardActions` props; it calls `usePathname()` and derives
the active nav item from the `NAV_SECTIONS` prefix table in `header.tsx`. A new top-level nav item
is a `{ prefix, page }` entry there.

A route that needs no chrome goes into `NO_CHROME_ROUTES` in `app-shell.tsx` — there is no per-page
opt-out — and renders `layout/standalone-shell.tsx` rather than a hand-rolled centered card:
`AppShell` holds the app's `<main>`, and that component holds the chrome-free half's. See "The
chrome-free routes had no `<main>`" at the end of this file.

## Shared list-page pattern: `useAuthGuard` + `useInfiniteResource` + `useDeleteResource`

The dives/trips/dive-sites list pages (`app/dives/page.tsx`, `app/trips/page.tsx`,
`app/sites/page.tsx`) share three hooks and two components; any new deletable-resource list reuses
them:

- `hooks/useAuthGuard.ts` redirects to `/signin` once the auth check settles signed-out
  (`useRedirectIfAuthenticated` mirrors it for public-only pages).
- `hooks/useInfiniteResource.ts` takes a `(page, perPage) => Promise<{data, total_count, has_more}>`
  fetcher and a `keyOf`, returning
  `items`/`isLoading`/`isLoadingMore`/`totalCount`/`hasMore`/`loadFailed`/`loadMore`/`reload`/`removeItem`/`applySaved`.
  Pages accumulate. Pair with `components/ui/load-more-trigger.tsx` (`<LoadMoreTrigger />`), whose
  button doubles as the scroll sentinel and hides on a single page.
- `hooks/useDeleteResource.ts` takes a `(id) => Promise<...>` delete function and returns
  `deletingId`/`pendingId`/`requestDelete`/`cancelDelete`/`confirmDelete`. Pair with
  `components/ui/confirm-dialog.tsx` (`<ConfirmDialog open={pendingId !== null} />`), not the native
  `confirm()`, which freezes the tab.

Wire `useInfiniteResource`'s `removeItem` as `useDeleteResource`'s `onDeleted` so the row vanishes
without the list collapsing to page one; `reload` is for a delete that changes other rows. Why
`removeItem` rather than a refetch, and why the cursor moves with it, is the section at the end of
this file.

## Access token lives in memory only, never in `localStorage`

Anything running on the page (XSS, a compromised dependency, a browser extension, an error-reporting
SDK serializing storage) can read `localStorage`, so `lib/api/client.ts` holds `access_token` in a
module-scoped variable exposed via `getAccessToken`/`setAccessToken`/`clearAccessToken` — not React
state, since the request interceptor needs the latest value at request time, not a re-render. The
refresh token is already an `httponly`, `secure`, `samesite=lax` cookie set by the API (`login.py`).

The token does not survive a reload, so `AuthContext`'s bootstrap effect calls
`refreshAccessToken()` (POST `/auth/refresh`, re-deriving a token from the cookie) on every mount.
`authAPI.isAuthenticated()` only says whether this tab holds a token right now; use
`refreshAccessToken()` to learn whether a session exists.

This defeats passive exfiltration only. A live XSS payload can call `/auth/refresh` itself while the
page is open; escaping and the CSP (below) close that gap, not storage choice.

## `NEXT_PUBLIC_API_URL` is the full base, `/api/v1` included - not an origin

The variable goes straight to axios as `baseURL` in `lib/api/client.ts`; `lib/api/*.ts` modules pass
route-relative paths on top. The API mounts everything under `/api/v1` (`APIRouter(prefix="/api")` +
`APIRouter(prefix="/v1")`, not configurable), so the prefix belongs in the variable; an origin-only
value 404s every request.

Appending the prefix in `client.ts` instead is rejected: a reverse proxy mounting the API under a
subpath has nowhere else to say so, and `src/proxy.ts` is written around a value carrying a path.

Two other readers: `src/proxy.ts` needs an origin for the CSP's `connect-src` (a path there matches
only itself), so `apiCspSource` in `lib/api-base.ts` takes `new URL(...).origin`, guarded against a
relative value. `scripts/screenshots.mjs` appends only the route; running in Node with no page
origin, it needs an absolute value, hence `.env.example`'s absolute dev URL.

The variable is an optional build-time override for split-origin deployments; unset, the base is the
relative `/api/v1`, proxied by this app (next section).

## The web app proxies `/api/v1` to the API, and that is the shipped topology

With `NEXT_PUBLIC_API_URL` unset, axios' `baseURL` is the relative `/api/v1`
(`DEFAULT_API_BASE_URL`, `lib/api-base.ts`) and the catch-all `app/api/v1/[...path]/route.ts`
streams to `API_INTERNAL_URL` (default `http://api:8000`; `http://localhost:8000` under `next dev`).
`NEXT_PUBLIC_*` values are inlined at build, tying a baked-in address to its builder; a route
handler reads `process.env` per request, whereas `rewrites()` in `next.config.js` freeze into the
`output: "standalone"` build.

Load-bearing in `lib/api-proxy.ts`: `Expect` is dropped (`undici`: `UND_ERR_NOT_SUPPORTED`);
`Accept-Encoding` is not forwarded nor `Content-Encoding`/`content-length` passed back (`fetch`
decodes its hop); `Set-Cookie` is re-added via `getSetCookie()` (comma-joining breaks `Expires`); no
body for `HEAD`/204/205/304; `request.body` streams (`duplex: "half"`) only while `src/proxy.ts`'s
matcher excludes `api/`, as middleware buffers, truncating at `experimental.proxyClientMaxBodySize`;
the unreachable-API log omits the `?token=` query; `X-Forwarded-For` passes through unappended (a
handler cannot see the socket peer). The API trusts it only from `TRUSTED_PROXY_IPS`: omitted,
callers share one rate-limit bucket; naming a directly exposed container makes every per-IP limit
forgeable (`.env.example` warns).

## Strict, nonce-based CSP via `src/proxy.ts` - Node server only

`src/proxy.ts` (export `proxy`, not `middleware`) sets a per-request
`script-src 'nonce-...' 'strict-dynamic'` CSP. `app/layout.tsx` reads it from the `x-nonce` header
via `headers()` for `next-themes`' `ThemeProvider`; Next propagates it elsewhere. All routes go
dynamic (`ƒ`); accepted. Node server only (`output: "standalone"`): a static export
(`output: "export"`) cannot carry a per-response nonce; that needs a hash-based CSP.

- `eslint.config.mjs` sets `"react/no-danger": "error"`; `dangerouslySetInnerHTML` needs a sanitizer
  plus disable.
- `style-src-attr` is plain `'unsafe-inline'`: third-party inline `style` attributes carry no nonce
  and execute no script. `style-src` is nonce-only in production; dev needs `'unsafe-inline'` for
  Fast Refresh.
- Radix scroll locks (`react-remove-scroll` -> `react-style-singleton`) inject a raw-DOM `<style>`
  with `get-nonce`'s nonce, so `src/components/nonce-provider.tsx` calls `setNonce(nonce)` in
  render, before descendants' effects.
- The matcher omits Next's guide's `missing:` clause: prefetch payloads carry no nonce, and it lets
  any `purpose: prefetch`/`next-router-prefetch` header skip the CSP; `src/proxy.test.ts` pins that.
  `cacheComponents`/PPR, incompatible anyway, would reopen this.

## Unified auth flow: one passwordless `AuthForm`, no password-based `/signin`/`/signup` pair

There is one auth form, `components/auth/AuthForm.tsx` (email, "Continue", "Continue with Google"),
for the passwordless flow; Settings has no "Change Password" card. Its host page depends on
`REGISTRATION_MODE`; see "The landing hero holds one of two forms, and the API is what says which"
and "`/signin` is a dedicated sign-in page, and carries where the visitor was headed".

- `app/auth/verify/page.tsx` is the magic-link target (`{FRONTEND_URL}/auth/verify?token=...`): a
  page rather than the `POST /auth/email/verify` call, so a scanner's GET never burns the single-use
  token; it fires only on a click (see "Both magic-link pages require an explicit click before the
  verifying `POST` fires").
- `app/onboarding/page.tsx` completes the profile (name, username) from `AuthContext`'s `onboarding`
  state, set in memory by `verifyEmailLink`/`signInWithGoogle` on `status: "onboarding_required"`,
  never persisted, so a direct load bounces to `/`.
- `AuthContext` exposes `onboarding`/`completeProfile`/`clearOnboarding` and
  `requestEmailLink`/`verifyEmailLink`/`signInWithGoogle`; the last two return `boolean` (`true`
  signed in, `false` onboarding) so callers pick `/dashboard` or `/onboarding`.

## `google-icon.tsx`'s "G" mark is extracted directly from Google's own pre-approved asset download - not hand-reconstructed

`components/icons/google-icon.tsx` holds the current gradient "super G" that Google's Sign in with
Google branding guidelines mandate; the flat four-quadrant mark
(`#4285F4`/`#34A853`/`#FBBC05`/`#EA4335`) is outdated and rejected. The SVG comes from the "Download
Pre-Approved Brand Icons" bundle, not a hand-drawn approximation: the mask path tracing the
letterform and the gradient layer it masks — a CSS `conic-gradient()` in a `<foreignObject>` (SVG
has no conic paint server) plus blurred colour ellipses — are kept verbatim; the pill
background/stroke and Figma-only metadata (`data-figma-gradient-fill`, `data-figma-skip-parse`) are
dropped. The `viewBox` is cropped from `0 0 40 40` to `10 10 20 20` without touching inner
coordinates. Every mask/clip-path/filter `id` is namespaced through `React.useId()` so multiple
instances cannot collide. The root `<svg>` keeps `fill="none"`: `fill` inherits, and without it
Figma's fallback `<path>` beside the `<foreignObject>` paints solid black over the gradient.

## Changing your account email is a request/confirm flow, not a plain field edit

`lib/validations/settings.ts`'s `profileSchema` has no `email` field, matching the API's
`UserUpdate`; `app/settings/page.tsx`'s profile form touches only name/username. Email lives in
`components/settings/EmailChangeCard.tsx`: enter a new address, submit via
`authAPI.requestEmailChange(newEmail)`, get the same generic "check your new email" message even for
a taken address, and the change applies only once the emailed link is confirmed.
`POST /user/email-change/request` always acts on the caller's own account, so the card takes no
`userUuid` prop.

The field is always visible with one full-width "Send confirmation link" button — no edit toggle, no
cancel — matching the Profile Information card beside it. Both cards use `flex flex-col h-full` /
`flex flex-col flex-1` / `flex-1` so their action buttons sit at the same height whatever their
field count.

The link points at `app/settings/confirm-email/page.tsx`, a standalone centered card in
`NO_CHROME_ROUTES` like `/auth/verify` and `/onboarding`. On success it calls `refreshUser()`,
harmless when the visitor is not signed in there.

## Both magic-link pages require an explicit click before the verifying `POST` fires

`/auth/verify` and `/settings/confirm-email` render a `"ready"` state with a plain button ("Sign in"
/ "Confirm email change") and call `verifyEmailLink`/`verifyEmailChange` only from its `onClick`,
never on load. Mail clients (Outlook Safe Links, iOS Mail previews) load links in a JS-executing
browser before a human clicks; verifying from a `useEffect` hands them the single-use token. A click
is what automation cannot fake, as `/onboarding` already requires for a new account.

Rejected: a same-browser pairing cookie (requesting on a laptop and opening on a phone is normal),
and verifying on load while leaning on the backend's idempotent reuse of a used-but-not-invalidated
token (`AuthenticationRequest.used_at` vs `invalidated_at`), which still lets automation sign in.
That leniency remains, as defence in depth for double clicks.

`/settings/confirm-email` auto-redirects to `/settings` 3 s after `"success"` (`setTimeout`, cleaned
up on unmount) beside a "Back to settings" link; `/auth/verify` needs none, since
`router.replace("/dashboard")`/`"/onboarding"` follows `verifyEmailLink` directly.

## Magic-link pages: The button itself shouldn't show for a link that's already been used

Both pages call a side-effect-free precheck on mount —
`authAPI.checkEmailLink`/`checkEmailChangeLink` (`GET /auth/email/verify/check`,
`GET /user/email-change/verify/check`) — before showing the confirm button, in a `"checking"` state
distinct from the post-click `"verifying"`. A used, invalidated or expired token goes straight to
`"error"`; only a live one reaches `"ready"`. Otherwise the back button lands on a page whose button
"succeeds" again via the backend's idempotent-reuse leniency, meant for races. A `checkedRef` guard
keeps Strict Mode from double-firing the check.

The check returns the token's target email, shown in `"ready"` ("Click below to sign in as
`{email}`") and, for confirm-email, in `"success"` from `verifyEmailChange`'s response.

`AuthForm`'s "Check your email" screen gates "Resend link" behind a 30 s client-side countdown
(`RESEND_COOLDOWN_SECONDS`), a self-rescheduling `setTimeout` (not a mount-tied `setInterval`) that
stops at zero and restarts on resend. The real limit is server-side (`MagicLinkSettings` in the
API's `core/config.py`); a resend past it surfaces `RateLimitException`'s message.

## Current-user endpoints live on a bare `/user`, not `/user/me`/`/user/{uuid}`

The API serves current-user-only routes on a bare `/user` (no `/me`, no `{uuid}` — see the API's
`DECISIONS.md`), separating "my account" (full data, always the signed-in caller) from a future
public-profile endpoint for other users (limited fields, no `email`, not built). `lib/api/auth.ts`
matches: `authAPI.getCurrentUser()` calls `GET /user`, and `authAPI.updateProfile(profileData)`
calls `PATCH /user` with no `userUuid` argument. `lib/api/dive-stats.ts`'s
`diveStatsAPI.getDiveStats()` calls `GET /user/dive-stats`, also without `userUuid`; its callers are
`dashboard/page.tsx` and `profile/page.tsx`. There is no way to fetch or manage another user's data
through this API until the public-profile endpoint exists.

## FIT imports: one vendor-neutral label, and gas gaps filled here but declared

`diveParserLabel` says "FIT export", not "Garmin FIT": one parser reads every vendor's FIT files
under `parser_key` `fit`. `DIVE_FILE_ACCEPT` is `.xml,.json,.fit`; `dives.test.ts` pins both against
the API's registry with `satisfies Record<keyof typeof DIVE_PARSER_LABELS, string>`.

Gaps are never filled: an invented 11.1 L of air corrupts `compute_gas_use`, so a gap stays `""`,
saves as NULL, and the import box names it in a line that stays on screen. `guessed` is keyed off
the file alone and holds a per-field source fixed at import; the note quotes no value, the fields
being ~2,200 px away. Helium folds into "gas mix" when oxygen was guessed too, `helium fraction`
otherwise.

`mergeMixture` reads the file first, then the same-position cylinder, pairing only when counts
match; pressures move as a pair. `role="status"` renders unconditionally, `sr-only` until it has
text. `lib/dive-import.ts` holds the logic; `dive-file-import.test.ts` tests `applyParsedDiveToForm`
against the pages' literal seeds, `[]` and one `DEFAULT_MIXTURE`.

## Parsed dive-file mixtures need `useFieldArray().replace()`, not `form.setValue()`

`applyParsedDiveToForm` (`dive-file-import.tsx`) fills top-level fields with `form.setValue(...)`
but hands `ParsedDiveSchema.mixtures` to an explicit `replaceMixtures` parameter, mapped to
`DiveMixtureInput` via `mergeMixture`. `MixtureFields` (`mixture-fields.tsx`) renders the array
through `useFieldArray({ name: "mixtures" })`, which keeps its own `fields` state keyed by generated
`id`, and `setValue` does not keep that bookkeeping in sync.

There must be exactly one `useFieldArray({ name: "mixtures" })` per form. Two instances on one
`control`/`name` do not sync on shrink: `replace()` through one leaves the other's `fields.length`
unchanged when the new array is shorter, so an import with fewer mixtures than the form holds leaves
trailing rows behind. `mixture-fields.tsx` exports the `MixtureFieldArray` type
(`UseFieldArrayReturn<MixtureFieldsValues, "mixtures">`) and `useMixtureFieldArray(control)`;
`dives/new/page.tsx` and `dives/[id]/edit/page.tsx` call it once beside `useForm()` and pass the
result through `DiveFormCard` to `DiveFormFields`/`MixtureFields` and `DiveFileImport`, which never
create their own. `ParsedDive` (`lib/api/dives.ts`) declares `mixtures: ParsedDiveMixture[]`
explicitly.

## `dives/new`/`dives/[id]/edit` pages share `DiveFormCard`/`PageHeader`/`PageSpinner`

A dive form page is its own data-loading effects, its own `onSubmit` and its early-return states,
then one `PageHeader` and one `DiveFormCard`. `useMixtureFieldArray(control)` (`mixture-fields.tsx`)
holds the `useFieldArray` generic parameter and cast in one place. `DiveFormCard`
(`dive-form-card.tsx`) wraps `Card`/`Form`/`form` + `DiveFileImport` + `DiveFormFields` +
`DiveFormActions`; the per-page inputs are `mode`, `userId`, `onSubmit`, `cancelHref`,
`submittingLabel` and `submitLabel`. `PageHeader` (`components/ui/page-header.tsx`) is the
resource-agnostic back-button + title/subtitle block, with an optional `actions` slot for the `[id]`
detail pages' Edit/Delete row.

`PageSpinner` (`components/ui/page-spinner.tsx`) is the full-viewport `min-h-screen` `<Loader2>` for
the top-level auth-loading gate. The list and detail pages render below `AppShell`'s header and
footer, so their spinners use `min-h-[60vh]` inline. `SectionSpinner`
(`components/ui/section-spinner.tsx`) is a loading section inside a rendered shell; `NotFoundState`
(`components/ui/not-found-state.tsx`, `message`/`backHref`/`backLabel`) the not-found state. Both
omit the outer container `div`, whose class differs between edit pages
(`container mx-auto px-4 py-8`) and detail pages (`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8`).

## Mixture form/display numbers match the API's 2-decimal precision

The API rounds parsed `oxygen`/`helium`/`start_pressure`/`end_pressure` to two decimals, so
`mixture-fields.tsx`'s `<Input type="number">`s for those use `step="0.01"`, like
`max_depth`/`avg_depth`/`bottom_temperature` in `dive-form-fields.tsx`, and `dives/[id]/page.tsx`
renders `oxygen` and `helium` as raw numbers — `toFixed(1)` hides a real digit (`20.99%` as
`21.0%`).

Volume is `VolumeCombobox` (`volume-combobox.tsx`), built like `CreatableCombobox`: a plain
`<input type="number">` plus a hand-rendered absolute-positioned dropdown of `<button>`s, not Radix
`Select`. Radix registers `SelectItem`s only once the dropdown has opened, so a closed trigger's
`SelectValue` cannot resolve a label for a parsed value matching no preset and renders "NaN L". The
input shows the bare number (`11.1`, never `11.1 L (AL80)`); a preset's label appears only in the
dropdown, which always lists every preset with no filter-as-you-type — few enough that filtering
only hinders comparing them. There is no custom clear button: select-all and delete already clear a
native number input.

## Gear sets are loaded into the dive form, never linked from the dive

The dive form's gear section (`components/gear/dive-gear-field.tsx`) has a "Load a gear set..."
picker, the item list (`GearItemMultiSelect`) and a "Save as set" button. Picking a set replaces
`gear_item_uuids` with that set's items; from then on the two are independent, and the dive is saved
with items only — the API has no `gear_set_uuid` on a dive.

Loading a set into a non-empty list asks first via `ConfirmDialog`, naming what is about to be
replaced; loading into an empty list is one click. The picker un-selects itself once the list is
edited: `GearItemMultiSelect` fires `onManualChange` only on user-driven add/remove, not on the
programmatic `onChange` from loading a set, so it stops claiming "Sidemount" after half the kit is
swapped. "Save as set" opens `GearSetDialog`, the same component the gear page uses, with
`initialItemUuids` plus `allowChoosingTarget`, which adds a "Save to" dropdown of existing sets
alongside "Create a new set".

## The gear picker displays archived items but won't offer them

`GearItemMultiSelect` renders archived items — an old dive or an older set can reference retired kit
— with an "Archived" badge, removable but never offered for a new selection. The dropdown searches
server-side with `include_archived=false`, so retired kit does not eat into the page of matches; an
archived selection reaches the list through the same per-uuid lookup as any other unknown uuid.
New-dive prefill (`dives/new/page.tsx`) carries the previous dive's gear over but skips archived
items, since the picker would not offer them either.

## Gear is created and edited in dialogs, not on `new`/`edit` pages

Trips and dive sites get `/x/new` and `/x/[id]/edit` pages; gear does not. `GearItemDialog` and
`GearSetDialog` handle both create and edit — passing an existing record edits it in place, omitting
one creates — and `/gear` is one page listing items and sets together. A gear item is four fields
(name, brand, rented, notes), and the flow that matters most is adding one from inside a half-filled
dive form, where navigating away would lose the form or need draft persistence. `/gear/[id]` remains
as a detail page because it hosts the "Dives with this Gear" list.

## The gear delete dialog offers "Archive instead", and its wording is pinned by a test

Both gear delete confirmations read:

> Deleting removes this gear from your dives and gear sets. To keep it in your log and its service
> history, archive it instead. Either way, its service reminders stop.

A deleted item drops off dives and sets entirely (`crud_dive_gear_items.py`,
`crud_gear_set_items.py`). `ConfirmDialog` takes `secondaryAction?: { label, onClick }`, rendered
between Cancel and confirm; it is disabled by `isLoading`, not by `confirmDisabled`, which only
means the dialog's content is incomplete.

The offer appears only while `is_archived` is false, because both pages archive through a toggle
(`toggleArchived` on the list, `handleToggleArchived` on the detail page). It archives directly,
skipping the row action's confirmation (`handleArchiveToggle` / `setIsArchiveConfirmOpen`).

"Either way" stands as its own sentence: archiving stops reminders exactly as deleting does
(`send_gear_service_digests` filters `GearItem.is_archived.is_(False)`), and hanging the clause off
either verb reads as "archiving keeps them". A test pins the wording.

## The invite queue selects with checkboxes, and everything else is a switch

The line is selection against setting: a switch is a state you leave set, while an invite-queue row
is picked for a batch that means nothing until Send invitations or Remove is pressed.
`/admin/invites` is the app's only checkbox. Every other boolean (the Fields dialog alone has one
per `DIVE_FORM_FIELD_REGISTRY` and `DIVE_FORM_ALWAYS_ON_FIELDS` entry) is `Switch`
(`ui/switch.tsx`), taking `checked`/`onCheckedChange`; Radix's `Root` renders
`<button type="button">`, which `<label htmlFor>` names.

The tri-state settles it: select-all is `indeterminate` on a partial selection, and ARIA forbids
`aria-checked="mixed"` on `role="switch"`, so a switch would read as off with rows selected.
`ui/checkbox.tsx` is a styled native `<input type="checkbox">`, not `@radix-ui/react-checkbox`;
`indeterminate` is a DOM property, not an attribute, so the header box sets it through a `ref`
callback. A screen reader reads the mixed state at the header box; the "N addresses selected"
`aria-live` region above the table announces as rows are ticked.

## A dialog's submit event bubbles into the form that opened it

Every "quick add" dialog — gear item, gear set, dive site, trip — renders from inside the dive form,
and each contains its own `<form>`. Radix portals `DialogContent` to `document.body`, so the DOM has
no nested forms, but React bubbles through the React tree: the dialog's submit lands in the dive
form's `onSubmit`, and `handleSubmit` calls `preventDefault()` but never `stopPropagation()`. Saving
in the dialog then submits the dive form too, which fails validation on an unfilled field ("Duration
is required") and scrolls to it; Enter in any dialog input does the same via implicit submission.

`lib/dialog-form.ts`'s `dialogFormSubmit()` stops propagation before handling:

```tsx
<form onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}>
```

Any new dialog containing a form must use it; the bug is invisible until the dialog is opened from
inside another form. `lib/dialog-form.test.ts` covers stop-before-handle, event passthrough and
errors not swallowed.

## Gear types are a closed vocabulary shared with the API, not free text

`GEAR_TYPES` in `lib/api/gear.ts` mirrors the API's `GearType` enum, which is DiveJSON 1.0's
`gear_item.type` enum value for value and in order; the check is a diff against
`schema/1.0/divejson.schema.json`'s `#/$defs/gear_item/properties/type/enum` in
[DiveJSON](https://github.com/divejson/divejson). Declaration order is the picker's order, so a new
category enters the format first and lands here at its position.

`gearTypeLabel()` falls back to the raw value for a type this build lacks (a slug beats a blank
cell), and a test walks `GEAR_TYPES` for a type without a label. Nothing generates the list from
either source, so the API widens first — it rejects an unknown `type` with a 422 — and the picker
last.

Type is optional: `""` is the form's "not set" state, sent as explicit `null` on update and omitted
on create. Radix `SelectItem` cannot take an empty string, so "No type" uses a `__none__` sentinel,
like `GearSetDialog`'s "Create a new set".

## `ComboboxItem.hint` is a cosmetic second line, not a `location`

`CreatableCombobox` items carry an optional `hint`: a purely cosmetic second line after the name.
Dive sites put a location there; the gear picker puts the item's type ("Apeks XTX50, Regulator"),
since kit often has cryptic model names and the category is what makes the dropdown scannable. The
name is `hint` rather than `location` because the slot is not about places.

## Drag-to-reorder uses Pointer Events and no library

`hooks/useDragSort.ts` drags gear and dive sites by a grip handle without a library.

Pointer Events, not HTML5 drag-and-drop, which emits nothing for touch; the hook sets
`touch-action: none` on the handle or the browser scrolls instead. Move listeners go on `window`,
not `setPointerCapture`: React moves the capturing row on reorder, which fires `lostpointercapture`
and kills the drag. The row follows the pointer via `dragOffset`, re-based at each swap
(`desiredTop - targetRect.top`); swaps compare row centres and walk every neighbour cleared.
`moveItem()` returns the same reference for a no-op move since `onReorder` fires per pointermove.

The handle is a real `<button>` answering Up/Down, and uuid-keyed rows keep focus across reorders.
Dive sites have no separate arrows; their handle's `aria-label` names the position and the primary
slot, since position 0 decides where the dive is filed. `resolveSwapTarget()` is exported so the
pure logic is unit-testable; jsdom has no layout.

## The combobox opens on click as well as focus, and stays open for multi-select

`CreatableCombobox` opens its menu on `onClick` as well as `onFocus`. Picking an item closes the
menu while the item's `onMouseDown` `preventDefault` keeps focus on the input, and `focus` does not
fire on an already-focused element — so focus alone leaves the input a dead end after any close that
keeps focus (a pick, Escape, a dialog restoring focus). A click always brings the menu back.

`keepOpenOnSelect` keeps the menu up after a pick and clears the typed filter so several items can
be added in a row. `DiveSiteMultiSelect` and `GearItemMultiSelect` set it, their picked items moving
into the list above; `TripCombobox` leaves it off because it fills a single field, where closing and
showing the chosen name is right.

## Dropdowns are navigable with Up/Down and Enter

`CreatableCombobox` (dive sites, trips, gear) and `VolumeCombobox` (cylinder presets) highlight rows
with Up/Down and take the highlighted one with Enter, sharing `nextActiveIndex()` so they move
identically.

The menu opens with nothing highlighted (`activeIndex === -1`), so Enter keeps its meaning — commit
the typed text, matching an exact name or creating one via `onCreate` — rather than picking the
first row; Down enters from the top, Up from the bottom. Movement clamps rather than wrapping. The
"Add new..." row is option 0, not a special case. Typing resets the highlight and hovering moves it,
so mouse and keyboard agree. The input carries `role="combobox"` with
`aria-expanded`/`aria-controls`/`aria-activedescendant`, rows carry `role="option"`/`aria-selected`,
and the highlighted row scrolls into view (`block: "nearest"`) in the 15rem-tall menu.

`VolumeCombobox`'s `type="number"` input gives up native Up/Down stepping by `step` (0.01) for list
navigation; reconsider that one dropdown if stepping is ever wanted.

## Weight sits with the gear, not with the environment readings

`weight` (kilograms of ballast, a plain per-dive number on the API's `Dive`) renders directly below
the gear picker in `DiveFormFields` and inside the "Gear" card on the dive detail page, not beside
Bottom Temperature/Visibility. The form splits what the diver observed (depth, temperature,
visibility, water type, altitude) from how the diver was configured (gear, weight), and weight is
the field most often looked up to check against the suit and cylinder used.

The detail page's Gear card renders when either is present: `hasGearInfo` is
`gear_items.length > 0 || weight != null`, mirroring `hasEnvironmentInfo`. `dives/new` pre-fills it
from the last dive alongside gear and mixtures, since it rarely changes between consecutive dives.
Zod uses `min(0)` rather than `positive()`, matching the API's `ck_dive_weight_non_negative`: zero
is a real entry, distinct from an omitted one.

## Loading a gear set fills in the dive's weight too

A `GearSet` carries an optional `weight` (kg), and picking a set in the dive form applies it
alongside the item list; the dive keeps its own copy from then on.

`applySet` calls `onWeightChange` only when `set.weight != null` — a set without a weight is not
asserting "dive with zero lead", which is also why `gear_set.weight` is nullable rather than 0. The
`ConfirmDialog` fires on a non-empty item list only; the weight rides along unguarded, because
rebuilding eight hand-picked items is laborious and retyping one number is not. "Save as set" passes
`initialWeight={weight}` beside `initialItemUuids={value}`.

`DiveGearField` takes `weight`/`onWeightChange` without rendering the input. In `DiveFormFields` the
gear `FormField` is nested inside the weight one so both `field` objects are in scope; registering
`weight` twice (`useController` plus `FormField`) works in react-hook-form but leaves two
subscriptions to one name for no benefit.

## Service status is derived in the browser, because a cached "days remaining" is a lie

The API returns only clock-stable facts — `next_due_on`, `next_due_at_dive_count`,
`last_service_on`, `dive_count` — and no service status. Status depends on today's date, and the
single-item cache is an hour (the list 60s), so a server-computed "due in 1 day" would still say so
tomorrow.

`serviceStatus()` in `src/lib/gear-service.ts` does the arithmetic at render time. It is a
line-for-line twin of `service_status` in the API's `services/gear_service.py`, which exists only
for the reminder email; the constants are named identically on both sides
(`SERVICE_DUE_SOON_DAYS = 30`, `SERVICE_DUE_SOON_DIVES = 10`) so `grep SERVICE_DUE_SOON` finds the
pair. Both interval arms are evaluated and the more urgent wins ("annually or every 100 dives,
whichever comes first"). `worstServiceStatus()` collapses an item's schedules into the gear list's
one badge and returns `null`, not `"ok"`, when there are no schedules: nothing tracked is not
everything fine, and `ServiceStatusBadge` renders it as a muted dash.

## `lib/gear-service.ts` holds the logic, `lib/api/gear-service.ts` holds the transport

`lib/api/gear-service.ts` is transport: hand-written types and axios calls (`SERVICE_KINDS`,
`serviceKindLabel`, the `gearServiceAPI` object) mirroring the API's Pydantic schemas, like
`lib/api/gear.ts`. `lib/gear-service.ts` is pure functions — no axios, no React — so the rules that
matter (status thresholds, date arithmetic, due-text phrasing, type presets) are unit-testable;
`gear-service.test.ts` holds the status truth table. `vitest.config.mts` collects coverage for
`src/lib/**` only, so anything worth testing lives in `lib/`.

`lib/api/gear.ts` imports `GearServiceScheduleSummary` from `lib/api/gear-service.ts` as
`import type`; the API side points the other way (`schemas/gear_service.py` imports nothing from
`gear_item.py`), so the pair can never become a cycle.

## Service dates are `YYYY-MM-DD` and never touch `new Date(dateString)`

`next_due_on`, `starts_on`, `serviced_on` and `last_service_on` are bare dates, and
`new Date(dateString)` parses one as UTC midnight — the previous day anywhere west of Greenwich,
making every due date read a day closer than it is.

`daysBetweenIsoDates()` builds both ends from split parts (`new Date(y, m-1, d)`), like
`formatDateOnly()`. Local midnight on both ends is immune to DST: both Dates shift by the same
offset, and rounding the millisecond difference absorbs the one 23- or 25-hour day between.
`todayIsoDate()` is built from local getters rather than `toISOString()` for the same reason. The
tests assert exact day counts across both DST transitions and run under UTC-8 through UTC+14.

## Gear service uses two dialogs, and both need `dialogFormSubmit`

`GearServiceScheduleDialog` and `GearServiceRecordDialog` follow `GearItemDialog`: dialogs rather
than pages, since they are a handful of fields reached from a gear detail page the diver wants to
stay on, with the same three-way open state (`null` closed, `undefined` creating, an object
editing).

Both contain a `<form>` and wrap their submit in `dialogFormSubmit()`. They are not opened from the
dive form today, but the rule is about the React tree, not the call sites, and costs nothing.

Both interval fields use the `""`-means-cleared convention of `gearSetSchema.weight`, mapped to an
explicit `null` on PATCH so an interval can be removed rather than ignored as an omitted key. The
"at least one interval" rule is an object-level `.refine()`, which unlike
`z.preprocess()`/`.transform()` leaves `z.input<>` untouched.

## Per-gear-type service presets are prefills, not safety advice

`defaultSchedulesForGearType()` prefills "Add Schedule" — "visual inspection, every 12 months" for a
cylinder, "service, every 12 months or 100 dives" for a regulator — purely to save typing. The
presets are not authoritative: manufacturer intervals differ, and cylinder test periods are set by
jurisdiction (five years across much of the US and EU, two and a half in some regimes). Every field
stays editable, nothing is filled in silently on save, and the dialog says so. This is
dive-safety-adjacent UI and must not read as advice; keep that framing if the list grows. Gear with
no meaningful convention (a mask, a knife) or no type gets `[]`, not a made-up default.

## The dashboard's "Service due" card renders nothing when nothing is due

`ServiceDueCard` returns `null` when no schedule needs attention and when its fetch fails (logged,
not surfaced): a permanent "all your gear is fine" tile trains people to stop reading the dashboard,
and a supplementary card erroring out should not make the page look broken.

It calls `GET /gear-service-due`, which takes no date horizon — a server-side "due within N days"
would bake today's date into a cached response and go wrong at midnight — and buckets client-side
through the same `serviceStatus()` every other surface uses. The gear list needs no extra request:
`GET /gear-items` embeds each item's schedules as `item.service`, and the badge derives from those.

## The dashboard's "Service due" card: each row logs its service without leaving the dashboard

Each row carries the gear detail card's icon-only `ClipboardCheck` button, opening the same
`GearServiceRecordDialog`. The row is a flex container with link and button as siblings, not one
`Link`: a `<button>` inside an `<a>` is invalid HTML and would also navigate.

The button names item and schedule, since the list spans a diver's every item;
`service-due-card.render.test.tsx` renders the four-row case. `serviceKindAndLabel` sits in
`lib/api/gear-service.ts` beside `serviceKindLabel` so both surfaces phrase a schedule one way.

`GearServiceRecordDialog` takes `gearItemUuid`, not a `GearItem`, an optional `gearItemLabel` as
description, and a `schedule` typed `GearServiceScheduleSummary`. The entry is `useMemo`d: the
dialog resets its form in an effect keyed on `schedule`, and a `scheduleFromDueEntry(...)` built
during render wipes half-typed notes. It mounts only while a row is being logged. The fetch is a
`.then()` chain in a `useCallback`, not `async`, because `react-hooks/set-state-in-effect` reads an
awaited call in an effect body as a synchronous `setState`.

## The gear reminder toggle lives in its own settings card, and saves on change

`NotificationsCard` is factored out like `EmailChangeCard` rather than bolted onto the profile form:
a different concern that grows if more email preferences appear. It saves on change rather than
behind "Save Changes" — a single boolean, and a toggle that needs confirming reads as broken — and
sends only `{ gear_service_emails }`, since `PATCH /user` is `extra="forbid"` and anything else
alongside would 422. `User.gear_service_emails` is optional in the TS type and falls back to `true`
when absent, matching the server default.

## Private card images render from a blob URL, which needs `blob:` in `img-src`

`GET /certification/{uuid}/file/{side}` is owner-only and needs an `Authorization` header, which an
`<img src>` cannot send; `lib/api/client.ts` holds the access token in memory and only the refresh
token is a cookie, so a plain `src` would 401.

`hooks/useAuthedBlobUrl.ts` fetches through the API client with `responseType: "blob"`, wraps the
result in `URL.createObjectURL`, and revokes it on replacement and unmount (an unreleased object URL
leaks the blob for the life of the page). `proxy.ts` therefore lists `blob:` in `img-src`: `'self'`
does not cover blob URLs, and a `blob:` URL can only name data this document created.

The hook keeps one settled result object and derives `isLoading` from `result === null`; setting a
flag synchronously in the effect body trips `react-hooks/set-state-in-effect`. The blob is refetched
on every mount, so a card in both list and dialog is fetched twice — fine behind
`Cache-Control: private, max-age=300` and `ETag`, not at gallery scale.

## Private card images: Keying that fetch on (certification, side) is not enough - it breaks Replace

The card image sits at a stable URL whose contents change, which defeats two caches at once:
`fetchBlob` keyed on `[certificationUuid, side]` never re-runs `useAuthedBlobUrl`'s effect after a
replace, and `max-age=300` lets the browser serve the old bytes for five minutes from an identical
URL.

`certificationFileVersion(file)` in `lib/certification.ts` fixes both: it is in the `useCallback`
deps and is sent as a `v` query param the API ignores. `updated_at` moves on every replace; `uuid`
covers delete-then-upload, which inserts a new row whose `updated_at` is null like the original's.
It does not fold in `side`, already in the URL, so repeat views of an unchanged card still hit the
cache. It lives in `lib/` to be testable: `certification.test.ts` covers replace, second replace and
delete-then-reupload, none of which a type checker sees.

## PDFs are download-only, never previewed inline

`proxy.ts` sets `object-src 'none'` with a narrow `frame-src`, and inline PDF rendering needs an
`<object>` or `<iframe>`. Loosening either to display user-uploaded documents is a bad trade for a
preview, so a stored PDF shows as a labelled file with a Download button; most c-cards are
photographed, so the image path is the common one. Downloading goes through the API client — a plain
`<a href>` to the endpoint would 401 — fetching the blob, clicking a synthetic anchor and revoking
the URL immediately.

## `useWatch`, not `form.watch()`

`CertificationDialog` shows `agency_other` only when the agency is `other`, read with
`useWatch({ control, name })`. `form.watch("agency")` returns a fresh function every render that
cannot be memoized, which `react-hooks/incompatible-library` flags — against the `useForm()` call,
and while it is present the react-hooks plugin stops analysing the rest of the component, so fixing
it can reveal previously silent `set-state-in-effect` errors in the same file.

## Certification expiry is derived in the browser, and `null` means "don't badge"

`lib/certification.ts` reuses `todayIsoDate`/`daysBetweenIsoDates` from `lib/gear-service.ts`; both
avoid `new Date(dateString)` on a bare date, which parses as UTC midnight and lands a day early in
western timezones.

`certificationExpiryStatus` returns `null` for both "no expiry date" and "expires, but not soon" —
there is no "valid" state. Most recreational certifications never expire, so badging them all green
would bury the rows that need attention, the same reasoning as `worstServiceStatus` returning `null`
for untracked gear. The window is 90 days, not gear's 30: renewing a rescue or first-aid card means
booking a course with an instructor, not dropping a regulator at a shop.

## Card uploads are a separate step from creating the certification

The API takes card images on `PUT /certification/{uuid}/file/{side}`, not as multipart on create, so
the dialog creates the certification first and then opens the card-images dialog. A new
certification hands straight off to that second dialog: adding the photo is the point of the
feature, and making the diver find the button afterwards would bury it. After any upload or delete
the list's embedded file metadata is stale, so the page refetches the single certification and the
list, and re-points the open dialog at the refreshed row — otherwise the open panel keeps showing
what it loaded with.

## The dive form holds the imported file in page state and uploads it after saving

`DiveFileImport` calls `onFileAdded` only after a successful parse, and the page — `dives/new` and
`dives/[id]/edit` — parks the pending files in `useState` until `createDive`/`updateDive` resolves.
The API stores nothing at parse time and there is no dive to attach to before the save succeeds.
Uploading after the save also means importing a file and then cancelling an edit never changes the
dive's stored export.

A failed attach is a toast, not a rollback: the dive is saved and correct, and the file is kept so
parsing features can be developed against real exports, which is not worth undoing the diver's save
over. Both real failures surface with the API's wording — a 409 means the export is already attached
to another dive, a 422 that the import went stale and needs redoing. `isSubmitting` stays true
across the upload so the button does not re-enable mid-flight.

## The dive's source file downloads through the API client, like card images

`DiveRecordingsCard` fetches a Blob through the API client (`getDiveFileBlob`, keyed by dive and
file uuid) and clicks a synthetic `<a download>`, the same pattern as
`certification-view-dialog.tsx` and for the same reason: the endpoint needs an `Authorization`
header and the access token lives in memory, so a plain `<a href>` would 401. The object URL is
revoked immediately; the browser holds its own copy by the time the click returns. No CSP change is
needed, since nothing renders the file — `useAuthedBlobUrl` and the `blob:` `img-src` entry are not
involved. The `v` param is `${uuid}:${updated_at}`: `uuid` covers delete-then-reattach, `updated_at`
a replace; without it `max-age=300` keeps serving the previous file's bytes.

## Deleting the imported file refreshes without the page-level spinner

The dive detail page has two fetchers: the initial `useEffect` one, which toggles `isLoadingDive`
and redirects on failure, and a separate `refreshDive` `useCallback` passed to `DiveRecordingsCard`
as `onChanged`, which does neither. Reusing the first would blank the page into a spinner to swap
one card and redirect to `/dives` if the refetch failed after a delete that had already succeeded.
It also trips `react-hooks/set-state-in-effect`: a `useCallback` that calls `setState` synchronously
cannot be called from an effect body.

## `Dive.source_file` is optional because the list response never carries it

The same `Dive` interface backs `GET /dives` and `GET /dive/{uuid}`, and the API sends `recordings`
only on the detail one — the list is its hottest query and nothing in the table renders an
attachment. Hence `recordings?:` rather than a required member; do not "fix" the missing value by
adding it to the list server-side. `diveParserLabel` falls back to the raw `parser_key` for a parser
this build has not heard of, rather than to a blank or "Unknown": the API can grow a parser ahead of
the frontend, and a slug in the cell beats an empty one that reads as a bug.

## Air consumption is the API's number; the browser only explains its absence

`dive.gas_use` (SAC/RMV) arrives computed from the detail endpoint and renders as-is: unlike service
status, it depends only on stored dive fields, so a cached value cannot go stale. The one
implementation is the API's `services/dive_gas.py`; do not add a second here.

The browser owns `lib/dive-gas.ts`'s `gasUseUnavailableReason()`. The API returns `gas_use: null`
for an un-derivable dive without saying why; the Air Consumption card renders whenever the dive logs
a tank, showing the figures or the reason, because an absence despite filled-in pressures reads as a
bug. Its branches mirror the guards of `compute_gas_use()` and `compute_multi_tank_gas_use()` and
change with them (`grep gas_use` finds the set). It returns `null` when `mixtures` is absent (the
list response carries neither `mixtures` nor `gas_use`), and the multi-tank branch names a
limitation rather than asking for a field, except the one case in "The multi-tank branch splits
three ways, and tests attribution first".

## The air-consumption chart is hand-rolled SVG, and breaks its trend line at gaps

No charting library: `src/proxy.ts` ships a nonce-based CSP that allows inline style attributes
(`style-src-attr 'unsafe-inline'`) but nonce-gates `style-src` in production, so a library injecting
a `<style>` element breaks only in production. `gas-use-chart.tsx` is plain `<svg>` themed off
`currentColor`.

`segmentByGap()` splits the series where consecutive dives are more than `TREND_GAP_DAYS` (60)
apart, one polyline per run, so a summer without dives is a gap, not a flat line.

Coral trend, teal dots: declared once in `globals.css`, never under `.dark`, so they hold contrast
in both themes.

The y axis is not zero-based: `niceDomain()` rounds outward from the data, with 2.5 in its
progression so a 5-to-26 spread does not step by 10.

Each dot is a plain SVG `<a>`, not `next/link`. Below ~560px the chart scrolls inside
`overflow-x-auto`. The card renders when empty, unlike `ServiceDueCard`: missing pressures or an
average depth are something the diver can fix.

## The chart windows to All/Year/Month, but scales itself from the whole series

`GasUseCard` owns a scope switch (`all`/`year`/`month`) with prev/next, and opens on `year` at the
most recent dive. Three things derive from the whole series, not the window: the y domain, so
periods stay comparable; the trailing mean, sliced after computing; and the x bounds, which are the
calendar period, so one April trip is one cluster, not a stretched year.

`periodRange`, `periodLabel`, `availablePeriods`, `stepPeriod` and `resolveAnchor` live in
`lib/chart-period.ts`, shared with `DiveActivityCard`. `stepPeriod()` skips to the next period
containing dives; `null` disables the button. The label is a `<Select>` over `availablePeriods()`
whose value is the period's start, never the anchor: a Radix `Select` with an unregistered value
renders an empty trigger. The anchor is always a dive's own timestamp.

Everything buckets on `diveWallClockTime()`, never `new Date(start_time).getTime()`, and reads back
with `getUTC*`/`Date.UTC`/`timeZone: "UTC"`; a local getter in that chain moves a New Year's dive a
year.

## The chart's tooltip is one state-driven card, not a tooltip per dot

One `hovered` index for the whole chart drives an HTML card over the plot, not a `Tooltip.Root` per
point: the same state drives the dot's enlarge-and-brighten, so dot and card cannot disagree.
`@radix-ui/react-tooltip` is for buttons.

It is positioned in percentages of the chart box (the SVG scales uniformly in a wrapper of its own
size) through the `style` prop, an inline attribute the CSP allows
(`style-src-attr 'unsafe-inline'`). It flips to stay inside the box — below the dot in the top
third, edge-aligned within 18% of either side — because `overflow-x: auto` on the scroll container
computes `overflow-y` to `auto` and clips.

Each dot has an invisible `r=7` hit circle with `fill="transparent"`, not `fill="none"`, which takes
no pointer events. The card is `pointer-events-none` so it cannot steal the hover, has no accessible
text (the link's `aria-label` does), and clears when the window changes.

## `--tooltip` is its own surface token, because `--popover` isn't one

`--popover` and `--card` are the same colour in both themes, so `bg-popover` over a card is
separated from it by a 1px border alone — fine for a dropdown over page background, wrong for a
hover card overlapping its own data points, which then reads as cut out of the card.

The hover card uses `--tooltip`/`--tooltip-foreground`, declared in `globals.css` and registered in
`tailwind.config.mts` like `--coral` and `--teal`. It is dark in both themes rather than inverting:
a near-black chip carries the same weight over a white card as over a dark one. Contrast against the
card: 17.9:1 light, 1.22:1 dark, where shadow and hairline border do the separating; chip text 17:1,
70%-alpha secondary lines 8.8:1.

The border is `border-white/10`, not `--border`, which is invisible on a near-black chip in light
mode and merges with it in dark.

## `niceDomain`/`axisTicks` live in `lib/chart-scale.ts`, not `lib/dive-gas.ts`

`niceDomain` and `axisTicks` live in `lib/chart-scale.ts`, with their tests, not in
`lib/dive-gas.ts`: a depth axis has nothing to do with gas use, and importing a gas module to scale
metres reads as an accident.

`niceDomain`'s "deliberately not zero-based" docstring is right for depth too. The depth axis
anchors at the surface by arithmetic — feeding the surface's own `0` into the values makes
`Math.floor(0 / step) * step` equal 0 — so a `zeroBased` flag would do nothing.

## The dive profile chart is hand-rolled SVG too, with three channels and one hovered time

Same CSP reasoning as the air-consumption chart, restated in the component so nobody reaches for
Recharts; the arithmetic lives in `lib/dive-profile.ts`, Vitest-tested.

Depth is inverted, surface-anchored and filled (`text-teal`, `opacity-15`). Temperature gets its own
domain, since 21.6–21.9 °C is flat on a depth-wide axis. Pressure shares the right edge without
labels; every cylinder shares one pressure domain.

One hovered time, not index: channels are sampled independently, so a full-plot transparent `<rect>`
maps the cursor to seconds once and each channel resolves its own sample with `nearestSampleIndex`.
Readouts are real readings, never interpolations.

`tooltipVerticalAnchor` pins the card to the plot's top or bottom edge, whichever keeps it off the
readings: card height depends on channel count, so offsetting from a point overflows the clipping
scroll container.

Keyboard scrubbing is out of scope. The `aria-label` uses `formatDurationHoursMinutes`, not `MM:SS`.
`--pressure` is a third theme-stable token in `globals.css`, violet.

## The profile's line breaks are derived from the series' own cadence

`segmentByTimeGap` is `segmentByGap` in seconds: never draw a line across data that is not there, or
a ten-minute transmitter dropout reads as a smooth pressure fall. `Dive_2025-03-08-1440.xml` has a 1
341-second hole in its pressure series.

The threshold is derived (`gapThreshold`), not fixed: cadence ranges from 1 s (Suunto Ocean
temperature) to 10 s (Suunto depth series), and the API's min/max downsampling stretches it
unevenly, so a fixed value either breaks every downsampled line into confetti or draws through a
real dropout. Three times the median delta sits above jitter and below any dropout worth showing;
`MIN_GAP_SECONDS` keeps a regular 1 Hz series from breaking on a rounding wobble.

## The profile card fetches on mount and needs no `onChanged`

`DiveProfileCard` renders nothing when the shown recording has no `profile` summary — the same call
as `DiveRecordingsCard`, the opposite of `GasUseCard`. A hand-logged dive has no samples, so there
is nothing for the diver to act on and no empty state worth showing.

It takes no `onChanged` callback. Deleting a recording's last file deletes the recording
server-side, and the page's `refreshDive` drops it from `dive.recordings`, which re-renders this
card; a callback would be a second mechanism for something that already happens.

The series come from `GET /dive/{uuid}/recording/{rid}/profile`, fetched separately from the dive
and keyed on the profile's `updated_at` as a `v` cache-buster, because they are tens of KB and the
detail response carries only the summary. A failure shows a muted line in the card rather than a
toast: nothing the diver did caused it and nothing they can do fixes it.

## `Dive.profile` is optional for the same reason as `source_file`

The profile summary rides on `recordings[].profile`; there is no `Dive.profile` member.

The series stay integer-scaled on the wire (depth in cm, temperature in tenths of a degree, pressure
in tenths of a bar) and are divided in `toChannelSeries`. Divided, never multiplied by a reciprocal:
`1234 / 100` is the correctly rounded `12.34`, whereas `1234 * 0.01` is `12.340000000000002`,
exactly the noise the integer encoding removes. `PROFILE_CHANNELS` holds the divisors and mirrors
the API's `DEPTH_SCALE`/`TEMPERATURE_SCALE`/`PRESSURE_SCALE`; the two lists are a pair.

## The contact form posts to the API, and the page it lives on claims only what exists

`contactAPI.sendMessage` posts to `POST /contact`; the API forwards it to its `CONTACT_FORM_EMAIL`,
and nothing here decides the recipient.

`NEXT_PUBLIC_CONTACT_EMAIL` is display only — the `mailto:` fallback in the error state — optional,
with no default: `contact@opendiving.app` would hand a self-hosted instance's visitors an address
that cannot see their server. Unset, `ContactForm` points at `FALLBACK_ISSUES_URL` in
`lib/contact.ts`, since a broken form is this repo's bug. Set it only where the operator reads the
mailbox.

`CONTACT_CATEGORIES` in `lib/api/contact.ts` mirrors `ContactCategory` in the API's
`schemas/contact.py`; the backend 422s anything else, so adding a category changes both sides.
`contactSchema` duplicates the API's length bounds to fail before a round-trip.

The form prefills empty fields from `useAuth()`; `defaultValues` cannot, since the user arrives
after the auth bootstrap resolves. The page is a Server Component for `metadata`; only the form is
`"use client"`.

## `/signin` is a dedicated sign-in page, and carries where the visitor was headed

`app/signin/page.tsx` is a dedicated sign-in page: the shared `AuthForm`, a "Sign in" heading, and
no chrome (`NO_CHROME_ROUTES` in `app-shell.tsx`, like `/auth/verify` and `/onboarding`). Sending
signed-out visitors to `/` dumps a shared dive link or an expired session onto the marketing page,
where the form is one section among many and nothing records the destination. There is still exactly
one form and one entry point, not a password-based `/signin`/`/signup` pair. On an `open`-mode
instance the landing hero hosts its own `AuthForm`; on `invite`-mode, the default, the hero holds
the invite-request form and `/signin` is `AuthForm`'s only mount, which makes this page
load-bearing.

`Header`'s signed-out state shows a coral "Sign In" button linking here, kept in the actions row at
every breakpoint rather than folded into the mobile menu: on a phone it is the most important thing
a signed-out visitor can do.

## The destination round-trips through `lib/auth-redirect.ts`

`useAuthGuard` redirects with `router.replace` to `signInHref(...)`, `/signin?next=<encoded path>`.
`sanitizeRedirectPath` rejects anything but a plain `/`-relative path (absolute URLs, `//host`,
`/\host`), in and out, since the value sits in storage between. The guard reads `window.location`,
not `useSearchParams()`, which would force a `Suspense` boundary onto every page calling it.

The magic link returns on `/auth/verify` with no destination, so `AuthForm` calls
`rememberPostAuthRedirect` on every link request (resends included) and `/auth/verify` calls
`consumePostAuthRedirect`, which removes the key as it reads it. Google keeps its destination in its
own per-attempt record.

The store is `localStorage`: a mail client opens the link in a context whose `sessionStorage` is
empty. The entry is `{ path, expiresAt }` with a one-day expiry, not
`MAGIC_LINK_TOKEN_EXPIRE_MINUTES`, which the API can raise unseen. `signOut` clears it. Tests
install `test/memory-storage.ts` per suite in `beforeEach`, never in `vitest.setup.ts`, or state
leaks between files.

## Signing out lands on `/`, and gets there with a page load

`AuthContext.signOut` names its own destination, `/`, or the guard sends the leaving diver to
`/signin?next=%2Fdives`. It uses `hardNavigate("/")`, not `router.replace("/")`: a client-side
navigation from `signOut` loses to the guard's effect, whereas a page load cannot be cancelled by a
later `replaceState`. Signing out from a public page reloads to `/` too.

It navigates only on success and otherwise changes nothing and rejects. `POST /auth/logout` alone
blacklists the token pair and deletes the refresh cookie; after a failure a page load re-bootstraps
from that cookie onto `/dashboard`, and clearing the user locally would paint "signed out" over a
session the interceptor rebuilds on the next 401. `Header` turns the rejection into a "Couldn't sign
you out" toast.

`hardNavigate` raises `isLeavingPage()` and `useAuthGuard` returns early on it, or the guard fires
an RSC request for `/signin?next=…&_rsc=…` before the document dies. It lives in `lib/navigation.ts`
so `AuthContext.test.tsx` can mock it.

## The dashboard shows only what the app actually tracks

Nothing on `app/dashboard/page.tsx` claims what the app cannot back. `user_dive_stats.species_seen`
is never derived (`services/dive_stats.py`), so it stays in `UserDiveStats` — the field is on the
wire — but no tile renders it. There is no quick-actions card; the one action worth promoting,
logging a dive, is a single primary button in the page header. `SetupChecklistCard` is driven by
real counts (`/user/dive-stats`, `/gear-items`, `/certifications`, the last two fetched with
`items_per_page: 1` for `total_count` alone) and removes itself once all three are done.

`CertificationExpiryCard` is the certification twin of `ServiceDueCard`: it renders `null` when
nothing needs renewing and when its fetch fails, and its rows link to `/certifications`, where
certifications are edited in dialogs and have no URL of their own. Filtering and ordering live in
`certificationRenewals()` in `lib/certification.ts`, not the component, so "expired sorts above
expiring soon" is tested without rendering.

## The layout is a flat stack, so the cards that can vanish leave no hole

The dashboard is one `space-y-6` column with `ServiceDueCard`, `CertificationExpiryCard` and
`SetupChecklistCard` as direct children: `space-y-*` spaces rendered siblings, so a card returning
`null` costs nothing, whereas a wrapping "needs attention" `<div>` would leave its own gap on every
day nothing is due. The same reasoning rules out a two-column grid whose sidebar sits empty for a
diver with nothing due.

Alerts sit above the stats: an overdue regulator matters more than a dive count, and the checklist
is the first thing a new account should see. The stat tiles and the air-consumption chart hide at
zero dives, but not while the stats request is in flight — `hasDives` stays true until the answer is
in. Recent dives and trips sit side by side at `lg`, so `RecentDivesCard`'s rows carry `min-w-0` on
the left block and `flex-shrink-0` on the metrics, or a long site name squeezes the duration/depth
column.

## The heading greets by time of day, and reads the clock during render

The dashboard heading is "Good morning/afternoon/evening, {name}!". The buckets live in
`greetingForHour()` in `lib/date-time.ts`: morning from 04:00, afternoon from noon, evening from
18:00, and the small hours fall in with the evening, because "Good night" is a farewell.

`new Date().getHours()` runs during render, normally a hydration hazard since the server's hour is
not the viewer's. It is safe here only because the heading sits behind the auth gate: `AuthProvider`
starts at `isLoading: true` and resolves in an effect, so SSR and the first client render return
`PageSpinner` and the greeting is never in the SSR markup. A greeting rendered above that gate needs
the mounted-flag treatment `ThemeToggle` uses.

The greeting is fixed for the life of the mount; no timer ticks it over at midnight.
`scripts/screenshots.mjs` pins the browser clock to 09:00 for the README image.

## There is no `/profile` until there is someone else to show it to

There is no `/profile`. A profile page exists to be someone else's view of a diver, and the API
cannot serve one yet: the public profile endpoint is deliberately not built (see "Current-user
endpoints live on a bare `/user`, not `/user/me`/`/user/{uuid}`"), so a `/profile` could only read
the signed-in caller. That only duplicates the dashboard — the same `getDiveStats()` numbers behind
the same `hasDives` gate, the same `RecentDivesCard`, and an identity header that is a read-only
copy of what `/settings` edits — at a second URL reachable only from the avatar dropdown.

When the public endpoint lands, the page comes back as `/divers/[username]`, written fresh: it takes
a username parameter, must not render `email`, and shares no fetch with the dashboard.

## `/profile`: the dashboard carries no certifications summary in its place

`CertificationsCard` and `certificationsByRecency` (`lib/certification.ts`) have no caller without
`/profile`, so they are removed rather than left exported; both are recoverable from git when
`/divers/[username]` wants them.

The dashboard deliberately does not get the card in exchange. It already carries
`CertificationExpiryCard`, the half of the subject that needs the diver to act; "every c-card you
hold, newest first" is not an alert, and `/certifications` is one nav click away with images, dates
and dialogs. A read-only echo of a page in the nav is the duplication that took `/profile` down.

Before writing that ordering again: `GET /certifications` is newest-row-first, so a diver who enters
their Open Water card last gets it above the Divemaster it led to. `/certifications` still renders
the API's order — it is a paginated table, and reordering one page client-side lies about the pages
either side.

## There is no Gravatar line; `/settings` shows the avatar itself

There is no Gravatar line: `/settings` shows the avatar itself, with the controls that change it
(see "Avatars are this instance's own, and there is no Gravatar fallback").

The username hint under the profile form states the rule the field enforces (`profileSchema`:
lowercase letters and numbers, unique), not "used in your profile URL and for mentions": there is no
profile URL and mentions are not a feature.

## Dive numbering: the suggestion follows the date, and only the diver renumbers

The API owns the rules (`services/dive_numbering.py` and the matching section of its
`DECISIONS.md`): `dive_number` is a label, gaps in it are as often deliberate as accidental, and
nothing renumbers a log automatically. The three sections that follow are what this repo does with
that.

## The new-dive form's number tracks `start_time`, not the last dive

`useSuggestedDiveNumber` refetches `GET /dives/next-number` whenever the start time changes, so a
back-filled 2019 dive is not offered #213, and importing a dive-computer file, which rewrites
`start_time`, moves the number with it.

The suggestion is written with `resetField`, not `setValue`. The hook stops suggesting once
`dive_number` is dirty, meaning the diver has taken the field over. `setValue` without `shouldDirty`
breaks that: react-hook-form recomputes `dirtyFields` against `defaultValues` on the next change to
any field, so a suggestion written over the default reads as dirty the moment the diver touches the
date, exactly when the hook must run again. `resetField(name, { defaultValue })` writes the
suggestion as the default, so "dirty" keeps meaning "the diver typed a number".

Create-only. Renumbering an existing dive because its date was corrected is the silent renumbering
the app avoids everywhere: the number may be in a paper logbook.

## The duplicate note is attached to a value, not rendered outright

`diveNumberNotice` is `{ forValue, message }` and `DiveFormFields` shows it only while the field
still holds `forValue`. A note about a number no longer on screen is worse than none, and the
alternative — `form.watch("dive_number")` in the page — opts that whole component out of React
Compiler memoization (`react-hooks/incompatible-library`), whereas the field's own render already
has the current value.

It is a `FormDescription`, never a validation error: duplicate numbers are a normal state while
back-filling, reconciled later with Renumber, so nothing about them may block a save.

## The numbering line describes; it doesn't scold

`describeDiveNumbering` never says "should" and never phrases a gap as a problem. A diver continuing
a paper logbook has deliberate gaps forever, and a line that nags on every page load is one they
stop reading. There is no dismiss control for the same reason: the line is muted enough not to need
one, and hiding it would hide the way in to Renumber.

`RenumberDivesDialog` mounts its form as a child rendered only while open, so each visit starts from
clean defaults without a `setState` in an effect. Its preview is tagged with the inputs that
produced it and every branch, including the confirm button, is gated on that tag matching the form,
so it can never apply a renumber the diver has not been shown. The change list renders in full
inside a scroll container: "and 180 more" hides exactly the rows someone checks against a paper
logbook.

## "Due today" is overdue, and the certification boundary is deliberately the other way

`serviceStatus` treats `next_due_on === today` as `overdue` (`days <= 0`) and `formatServiceDue`
says "Overdue (due today)" to match; `formatServiceDue agrees with serviceStatus` in
`gear-service.test.ts` pins the pair. The boundary is the API's: `service_status` in
`services/gear_service.py` uses `today >= next_due_on`, and the reminder digest in
`core/worker/functions.py` emails "overdue since …" about a schedule due that morning, so a
`days < 0` badge would disagree with the email.

`certificationExpiryStatus` uses `daysLeft < 0`, and that is not an inconsistency to harmonise: a
c-card is valid through its printed expiry date, whereas a service interval that has arrived has
arrived. The certification side has no API counterpart — no status field, no reminder job, no email
— so `CERTIFICATION_EXPIRING_SOON_DAYS` is frontend-only, unlike `SERVICE_DUE_SOON_DAYS`, named
identically on both sides so one grep finds the pair.

## Service status is derived in the browser, and so is a timezone off the digest

The API returns only clock-stable facts about a schedule (`next_due_on`, `next_due_at_dive_count`,
`last_service_on`) and never a computed status: `ServiceStatus` in the API's
`schemas/gear_service.py` is neither a stored column nor a field on any read schema, because those
routes are cached for 60 seconds and a cached status is wrong the next morning. Deriving it in
`lib/gear-service.ts` is the intended price of cacheable responses, not drift.

The browser computes "today" in the viewer's timezone (`todayIsoDate` uses local date parts on
purpose) while the reminder digest in `core/worker/functions.py` uses UTC, `User` having no timezone
column. A diver at UTC+13 can see "Overdue" up to a day before the email agrees. At a 30-day lead
time that is cosmetic, and the API-side fix (run hourly, gate on the offset of the most recent dive)
is not worth it. Documented, not fixed.

## One paging helper, and neither dashboard card pages

`fetchAllPages` in `lib/api/client.ts` is the one `while (hasMore)` loop: page cap, abort signal,
dedup. Runaway is not the hazard (the API clamps `items_per_page` to 100); snapshots are. List pages
are cached for 60 seconds per `page`, so an insert between pages makes the boundary item arrive
twice — `keyOf` dedups it. The gap half, an item pushed to the next page by a delete, cannot be
fixed client-side; hence single-shot endpoints.

Truncation is `console.warn`ed, not thrown: a short list that looks complete is unexplainable later.
The abort signal stops the loop between pages, not the request in flight (`lib/api/*` takes no axios
config); `isAbortError` tells unmount from failure.

Neither dashboard card pages: `ServiceDueCard` uses `/gear-service-due`, `CertificationExpiryCard`
uses `/certifications-expiring` (no `within_days`; see the API's `DECISIONS.md`), and both honour
the `truncated` flag via `TruncatedNote`, since a safety-adjacent list must not under-report
silently. `fetchAllCertifications` survives for callers needing whole records.

## Blob-wrapped error bodies are unwrapped in the interceptor, not at the call sites

Axios applies the request's `responseType` to error responses too, so a failed
`responseType: "blob"` request arrives with its JSON error body wrapped in a Blob and
`getApiErrorMessage` finds no `response.data.detail` (every binary route raises an ordinary
`HTTPException`, so the JSON body is always there).

`unwrapBlobErrorBody` runs in the response interceptor, the one place every rejection passes
through, which keeps the ~26 call sites synchronous. A body that is not JSON is left as the Blob and
the caller's fallback is used; throwing inside the interceptor would replace the real error with a
parse error.

The fixture for that case in `client.test.ts` must not contain a NUL: git then classifies the whole
file as binary and GitHub renders no diff for it. It is the escape sequence `"\x89PNG-ish bytes"`,
which fails `JSON.parse`.

`useAuthedBlobUrl` returns the raw `error` alongside `hasError` so callers run it through
`getApiErrorMessage` themselves.

## The combobox will not clear a selection it cannot prove is gone

`CreatableCombobox`'s `onBlur` calls `commit()`, which matches the typed text against
`remoteResult.items` — empty until the debounced search lands — so tabbing through the Trip field
would commit a clear. `commitAction`, a pure function, decides: `searchedQuery` records which query
the current results answer, and until it equals the text being committed an empty result set is not
evidence, so the action is `keep`. A failed search leaves `searchedQuery` untouched (a 500 is not
evidence either), and a selection whose name the input still shows is kept. Once the server has
answered that exact query with nothing, the clear goes through.

`clampActiveIndex` re-derives the highlight every render, because the option list can shrink under a
stationary `activeIndex` (a narrowing search, a sibling pick changing `excludeIds`), leaving Enter
reading `undefined`. Out-of-range collapses to -1, not the last row, giving Enter its other safe
meaning: commit the typed text.

## Fetch states are one settled value, not a pile of booleans

`DiveProfileCard` holds a single `ProfileResult | null`, `null` meaning in flight, cleared in the
effect's cleanup — the shape `useAuthedBlobUrl` uses, avoiding a `setState` in an effect body.
Separate `profile`/`hasFailed` booleans that nothing reset made one failure permanent and showed a
stale chart after a re-import.

It branches on which failure: a 404 ("This dive has no profile") is permanent and gets no retry
button, because re-asking returns the same 404; a 401, 5xx or network failure gets one.

The dashboard stats fetch shows an error with a retry rather than tiles stuck on "—": the API
returns zeroed stats for a diver with no dives, so anything landing there is exceptional.

`usePaginatedResource` guards races with a request-id ref: only the newest request may settle, so a
slower earlier page cannot overwrite newer rows or `currentPage`, and superseded requests leave the
spinner alone.

## Assorted rules: `useDragSort`, `use-toast`, downloads, `DateTimePicker`, `AuthContext`

- `useDragSort` removes its window listeners on unmount: `handleMove`/`handleEnd` are closures
  inside `startDrag`, so `endDrag` calls a remover stored in a ref.
- `use-toast` is vendored from shadcn/ui with two upstream bugs fixed: the subscribe effect depends
  on `[]`, not `[state]`, and `TOAST_REMOVE_DELAY` is 1000ms, not `1000000`, which with
  `TOAST_LIMIT = 1` pinned every toast ever shown in `memoryState`.
- Downloads go through `lib/download.ts`, which appends the anchor (Firefox ignores a detached one)
  and defers revoking the object URL, since Firefox and Safari read the blob asynchronously after
  `link.click()`.
- `DateTimePicker` holds a typed time until a date is chosen rather than committing against
  `new Date()`, never right for a back-filled dive; a cleared field stays empty instead of
  `Number.parseInt(raw, 10) || 0` snapping it to "00".
- `AuthContext` memoizes its value and seven methods; a fresh `signOut` or `refreshUser` identity
  every render re-ran every effect depending on them.

## `useResource` for the detail pages, and one delete flow for everything

`useResource` is the block the `[id]` detail pages and the dive edit page share: read `params.id`,
cast it, fetch, toast-and-redirect on failure, clear loading in `finally`. Five copies drift; an
unguarded one settles after unmount and toasts and redirects on whatever page the diver reached. It
holds the one `params.id as string` cast.

`refetch` re-reads without touching `isLoading`, so an archive toggle or file delete swaps one card
instead of blanking the page; failures there are non-fatal and do not redirect, since whatever
prompted the refresh already succeeded. The dive edit page seeds its form through `onLoaded`, held
in a ref so an inline arrow does not restart the fetch.

Detail-page deletes go through `useDeleteResource`, which formats the failure with
`getApiErrorMessage` itself, so a 409 ("this dive site is used by 3 dives") reaches the diver
instead of a generic "Please try again."

## `PaginatedResponse` lives in `lib/api/client.ts`, and dialogs share their error state

`PaginatedResponse<T>` lives in `lib/api/client.ts`, beside the client that produces it, and the
eight `lib/api/` modules are type aliases over it; nothing in `lib/api/` imports upward from
`hooks/`, which is why a copy in `hooks/usePaginatedResource.ts` bred eight identical local
declarations. `hooks/useInfiniteResource.ts` re-exports it for pages importing the type alongside
the hook.

`useDialogApiError` owns the `apiError` state of the create/edit dialogs, so the effect that resets
a form does nothing but `reset(...)`, which `react-hooks/set-state-in-effect` has no quarrel with.
The disables that remain outside the two hooks — theme mount, avatar fallback, the date picker's
external sync — are genuinely different patterns, not copies of one.

## `FormControl` only labels what it can reach

`FormControl` is a Radix `Slot`: it merges `id`/`aria-describedby`/`aria-invalid` onto whatever its
child renders. That works for a leaf `<Input>` and silently fails in two cases.

A custom component that never spreads rest props. `DiveStartTimeField`, `TripCombobox`,
`DiveSiteMultiSelect`, `DiveGearField` and `VolumeCombobox` extend `FormControlSlotProps` from
`form.tsx` and spread it onto their own focusable control; otherwise `FormLabel`'s
`htmlFor={formItemId}` points at an id that exists nowhere.

A wrapper `<div>`. Fields with an icon or unit adornment keep `FormControl` inside the
`<div className="relative">`, around the `<Input>`: `<label for>` only associates with labelable
elements, so an id on the div gives the input no name. It only needs to be inside the `FormItem`.

The markup looks correct either way; this check surfaces it:

    [...document.querySelectorAll('label[for]')]
      .map(l => document.getElementById(l.htmlFor)?.tagName)

For a composite field the slot props go on the primary control (the date picker in
`DiveStartTimeField`) and the secondary one keeps its own `aria-label`.

## `--coral-solid` and `--teal-solid` do not exist: the brand accents are one hue each

`--coral-solid`, `--coral-text` and `--teal-solid` do not exist; the brand accents are one hue each
(see "The brand accents are their CSS named colours, and `--coral-solid` and `--teal-solid` do not
exist"). The arithmetic is the price: `--coral` as a filled button background under white text
reaches 2.3:1, which axe flags on the sign-in button.

Two other contrast rules hold. The landing page's stats strip does not use
`text-primary-foreground/70` on `bg-primary` (3.4:1 in dark mode). `text-primary` is not a link
colour (3.67:1 in dark mode, `--primary` being mid-grey there); in-copy links are a plain underline
inheriting the surrounding colour.

`npx @axe-core/cli --tags="wcag2a,wcag2aa,wcag21aa"` over `/`, `/signin`, `/contact`, `/privacy` and
`/terms` is the check that covers contrast; the `code-quality` workflow scans only `/`, so the other
four are re-checked by hand after any change to `globals.css`.

## Metadata, and why the landing page is a Server Component

The root layout sets `metadataBase` (or Next emits relative `og:image` URLs no crawler can fetch), a
`title.template`, OpenGraph and Twitter cards, and the README's pitch. `NEXT_PUBLIC_SITE_URL` lets a
self-hosted instance name its own origin; the localhost fallback is harmless, since only public
pages unfurl. A page exporting `title: "Contact"` renders "Contact | OpenDiving", so pages omit the
suffix; the landing page opts out with `title: { absolute: ... }`.

The landing page is a Server Component rendering `components/layout/landing-page.tsx`, which carries
the `"use client"` — the only way to export metadata from a page gating its render on
`useRedirectIfAuthenticated`. It is the one page worth indexing; everything else is behind auth and
renders client-side because the access token lives in memory.

Its hero headline is the page's `<h1>` and the header wordmark is a `<span>`, so no page has two
`<h1>`s; the dashboard's greeting heading is its `<h1>`.

## Component filenames are kebab-case

Files under `src/components` are kebab-case (`auth-form.tsx`), exported components PascalCase
(`AuthForm`), and icons live in `components/icons/`. Nothing else states the convention, which is
how files drift out of it.

## One spinner component per shape, not per call site

`PageSpinner` takes a `variant`; `ButtonSpinner` covers the in-button case. Three styles otherwise
accrete: the `Loader2` icon, hand-written `min-h-[60vh]` copies of `PageSpinner`, and bordered CSS
rings like `<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />` in forms.

The `min-h-[60vh]` variant is deliberate: a page rendering below `AppShell`'s header and footer must
not reserve a full viewport, or the footer is pushed off the bottom of a page shorter than one.
`ButtonSpinner` uses `currentColor`; a hardcoded white is right only on a filled button and wrong on
the outline and ghost variants.

## Theme tokens, and the three colours that needed a second variant

Colours come from theme tokens, not raw Tailwind palette classes. Two raw uses stay on purpose: the
dialog overlay's `bg-black/80` (a scrim is black in both themes) and the chart tooltips'
`border-white/10` hairline over a dark surface.

A colour tuned to sit behind white text cannot also read as text. `--coral` and `--teal` carry no
second variant; the destructive pair does: `--destructive-solid` fills buttons, badges and toasts,
since white on `--destructive` is 3.6:1, while `--destructive` stays light enough to read as text on
the dark background.

`--success` replaces hand-picked `green-600`/`green-400` pairs. `--warning` has one use, the terms
page's safety notice, deliberately not a `bg-muted` callout. `--muted-foreground` is 40%, not
shadcn's 46.9%, so it passes on `--muted` as well as `--background`.

In-copy links are underlined, not coloured: `text-primary` is 3.67:1 as link text in dark mode, and
colour alone trips axe's `link-in-text-block`.

## Outcomes go in toasts; `StatusMessage` is the documented exception

Outcomes are reported as toasts. `StatusMessage` is the inline exception, for a form whose result
the diver has to re-read while fixing it: the sign-in form's expired link, the email-change card's
"check your new address". It carries `role="alert"`; the state is signalled by icon, border and tint
while the body text stays `foreground`, because `text-destructive` on `bg-destructive/10` is only
3.3:1.

## Verifying colour work

Reading the accessibility tree catches labelling; contrast needs measuring, in both themes, against
the rendered value: `bg-destructive/10` composites over whatever is behind it, so the painted
background is not the token's colour.

Switch themes the way the app does. Toggling `dark` on `documentElement` and reading
`getComputedStyle` in the same script lies: the custom property re-resolves while elements already
on the page keep painting the other theme's `color`. Emulate `prefers-color-scheme` and reload — the
Browser pane's `resize_window{colorScheme}` or Playwright's `colorScheme` — then measure; the tell
is that unrelated body text changes colour too.

`npx @axe-core/cli` covers the public pages. Authenticated pages have no session under it, so sweep
them with an in-page script that walks every text node, resolves the nearest opaque background and
applies WCAG's large-text threshold. A scan run while the dev server is mid-recompile reads a
half-updated stylesheet; re-run before believing a sudden spike.

## Component and hook tests run on Testing Library, and coverage says where the gaps are

`@testing-library/react`, `/dom`, `/jest-dom` and `/user-event` are dev dependencies;
`vitest.setup.ts` registers jest-dom's matchers plus the browser APIs Radix needs on mount that
jsdom lacks (`matchMedia`, `ResizeObserver`, `scrollIntoView`), or a dialog or select throws before
its assertion.

Hook tests each pin a bug: `useDeleteResource` shows the API's own message on a refused delete,
`usePaginatedResource` ignores a late superseded response, `useResource` stays silent once
unmounted, `AuthContext` clears the user on session-expired even when sign-out fails.

Mock `useRouter` with a hoisted object: `useResource`'s fetch effect depends on the router
reference, so a fresh object per call loops forever. `vi.mock` factories are hoisted above every
statement; shared spies come from `vi.hoisted`.

Coverage scopes `lib/`, `hooks/`, `contexts/`, `components/` and `app/`, excluding vendored
`components/ui/**`. Global thresholds sit just under current values as a ratchet; per-directory
floors on `lib/`, `hooks/` and `contexts/` hold the tested layers. Raise them as coverage grows;
never lower one.

## The toast store is a real external store, and a lesson in measuring against a dev server

`useToast` uses `useSyncExternalStore`, not the `useState` + `useEffect` subscription shadcn/ui
ships. The store is module-level so `toast()` is callable outside React. The effect-based version
drops toasts: `dispatch` notifies whoever is in `listeners` at that instant, the subscription is set
up in an effect, and `<Toaster />` is a later sibling of `<AppShell>` in the root layout, so a toast
raised from a page's own effect reaches nobody. `useSyncExternalStore` reads the snapshot during
render and re-checks after subscribing.

`TOAST_REMOVE_DELAY` is 1000ms, all the exit animation needs; on-screen time is Radix's, 5s by
default.

Measure toast timing from an event you control: a dev-server navigation that compiles the route
hands control back after Radix has auto-dismissed. Break the request on an already-loaded page,
sample from `t=0`, and print `performance.now()` in the first sample. A result implicating something
as inert as a `setTimeout` constant is a measurement error first.

## Both charts' legends are the control for what they plot

Every mark on both charts is toggled from its legend entry, which names it and carries its swatch.
Entries are `<button aria-pressed>`, not checkboxes; the label stays the mark's name in both states,
and a hidden mark's swatch turns muted. Hiding everything is allowed and replaces the plot with a
one-line message.

The profile chart toggles by channel, not plotted line: both pressure lines share `--pressure`, and
"tank pressure" survives across dives where "gas 2" does not.

Labelled axes follow what is plotted, so `PlottedChannel` carries the `domain` it was scaled against
rather than the axis recomputing one — wrong for pressure, where every cylinder shares one domain.
The `aria-label` uses visible channels too.

The gas chart's trend and spread band share one toggle; `withSpread` (`scope !== "all"`) is separate
from `showSpread`, which also requires the trend, so the legend keeps saying "and spread" while the
trend is off.

## Remembered selections use `useSyncExternalStore`, and the handler uses the updater form

`lib/chart-series-view.ts` is the storage half, generic over series keys. `localStorage`, as in
`gas-use-view.ts` (which lends `subscribeToNothing`): the selection must survive the tab closing and
work from the bare `/dashboard` and `/dives/{uuid}` URLs.

The read is `useSyncExternalStore` with a server snapshot of `null`; the snapshot stays the raw
string because `useSyncExternalStore` compares with `Object.is` and a freshly parsed array loops
forever.

`parseSeriesVisibility` filters unknown keys: a key this build no longer plots is stale, not
corrupt. A stored `[]` restores as "hide everything"; only-unrecognised keys fall back to `null`.
The profile chart also intersects with the channels this dive recorded, ignoring an empty result.

The toggle handler uses `setChosen(current => ...)`: computed from the render's `visible`/`marks`,
two toggles in one batch both see the pre-click value and the second undoes the first. The storage
write is a `useEffect` keyed on the selection, so the updater stays pure.

## The hand cursor on buttons is restored once, in the base layer

Tailwind v4's Preflight drops v3's `button, [role="button"] { cursor: pointer }`, leaving
`<Button asChild>` around a `<Link>` with a hand (it renders an `<a href>`) and the same component
as a real `<button>` with an arrow. The rule is restored once in `@layer base`, widened to native
controls, instead of per-component `cursor-pointer` patches:

```css
button:not(:disabled),
[role="button"]:not(:disabled),
select:not(:disabled),
input:where([type="checkbox"], [type="file"]):not(:disabled) {
  cursor: pointer;
}
```

`[type="radio"]` has no call site; `[type="checkbox"]` is for the invite queue's boxes (a switch is
a `<button>`). In `@layer base`, every `cursor-*` utility outranks it: Radix's
`role="menuitem"`/`role="option"` items keep their explicit `cursor-default`, and
`disabled:cursor-not-allowed` and `cursor-grab` still apply. `:not(:disabled)` is for the inputs;
`Button` already sets `disabled:pointer-events-none`.

`<label>` is deliberately out: a bare `label` selector would put a hand over text-input labels.
Labels beside a boolean control carry an explicit `cursor-pointer`; count them with
`git grep -n cursor-pointer -- "*.tsx"`. The Fields dialog's switch labels do not, which is the one
uneven spot.

## The README screenshots are generated, at one width that is a breakpoint

`scripts/screenshots.mjs` retakes every image in `docs/screenshots/`;
`npm run screenshots -- you@example.com dashboard` retakes only those. `playwright-core` (with
`executablePath`), not `playwright`'s browser download.

1024px wide, where `lg:grid-cols-3` stops stacking the detail pages. Height lands on a card
boundary, measured by `cutBelow()` before the shutter: `CUT_BELOW` names a card; the gear page's
`HEIGHT` is the one literal. `deviceScaleFactor: 2`; PNGs are twice their frame. Selectors are
scoped by card `<h3>` (`chartCard()`) and match shared label halves as a regex.

Subjects are ranked from the log using the access token a Playwright `request` listener lifts off
the app's requests; a second magic link is rate-limited and `/auth/refresh` rotates the cookie.
`DIVE_UUID` names the dive when ranks tie; an unknown uuid or a sample-less dive throws before the
first shutter rather than falling back.

The clock is pinned to 09:00 (`GREETING_HOUR` overrides) with `setFixedTime()`, not `install()`,
leaving timers and `networkidle` real.

## The dive shot is ranked by recordings

The dive subject is ranked, not filtered, by how many of its recordings carry samples. Two is the
picture worth having (the _Recordings_ card lists both computers and `DiveProfileCard` shows its
switcher), one is an honest photograph, and zero is the only disqualifier: the profile card renders
nothing without samples. Ranking costs a `GET /dive/{uuid}` per candidate; `recordings` is
deliberately absent from the list schema.

A requested shot with no subject throws before the first shutter press, so a run leaves no
half-updated set behind; a shot nobody asked for stays silent (`wanted()`).

`CUT_BELOW["dive-detail"]` names the _Recordings_ card the image exists for, not the card that comes
out last. The committed image shows no switcher: `DiveProfileCard` draws it only once a second
recording has a profile. Shooting a different account is no way out; the README images are one
product tour.

## A cut that cannot slice a card

`cutBelow()` returns the first height below the anchor at which no card is still open: every card
that begins above it also ends above it. On the two-column dive page the main column is mid-card
when the sidebar's next card starts, so no sibling's top yields a clean frame. The row gap comes
from the anchor's neighbour, either side.

It iterates: one sweep over the cards open at the anchor's bottom misses the sidebar card beneath
it. Each pass that moves the cut has found a card the previous one could not see, so the loop is
bounded by the card count.

The frame can end well below the card that named it; that distance is the subject's, not the cut's.
A one-column page settles on the first pass, seeded from the neighbour's top, at exactly the
single-line answer; 3px is a sliver of the next card.

## The dive-site shot cuts at the foot of one column, not at a seam

Its two cards, one per column, finish together only at the page's bottom, and `cutBelow()` refuses
both anchors with _"that card has no neighbour to measure the gap from"_. The image exists for the
map in the sidebar card, so `CUT_AFTER_CARD` names it and the frame ends at its foot (gutter: the
grid's `rowGap`).

A card may be cut through; a row may not, since a line just above its border reads as clipped, so
the cut moves down past any row it lands inside to the next row's top. Rows are bordered boxes with
a bordered ancestor (`RecentDivesCard`'s `<a class="rounded-lg border">`); cards have none.

The subject is the placed site with the most dives; a position is required, since `LocationsMap`
renders nothing without coordinates. Dive count costs a scoped `/dives` request per placed site
after paging `/dive-sites` (capped at 100).

## The gear frame's `HEIGHT` is the lever under the README row, written down rather than measured

`gear-item`'s `HEIGHT` is 911, the one figure written down rather than measured: the README row sets
it, not the page, because `gear-item.png` stacks over `dive-site.png` beside `dive-detail.png` and
the pair must come level.

Measured, not reasoned: the row's markdown through GitHub's `/markdown` API, styled with
`github-markdown-css`, with the committed PNGs in a doctype document (quirks mode collapses the line
box). A `<br>` between stacked images adds 6px of unscaled descent.

Every gutter-respecting stop overshoots (`cutBelow()` and `cutAfterCard()` both return 935), so 911,
the foot of the _Service_ card, has none; the pair sums 2px short of the dive shot.

`HEIGHT` stays a number and goes stale when `dive-detail` or `dive-site` is re-framed.
`refuseSlicedRow()` throws before the shutter if the height lands inside a row; snapping to a gap
would silently move the balanced height.

Cutting the _Service_ card 12px short reaches the target but slices its border.

## The map is photographed to find out whether it drew

`networkidle` is blind to MapLibre: it settles when tile requests stop, before they are painted, so
a canvas caught in that window photographs as an empty box.

Reading pixels from page script does not work: `MapCanvas` builds the map without
`preserveDrawingBuffer`, so `drawImage` returns an empty frame, and enabling the flag for a
screenshot script would cost every map in the app.

`mapPainted()` screenshots the canvas element instead; Playwright captures through the compositor,
the same path the page screenshot takes. A flat frame compresses to about a kilobyte and a coastline
to tens of that, so a byte floor clear of both separates them, and two consecutive captures
byte-identical and over the floor is a map drawn and no longer moving (MapLibre fades labels in). It
throws after twenty seconds. The frame is set before the check, because MapLibre redraws whenever
its box changes.

## `visit()` fails loudly when a navigation lands on `/signin`

`visit()` throws when a navigation lands on `/signin` — "signed out on the way to /dashboard" —
rather than letting a run quietly produce four screenshots of the sign-in form. It costs nothing and
catches any future auth regression, not one in particular.

## The same script writes the product repository's copies

`opendiving/opendiving` renders copies of these images on its front page and cannot retake them, so
`shot()` writes both trees from one shutter press: `docs/screenshots/` here and
`$PRODUCT_DIR/docs/screenshots/`, defaulting to `../opendiving` in the sibling shape `API_DIR` uses.
An absent clone is a printed note, not a failure. One press, not two: the pages are live, and
writing the buffer twice is what makes the copies identical.

A new shot reaches that repository as a file, not a picture on its page; that README names what it
renders. A capture in a git worktree resolves `../opendiving` inside `.claude/worktrees/` and writes
one copy; the next full-checkout run makes the other. The files are byte-identical wherever both
exist; the front pages may differ until that README is edited.

Rejected: hotlinking this repository's raw URLs from the product README, which breaks on a rename.
The script commits nothing over there.

## "Due soon" is a `warning` badge, because `secondary` is invisible on a card

`serviceStatusBadgeVariant` never maps `due_soon` onto `secondary`. Every place the chip renders
(gear list, gear detail card, dashboard service-due card) sits on a card, and dark `--secondary`
against `--card` is a near-neutral grey a few lightness points off its surface: 1.2:1, with no
border. The label passes every text-contrast scan, so a text-node walker never flags it; non-text
contrast is the check that fails. It also made "Due soon" identical to "Rented", a fact about an
item rather than a status.

`--warning` is dark and slightly brown in light mode (`32 92% 27%`) because it carries white text
and a mid-amber only reaches 3.9:1 under white; in dark mode it is `38 95% 62%` with near-black
text. Its consumers: `courseStatusBadgeVariant` (`incomplete`, `provisional`), `text-warning` in
`dive-exposure-card`, `dive-mixtures-card` and `mixture-fields`, and `terms/page.tsx`
(`border-warning/40`, `bg-warning/10`, `text-warning`). `lib/gear-service.ts` does not touch it.

## Dark `--secondary` is 22%, because every secondary chip renders on a card

Dark `--secondary` is 22%, nine points above `--card`, because every `secondary` chip (the count
chips on dives, sites, trips, certifications, gear and gear sets; "Rented" in `gear-items-card`,
`dive-detail-main` and `gear-item-multi-select`; the dashboard's `doneCount/steps` chip) renders on
a card header, where three points of lightness is no background at all.

Lightness rather than a border: the base `Badge` carries `border` and `secondary` sets
`border-transparent`; a visible border makes it look like `outline`, which sits three rows away as
"In service". Light `--secondary` (`210 40% 96%`) keeps its 4-point gap because it separates by hue;
the dark palette is 4%-saturated system grey with no hue to spend. 22% is where the chip stops
disappearing before it reads as a button.

`bg-secondary` is also the selected segment of the gas-consumption time-range control and the unused
`Button` `secondary` variant. `--muted` stays at 16%: a large-area wash at 22% reads as a panel.

## The service scale is three brand fills, and `--warning`'s amber would be a fourth accent

`serviceStatusBadgeVariant` returns `"teal"` for `ok`, `"coral"` for `due_soon` and `"destructive"`
(`bg-destructive-solid`) for `overdue`; `warning` and `outline` are out of it. The scale reads by
hue, not weight: an outline beside two fills reads as an absence, and "In service" is a verdict.

The palette has three accents (`--coral` 16, `--teal` 180, `--pressure` 265); `--warning`'s amber on
a status chip was a fourth hue for one badge. Coral and `destructive` are six degrees apart, so they
separate by lightness.

`--coral-foreground` and `--teal-foreground` are both white so the three chips share one label
colour. Coral pays 2.50:1 on the label, under AA; the fix if wanted is near-black on
`--coral-foreground` alone. Measured, both themes:

| Surface                                | Light  | Dark   | Bar   |
| -------------------------------------- | ------ | ------ | ----- |
| Badge label on the coral fill          | 2.50:1 | 2.50:1 | 4.5:1 |
| Coral fill against `--card`            | 2.50:1 | 6.51:1 | 3:1   |
| Badge label on the teal fill           | 4.77:1 | 4.77:1 | 4.5:1 |
| Teal fill against `--card`             | 4.77:1 | 3.41:1 | 3:1   |
| Badge label on `--destructive-solid`   | 5.61:1 | 5.87:1 | 4.5:1 |
| `--destructive-solid` against `--card` | 5.87:1 | 2.77:1 | 3:1   |

`--destructive-foreground` is redeclared under `.dark`; the brand foregrounds are not. The fill
misses are accepted: a saturated fill separates by hue. Watch the coral fill if light `--card` stops
being white.

## And the dashboard puts the chip last, where the rows align

`ServiceStatusBadge` renders badge then detail, right where it is a column. The dashboard's
service-due card rows are `flex justify-between`, so badge-first strands the chip mid-row;
`detailFirst` (prop, default off) swaps the order there, a prop so the three render sites cannot
drift.

`CertificationExpiryCard` is the same row and composes its own `Badge`, so its swap is inline.
`certificationExpiryBadgeVariant` returns `destructive` / `coral`, never `secondary`: grey beside
coral reads as not a status. No `teal`, since `certificationExpiryStatus` returns `null` for a
healthy certification and no chip renders.

Widths are per-card: service chips `min-w-24`, certification chips `min-w-28`. The courses Status
column takes `min-w-24` only; `courseStatusBadgeVariant` keeps its own vocabulary because courses
share no screen with gear or certification chips (`courseStatusLabel` falls back to the raw wire
value). All three carry `whitespace-nowrap` so a fallback font or longer label overflows the pill
visibly rather than growing a second line.

## One card-header shape: `space-y-1.5` only reaches `CardHeader`'s _direct_ children

`CardHeader` is `flex flex-col space-y-1.5 p-6`, and `space-y-*` is a `> * + *` selector, so the 6px
title/description gap exists only while both are direct children. Wrapping both in a `<div>` eats it
(0px); wrapping only the title with a `size="sm"` button doubles it (12px), since a 36px button
centred against a 24px `leading-none` title adds slack inside the row. A card whose header carries a
control uses one shape:

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

`items-start` aligns the control with the top of the title block. Verify by diffing
`description.top - title.bottom` on rendered cards; every pair measures 6px at 1100px and 375px.

Card-title icons are `gap-2` on the title, never `mr-2` on the icon, and inherit the title's colour:
`text-primary` is a mid-grey in dark mode, dimmer than the description beneath. `contact`'s
`text-success` shield and `text-destructive` heart stay, being semantic.

## The dive page's gear list is a table, and its columns lead with Type

`DiveDetailMain`'s Gear card is a `Table`, the same shape as the Gas Mixtures card above it, rather
than a `<ul>` of `gearItemLabel(item)`: brand and name glued into one string give the eye nothing to
scan down at seven items.

Columns are Type, Brand, Name, deliberately not `/gear`'s Name/Type/Brand. `/gear` lists things you
own, looked up by name; the dive page is a kit list read by type ("what suit? what computer?"), and
the closed vocabulary gives a short repeating left edge. Splitting brand out retires `gearItemLabel`
here; it stays where a one-line label is needed (picker, sets card, archive/delete confirmations).
The Name cell keeps the link and the Rented/Archived badges.

The whole Type column is `text-muted-foreground`: the type is the question, the name the answer, and
a full-strength category column competes with the names. Brand stays full strength, being part of
the item's identity.

## The activity chart is bars over the same three scopes as the gas chart

`DiveActivityCard` mirrors `GasUseCard`'s header, stat row, stepper, remembered view and
All/Year/Month toggle over `lib/chart-period.ts`.

Bars with a zero-anchored axis: a count has no meaning between values, and bar height is the
quantity. `countDomain` sits beside `niceDomain`, which is deliberately not zero-based and whose
1/2/5/10 ladder includes 2.5.

All is one bar per calendar year, Year twelve months, Month every day, as on the gas card. The
default is `all`, not `year`: a bar per year is legible at any career length.

The anchor is the start of a day with diving in it, so `periodRange`, `periodLabel`,
`availablePeriods`, `stepPeriod` and `resolveAnchor` live in `lib/chart-period.ts`.
`GET /user/dive-activity` returns one row per day and `activityBars` sums into months and years
client-side, so scope switches need no request (reasoning under _"Dives-per-day is counted in
Python"_ in `opendiving-api/DECISIONS.md`). `MAX_X_LABELS` is 20 for years, 12 for months, 31 for
days.

## Every chart control names its own card, because the two cards draw the same row

Both cards render on `/dashboard`, `Card` is a plain `div` with no role, and a screen reader's
controls list is flat names with no heading context, so identical toggles give four arrows all
reading "Previous period with dives". Each `aria-label` leads with its card:
`Dive activity: previous period with dives`, `Gas consumption: time range`. `screenshots.mjs` scopes
by the card's heading for the same ambiguity.

The period dropdown's accessible name is its own value ("September 2025"), which `aria-label` would
replace. The `SelectTrigger` uses `aria-labelledby` naming a visually-hidden hint span and then the
trigger's own text, so the name reads chart then period; see "`aria-describedby` never reaches the
accessible name" for why a description alone is not enough.

That hidden span is why `screenshots.mjs` waits on `getByRole("heading")` rather than
`getByText("Gas Consumption")`: `getByText` matches case-insensitive substrings, so a bare title
also matches "Gas consumption period" and fails strict mode.

## Empty buckets are the point, and the ceiling comes from the whole logbook

`activityBars` fills every day of the month, every month of the year and every year between first
and last dive. Plotting only buckets with diving spaces three trips evenly and says the year was
busy throughout; gaps are what make a season read as a season and tell a liveaboard from four
weekends. Nothing is drawn before the first dive or after the last, where the answer is "no data".

`barCeiling` scales the y axis to the tallest bar the scope can produce across the whole logbook,
not the period on screen; bar height is the quantity, and a per-year axis would draw a four-dive
August as tall as a forty-dive one.

Empty periods are not offered: `availablePeriods` lists only years or months containing dives and
`stepPeriod` skips the fallow ones, for both cards.

## Activity chart: What the bars can't be, and what that costs

The bars are not links, so the svg is `role="img"` (like the profile chart) rather than the gas
chart's `role="group"`. A `role="img"` label cannot state every bucket, so the figures follow the
chart as an `sr-only` list, one entry per bar, pluralized: a one-dive day is common and "1 dives"
reads badly aloud.

The hover target is the whole column, not the bar, since a quiet month is a few units tall and an
empty one has no bar; the bar is `pointer-events-none` so it cannot steal its column's hover.
`barPath` rounds only the top corners, because `<rect rx>` lifts the bar off its baseline.

The change figure is in dives, not percent, and uncoloured: a light year can be a house move rather
than a slump. `ChartStat` is shared with `gas-use-card.tsx`; the two cards stack, so a drifting
label size reads as a rendering fault.

## The two chart cards stack, and gas leads - both measured, not assumed

Each plot carries `min-w-[560px]`, which keeps twelve month labels and a y axis legible.
`lg:grid-cols-2` on the dashboard's `max-w-6xl` gives 482px (546px at `max-w-7xl`), and three things
break: both charts clip and grow a horizontal scrollbar, the axis text halves (16.6px to 8.6px,
since the svg scales uniformly), and the gas header goes from 50px to 114px as its toggle and
stepper drop below the description. Clearing all three needs about 1220px.
`RecentDivesCard`/`RecentTripsCard` pair up fine below: their content reflows instead of scaling.

Gas consumption leads because it can change how you dive tomorrow; activity records what already
happened. Reliably non-empty is a weaker claim on the top slot than reliably useful.

## `npm run format` covers the docs at the repo root, not just `src/`

The format scripts take `"**/*.md"` beside `src/**/*.{ts,tsx,js,jsx,json,css,scss,md}`, because no
markdown lives under `src/` and the repo's markdown (`DECISIONS.md`, `README.md`, `CONTRIBUTING.md`,
`CLAUDE.md`, `CODE_OF_CONDUCT.md`) is at the root. Recursive rather than root-only so a later
`docs/` is covered. Prettier skips `node_modules/` on its own and `.prettierignore` handles `.next/`
and `coverage/`. The `*.md` override in `.prettierrc.json` (`printWidth: 100`,
`proseWrap: "always"`) matches opendiving-api's mdformat width, so the two `DECISIONS.md` files look
alike.

`code-quality.yml` runs `npm run format:check` rather than repeating the globs; see "The Prettier
check fails the build now" for its failure mode. Prettier also rewrites `*emphasis*` to `_emphasis_`
and `*` bullets to `-`; `git blame` on a reflowed line points at the reflow, so blame its parent or
use `git log -L`.

## Breathing-gas maths lives in `lib/dive-mixtures.ts`, client-side, and is only ever a label

`gasName`/`mod`/`endDepth`/`ead`/`ppO2AtDepth`/`modWarning` live in `lib/dive-mixtures.ts`, not a
`lib/dive-mix.ts` one hyphen away. Client-side because the decisive input is live form state the API
cannot see; `services/dive_gas.py` derives only from stored columns.

Names round to whole percent (`gasName(32.4, 0)` is `"EAN32"`); `O₂`/`He` hold the exact fractions.
An impossible mix gets no plausible name: `gasName(50, 60)` returns `"O₂ 50% / He 60%"`, `oxygen: 0`
falls back, either fraction `null` returns `null`. Air gets neither END nor EAD; helium mixes get
END, nitrox EAD.

`modWarning` returns two sentences, 1.4 a planning note and 1.6 never appropriate;
`PPO2_WORKING`/`PPO2_DECO` are parameters, not a user setting. Callers holding a dive use
`diveModWarning`: one cylinder, `max_depth` applies with both thresholds; several, only "the
deepest-capable gas cannot reach `max_depth`" is reported, at 1.6 only.

The warning is spelled out under the table, not in a `title` tooltip. `text-warning`, not
`text-warning-foreground`, which is the white on `bg-warning`.

## `diveMixtureSchema` refines `o2 + he <= 100`, mirroring `ck_dive_mixture_oxygen_helium_sum`

`diveMixtureSchema` carries a refine mirroring `ck_dive_mixture_oxygen_helium_sum`, so a 50/60
trimix fails as a field error rather than a 500. It reports on `path: ["helium"]`: helium is the box
filled second on the trimix entries where this fires, so the message lands under the field being
looked at.

## The Exposure card renders stored numbers and derives nothing

`components/dives/dive-exposure-card.tsx` shows CNS, OTU and surface pressure unchanged. CNS and OTU
are the output of whichever algorithm the device ran; a "corrected" figure disagreeing with the
diver's wrist is worse than useless. The fields are read-only; the API keeps them off its
create/update schemas.

Start → end is shown, a missing half as an em dash. The card renders nothing when a dive has none of
the three: a diver never had the option to enter them. It is titled "Exposure & Pressure" because a
lone surface pressure is common and gating on CNS/OTU would drop it.

Past 100% CNS is `text-warning` emphasis on the number, not a warning sentence. The second channel
is an `sr-only` span, not an `AlertTriangle`, because a visible icon is visible advice; it is
carried as `alert?: string` on `Reading`. `dive-exposure-card.render.test.tsx` asserts it through
the accessible name.

## A recorded ppO₂ limit moves the MOD, and pointedly not the warning

`DiveMixture.po2_limit` is what the computer planned a gas to (a Suunto writes 1.4 on back gas and
1.6 on the deco bottle), so `ppO2Limit()` feeds it into every displayed MOD, falling back to
`PPO2_WORKING`. It does not reach `modWarning`/`diveModWarning`, which judge against
`PPO2_WORKING`/`PPO2_DECO`: a limit from a file is the edit that turns an over-MOD warning into
silence, and a cylinder recorded at 2.0 would become unwarnable. `OxygenFractions` declares
`po2_limit` and never reads it, so the answer is visible in the type.

The MOD header is conditional: `sharedPpO2Limit()` returns the single limit when every cylinder
agrees (an unrecorded limit counts as the 1.4 default) and the header stays `MOD @ ppO₂ 1.4`; only a
dive mixing limits drops to bare `MOD` with the qualifier in the rows.

`DEFAULT_MIXTURE` leaves `po2_limit` blank with placeholder `1.4 (default)`, so a hand-added
cylinder never claims a limit the diver did not choose.

## `gas_number` round-trips through the form untouched, and 0 is a real value

`DiveMixture.gas_number` is on `diveMixtureSchema` and `normalizeMixtures` with no input: it is the
source export's cylinder identifier and the join key to that cylinder's pressure curve on the
profile chart. In `mergeMixture` it needs `??`, not `||`: a Suunto Ocean numbers cylinders from 0.
The zod rule is `min(0)`, mirroring `ck_dive_mixture_gas_number_non_negative`.

`role` is a plain `<select>`, not the shadcn `Select`, because it needs "unset" as a real option and
Radix reserves `""` for clearing. Its empty value stays `""`, converted to `undefined` by
`normalizeMixtures` at the edge; react-hook-form re-displays a field's default whenever the value
resolves to `undefined`, so `e.target.value || undefined` snaps an imported `"deco"` back on
clearing. Any optional form field needs a non-`undefined` empty value, and `role` is
`z.union([z.literal(""), z.enum(GAS_ROLES)]).optional()` for that reason.
`MixtureFields role input > lets an imported role actually be cleared` pins it.

## `mod()` returns null below the surface, where `end`/`ead` floor at zero

A diver-editable `po2_limit` across the schema's `[0.4, 2.0]` band makes `mod(50, 0.4)` −2.0 m, and
both `diveMixtureSchema` and `ck_dive_mixture_po2_limit_range` accept the inputs. `mod()` returns
`null` for a strictly negative result, not the `Math.max(0, …)` that `endDepth` and `ead` use: 0 m
is a real END or EAD (a rich mix in shallow water is equivalent to the surface), whereas "MOD 0 m"
reads as a depth the gas may be breathed at, the opposite of the truth. Both call sites render `-`
for `null`. Exactly 0 stays a number: `mod(40, 0.4)` is 0 m.

## The role badge costs the mixtures table 73 px it did not have

The mixtures table overflows its two-thirds-width card (`overflow-x-auto` wrapper,
`whitespace-nowrap` rows); MOD is the last column and the first to go off-screen. Two cuts stand on
their own: `GAS_ROLE_LABELS` omits the word "gas" ("Bottom gas" under a column headed _Gas_ says it
twice), and the per-row ppO₂ suffix is `@ 1.6`, not `@ ppO₂ 1.6`, rendered only when a dive mixes
limits.

The remaining width is not paid for by moving `bar` into the headers or dropping `O₂`/`He`, which
hold the unrounded fractions. Cell padding is the real cost (at `p-4` a seven-column table spends
224 px on it) and `He` is dropped on a dive with no helium; see "The gas tables scroll inside
shadcn's own wrapper, and no card adds another". A `usage` badge in the same cell reproduces the
clipping and lives outside the table; see "The mixtures table carries no usage badge;
`tankUsageSentences` states the flags under it".

## The API sends `null` and the form schema wants `""`, so `toDiveMixtureInput` converts at the boundary

`DiveMixtureBase` declares optional fields `X | None` with no `exclude_none`, so an unrecorded field
arrives as an explicit `null`. `DiveMixture`'s optional fields are `| null` for that reason, and the
same rule covers `volume`, `oxygen` and `helium` (see _"A cylinder may record a mix with no vessel,
and three fields are `number | null`"_). A `null` reaching `zodResolver` fails silently:
`handleSubmit`'s valid callback never fires, so no request, no toast, no error, and `gas_number`,
having no input, has no `FormMessage`.

`toDiveMixtureInput` in `lib/validations/dive.ts` is the one API→form conversion, beside
`normalizeMixtures` for form→API. Field-by-field, no spread: a spread silently admits whatever field
is added next. A fixture written the way the API serializes it, with the `null`s spelled out, is
parsed through `diveMixtureSchema` and round-tripped through `normalizeMixtures`. The rule: a field
arriving from the API needs a boundary conversion the moment the form gives it a sentinel empty
value.

## The deco ceiling rides depth's axis, and hiding depth hides the water, not the scale

`ceiling` is a fourth `PROFILE_CHANNELS` entry with `scale: 100` and `inverted: true`, mirroring
`CEILING_SCALE = DEPTH_SCALE` in the API's `schemas/dive_profile.py`.
`depthDomain(depthValues, ceilingValues)` computes one domain from both channels whether or not
either is plotted: an axis of its own could draw a 3 m ceiling below a 40 m depth, and an axis
depending on what is visible moves under the diver's eyes when the ceiling is toggled.

`leftChannel` is depth, or the ceiling if depth is off; `depthChannel` alone gets the teal fill.

The forbidden zone is shaded, from the surface down to the ceiling, drawn over the depth fill. One
region per segment from `segmentByTimeGap`: a gap here is a stretch with no obligation, and spanning
it would shade a no-decompression descent. The line is dashed because it is the only curve never
measured, a computed limit rather than a reading.

## Adding a channel needs a remembered-selection key bump; removing one does not

`DIVE_PROFILE_SERIES_KEY` carries a `-v2` suffix. `parseSeriesVisibility` filters a stored selection
down to the keys the build plots, right for a key that has gone and wrong for one that has arrived:
a selection naming `depth`, `temperature`, `pressure` restores cleanly with the ceiling off and a
legend entry implying the diver chose that. The rule: adding a key to a `parseSeriesVisibility` list
needs a key bump; removing one does not.

The ceiling is a toggle rather than drawn with depth unlisted, because _"Both charts' legends are
the control for what they plot"_ forbids a legend entry that is not a control.

A bump owes no `removeItem` on the old key: that starts a list of dead names carried and grown on
every bump. The device-memory switch clears orphans by prefix, walking live storage rather than a
list; see _"One switch against every remembered preference on this device"_.

## `--ceiling` is one value for both themes, like `--teal`, `--coral` and `--pressure`

`--ceiling` is a single `0 80% 55%`, never redeclared under `.dark`, like `--teal`, `--coral` and
`--pressure`: a per-theme pair is tuned twice and drifts. Computed contrast is 4.3:1 against the
light card and 3.8:1 against the dark 13% one, clearing the 3:1 for a graphical object. The web
`accessibility-check` job would not catch a failure here: it runs axe against the landing page only,
with `|| true`. Not `--destructive`, a pair tuned for text and labels on a fill.

Hue 0 sits close to `--coral`'s 16; amber would buy separation, but red is what every dive computer
uses for a ceiling. Lightness and saturation separate them (pale salmon at 66% against saturated red
at 55%), plus the ceiling being the only dashed line over a shaded region. Colour does the least of
the work, which is what makes the overlap acceptable.

## Markers are annotations, so they have no axis

`events` render as a tick on the x-axis with a glyph on top at `x(t)`, the anchor surviving depth
toggled off; not a fifth `PROFILE_CHANNELS` entry (switch: _"The markers have a legend switch, and
it is not a fifth channel"_).

Three glyph families, not five. Colour marks only what joins elsewhere: a gas switch is `--pressure`
violet for its `gas_number`. A stop is not the ceiling's red: both types arrive via
`_STOP_TYPE_BY_NOTIFY` in `suunto_json.py` as a recommended pause.

`describeEvent` passes an `other`'s label through unchanged; `gas_number` is tested with `== null`.
`label` is free text, so the tooltip line is `max-w-64 whitespace-normal`.

`glyphFor` takes a `string` with a grey-circle fallback and `describeEvent` has a `default`:
`ProfileEventType` is closed only here, and with no `error.tsx` under `src/app` an unknown
`EVENT_GLYPHS` key takes out the dive route.

Resting opacity is 0.9; 0.55 puts `--ceiling` and `--pressure` under 3:1.

## The crosshair quotes a channel only within its `gapSeconds`, the threshold that breaks its line

`nearestSampleIndex` clamps at both ends, so a naive readout quotes a channel across stretches it
has no samples for — on the ceiling that invents a deco obligation.
`sampleIndexAt(t, seconds, maxDeltaSeconds)` is `nearestSampleIndex` bounded by the channel's
`gapSeconds`, the same threshold that breaks its line, so plot and readout cut the same stretch;
beyond it the channel drops out of the card as its line drops out of the plot. `PlottedChannel`
carries `gapSeconds`, and every call site goes through one local `runs(t)` returning segments and
threshold together.

`gapThreshold` answers `Infinity` below three samples — right for segmenting ("never break this
line"), wrong for quoting ("no distance is too far"). `readoutTolerance(t)` replaces that infinity
with `MIN_GAP_SECONDS`. A sentinel meaning "unbounded" is safe in "should I split here?" and
dangerous in "is this close enough?". The floor errs toward silence: no number beats an invented one
on the ceiling.

## Crosshair readout: `runs()` derives segments and `gapSeconds` from one threshold, and drops single-point runs

Segmenting the ceiling at an infinite threshold joins two isolated deco samples into one run, and
`ceilingAreas` shades a forbidden zone across water the diver owed nothing — the readout's lie in
pixels, which the readout then contradicts. `runs()` derives segments and `gapSeconds` from one
threshold so the two cannot disagree. Two samples ten seconds apart still join and draw; twenty
minutes apart they become single-point runs, and single-point runs are dropped rather than emitted:
a one-sample `<polyline>` draws nothing and `buildAreaPath` turns one point into a zero-width shape,
so dropping them makes "no ceiling here" true of the DOM, which is what a test can assert.
`max_ceiling` still puts the obligation in the card's description.

## Crosshair readout: a tolerance cannot answer "was this drawn?", so `PlottedChannel.drawn` does

`gapSeconds` answers whether a sample is near enough to quote, and a sample dropped for sitting in
an undrawable run of one is trivially near itself — so a readout could name a ceiling, plant a dot
and write "deco ceiling to 3.0 meters" into the `aria-label` over a chart that drew none. Distance
cannot answer a membership question. `PlottedChannel.drawn` is the set of sample indices that
reached the picture, and a readout needs both `sampleIndexAt` and `drawn.has(index)`.

A channel with nothing drawable is not a plotted channel: `channels` is filtered on
`segments.length > 0`, which holds the rule for legend, both axes, crosshair and summary at once.
Without it a two-sample series claims a toggle reading "on", a labelled axis and a line in the
`aria-label` over an empty plot, and a two-sample depth series draws its area fill with no line,
`depthArea` being built from the whole series.

## Crosshair readout: `drawnValues` feeds the axis and summary, and `drawnSampleIndexAt` skips undrawn samples

The `segments.length > 0` gate asks whether a channel is on the chart; runs are dropped per sample,
one level below it. A ceiling keeping one drawable run passes the gate and hands its raw series to
everything reporting an extreme, so the summary can announce a deeper ceiling than any drawn one and
the shared vertical axis stretches to fit a curve nobody sees. `drawnValues(series, drawn)` feeds
both `depthDomain` and `describeProfile`; `describeProfile` takes plain `number[]` per channel
rather than `ChannelSeries | null`, so the raw series cannot be passed by habit and an empty array
means "not on screen".

A nearer undrawn sample must not mask a drawn one: `drawnSampleIndexAt` walks outward from the
nearest sample and takes the first drawn one — the nearest drawn sample within tolerance.

## `gapsAreMeaningful` says what a gap means: only the ceiling refuses to join two samples

Segmenting every channel at `readoutTolerance` applies ceiling reasoning to measured channels: below
three samples `Infinity` becomes 15 s, so a two-sample channel more than 15 s apart splits into two
dropped singletons and stops plotting; where depth is the only channel the component falls through
to `available.length === 0` and reports no samples.

`ProfileChannel.gapsAreMeaningful` splits the cases on what a gap means. For a measured channel it
means "not recorded", there is no cadence to judge two samples by, and joining them is the honest
option — `gapThreshold`'s `Infinity`. For the ceiling it means no obligation existed, and joining
draws a forbidden zone over free water, so only it pays the cost of refusing. It coincides with
`dashed` and says something different: `dashed` is how a curve is drawn, this is what its absence
means. `dive-profile-chart.render.test.tsx` covers the component wiring the `lib` tests cannot.

## Markers are clipped to the plot, because the API says in so many words that they aren't

`_rebase_events` clamps an event's time at zero and deliberately leaves the high end alone: the
profile's `duration` spans the samples, a device keeps recording after the last one, and a FIT
`user_marker` can be pressed after surfacing. The API's contract closes with "A chart that draws
past its x domain is the chart's to clip", and that sentence is the requirement.

Unclipped, `x(6000)` on a 3 000 s dive lands outside the viewBox and `x(3200)` inside it, in the
axis-label gutter aligned with no time — while `describeProfile` names both. One filtered list feeds
the glyphs, the crosshair and the summary, so they cannot disagree. Markers past the domain are
dropped, not clamped to the last second (clamping invents a time), and not left to SVG clipping,
which hides what leaves the viewBox and draws what merely leaves the plot.

## A dive-wide bar/min is not a rate, so multi-tank `sac_bar_per_min` is null

Litres and RMV survive summing across cylinders: RMV is defined at surface pressure so a 22 L
twinset and an 11 L stage compare. SAC does not: bar/min is a rate of pressure, 10 bar from the
stage is half the gas of 10 bar from the twinset, and a dive-wide sum or average has no referent.
`DiveGasUse.sac_bar_per_min` is `number | null` on the wire and null on multi-tank dives, where each
`tanks` entry carries its own — meaningful because a tank has one volume, and the figure a diver
reads off a gauge, so it stays in the table. `gas-use-chart.tsx` and `gas-use-card.tsx` plot `rmv`
and label with `gas_used`, so the dashboard is untouched. The total row renders a greyed `-` rather
than omitting the cell: an empty cell reads as a layout bug, a dash as "no answer here".

## The multi-tank branch splits three ways, and tests attribution first

`compute_multi_tank_gas_use` gives up for five reasons: no attribution; two mixtures sharing a
`gas_number` (whole dive refused); a cylinder the attribution never names; a cylinder failing
`compute_gas_use`'s pressure arithmetic; a per-tank RMV past `MAX_PLAUSIBLE_RMV`. Only the fourth is
a skip. The third skips when that cylinder's pressures show no drop and refuses when they do, since
the surviving figures are then wrong, not incomplete; the fifth refuses likewise.

So `gasUseUnavailableReason` never claims the import records no switches; `DiveProfileCard` may be
drawing them above. It says the switches don't account for every cylinder, true of all three.
Without `dive_profile.gas_attribution`, the browser infers backwards: a cylinder whose pressures
would have produced a figure when the dive produced none means attribution was missing; otherwise no
pressure drop, or no pressures. The duplicate case gets no sentence; `gas_number` is never edited
here. Not "this tank's", and no mention of `dive.avg_depth`, not a multi-tank input.

## Attribution comes from gas switches only, and the litres never come from the profile

Per-cylinder pressure activity is not an attribution source: the exports carry one pressure channel
per file, so there is usually nothing to compare, and a cylinder's pressure keeps moving with its
temperature long after the diver switched away. The column is `gas_attribution`, not `gas_usage`,
because it carries only which cylinder, for how long, at what mean depth — no pressures. The litres
come from the form's `start_pressure`/`end_pressure`, not the profile's curve: the two disagree by a
few bar for the same cooling reason, and the recorded header is the number the mixtures card prints
directly above, so deriving consumption from another would make the table unreconcilable with it.

## The consumption table is six columns wide and scrolls, like the mixtures table above it

The consumption table sits in its own `overflow-x-auto` wrapper, like the mixtures table above it,
so a narrow pane scrolls the table and never the page body. `RMV` and `SAC` are content-driven
(`18.24 L/min`, `0.82 bar/min`), so shortening headers gains nothing there, and moving units into
the headers is forbidden by the card's rule: units stay with the values, never doubled in the label.
"Avg Depth" keeps its full length: it is a mean depth over the stretch a cylinder was breathed, and
"Depth" beside a per-tank row invites reading it as that gas's deepest point — the misreading
`diveModWarning` refuses to warn per tank over, a mean depth being the wrong input for a MOD. Before
shortening a header, check what fraction of the table is `p-4` padding; halving it is what made this
table fit. Widths: see "The gas tables scroll inside shadcn's own wrapper, and no card adds
another".

## The tank↔mixture join applies the API's duplicate rule rather than trusting it

`compute_multi_tank_gas_use` refuses a dive whose mixtures share a `gas_number`; `tankGasUseRows`
guards anyway, since a pure function sound only via a server-side check has no contract, and the
failure is litres listed twice under a total counting them once. A gas number naming more than one
cylinder names none: both rows are unattributed. Same on the tank side: a `Map` keyed by gas number
keeps the last writer, so a shared number would drop a tank while its litres stayed in the total.
Both get rows keyed by position in `tanks`.

Invariant, test-pinned: every tank reaches exactly one row. Two asymmetries: a mixture with no tank
stays, "Not attributed"; a tank with no mixture is appended as `Gas N`, not `Tank N`: the mixtures
card numbers by position and this row has none. Row keys use `mixture.id` or position, never
`gas_number`. No `!number` shortcut: Suunto Ocean numbers from 0.

## Attribution coverage is stated when it's short, and silent when it isn't

Per-tank figures are an inference that can leave a remainder — a file recording switches but not the
entry gas has nothing to assign the descent to — and figures covering 38 of 42 minutes presented as
the dive understate every one. `gasAttributionNote` says so from `attributed_seconds`/`duration`,
and says nothing below a one-minute remainder, which is rounding and would print two spans rendering
identically. The denominator is the profile's span, not `Dive.duration`: it is what the attribution
ran over, and `Dive.duration` may be hand-edited, making the fraction unfalsifiable. It returns null
when `attributed >= total` rather than printing "covers 45min of the 40min recorded" — unreachable
from a correct API, but the shape a degenerate profile takes. The sentence names the dive computer
("the 1h 12min the dive computer recorded") because `DiveGasUse.duration` routinely outruns the
header's `Duration`; two right numbers for two spans must not read as one being wrong.

## The total row is dropped when it would restate the only row above it

The corpus's normal multi-gas shape is one `tanks` entry: one transmitter on the back gas, a deco
bottle recording no pressures. There an "All tanks" row repeats the single row verbatim and prints a
dash under SAC beside a real `bar/min`, reading as "no SAC available". The total renders only when
two or more cylinders were attributed, the only case where it reconciles anything.

The condition is `attributedCount`, counted after the join. `tanks.length > 1` is equivalent, since
every tank reaches exactly one row, but `attributedCount` states the reason directly rather than
through an invariant. The layout switch is `rows.length > 0`; there `tanks.length > 1` would hide
the deco bottle's row on every one-transmitter dive. The "Not attributed" row stays regardless: on
such a dive it is the card's second fact, a bottle carried whose cost this log can't say.

## The dashboard chart names no depth the rate is not divided by

Multi-cylinder dives reach `GET /user/gas-use-history` with RMV normalized against each cylinder's
own mean depth, so the single-tank framing — `{avg_depth}m average · {gas_used} L used` in the
tooltip, `at {avg_depth}m average` in the dot's accessible name — makes `avg_depth` a true fact
about the dive and a false claim about the number beside it, while `gas_used` sums attributed tanks
only. Both are dropped together and replaced by the one thing needed: this rate is per cylinder, and
the dive page has the split. `point.gas_use.tanks?.length` is the switch, the same one the
consumption card uses. The accessible name gets the same treatment, not a simplified one, being the
only form a screen-reader user gets. `gas-use-chart.render.test.tsx` asserts the absence of the old
depth as directly as the presence of the replacement. A derivation that changes what a number means
has to be chased to every consumer of it.

## No profile, no attribution — and that is 18 of the 19 multi-gas dives

`gas_attribution` is a column on `dive_profile`, so a dive without a profile cannot reach the
multi-tank derivation whatever the diver types; `gasUseUnavailableReason` tests that first. The
guard reads `primaryRecording(dive)?.profile == null` — the primary recording's deliberately, since
the API joins gas attribution through `ordinal == 0` and a second computer's profile puts no
`gas_attribution` on the dive; see "A dive has recordings, and the first one is primary, picked only
by `primaryRecording()`". 18 of the corpus's 19 multi-gas dives are hand-logged, with no profile and
no source file, so "needs an import whose gas switches account for every cylinder" describes an
import that does not exist. The `mixtures` guard above has already returned for a list dive, so a
missing profile here is a real absence, not a withheld field. Test user-facing strings against the
corpus's ordinary case, not the one the code was written for.

## An empty tank row says "No pressures recorded" or "No figures", never "Not attributed"

`TankGasUseRow.use` is null for two server outcomes: the attribution never mentioned the cylinder,
or it did and `_tank_arithmetic` declined it — no pressures, no drop, or a degenerate stretch
(`seconds <= 0`, `mean_depth_cm <= 0`, which a gas switched to at the surface at the end of a dive
produces). A label reading "Not attributed" names the first and is contradicted on the second by the
coverage note reporting that cylinder's seconds as attributed. The row says "No pressures recorded"
where the mixture carries no pressure pair — checkable in the browser, and the corpus's deco bottle
without a transmitter — and "No figures" otherwise. `TankGasUseRow` carries `hasPressures`, read
only when `use` is null. When a null collapses several upstream states, a label naming one of them
is a guess: distinguish them or say less.

## One dot, two sentences, one predicate

The gas chart describes each point twice, in the tooltip and the dot's accessible name, and both
must agree on whether the RMV was derived per cylinder. `isPerTankPoint` is the single predicate,
replacing two independent `(point.gas_use.tanks?.length ?? 0) > 0` checks joined only by a comment.
Both renderings are tested: the tooltip is the path almost every diver takes, and pinning only the
accessible name lets a regression that puts `avg_depth` back into the tooltip ship green. Testing
the accessible name is not a proxy for testing the visible one, even where both come from the same
data.

## The dive's clock sits in the page header, and one `Duration & Depth` card holds the rest

The start time belongs with the date, already in the page header: `formatDiveStartTime` prints date,
clock time and, where the dive records one, its offset as one line. The offset stays because a dive
displays in its own timezone (see "A dive's `start_time` displays/edits in its own timezone, never
the browser's") and `10:04` alone cannot be checked; a DiveJSON import may carry no offset, and the
line then stops after the clock rather than inventing `(UTC+00:00)` — see "An unknown UTC offset is
a third state, and `new Date()` never sees an offset-less string". It is composed from
`formatDiveDateTime` + `formatDiveTimeOnly` rather than one `Intl` call: the separator a locale
picks is an ICU detail, and the offset is appended by hand regardless. What remains is one
`Duration & Depth` card: three stat blocks at one weight, `md:grid-cols-3`, depths individually
conditional so a hand-logged dive leaves duration alone.

## The ppO₂ limit is picked from a list, and an unlisted one is added to it

`po2_limit` is a `<select>`, not `<input type="number">`: the schema's 0.4–2 band catches a unit
error (Suunto JSON writes 140000 Pa for 1.4 bar), the values a diver picks are seven, and free entry
bought typos and a 422 on `ck_dive_mixture_po2_limit_range` the diver cannot act on. A `<select>`
for the same reasons as `role`: "unset" needs a real option, Radix `Select` reserves `""`, and `""`
must reach react-hook-form as the live cleared value — see "The API sends `null`, the form schema
only understood `""`".

The options are strings: `String(1.0)` is `"1"`, so an option labelled `"1.0"` would never match its
stored value; selection compares `Number(option) === value`, one direction only. A limit not on the
list is inserted, sorted, since a `<select>` matching no option renders blank over a held value. The
floor is 1.0 by decision: below it a figure is a CCR setpoint, not a MOD ceiling.

## The profile's left edge always carries a scale, and an all-hidden chart is still a chart

The plot holds at most three scales: depth and ceiling share one (see "The deco ceiling rides
depth's axis"), so the rule is over scales, not channels. With two scales, sides are fixed (position
reads faster than colour): meters left, temperature right, pressure taking whichever is free,
unlabelled when all three are on. A single scale goes left, right edge empty; mirroring it invites
reading two scales. Invariant: the left edge is labelled whenever anything is plotted, the right
exactly when a second scale is on.

`DiveProfileChart vertical axes` sweeps every non-empty selection, computing the expected right edge
with `distinctScales`; see "The deco readouts got a panel" for what "the plot" means now. Switching
the last channel off keeps the plot: same box, time axis and markers, the sentence over the middle
with `pointer-events-none`, neither edge labelled. A `??` chain that runs out is a case, not an
absence.

## The depth fill is built per segment, from the same `segments` as its line

`segmentByTimeGap` cuts every channel into runs so no line spans data that isn't there (see "The
profile's line breaks are derived from the series' own cadence"). `depthArea` is one `buildAreaPath`
per segment, from the same `segments` the polylines use, as the ceiling's has always been — not a
single path over `depthChannel.series.t` entire, which shades water across a dropout the curve above
refuses to span: a claim the diver was down there through a stretch the device recorded nothing
about. The test `leaves the dropout unfilled rather than spanning it` reads the `d` attributes back
and checks where the first path ends and the second starts; a count alone passes on two overlapping
fills.

## The markers have a legend switch, and it is not a fifth channel

A dozen markers on one dive is a picket fence, and opacity only trades marker legibility against the
plot's, so the legend switches them. `ProfileChannelKey` stays "a thing with a domain", which
`lib/dive-profile.ts` is written against; the legend switches the wider
`PROFILE_VIEW_KEYS = [...PROFILE_CHANNEL_KEYS, "events"]`, `parseSeriesVisibility` is generic over
its keys, and `ChannelToggles` is named `LegendToggles`. It lives in the legend only (see "Both
charts' legends are the control for what they plot"). The swatch is an uncoloured circle: diamond
and triangle mean specific types, and colour means "joins to something else on the chart", true only
of a gas switch. Hiding hides everywhere: glyphs, crosshair readout and accessible summary read one
`eventsShown`, and tests pin that a hidden marker is neither announced nor quoted. Adding the key
bumped `-v2` to `-v3`; otherwise stored selections restore with markers off. The empty-plot message
is held back while markers are up.

## A remembered selection is held over every key, not over the keys one dive has

`available` is per-dive while the stored selection is one app-wide entry. Narrowing it to
`available` before storing leaks: a toggle on a markerless dive writes back an entry without
markers, which `parseSeriesVisibility` reads as "off" on the next dive. It is held at full width,
`chosen ?? remembered ?? PROFILE_VIEW_KEYS`, and intersected with `available` to draw. `visible` is
that intersection; `shown`, `eventsShown`, `shownValues` and the empty-plot overlay read it, not the
selection. An empty `chosen` is honoured (`chosen !== null`, not truthiness): `[]` is a choice,
while a remembered selection plotting nothing here shows what the dive has. That test asks whether a
curve survives, not a key (`"events"` alone draws none), and the fallback restores curves only,
leaving markers untouched. The toggle's base is `visible` lifted over the full list, not the
selection. `DiveProfileChart selection across dives` and
`DiveProfileChart remembered selection that plots no curve here` pin it.

## A cylinder is named by its 1-based position, and `DiveMixture` has no `name`

`DiveMixture.name` is not a field: the label is a pure function of the fractions from the API and so
from here: schema field, form input, column, label fallbacks and `getDefaultMixtureName`. A cylinder
is named by 1-based position; `ParsedDiveMixture.name` was always `null`, so imports were already
positional. The mixtures card's first column is `Tank`, cells `Tank 1`, `Tank 2`: the consumption
card's format, since the tables are read row against row and `TankGasUseRow.label` derives the same
string; an unmatched cylinder stays `Gas N`. The column stays: the consumption card joins to it, the
profile's pressure channels are numbered against it, and `Tank 1` fits the slot. `mergeMixture` lost
`index`.

The per-tank form is eight boxes in a two-column grid, nothing widened (`Volume | ppO₂`, `O₂ | He`,
`Start | End`, `Role | Usage`), so pairs read as pairs and the two `<select>`s sit adjacent.
`DEFAULT_MIXTURE` is complete, so `append({ ...DEFAULT_MIXTURE })` and both pages' seeds share one
shape.

## The export filename is the server's, with a local mirror behind it

`lib/api/export.ts` calls `filenameFromContentDisposition` on the response and saves what the API
named. `Content-Disposition` is not a CORS-safelisted response header, so `fetch` reads it as `null`
unless the API names it in `expose_headers` on `CORSMiddleware` (`core/setup.py`); the API's
DECISIONS.md carries it under "`Content-Disposition` has to be named in `expose_headers` or the
browser hides it", and any other header the web app needs to read has the same problem. Behind the
parser, `exportFilename` mirrors `export_filename` in the API's `services/export/naming.py` —
`opendiving-<username>-<YYYYMMDD>.<ext>`, the `[^a-z0-9]+` scrub, `"export"` when the username
scrubs to nothing — kept as a fallback for a self-hosted API behind a proxy that strips the header.
The date is stamped in UTC from `getUTC*`, matching the server's `datetime.now(UTC)`, so a diver in
UTC+13 gets the name `curl` does. `export.test.ts` is the coupling and spells out the scrub cases so
it fails when the API's rule moves.

## The whole export is buffered in browser memory, and the escape hatch is a signed URL

Every export is fetched with axios `responseType: "blob"` and saved through `downloadBlob`, the path
the dive source file and c-card images take: the endpoints require an `Authorization` header and a
plain `<a href>` cannot send one, the token living in memory rather than a cookie. Those two are
bounded by upload limits; an archive is bounded by the account, held in RAM before writing and for
`REVOKE_DELAY_MS` after. Accepted, because the fix is not a frontend one. The escape hatch,
deliberately not built: a short-lived signed download URL served as a plain `<a href>`, streaming to
disk without entering the JS heap. It needs an API endpoint and a token scheme, and is what to build
when someone hits the ceiling — not a streaming-download library on this side.

## Buttons all named "Download" need an accessible name each

Every export button reads `Download`, so each carries an `aria-label` naming its row. An
`aria-label` overrides the button's text, so it tracks the busy state
(`Preparing Full archive export` while fetching, `Download Full archive` after), with `aria-busy`
backing it (`aria-busy` alone is unreliable).

The busy button is `aria-disabled`, not `disabled`: a real `disabled` drops focus to `<body>`, so
the name change reaches no one. Three parts replace it — an early
`if (busy.has(row.format)) return`, `aria-disabled:opacity-50` (Tailwind's `disabled:` variant never
fires), and a test that a busy click sends nothing.

Busy is a `Set<ExportFormat>`, updated functionally: a boolean disables every row while the archive
runs, and a single `ExportFormat | null` lets one row's `finally` clear the other's. A duplicate
click costs a second save, not a second request, since `apiClient.get` dedupes in-flight requests
(`getRequestKey`). Rows may run concurrently; the per-user export rate limit is the diver's budget
to spend.

## `<` is the earlier dive, which is the opposite of what the log list would suggest

`<` is the earlier dive, `>` the later: a timeline, not the newest-first order of `GET /dives`.
Neighbours come from `GET /dive/{uuid}/neighbors`, keyed by `start_time`, never `dive_number`, which
has gaps.

A route-group layout above `dives/[id]` owns the fetch, so a step keeps the outgoing dive mounted:
`SectionSpinner` shows only when `isLoadingDive && !dive`, and a step dims the cards to `opacity-50`
under `aria-busy`. Neighbours are stored under the uuid they were fetched for, and fetched for the
displayed `diveUuid`, not `params.id`, so arrows and date agree.

Each arrow is one `<a>` swapping its `href`, not `next/link`: alternating element types replaces the
node and drops keyboard focus. Unavailable is `aria-disabled` plus `pointer-events-none` with
`role="link"`; a plain click calls `router.push`. The log's end leaves its arrow dead, not removed;
`aria-busy` marks not-yet-known. A failed fetch is silent, as in `DiveNumberingStatus`.
`dive-neighbor-nav.render.test.tsx` pins node identity across the `href` swap.

## The gas tables scroll inside shadcn's own wrapper, and no card adds another

Both tables fit their 582 px slot at the 1024 px `lg:col-span-2` pinch, except a mixtures table
carrying role badges: the MOD column states a limit at the scale it is compared at (115 px metric,
112 px imperial, 9 px and 13 px more than a rounded one), which puts that worst case 7 px and 11 px
past the slot and scrolls it. `px-2` cells did most of the fit; see "Cell padding is `px-2`
app-wide". The cards add no `overflow-x-auto` wrapper: shadcn's `Table` wraps itself in
`relative w-full overflow-auto` (`ui/table.tsx`), so an outer one never scrolls and
`closest('[class*="overflow-x-auto"]')` reports 0 px. Measure `table.scrollWidth` against
`table.parentElement.clientWidth`, any conditional `tfoot` rendered. Chart wrappers
(`dive-profile-chart.tsx`, `gas-use-chart.tsx`, `dive-activity-chart.tsx`) stay: SVG has none.

Columns: gas has its own column in both; `Used`, not `Gas Used`; `He` only when a cylinder carries
helium; header `#` plus `sr-only` "Tank", `TankGasUseRow.label` `"1"`, unmatched tanks `Gas 3`,
footer `Total`; every MOD carries its muted ppO₂, so `sharedPpO2Limit` is gone. `GAS_BADGE_CLASS`
(`lib/dive-mixtures.ts`) is a 4.5 rem `min-width` sized to `Oxygen`. A shared `w-16` aligning both
badges is rejected: it collapses under `table-layout: auto`. The MOD cell's accessible name is
`56.66 m@ 1.4` (`dom-accessibility-api` trims nodes); tests assert `textContent`.

## Cell padding is `px-2` app-wide

`ui/table.tsx` diverges from shadcn: `TableHead` is `px-2`, not `px-4`; `TableCell` is `px-2 py-4`,
not `p-4`. Vertical padding is untouched. No table overrides cell padding; re-adding the component
from the shadcn registry silently restores `p-4`/`px-4`, hence the comment in the file.

Measured on nine tables at 375–1440 px with `padding-inline` injected, reading `table.scrollWidth`
against `table.parentElement.clientWidth`. At 1024 px and above nothing overflows at any padding; at
375 px everything scrolls regardless; 640–768 px is the argument: `px-2` clears every 640 px
overflow but certifications, and at 768 px stops `Date & Time` and `Apr 16, 2026, 12:59` wrapping in
the dive log. `px-3` clears under half. The one cost is the gutter between right-aligned `Dives` and
`Service` in `gear-items-card.tsx`; if that pair reads as one number, add `pr-` there rather than
widening every table. The five list pages still wrap `Table` in an inert `overflow-x-auto` div,
which fools `closest('[class*="overflow-x-auto"]')`.

## Dive site coordinates are two free-typed strings, validated as a pair

`latitude`/`longitude` are `number | null` on the API but form strings, converted by
`parseFormCoordinate()`/`formatCoordinateForForm()`; a `z.preprocess()`/`.transform()` would
collapse the `z.input<>` form type.

Both-or-neither is two `.refine()`s, messaging the empty field. `WholeCoordinatePair` enforces it,
422ing a body naming one coordinate without the other, and never reads the stored row, so moving a
site sends both. The dialog always submits the pair; a half pair from the database must be resolved
first.

`parseCoordinatePair()` splits a pasted `27.8506, 34.3136` into both fields. DMS is not parsed;
`AMBIGUOUS_DECIMAL_COMMA` refuses a bare comma between dot-less integers: `-16,5` is `-16.5` in
Europe and as a pair lands off Angola.

`toDecimalString()` uses `String()`, never `toFixed()`, going fixed below 1e-6 where `String(5e-7)`
fails `COORDINATE_REGEX`.

The pair hint is an `aria-hidden` `<p>` plus a per-field `sr-only` `<FormDescription>`:
`<FormDescription>` throws outside a `FormField`, and a hand-set `aria-describedby` overrides
`<FormControl>`'s, silencing errors. No `inputMode="decimal"`: iOS has no minus key.

## The map writes into the coordinate fields, and can tell its own echo from a diver typing

The picker holds no position, reading `latitude`/`longitude` from the form and writing through
`setValue`. `emit` records what it hands out, rounded to five decimals there, so the echo in props
is not read as typing, which recentres the map. The record is separate from the previous props,
spent once matched, never armed by a no-op placement; "ever placed" is latched (`parseFormPosition`
rejects `34.` mid-edit); comparison runs during render against the last props, never the view.

The geocoded name goes straight into Location, keyed to the clicked coordinates, announced via
`role="status"`. `reverseGeocode` returns a three-way `ReverseGeocode`: `204` nameless (clear unless
empty), `200` with `null` could-not-ask (leave alone); branch on `response.status`, as axios gives a
204 `data` of `""`.

Gesture rules are MapLibre configuration ("The picker's contract is its own, and MapLibre is
configured to meet it"). The basemap host sees divers' IPs and tile areas (`/privacy` §4.4); the CSP
follows `NEXT_PUBLIC_MAP_TILE_URL` to a self-hosted server.

## A trip's locations are self-describing objects, so nothing has to be resolved

`TripLocationMultiSelect` is built on the same `CreatableCombobox` as `DiveSiteMultiSelect` but
holds `{name, display_name, latitude, longitude, bbox_*}` objects, the snapshot the API stores,
rather than uuids, so a row renders from its own content with nothing to fetch and no loading state.

Rows therefore have no id. `locationKey` derives one from content: `geo:{lat}:{lon}:{display_name}`
for a geocoded place, `txt:{name}` lowercased and trimmed for a typed one. `mapSearchResults`
collapses results sharing a key, since Nominatim can return the same place twice. Selected rows are
keyed by position, because the API lets a trip hold the same place twice and a saved trip can arrive
holding it; two rows sharing a key would remove as one. Position-keyed rows swap content under a
focused drag handle, so `useDragSort` moves focus to the destination handle (`data-drag-handle`) a
frame after a keyboard reorder; for id-keyed lists that is a no-op.

## An unmatched query is addable as text, and that is an outage hatch as much as a long tail

Enter on an unanswered query adds the place as name-only text: the geocode proxy answers `[]` when
over the provider's one-request-a-second limit, so a throttled minute would otherwise accept
nothing.

`CreatableCombobox` tells a search that resolved empty (`searchedQuery` set, `commitAction` creates)
from one that rejected (`searchErrorLabel`); creating from an unanswered query needs
`createWithoutSearch`, which `keepOpenOnSelect` enables since an append-only field has no value a
blip could clear. That flag also makes `onCreate` fire from Enter only, never on blur or from
`handleInputChange`, without waiting for an in-flight search, which blur cancels.

Empty-menu text runs `minSearchLength`, search failed, `searchPending` ("Searching…"), then "No
places found — press Enter to add as text".

`min-w-0` goes on the row text and on the `<form>`, the `DialogContent` grid item
(`min-width: auto`). The 20-location and 255-character ceilings apply as the list is built: a schema
error at `locations.0.name` makes `errors.locations` an array and `FormMessage` renders "undefined".

## The picker types more slowly than the rest of the app, on purpose

`searchDelayMs` takes an optional override and `CreatableCombobox` a `searchDebounceMs` prop so the
trip picker waits 450 ms where every other remote combobox waits 250. Our list endpoints tolerate
four requests a second; Nominatim sits behind a proxy enforcing one request a second across the
instance and answers `[]` rather than queueing, so a fast debounce turns keystrokes into empty
menus. The empty query fired on menu-open skips the debounce, there being no keystroke to coalesce.

`searchPlaces` answers `[]` locally for a query outside the endpoint's `2..200` instead of calling
the API: either end is a 422, which arrives as a rejection, while a local `[]` keeps
Enter-to-add-as-text working.

The create branch runs `setInputValue(keepOpenOnSelect ? "" : created.name)`: a multi-select's input
is a filter that belongs empty, and the awaited `onCreate` resolving after the menu closed would
otherwise write the stale name back.

## Coordinates that were picked, not typed, are numbers

`lib/validations/dive-site.ts` validates coordinates as strings against a regex because a diver
typing a latitude passes through "-" and "-17." on the way to "-17.9". A trip location's coordinates
arrive whole inside an object picked from a menu, or are absent for a typed-in place; there is no
half-entered state. So `tripLocationSchema` uses plain `z.number()` with the API's bounds, catching
a nonsense object before the round trip. It carries no `z.preprocess` or `.transform`, which keeps
`z.input<>` inference working and `TripLocationFormValue` usable as the form's own type.

## The confirmation map is not `MapPicker`, and that is most of why it is short

Both maps draw through MapLibre and share `components/map/map-canvas.tsx` and `lib/basemap.ts`; they
stay two components because nearly everything in `MapPicker` serves write-back, telling a position
the map emitted from one typed into the coordinate fields, plus the gestures that place a pin.
`LocationsMap` emits nothing: give it locations, it draws them.

Pins are `bg-coral`, not `bg-primary`: primary is near-black in light and mid-grey in dark,
invisible on Dark Matter tiles, and coral is the one accent constant across themes.

The attribution overlay sits outside the `role="img"` surface, so the frame is two nested elements:
a link inside an image role drops out of the accessibility tree.

The surface is measured through a callback ref rather than a mount-only effect, because the map
renders `null` until something has a position; tying the `ResizeObserver` to the element appearing
lets callers skip gating on having something to draw.

## The read-only map lives in `components/map/`, not in `components/trips/`

A dive site is not a trip location, so the shared picture lives in
`components/map/locations-map.tsx` rather than being imported across feature folders.

`subject`, the aria-label's fallback, is read only when the places have no usable names; names are
joined by `formatTripLocationNames`. It is required despite an obvious default because the reading
path has no visual tell: an omitted value gives a wrong label on a screen-reader-only path no
screenshot exercises, so omission is a type error.

The frame's height is not a prop; it lives in the component, duplicated once in the `next/dynamic`
skeleton beside it, so a caller cannot make the page jump when the chunk lands.

The site page gates the map on the same `formatCoordinates` result the Coordinates line uses,
keeping a site with no position from fetching the chunk; a half-set position, which only raw SQL
produces, draws nothing and shows no coordinates.

## `fitBounds` unwraps longitudes before it unions them

MapLibre does the camera arithmetic; `unionBounds` in `lib/basemap.ts` supplies the box, and unwraps
each location's box against the first before the union. A trip to Fiji and Samoa spans about six
degrees across the antimeridian; unioning raw coordinates describes the 354 degrees the other way
round, which fits at exactly one zoom, the whole world with both pins at opposite edges. Each box's
width is taken as a signed span first, so an east edge folding behind its west stays one interval
rather than a negative one, while a zero-width point stays a point.

The fit is capped at `MAX_FIT_ZOOM` (9, counted against MapLibre's 512 px tile) rather than
`MAX_ZOOM`: a single location fits at any zoom, and a trip location is a town, an island or a sea,
so it should open where the coast is recognisable rather than in a grid of house numbers.

## A dive site's map opens further out than the picker that placed its pin

`MapPicker` opens at `PLACED_ZOOM` (11, `components/sites/map-picker.tsx`) for a site with a
position; the site page's map fits to `MAX_FIT_ZOOM` (9, `lib/basemap.ts`), the same cap a trip
location gets. Matching the picker is wrong for one reason: the picker can be zoomed out and a
static map cannot. In the sidebar's ~300px column an offshore site (Chumphon Pinnacle off Koh Tao,
Kimud Shoal off Cebu) renders at the deeper zoom as a featureless grey square with a coral dot,
about 11 km across with no land or labels; two levels out shows the island and named towns. A shore
site reads well at either, and roughly half of dive sites are offshore.

The cap is MapLibre's `maxZoom` on the fit, single rather than per caller: a per-caller argument had
one value, one explicit caller, and a second plausible number sitting in `MapPicker` inviting
someone to pass it.

## Locations are always sent on edit, never omitted

The API's PATCH treats an omitted `locations` key as "leave them alone" and any list as a wholesale
replace. `TripDialog` always sends the list: the form shows the whole set every time it opens, and
omitting the key when nothing changed would make "remove them all" inexpressible. The same rule
covers every list field the app edits (a dive's sites, gear and cylinders, a gear set's members)
because each form knows the whole set; see "The edit form submits the whole dive, because the read
is the whole dive".

The map beneath the picker is driven by `useWatch`, not `form.watch()`, which re-renders the whole
dialog on every keystroke in the notes. The map is a `next/dynamic` import with `ssr: false`, since
it measures its element and reads the theme; the wrapper lives in its own file so the skeleton's
height cannot drift from the map's.

## A "+N" is a promise that hovering will say what N was

`Moalboal, Bohol +2` compacts a list the payload already holds, so both surfaces carry the full list
as a `title`.

The hint sits on the whole label, not the "+N": a two-character badge is a small hover target and
splits the answer in two.

A hint that repeats the label is worse than none, so `formatTripLocationNamesHint` sits beside
`formatTripLocationNames`, answers `undefined` when nothing is hidden, and decides that under the
same blank-dropping rule: `["Moalboal", " ", "Bohol"]` under `max: 2` shows no "+N" and gets no
tooltip. `TripLocationsLabel` owns the limit and calls both, as `DiveSitesLabel` does for dives; the
trips table and the dashboard card pass locations and a fallback only.

`title` answers a mouse and nobody else: no hover on touch, unreachable by keyboard on a `<span>`.
The alternative is a `Popover` trigger nested in a link; hover-only stands until the app has a
tooltip primitive.

## `DialogFooter` is one row at every width, and its gap is `gap-2` not `space-x-2`

shadcn's footer is `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2`, a column with no
spacing below `sm:`, so on a phone Cancel and the action sit flush. Every dialog ends in Cancel plus
one action; the widest pair (`Cancel` beside `Create Certification` with its `Plus` icon) needs
about 326px against a content box of viewport minus 50px (`p-6` plus borders), so it fits on one row
at 360 and wraps only at 320. The column spent a second row on something that never needed one.

`gap-2` rather than `space-x-2` because the gap has to survive a wrap: `space-x` is a sibling margin
that knows nothing about line breaks, so a footer that did wrap (320px, a longer label, a larger
text size) would lose its spacing. `flex-wrap-reverse` keeps the buttons on one line when they fit
and puts the action above Cancel when they cannot, with 8px between rows.

## The dive's duration and depths card has no title

The dive page's duration and depth card has no header. Each figure is already labelled `Duration`,
`Maximum Depth`, `Average Depth`, so a `Duration & Depth` title restated the labels beneath it in a
heavier weight, and a `Timer` icon named a dive property rather than a page section. The card is
three stat blocks, first after the header, legible unlabelled.

`CardContent` takes an explicit `pt-6`: its default `p-6 pt-0` assumes a `CardHeader` supplied the
top padding. The dashboard's stats-error card (`app/dashboard/page.tsx`) restores it the same way;
two headerless call sites do not earn a `headerless` variant in `ui/card.tsx`, which would have to
guess whether the next one wants the same padding.

## Pages hold their shape while they load, instead of collapsing into a spinner

Every page is a client component that fetches on mount, and client-side navigation is instant, so a
route that early-returns a centred `Loader2` produces content, then an empty column with a small
mark, then content: two layout changes and a flash on every link. Placeholders shaped like the thing
they replace give one layout instead of three. `Skeleton` (`components/ui/skeleton.tsx`) is the
primitive; `CardSkeleton` and `ListRowsSkeleton` sit beside it, `TableRowsSkeleton` goes inside a
real `<TableBody>`, and `DetailPageSkeleton`/`FormPageSkeleton` (`components/ui/page-skeleton.tsx`)
assemble page shells from them. The page-level ones build on the real `Card` and `PageHeader`
primitives rather than re-describing their padding, which is what guarantees the header the same
height before and after the record lands.

Left out: a GitHub-style top progress bar, a signal rather than a fix while pages blank, and a
stale-while-revalidate layer under `useInfiniteResource`, which would show previous rows
immediately. Both come after the layout stops moving.

## The 150ms delay is what keeps a skeleton from being worse than a spinner

A content-shaped placeholder that appears instantly trades a layout jump for a grey flash: against a
local API most loads finish under 100ms. `animate-skeleton` (`tailwind.config.mts`) is two
animations, a `skeleton-in` fade held at `opacity: 0` for 150ms by `both`, then `skeleton-pulse`
from 350ms.

The delay is on the opacity, not on whether the skeleton renders: it takes its full space from the
first frame while invisible, so a fast response swaps straight to the new page and a slow one has
already reserved its layout.

The chrome needs the delay too. `Skeleton` is only the grey bar; the `Card`s and `TableRow`s around
it are real and would paint a grid of empty ruled boxes instantly, so `animate-skeleton-reveal`, the
fade without the pulse, goes on those containers.

`motion-reduce:animate-none` drops both, leaving the skeleton visible from the start: no delay beats
a delay you cannot see coming.

## Loading skeletons: What renders for real, and what doesn't

`DetailPageSkeleton` draws the real back button rather than a bar: where it goes is known before the
record is, and it is the one control someone wants during the wait. List pages keep their
`<TableHeader>` and column labels and put skeleton rows in the body, so the table has its real width
from the first frame.

Each list page's branch reads `!isLoading && empty ? placeholder : table`, with `items.length === 0`
inside `<TableBody>` choosing skeleton rows, so "loading" and "loaded" differ by the contents of one
element rather than by which subtree exists.

`TableRowsSkeleton`'s bar widths cycle by `(row + column)` rather than being random, which would
trip hydration. Its row count is `itemsPerPage`, known before the first response, so a full page
does not grow when the rows land; it overshoots only on a short last page, and the first load is
page 1.

## Holding the shape means the header cannot claim a count it doesn't have

`totalCount` is 0 until the first response, and the list cards' title badges read straight off it;
over ten placeholder rows a badge saying "0 total dives" states something false. `CountBadge`
(`components/ui/count-badge.tsx`) shows a placeholder instead, keyed on `isLoading && count === 0`
rather than `isLoading` alone, so paging through a loaded list keeps the total it knows.

The pagination footer is the same class of problem, left unsolved: it renders nothing while
`totalCount <= itemsPerPage`, so it adds ~52px when the data lands. Reserving that space would be a
guess (a list of exactly ten items never paginates) and guessing wrong shifts the layout the other
way.

## The dashboard's chart cards, and the enter animation

A `720 x 240` SVG at `w-full h-auto` collapsing to a spinner moves most of the page's height twice.
`ChartSkeleton` reserves the same `3:1` box plus, behind a `legend` prop, the 24px the gas chart's
`text-xs` legend occupies and the activity chart lacks.

`app/template.tsx` is a 150ms fade with no travel; a `fade-in slide-in-from-bottom-1` over 300ms
spent its animation sliding a `Loader2` and then cut hard to the content.

The root template is keyed at the first path segment, so the fade runs on `/dives` to `/dashboard`
and not on `/dives` to `/dives/[id]` or a pager step. Widening it is deliberately not done: a client
wrapper keyed on `usePathname()`, or a `dives/template.tsx`, remounts the subtree on a pager step,
blanking the page and dropping keyboard focus (see "`dives/(detail)/layout.tsx` owns the dive fetch,
so a step keeps the page mounted").

## The placeholders are hidden from assistive tech, rows and all

`Skeleton` carries `aria-hidden`, but that hides only the bar: the `<tr>`/`<td>` and bordered row
`<div>`s around it stay in the accessibility tree, so a screen reader would be told `/dives` has
eleven rows, ten of them empty. `TableRowsSkeleton` hides each placeholder row and
`ListRowsSkeleton` its whole container, a busy wrapper around a hidden inner element, because
`aria-busy` says nothing to a reader already told to skip the subtree.
`page-skeleton.render.test.tsx` asserts that `getAllByRole("row")` finds none of them.

## Loading skeletons: Measured, not eyeballed

Placeholder heights come from `getBoundingClientRect()` on the real page with the API held back by a
patched `XMLHttpRequest.prototype.send`, comparing loading and loaded geometry of the same element;
a screenshot does not show a `h-5` bar against a 24px line box or a legend nobody accounted for.

`ListRowsSkeleton`'s bars are `h-5`/`h-4` against the real row's `text-base` over `text-sm`, and its
count comes from the card's own `RECENT_DIVES_COUNT`/`RECENT_TRIPS_COUNT` rather than a default, so
the dashboard cards measure the same in both states.

One shift is accepted: the dashboard moves ~134px when a gear-service reminder is due, which is not
a placeholder problem, since whether that card exists is one of the things the request answers.

## The project instructions live in AGENTS.md, and CLAUDE.md is an import

`CLAUDE.md` holds a `@AGENTS.md` import and the few lines genuinely about Claude Code; the
instructions live in `AGENTS.md`, the cross-tool convention; Claude Code reads it only via the
import.

The forcing reason: `next dev` writes to these files. Next 16 ships
`node_modules/next/dist/server/lib/generate-agent-files.js`, called from `start-server.js` on every
dev-server start, gated on `agentRules !== false` in `next.config.js` and on `@vercel/detect-agent`
finding an agent env var such as `CLAUDECODE`. It upserts a block delimited by
`<!-- BEGIN:nextjs-agent-rules -->`, preferring `AGENTS.md` and falling back to `CLAUDE.md`.
Deleting the block only restores the precondition for the next start to add it back.
`agentRules: false` is rejected because the advice is real: `node_modules/next/dist/docs/` is the
shipped Next 16 documentation.

`CLAUDE.md` does not mention the parent checkout whose own `CLAUDE.md` loads alongside it: that
parent loads by ancestry regardless, and a standalone clone has none. The maintainer-facing reason
lives in the HTML comment at the top.

## The Prettier override is load-bearing

`.prettierrc.json` gives `AGENTS.md` `proseWrap: "preserve"`, against the `*.md` default of
`"always"` at 100 columns. Otherwise Prettier rewraps the managed block's long lines,
`hasCurrentAgentRules` compares the installed block against the expected text exactly, the
comparison fails, and the next dev-server start rewrites it unwrapped: `npm run format` and
`next dev` undo each other, and `format:check` fails after a dev server on a file nobody touched.
`preserve` keeps the file in the formatter for everything else and costs only hand-wrapping the
prose, noted at the top of `AGENTS.md`.

## A recorded fix is a location with a different marker, not a second map

The dive page draws three positions, each site's pin, the entry fix and the exit fix, and only the
first is a place somebody chose. A second component, or a `sites`/`fixes` pair of props, is the
wrong shape: everything about drawing them is identical and only the marker differs. So
`MappableLocation` carries one optional field, `variant?: "pin" | "fix"`, defaulting to the pin
every caller already draws, and the map stays ignorant of dives. A domain-shaped
`kind: "site" | "gps"` is rejected for the same reason `subject` is a string.

The fix inverts the pin's two colours rather than its size, shape or hue: same coral, same 12px,
`border-coral` with a `bg-background/80` centre against the pin's `border-background` over
`bg-coral`. One accent reads as one legend, and the tinted centre keeps the ring legible over a
coastline on Positron and Dark Matter.

## The drift between entry and exit is a line of text, not a line on the map

A segment between the two fixes cannot work: the map is capped at `MAX_FIT_ZOOM` (9) for reasons
unrelated to dives (see "A dive site's map opens further out than the picker that placed its pin"),
and at that cap a pixel is about 100 m of ocean, so a surface swim is a sub-pixel line between
overlapping markers.

`lib/geo-distance.ts` answers in text: `haversineMeters` between the pairs, `formatDistance` to
whole metres below a kilometre and one decimal above. Haversine needs no antimeridian special case;
179.9999°E to 179.9999°W is 22 m. Whole metres because a consumer GPS fix is good to about five, and
rounding happens before the unit is chosen, so 999.6 m renders "1.0 km" rather than "1000 m". Metres
is the only unit; the app has no unit preference to consult.

## The dive's location card renders on GPS alone

An imported file carries fixes whether or not the diver attached the dive to a site, so the card is
gated on `trip || dive.dive_sites.length > 0` or either coordinate pair, and the map inside it
separately on at least one position among sites and fixes: the two-level arrangement the site page
uses, where the inner gate keeps the `next/dynamic` chunk unfetched.

Both gates use `!= null` per coordinate, never truthiness: a dive off West Africa exits at longitude
0 and one in the Galápagos at latitude 0. `formatCoordinates` and the map's `placedLocations`
already guard this way; the pair is turned into a point once at the top of the component and read
from there.

The card is titled "Location" for every combination: a heading that changes between two dives reads
as two cards, and every block inside is labelled ("Trip", "Dive Site", "Entry", "Exit").

## The edit form submits the whole dive, because the read is the whole dive

`PATCH /dive` is a partial update, but the edit form sends everything it holds on every save;
`buildDiveUpdate` does not filter on `dirtyFields`. Trip, DiveSite, GearItem, GearSet and
GearServiceSchedule are hard-deleted, and the `ON DELETE` rules on every referencing FK do the
cleanup, so a read is the whole truth about the dive and echoing it back says exactly what the dive
holds.

"The diver cleared the trip" and "the client echoed a null it was handed" are the same PATCH on the
wire; the API cannot tell them apart. That argues not for filtering but for never letting a read
differ from the record, which is the API's rule: a read filter is not a local change.

`buildDiveUpdate` keeps one rule: `undefined` means "not sent", `null` means "the diver cleared it".
Collapsing them makes a trip impossible to remove.

## Seeding the edit form has to be faithful, and `mixtures` is where that bites

Sending the whole form is safe only if the form holds the dive. A dive with zero cylinders is a real
record (`DiveCreate.mixtures` is `default_factory=list`) and `patch_dive` replaces the list
wholesale on presence, so seeding `mixtures` with a synthetic `DEFAULT_MIXTURE` row writes an 11.1 L
cylinder of air to a dive whose only edit was the notes, and `compute_gas_use` derives an RMV from
it. The edit page seeds through an exported `diveToFormValues` beside `toDiveMixtureInput`, testable
at its seam, with no synthetic row.

The narrower fix, omitting `mixtures` in `buildDiveUpdate` when the dive had none and the field
holds one pristine `DEFAULT_MIXTURE`, is wrong: `DEFAULT_MIXTURE` is the `"11.1 L (AL80)"` preset,
and a value-equality guard makes exactly that cylinder unsavable. `MixtureFields` renders
`mixtures: []` with "No cylinders recorded for this dive." and its Trash button has no `index > 0`
gate, so zero is reachable by hand.

## `dirtyFields` is maintained only when it is read during render

`formState` is a Proxy. React Hook Form maintains a key only once something has read it during
render, and `useFieldArray`'s `replace` checks that flag before recomputing dirty state. Read inside
a submit handler, `dirtyFields` is still `{}` after a file import has replaced every cylinder, so a
filter keyed on it drops `mixtures` and a save that reports success discards the import. Scalars set
through `setValue(..., { shouldDirty: true })` are marked either way, which hides the gap. The
subscription is `useFormState({ control })` plus the destructuring, in the render body; calling the
hook alone is not it.

`useSuggestedDiveNumber`, `dives/new/page.tsx` and `dive-form-fields.tsx` read react-hook-form's own
`isDirty` for unrelated UX and are unaffected.

## A deleted trip or dive site can hand its dives to another one on the way out

The delete confirmation for a trip or dive site offers to move its dives first: same button, same
dialog, one dropdown always on screen. `DELETE /trip/{uuid}?move_dives_to={uuid}` re-points the
dives and deletes the trip in a single transaction, so either the log ends up on the replacement and
this trip is gone, or nothing happened — the browser has no ordering to get right and no half-done
state to report.

Rejected: moving client-side by paging `GET /dives?trip_uuid=`, sending one `PATCH` per dive, then
deleting. A failure partway leaves some dives moved and the trip standing, a liveaboard costs forty
round trips, and any dive added between the last page fetch and the delete is stranded.

## Delete with move: The dialog says what deleting does, and asks the API for no count

The dialog states that deleting removes this trip from every dive logged on it and touches no dive.
That is true at any count, zero included, because the API hides soft-deleted trips, dive sites and
gear from every dive read (`get_trip_uuids_by_ids` and `get_dive_sites_for_dive(s)` filter
`is_deleted`). So the dialog asks the API nothing before wording itself: no count request, no
loading or "couldn't check" state, no disabled Delete.

The picker is unconditional, and its empty state is the plain delete — no synthetic "None" row, the
shape `TripCombobox` uses for a dive with no trip. Rejected: a "Move N dives to another trip first"
checkbox revealing the picker, which needs `GET /dives?trip_uuid=X&items_per_page=1` for
`total_count`, a timeout race against `apiClient` setting no axios timeout, and a failure state.

A confirmation that must ask the API a question before it can word itself has the wrong wording.

## Delete with move: The toast names the destination, and the call site is where both halves are known

"Trip deleted successfully. Its dives moved to Cebu 2026." is assembled at the four `onConfirm` call
sites from the name the dialog hands back beside the uuid, and `useDeleteResource.confirmDelete`
takes an optional `successOverride` for it. The sentence carries no count, so nothing crosses the
round trip: the name is known synchronously at confirm time.

Rejected: a count in the sentence. The count would come from the delete response and the name from
the picker, so a hook would have to carry the name across in a map keyed by the id being deleted —
two rows can be deleted at once, and responses return in any order.

Both deletes are typed `{ message: string }` in `lib/api/client.ts`; nothing here reads a delete
response. `successMessage` on `useDeleteResource` is a plain string, not `(result, id) => string`,
and the hook has no generic over the response.

## The confirm button reports only its own delete

`isDeleting` is `deletingId === pendingId`, not `deletingId !== null`: the latter is true while any
row is being deleted, so opening the dialog for a second trip during the first's request shows it
disabled, spinner and all. The dialog is closed for its own delete anyway, since `confirmDelete`
clears `pendingId` before it starts.

`deletingId` in `useDeleteResource` stays a single value across all seven call sites: a second
delete overwrites it, so the first row's spinner stops and its trash button returns while its
request is still out. The cost is cosmetic and bounded — firing the same delete twice yields two
success toasts, both routes being idempotent. The fix, a `Set<string>` with an `isDeleting(id)`
helper across every caller, is wider than the symptom justifies.

## Delete with move: The picker, and what it deliberately does not do

It excludes the resource being deleted — the API answers that choice with a 422, so listing it
offers an error.

It is a bare `CreatableCombobox`, not `TripCombobox`/`DiveSiteMultiSelect`: those carry name-lookup
for a uuid handed in by a form, and this field only holds what the diver picked from its own menu.
No "Add new..." either — a brand-new empty trip is not what "move these somewhere" means, and the
create dialogs are one page away.

`ConfirmDialog`'s `children` slot keeps this one dialog rather than a second layered on top. Its
`confirmDisabled` is separate from `isLoading` because an unfinished choice must still be
cancellable.

Title and description live in the component's own `COPY` table beside the placeholders and search
functions, not as props: the wording is kind-specific and the pages have no say in it.
`confirmMessage` on `useDeleteResource` is optional, and these callers omit it.

## An empty picker is an answer; a half-typed one is not

`CreatableCombobox` has three states: empty, chosen, and text resolved to neither.
`handleInputChange` re-fills the selection only on an exact match, and the blur commit
(`commitAction`) resolves a prefix to `{ type: "clear" }`, so Delete over "Ceb" would silently drop
the move.

Delete is blocked there, with a line saying so, not guessed: a prefix can match several trips. An
empty field stays a valid answer. It arrives through one optional prop, `onTextChange`, from an
effect on `inputValue` — `value` cannot tell mid-word from chose-nothing, and the dialog's debounced
(250 ms) `onSearch` wrapper loses to a fast click.

Disabling alone is no guard: `disabled:pointer-events-none` on `Button` lets the press reach
`DialogFooter`, whose default action blurs the picker, re-enabling the button before `click`
dispatches. `DialogFooter` in `ConfirmDialog` carries
`onMouseDown={(event) => event.preventDefault()}`, as `CreatableCombobox` does on its menu rows.
jsdom performs no default focus change; `confirm-dialog.render.test.tsx` pins only the
`preventDefault` call.

## The confirmation focuses Cancel, because its `children` may open a menu

Radix focuses the first tabbable descendant of `DialogContent` on open. With a field in
`ConfirmDialog`'s `children` slot that field is first, `CreatableCombobox` opens its menu `onFocus`,
and the menu is `absolute z-50` — it paints over the footer rather than pushing it down, so the trip
list covers Cancel and Delete, a click aimed at Delete picks a destination the diver never chose,
and every confirmation fires a `getTrips`/`getDiveSites` search, plain deletes included.

`onOpenAutoFocus` calls `preventDefault` and focuses `cancelRef.current` explicitly. Cancel is the
right target on its own terms: Enter should not be the destructive key. A slot component inherits
the focus behaviour of whatever it is given, so `ConfirmDialog` names its own focus target.

## `excludeIds` hides a row; it does not make the item unpickable

`CreatableCombobox` applies `excludeIds` in `visibleItems`, the rendered menu, while the exact-match
paths — `findExactMatch` on every keystroke, `commitAction` on commit — read the unfiltered result
list. So a hidden item is pickable by name: typing "Blue Hole" while deleting one of two dive sites
called "Blue Hole" resolves to the one being deleted and sends `move_dives_to` equal to the uuid in
the path, which the API answers with "A dive site cannot be moved onto itself."

The delete dialog filters the target in its own `search` wrapper, so it never enters the result
list, the exact-match lookup or the seen-options map, and passes no `excludeIds`. The component's
exact-match paths are not taught `excludeIds`: its only other consumers are append-only
multi-selects whose `keepOpenOnSelect` branch never reaches the blur commit. The test
`will not resolve a typed name to the target itself` catches a second single-select that passes
`excludeIds`.

## Delete with move: Per-target state resets during render, not in an effect

The chosen replacement belongs to the trip it was picked for and must be gone when the dialog opens
on another, or confirming would send the old destination for the new trip's dives. An effect paints
one frame of the previous answer first; a `useLayoutEffect` avoids the frame but trips
`react-hooks/set-state-in-effect`, an error here. The dialog compares the target against the one the
last render was for and resets during render — React's own
[adjusting state when a prop changes](https://react.dev/learn/you-might-not-need-an-effect) — and
React re-runs the component before anything reaches the screen.

The map of options the picker has seen is a ref, and touching a ref during render is its own lint
error, so it is never cleared. That is safe: an entry is only read for an id the current menu just
offered, and the search that offered it already wrote a fresh entry under that id.

## A gear set's members are sent on every save, like a trip's locations

`PATCH /gear-set` treats an absent `gear_item_uuids` as "leave the members alone" and any present
one, `[]` included, as a wholesale replace (`replace_gear_items_for_set`). `GearSetDialog` sends the
key on all three flows — edit, create, and saving a dive's gear over an existing set — and
`gear-set-dialog.render.test.tsx` asserts what each sends.

Echoing the picker back is safe because a set read carries every member: gear items are hard-deleted
and `gear_set_item.gear_item_id` is `ON DELETE CASCADE`, so a rename can destroy no hidden row.
`TripDialog` sends locations on the same rule ("Locations are always sent on edit, never omitted"):
the form knows the whole set, and `[]` means the diver emptied the picker.

Rejected: omitting `gear_item_uuids` unless `dirtyFields` marks the picker touched. `dirtyFields`
answers for one flow only; the two seeded via `reset` (`initialItemUuids`, the set's own read) would
become renames. The absent-key path `get_gear_items_for_set` documents is exercised by no client.

## The create form proposes no cylinder, and the last one is removable

`dives/new/page.tsx` seeds no mixture in `defaultValues` or in `prefillFromLastDive`'s fallback, the
remove button in `mixture-fields.tsx` has no `index > 0` gate, and `onSubmit` sends
`normalizeMixtures(data.mixtures ?? [])`, so an untouched gas card reaches `POST /dive` as
`mixtures: []` — which `DiveCreate.mixtures` (`default_factory=list`) and `dive-mixtures-card.tsx`
expect.

Gas alone goes unproposed: `diveModWarning` computes a MOD from whatever cylinders the form holds,
so a seeded cylinder of air raises an oxygen-exposure warning past ~56.7 m about gas the diver never
entered.

`DEFAULT_MIXTURE` stays for "Add Mixture" and the placeholders; `prefillFromLastDive` copies the
previous dive's cylinders and invents none. The ungated remove button also lets the edit form clear
a dive's cylinders (`DiveUpdate.mixtures` accepts `[]`) and carries an `aria-label` naming its tank.

`app/dives/new/page.render.test.tsx` stubs the API and asserts what `createDive` receives: `[]`
untouched, `[]` after add-then-remove, the cylinder when one is entered.

## A dive-level select carries the same three states, and the two submit paths disagree about the third

`water_type`, a dive-level `<select>`, carries the `""`/`null`/`undefined` tri-state the cylinder
`role` field has — see "The 'cleared field resets to default' React Hook Form quirk" and "The API
sends `null`, the form schema only understood `""`". `""` is the live cleared state and what
`diveToFormValues` seeds from `null` — never `undefined`, or react-hook-form re-displays the
default. `undefined` means untouched and is dropped from a PATCH; `null` means cleared and is sent.

`buildDiveUpdate` converts `""` to an explicit `null`: an edit may already hold a value, and
dropping the key would keep it while the toast says otherwise. The create page omits it instead, as
with `trip_uuid`. Neither sends `""`, which `WaterType` (`StrEnum`) and `DiveCreate`
(`extra="forbid"`) reject with a 422.

Altitude is `min="-450" max="6500"`, mirroring `ck_dive_altitude_range`, not Visibility's `min="0"`
(the Dead Sea). Both prefill from the last dive like weight; `bottom_temperature` does not, being a
reading of the day.

## A start pressure of 0 is not a low reading, it is a missing one

`diveMixtureSchema` rejects a non-positive `start_pressure` and accepts an `end_pressure` of 0: a
dive cannot start on an empty cylinder, only end on one. Domains: `start_pressure ∈ (0, 350]`,
`end_pressure ∈ [0, start_pressure]`, plus blank. The message says blank means unknown, which a
diver will not guess.

`max(350)` mirrors the API's `gt=0, le=350` and `ck_dive_mixture_*_range` and, like `po2_limit`'s
band, catches unit errors — psi in a bar box, millibar, a summed sidemount pair. It sits on both
fields: the `end <= start` refinement returns early when start is blank.

`toDiveMixtureInput`'s `??` stays: coercing a stored 0 to `""` would hide the data the bound forbids
rather than show a message, and the API's read schema stays unbounded so the fallback is a form
error, not a 500.

Tests assert the message string; `dive.render.test.tsx` has a second harness rendering the real
`MixtureFields` so a rejected value reaches its `<FormMessage />`.

## Units convert at the edges: metric state, one formatter module

Everything stored or sent is metric. The `units` preference changes display and entry only, in
`lib/units.ts` (`formatDepth`, `unitWord`) and `UnitNumberInput`. `useUnits` reads `useAuth`,
defaulting to metric; render tests mock `@/contexts/AuthContext`.

`UnitNumberInput` renders feet and commits metres, so form state, `lib/dive-mixtures.ts`
(`METERS_PER_BAR = 10`) and `lib/validations/dive.ts` stay unit-blind; display-unit state would need
per-system Zod factories. `toCommittedMetric` inverts before rounding to 2 dp, so whole imperial
values round-trip (`units.test.ts`). `visibility` and `altitude` are `Integer`, so 50 ft reads back
49 ft. A typing draft defers correction to blur. `displayBound` converts metric `min`/`max` inward
(minimum up, maximum down); bound messages name both systems, computed from `PSI_PER_BAR`.

Charts divide by `PROFILE_CHANNELS[*].scale` (`toChannelSeries`/`toPressureSeries`) before
converting; depth and deco ceiling share one `CHANNEL_DIMENSION`. Not converted: `po2_limit`,
`surface_pressure_bar`, percentages, coordinates, duration, and tank volume (no rated-pressure
column), relabelled only; see "Cylinder presets are named AL/HP/LP, and every one of them is offered
in both systems".

## The trip form's map is always on screen, and its fields run name, dates, place, notes

`TripDialog` renders `LocationsMap` unconditionally; `showWhenEmpty`, an opt-in prop, draws the
whole world until the first place is picked. A frame appearing with the first place shoves the lower
fields down mid-edit, and an empty map says the field above wants a place, not free text — as
`DiveSiteMapField` does with `MapPicker`.

`showWhenEmpty` stays opt-in: the trips list, a trip's page and a dive's sidebar answer "where is
this?", where an empty world is worse than no map, and gating keeps the chunk unfetched. The empty
frame's aria-label is `Map of the world, awaiting ${subject}`, each `subject` being a definite noun
phrase.

The empty view is `WORLD_CENTER` at `MIN_ZOOM` (0) from `lib/basemap.ts`, read by both maps.

Field order: name, dates, place and map, notes — dates are known without thinking, the place's
search answers with the map, and the growing block sits last-but-one. `/privacy` names both forms.

## A location's full label is trimmed of the name it sits beside, at render time

Nominatim's `display_name` opens with the name it matched, and surfaces show the name first.
`formatLocationContext` in `lib/trip-locations.ts` drops the leading parts of the label the name
repeats, returning `undefined` when nothing is left so callers drop the element with `&&`.

It aligns whole comma-separated parts, never substrings: "Dahab" is a duplicate in "Dahab, South
Sinai" and context in "Blue Hole, Dahab, South Sinai", and whole parts stop "Ko Tao" eating "Ko Tao
Island".

It runs at render, not in `geocodeResultToLocation`: `display_name` is stored on the location rows,
so saved trips would stay untrimmed, and `locationKey` derives identity from position plus label, so
an old place re-picked would duplicate. The row's `title` keeps "name, context": an ellipsis hides
exactly what tells two places apart. The stored label is the short form; see "The label a trip
location keeps is the API's short form, chosen on the way in".

## The label a trip location keeps is the API's short form, chosen on the way in

`geocodeResultToLocation` stores `GeocodeResult.location` — the API's `_short_location`, place plus
country from the provider's structured address — as `trip_location.display_name`, not Nominatim's
`display_name`; a dive log records "Dahab, Egypt", as the dive site form does
(`dive_site.location`).

It is received, not derived: the flat string cannot say whether the name is the settlement ("Dahab"
→ "Dahab, Egypt") or sits inside one ("Blue Hole" → "Blue Hole, Dahab, Egypt"); the structured
address can.

Costs: old rows keep the provider's label until re-picked. `locationKey` (`geo:{lat}:{lon}:{label}`)
lets one old row duplicate on re-pick. A trip stops matching its region in search:
`_search_conditions` in `trips.py` ORs the term against `TripLocation.display_name`, and
`_short_location` composes place or region, never both; `test_the_display_name_matches_too`
hand-writes its fixture and misses this. Neither repair (a second stored field, a geocoder-backed
search) is worth it.

Menu hints show it too; `ComboboxItem` has only `id`, `name`, `hint`. `placeKey` in
`place-search.tsx` keys on the provider's label.

## The geocoder's attribution is a wire format, not display copy

`GeocodeResult.attribution` carries its licence link in the one markdown shape `parseAttribution`
reads, `[label](href)` — the shape `DEFAULT_TILE_ATTRIBUTION` uses — and the client parses it under
the place picker and the dive site map. The OSMF guidelines ask that the origin and licence be
reachable, "for example by making the text a clickable link", and a linked label fits the 325px a
375px phone leaves the dialog, where a bare URL wraps.

The client is safe in either merge order: `parseAttribution` on a string without markdown returns a
single text run, so an API serving the bare string renders as before.

`Attribution` (`components/attribution.tsx`) renders the parts for all four credits — two map
corners, two lines of fine print — as inline elements with no styling. It is the enforcement point
for `react/no-danger`: the value comes from an environment variable or whatever `GEOCODER_URL`
answers.

## The place-search credit holds its line open, and does not chase the dropdown

The open menu (`absolute z-50`, `max-h-60`) covers the picker's credit until a place is added. That
is no licence problem: the OSMF guidelines oblige the application, not each result. A sticky footer
inside `CreatableCombobox` is rejected — `scrollIntoView({ block: "nearest" })` would park the last
option under an overlay it cannot see, an anchor would sit inside `role="listbox"`, a link would
race the closing blur, and six other consumers gain a prop for one.

The credit must not materialise: it would shove the map and Notes down the dialog mid-edit. Its line
is held open with `min-h-4`, costing a blank 16px when a saved trip opens without a search. It
matches the tile credit's size and has no `Place search:` label, which only made it wrap. The two
credits stay separate: tiles come from `NEXT_PUBLIC_MAP_TILE_URL`/`_ATTRIBUTION`, place names from
the API's `GEOCODER_URL`, and a self-hoster may run two providers.

## Three roads to a position, so the geocoding lives in a hook above the map

A position arrives three ways — pin, place search, pasted latitude/longitude pair — and only
`DiveSiteDialog` sees all three, so the reverse geocode and its guards live in
`hooks/useGeocodedLocation.ts`; `DiveSiteMapField` renders search, map and credit.

The guards — newest request wins, the reply checked against the fields as they stand on arrival,
`unknown` never clearing a field while `nameless` does, a nameless answer silent with nothing to
clear — are reasoned in "The map writes into the coordinate fields".

Pasting a pair places the site and triggers the lookup; typing digits does not: `useWatch` fires per
keystroke into a one-request-a-second rate limit.

The dialog stays mounted, so the hook takes `open` and resets on it in an effect carrying the
`react-hooks/set-state-in-effect` disable `useDialogApiError` uses (synchronising to an external
prop is the rule's escape hatch), bumping the request counter so a reply in flight is discarded.

## The dive site form searches for a place too, above an `h-40 sm:h-48` map

`PlaceSearch` is the trip picker's field without list, reordering, creation or value, handing back
one pick to fill coordinates, Location and, for a catalog site, Name (see "The site search has two
sources, and only one of them names the dive site").

The geocoder knows the bay, not the entry, so search sits above map. The box empties after a pick,
naming a place the pin has left being untrue, and creates nothing.

Holding no value, it needs `keepOpenOnSelect`: a single-select's `handleInputChange` and `commit()`
pick an exactly-typed name on keystroke and blur, and Save is a blur, so an unclicked "Ko Tao" would
file a site nobody chose.

Searched places are not rounded; only `MapPicker`'s `emit` rounds, for its own echo.

Its credit is its own, held open with `min-h-4`. The map is `h-40 sm:h-48` like `LocationsMap`, and
the `dive-site-map-field.tsx` skeleton matches. `/privacy` §4.5 covers both forms.

## The species picker resolves a pick into a catalog row before form state sees it

Search returns catalog rows (`uuid`) and upstream-only rows (`aphia_id`); only the former attach.
`SpeciesMultiSelect` calls `POST /species/resolve` at pick time; a synthetic `aphia:` value resolved
on submit puts a non-uuid in `species_uuids` and ties saves to upstream. Pending picks are local
rows (`aphia:` id in `excludeIds`); via `onPendingChange`, `DiveFormActions` disables submit as
"Adding species...", not `isSubmitting`. `appendUuid` reads an eagerly claimed ref, not `value`:
`keepOpenOnSelect` allows concurrent resolves. No free-text hatch: a global row has no owner.
Prefill (`app/dives/new/page.tsx`) skips species but lists them in `form.reset` as `[]`.
`speciesDisplayName` falls back from `common_name` to the binomial; `hintFor` shows `matched_name`
verbatim, any language. `"unknown"` is the API's rank sentinel from both `_wikidata_result` and
`_worms_taxon`; `speciesRankLabel` drops it and `speciesNameWithRank` (appending any rank but
"Species") keeps a live guard. Ranks vary by register; never key on one. The picker keeps the API's
order (`visibleItems`, no `sort`) and `hintFor`'s row-relative redundancy check.

## The Species Seen tile shows the derived `species_seen`, one of four figures in one `Card`

The API derives `species_seen` as the distinct species over a diver's live dives, recomputed on
every dive write, so the dashboard shows it. The four figures sit in one headerless `Card` as a
`grid-cols-2 lg:grid-cols-4` grid rather than four cards: a fourth card strands itself at
`md:grid-cols-3`, and four headers and borders on four numbers read together as one answer, the same
shape as the dive page's duration-and-depths block. A 2×2 below `lg` rather than a single column, so
four short figures do not run down the page. Icons sit in front of the label, since a right-aligned
icon in a quarter-width column floats away from its words; per-width measurements live in the
component's comment. The cell component is `Stat`, not `StatCard`, because it renders a cell and not
a card.

## What actually keeps a species search from leaving is the cache, not the catalog

`/privacy` §4.6 discloses the species picker's two providers. `search_species` runs `_local_search`
and `_remote_search` every time; a catalog hit changes what is offered (a `uuid` row), never whether
providers are asked. The shared cache stops a search leaving: `_cache_key("search", query)` is keyed
on the normalized query alone, so instance-wide, and a complete answer is held thirty days
(`_HIT_TTL_SECONDS`), a partial fan-out one hour, hence "a month", not "always". The shared catalog
stops a resolve leaving: `resolve_species` returns early on `_species_by_aphia_id`. Resolving
contacts both providers, `AphiaRecordByAphiaID` then `_wikidata_by_aphia_id`
(`haswbstatement:P850=<aphia_id>`, source of `wikidata_qid` and the common name), so the AphiaID
leaves only at pick time; `_wikidata_search` sends the typed query with a bare
`haswbstatement:P850`. Emptying `WORMS_API_URL`/`WIKIDATA_API_URL` is not the escape hatch §4.4
offers for tiles: search degrades to the catalog and resolving a new species fails. WoRMS is the
taxonomy, Wikidata the common names; the section mirrors §4.5's three points.

## Web config is read at runtime, and the browser is handed it

`NEXT_PUBLIC_*` literals are inlined at build, freezing the build machine's values.
`lib/runtime-config.ts` reads `SITE_URL`, `CONTACT_EMAIL`, `GOOGLE_CLIENT_ID` and the basemap
variables server-side; `contexts/ConfigContext.tsx` hands the browser its share. The `NEXT_PUBLIC_`
fallback is read as `env["NEXT_PUBLIC_" + name]`, never a literal (frozen to `undefined` at build);
unprefixed wins, blank means unset. Root metadata is `generateMetadata()`, not a `metadata`
constant; routes are dynamic anyway (`headers()`). `metadataBase` is `new URL(...)` per request, so
a malformed `SITE_URL` warns and falls back to `http://localhost:3000`, failing open like
`lib/api-base.ts` and `lib/basemap.ts`. `runtimeConfig()` reads lazily and memoizes; `src/proxy.ts`
memoizes its CSP sources so `basemapOrigins` warns once. `resolveBasemap()` applies defaults
(light-set-means-both) to configured values passed as data, refusing a style URL without
attribution. `useConfig()` has a real default, unlike `useAuth()`, for component tests. The basemap
lands in `connect-src`; `img-src` is `'self' data: blob:` plus this instance's API origin when
split-origin, no third party.

## The privacy page describes no usage analytics, because none exist

The Gravatar gate is gone with Gravatar itself; see "Avatars are this instance's own, and there is
no Gravatar fallback". What stands is the analytics half: the privacy page describes no usage
analytics, because none exist and the CSP forbids one structurally (`connect-src` names the API and
nothing else). Template claims like "Usage Data: pages visited, features used, time spent", "analyze
usage patterns" or an "Analytics Cookies" bullet do not belong there: a policy that overstates what
is collected is not the safe direction to be wrong, since it is the document a reader uses to decide
whether to trust the rest.

## HSTS is decided per request, and omits `preload`

`Strict-Transport-Security` is set per request in `src/proxy.ts`, not in `next.config.js`'s
build-time `headers()`, where the build machine decides a security header for someone else's domain.
Per-request buys the condition: the header goes out only over HTTPS, judged by the first entry of
`x-forwarded-proto` (the client-facing hop; proxies append) or else the request's own scheme. A LAN
instance on `http://192.168.1.4:3000` handed a two-year pin becomes unreachable once recorded.
`WEB_HSTS=off` leaves it to the proxy in front. `preload` is omitted: the browsers' list commits
every host under a domain for years, an operator's choice, not an application's. `includeSubDomains`
stays: scoped to the serving host, undone by letting max-age lapse. The header rides only responses
the matcher covers, documents rather than `_next/static`, enough since HSTS is recorded per host on
the first navigation. `next.config.js` keeps the headers identical for every deployment (`nosniff`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`): static fact versus instance decision.

## `WEB_NOINDEX` is two mechanisms, because `Disallow` is not `noindex`

With the flag set, `app/robots.ts` answers `Disallow: /` and `src/proxy.ts` adds
`X-Robots-Tag: noindex, nofollow` to every page. Doing only the first is the common mistake:
`robots.txt` asks a crawler not to fetch, which is no promise not to list. A URL learned elsewhere
can be indexed unfetched, and a page never fetched is one whose `noindex` is never seen, so the two
directives cover disjoint cases. `robots.ts` needs `export const dynamic = "force-dynamic"`: Next
prerenders a route handler that reads nothing request-scoped, which would resolve `WEB_NOINDEX` on
the build machine and freeze the answer into the image, the trap `lib/runtime-config.ts` exists to
avoid, arriving through a file convention. The default is allow: no `robots.txt` reads as no
restriction.

## `/healthz` is shallow on purpose

The container healthcheck in `Dockerfile` asks this route, which reports only that the process
serves HTTP. It checks neither Postgres nor Redis: the web container talks to neither, and a slow
database it never uses must not restart a container that renders fine; the API has its own readiness
probe. `force-dynamic`, because a handler with no request-time API is prerendered and served from
disk, and a health endpoint running none of the app's code is a strange thing to trust. The
`src/proxy.ts` matcher excludes it, like `api/`: a policy about scripts and styles says nothing
about two words of text, and it keeps a fresh nonce off a path hit every thirty seconds. The check
is a `node -e` one-liner in exec form: `node:24-alpine` ships neither `curl` nor `wget`, and with no
shell involved `process.env.PORT` is read by node at run time, so a moved port still works.

## The image builds once per architecture, and a `v*` tag is checked against `package.json`

`.github/workflows/publish-image.yml` publishes `ghcr.io/opendiving/opendiving-web` on a `v*` tag or
a rebuild dispatch; `:edge` is its own section. `linux/amd64` and `linux/arm64` build natively,
never under QEMU; a `merge` job builds the manifest list. `docker buildx imagetools create` sets
`X.Y.Z`, `X.Y`, `X` and `latest` in one call; the major alias starts at `1.0.0`. Every tag push must
be plain `vX.Y.Z` equal to `v` + `package.json`'s version, before any push; `^v[0-9]` would pass
`vnext` as a `sha-` image. The extra-tag input refuses `^v?[0-9]`, which overwrites real aliases.
The api repo's workflow is this policy twice (hand-assembled tags, not `docker/metadata-action`);
change both together, `publish-release` included. `pr-title.yml`'s labelling job sets one of
`breaking`/`feat`/`fix` for `.github/release.yml`, removes the others, and skips fork PRs (read-only
token). The release is published, not drafted: `opendiving/opendiving`'s coordinator tags both
components before itself, its release being the hand-finished one; going live before the product's
guard is the accepted cost.

## The install lives in the product repository, and this README points at it

An install is one compose file naming both `web` and `api`, so neither component repository can hold
it without the other carrying a copy. It lives in `opendiving/opendiving` with its docs, and this
README links there rather than paraphrasing: two copies diverge, and the wrong one is the one the
reader found first. `README.md`'s _Full self-hosting docs_ goes to `.../opendiving/tree/main/docs`;
`landing-page.tsx`'s `SELF_HOSTING_URL` and the contact page's _Self-hosting quickstart_ land on
`https://github.com/opendiving/opendiving` itself, which carries pitch and commands. What stays here
the bundle has no reason to know: building this image yourself, and `NEXT_PUBLIC_API_URL` as a build
arg for split-origin deployments. The README says where the project's instance is named (the front
door, `opendiving.app`) rather than copying the address; a URL in three repositories goes wrong in
two. `SECURITY.md`'s "that includes the instance this project runs itself" only closes the reading
that the project's own server is fair game.

## The landing page can only claim what the instance can back up

This page is the unauthenticated view of somebody's server, so a claim not checkable against this
repository or the running instance makes a liar of the self-hoster. The coloured band carries the
vendor-shutdown argument (Movescount, Deepblu, Diveboard) and three facts (licence, no trackers,
export formats) in full `text-primary-foreground`, never `/70`: 4.90:1 against 3.4:1 on `bg-primary`
in dark mode, the `--coral-solid` constraint. No store badges; prose says no mobile apps exist. The
hero sells the log, not the deployment: most visitors are divers, not self-hosters. `<h1>` "The
Ultimate Diving App" stays by the owner's call; `app/page.tsx`'s `title` changes with it or not at
all. Data ownership lives in the `#features` card "Yours To Keep", the band (as the export) and
`#self-hosting`. Nav is Features, Self-hosting and `Source`. The footer's "Open source diving
platform for the global diving community" states audience, not traction; leave it.

## `scroll-padding-top` on `html`, because the sticky header eats anchor targets

The `sticky top-0 z-50` header hides the top 69px of any anchor target. One declaration in
`globals.css`:

```css
:root {
  --header-height: calc(4.25rem + 1px);
}
html {
  scroll-padding-top: var(--header-height);
}
```

On the container, not `scroll-mt-*` per target, so every anchor and focus scroll is covered; `html`
is what scrolls. Exactly the header's height (`py-4` twice, `size="sm"` button at `h-9`, 1px
`border-b`), rem-based to track the root font size. Overshoot is the bad direction: a flat `5rem`
exposes 11px of what sits above the target, the `bg-primary` band over `#self-hosting`; undershoot
only hides padding. `#features` (`pb-20`, no `pt-`) adds `scroll-mt-20`, safe only because the hero
above shares `bg-background`; on `#self-hosting` it would expose the band, so a section borrows
offset only when the one above shares its background. `volume-combobox.tsx` and
`creatable-combobox.tsx` scroll their own `overflow-y-auto` listbox
(`scrollIntoView({ block: "nearest" })`), which `html` cannot reach and `*` would break.
`header.tsx`'s `calc(100dvh-4.5rem)` menu cap stays separate.

## `ci.yml` and `code-quality.yml` run on a read-only token, with nothing left in `.git/config`

Both declare `contents: read` at workflow level, as `publish-image.yml` and `pr-title.yml` do.
Without a `permissions:` block a run inherits the repository default, read-write on every scope
unless narrowed, and nothing here writes. `actions/checkout` also leaves `GITHUB_TOKEN` in
`.git/config` unless told not to, and every job runs third-party code there, `code-quality.yml`
sharpest with `npx --yes` fetching `depcheck`, `@next/bundle-analyzer`, `madge` and `@axe-core/cli`
unpinned. `persist-credentials: false` on every checkout costs nothing, no job using git afterwards;
`fetch-depth: 0` on `code-quality` is independent and stays. A writing step asks on its own job,
restating `contents: read` beside what it needs, since a job-level block replaces the workflow's;
`pr-title.yml` shows it, `permissions: {}` at the top and the labelling job asking for two scopes.
`dependency-review` writes nothing and runs on the workflow-level grant with no block. The api
repo's `linting.yml`, `tests.yml` and `type-checking.yml` carry the same two lines.

## `SECURITY.md` has two channels, and both of them exist

The primary channel is GitHub's private vulnerability reporting, `security/advisories/new`: private
by construction, thread and advisory together. A repository setting (Settings → Code security), not
a file. `security@opendiving.app` is the second channel and a real inbox. An address must pass "has
a maintainer created it and agreed to read it", not "does it look plausible" (so
`lib/runtime-config.ts` leaves `CONTACT_EMAIL` unset, and `conduct@opendiving.app` in
`CODE_OF_CONDUCT.md` is conduct only). The contact form's `security` category (`CONTACT_CATEGORIES`)
is no third channel on any instance, even the project's own: an unauthenticated public form posting
to whatever address the instance configured, without advisory-thread privacy. No supported-versions
table and no SLA: `publish-image.yml` aliases one tag and nothing is backported, so "the latest
release" is the whole answer, and no rota backs a 48-hour acknowledgement or 90-day clock. Reporters
are asked to nudge after a couple of weeks and name their own deadline.

## The CSP nonce is 16 random bytes, not a stringified UUID

`src/proxy.ts` builds the nonce as
`Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64")`, not
`Buffer.from(crypto.randomUUID()).toString("base64")`. Not a weakness fix: a v4 UUID carries 122
bits and is unguessable, but CSP Level 3 asks for 128, and "why 122?" is a question that does not
belong in this app's most security-critical file. It is also 24 base64 characters against 48, on a
header naming the nonce twice per response. `crypto.getRandomValues` and `Buffer` exist in either
runtime, and Proxy runs on Node regardless: Next 16 defaults it there and forbids the `runtime`
export in a proxy file
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Base64 padding
is legal in a nonce (`base64-value` ends in up to two `=`), which matters because 16 bytes always
yields `==`. `src/proxy.test.ts` reads the nonce with `/'nonce-([^']+)'/` and asserts two requests
differ; base64 contains no `'`.

## A pin is a promise to renew, and `.github/renovate.json5` is the renewer

`.github/renovate.json5` is the renewer. Renovate, not Dependabot, which cannot read `.nvmrc`, group
across ecosystems, or match `customManagers`. The regex `customManagers` entry covers the four
`npx --yes <tool>@<version>` pins in `code-quality.yml` (`depcheck`, `@next/bundle-analyzer`,
`madge`, `@axe-core/cli`), seen by no other manager.

`pinDigests: false` is load-bearing: the `Dockerfile` floats on `node:24-alpine` so a Publish Image
re-run at an old `v` tag collects patched Alpine packages, where a digest pin, or
`helpers:pinGitHubActionDigests`, rebuilds the vulnerable base and reports success. First-party
actions pin a major tag, third-party a SHA; Renovate renews both.

Node waits on `dependencyDashboardApproval` (`.nvmrc`, `engines.node`, `Dockerfile` grouped): the
`24.x` in `with:` strings in `ci.yml` and `code-quality.yml` is invisible to the `github-actions`
manager, so an automatic bump ships a runtime CI does not test, and odd majors are not LTS
(`engines.node`: `>=24 <25`).

`aquasecurity/trivy` (`setup-trivy`'s `version:` input, `currentValue: latest`) is disabled by name:
a number there freezes the scanner's advisory knowledge.

## The scan that matters runs on a schedule, and both jobs use Trivy, not `npm audit`

`.github/workflows/vulnerability-scan.yml`'s PR job asks whether a change is vulnerable; the
scheduled job asks whether what people already run is, and only that drives the rebuild
CONTRIBUTING.md documents.

Both use Trivy: `npm audit` cannot see the Alpine half of `node:24-alpine`, and one database serves
both jobs. `trivy fs` runs `HIGH,CRITICAL --ignore-unfixed` over production dependencies; an
unfixable finding leaves no move. `--scanners vuln` is explicit: a base-image CVE is already public,
notification rather than the disclosure `SECURITY.md` forbids.

Findings fail only the PR job; the scheduled one fails just when release tags exist and no alias
resolves. The scan set is the newest release plus `edge`, per `SECURITY.md`'s support policy. The
report is node where the api's is `python3`, the only deliberate divergence.

The PR job's `packages: read` and `docker login` authenticate Trivy's database pull from ghcr.io,
which rate-limits anonymous pulls. `declare -A TAGS_FOR=()` stays set under `set -euo pipefail`.

## The alert arrives where it can be acted on, and the scan replaces the whole set

The scheduled scan uploads SARIF through `upload-sarif`; an upload replaces its category's alert
set, so a cleared finding closes itself and a recurrence opens fresh. `sarif_file` takes a
directory, so every image's `.sarif` goes under `sarif/` and uploads once under the constant
category `published-images`: separate uploads overwrite each other, and a category per image holds
alerts open forever once an `X.Y.Z` alias leaves the scan set.

Each image is scanned twice: the first pass feeds the run summary, a second
`trivy image --ignore-unfixed` produces the SARIF, since `trivy convert` cannot filter on fix
availability. The markdown report stays because code scanning cannot say which of two remedies
applies; its footer builds absolute URLs from `github.server_url` and `github.repository`, since
page depth changes where a relative link lands. A third-party upload carries its own tool name and
category and does not collide with CodeQL default setup.

## `dependency-review` is a gate on the diff, and its licence list is derived, not edited

The action compares the PR's manifests against the base commit's and reports only what the change
introduces — not a second Trivy check. `fail-on-severity: moderate` is stricter than Trivy's HIGH
because a moderate advisory on a dependency being added now is cheap to decline.

The licence list is the union of every licence the installed tree ships: a changed dependency is
checked like an added one, so a narrower list goes red on an ordinary framework bump. Derive it
rather than editing it:

```bash
node -e 'const fs=require("fs"),p=require("path");const s=new Set();(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(!e.isDirectory())continue;const q=p.join(d,e.name);if(e.name.startsWith("@")){w(q);continue;}const j=p.join(q,"package.json");if(fs.existsSync(j)){const m=JSON.parse(fs.readFileSync(j,"utf8"));s.add(typeof m.license==="string"?m.license:(m.license||{}).type||"UNKNOWN");}const n=p.join(q,"node_modules");if(fs.existsSync(n))w(n);}})("node_modules");console.log([...s].sort().join("\n"));'
```

It is not a compatibility check — the project is AGPL-3.0 and everything listed flows into it; the
gate makes an unreviewed licence a red check, and widening the list records the review.

`actions/dependency-review-action` and `github/codeql-action/upload-sarif@v4` pin a major tag as
GitHub's own. The job declares no `name:`, so its check is the job id `dependency-review`, named
exactly in the `main` ruleset's required checks.

## The sign-in email carries a code as well as a link, and the code is keyed on the request, not the address

`POST /auth/email/request` answers with a `request_id`; `CheckEmailCard` verifies the six-digit code
against it. Link and code share one `authentication_request` row; whichever arrives first consumes
it. A link signs in the device that opens it; a code crosses devices.

The `request_id` is the security-relevant part: six digits are contained only by the row's
five-attempt cap, and keying on the address would let anyone who knows it burn those attempts,
denying sign-in to email-only accounts. An id only the requesting browser holds is unreachable.
`AuthForm` holds address and id as one `SentLink` value; a resend replaces both and `CheckEmailCard`
clears any half-typed code.

Sanitize before bounding: a `maxLength` truncates a pasted `481 052` before `onChange` sees it.
`handleVerify` refuses a short code, which would spend an attempt. Routing is by the `redirectTo`
prop through `sanitizeRedirectPath`, not `localStorage`: the code never leaves the tab, so any
stored destination stays behind.

## The code field is Radix's one-time-password field, not one text input

`CheckEmailCard` renders `@radix-ui/react-one-time-password-field` via
`components/ui/one-time-password-field.tsx`. `validationType="numeric"` sanitizes every input path;
`autoComplete="one-time-code"` sits only on the current tab stop (`data-1p-ignore`/`data-lpignore`
elsewhere) so managers offer it once.

The root is a `role="group"` labelled by `<span id="signin-code-label">`, so tests use
`getAllByRole("textbox", { name: /^Character \d of 6$/ })`; `getByLabelText` returns the untypeable
group div instead of throwing. No submit button: `autoSubmit` and Enter's `form.requestSubmit()`
both reach `handleVerify`, whose `isCodeComplete` check alone guards against a short submission.

Every failure, 429 included, empties the boxes and refocuses the first via `restartCodeEntry`:
auto-submit fires on every change to a full field, so correcting in place burns attempts. A mount
effect shares `focusFirstCodeBox`, because `CheckEmailCard` replaces `AuthForm`, dropping focus to
`<body>`. The hint renders unconditionally; the group's `aria-describedby` names it. In flight the
field is `readOnly`, since `disabled` drops focus out of the group. Boxes are `flex-1 min-w-0`,
since six 40px boxes overflow a 320px viewport.

## `/signin`'s heading sits inside the card, and `titleAs` carries the level with it

`AuthForm` renders an icon/heading/blurb block inside its card only when a page passes `title`;
`/signin` is the only caller, since the landing page's hero already introduces the form. The heading
is an `h1` sized by classes (`CardTitle`'s `as` prop), because `/signin` has no other heading and
would otherwise fail axe's `page-has-heading-one`. `CheckEmailCard` replaces `AuthForm` rather than
rendering inside it, so a `titleAs` prop threads through: it defaults to `h3` for the landing page,
and `AuthForm` passes `h1` when given a title, so the page keeps its `h1` after a link is sent — a
state no URL scan sees. `auth-form.test.tsx` asserts the tag name in all four combinations, because
the rendered page looks identical when this is wrong.

## A 401 from a sign-in endpoint must not go down the refresh path

The response interceptor in `lib/api/client.ts` treats a 401 as an aged access token, refreshes, and
retries. For a signed-out visitor the refresh throws, so its "Refresh token missing." replaces the
API's own detail, `clearAccessToken()` runs, and `AUTH_SESSION_EXPIRED_EVENT` fires at someone who
never had a session. `SESSION_MINTING_PATHS` excludes the routes where a 401 means the credential in
the body was refused: `/auth/refresh`, `/auth/email/verify`, `/auth/email/verify-code`,
`/auth/google`, `/auth/complete`. `/auth/logout` stays out deliberately — it needs a live access
token to blacklist the pair, so refresh-and-retry is right there. Tests swap
`apiClient.defaults.adapter` and `axios.defaults.adapter` together, because `refreshAccessToken`
uses a bare `axios.post`, and keep the negative case (an ordinary request still refreshes once) so
the set cannot grow until nothing refreshes.

## Passkeys sign in twice over, and the browser's own capability is the only switch

`@simplewebauthn/browser` (v13) backs passkey sign-in. `POST /auth/passkey/options` mints a
challenge and returns its `flow_id`; `POST /auth/passkey/verify` takes `{flow_id, credential}` and
returns the same `AuthOutcome` as the other entry points. The key is `credential`, not `assertion`:
the API's request model is `extra="forbid"`, and the test in `lib/api/passkeys.ts` pins the body
shape. `AuthContext.signInWithPasskey(flowId, credential)` runs through `applyOutcome`, and
`verifySignIn` uses `authAPI`'s exported `captureSession`. `/auth/passkey/verify` is in
`SESSION_MINTING_PATHS` for the reason "A 401 from a sign-in endpoint must not go down the refresh
path" gives.

Nothing is configurable. `browserSupportsWebAuthn()` is `false` exactly where the feature cannot
work — a plain-HTTP LAN instance gets no `PublicKeyCredential` — so the UI hides on capability,
extending `GoogleAuthButton`'s returns-`null` precedent; there is no `PASSKEYS_ENABLED` knob. The
capability is read through `useSyncExternalStore` (`false` on the server), not an effect calling
`setState`, which `react-hooks/set-state-in-effect` rejects: the value differs between server and
client renders rather than changing over time.

## The form arms a ceremony nobody asked for, and that is the feature

`hooks/usePasskeySignIn.ts` runs one ceremony two ways. The explicit one is the "Sign in with a
passkey" button (click, modal sheet, real error), kept because the cross-device QR flow appears only
behind a deliberate ceremony. The conditional one arms on mount when
`browserSupportsWebAuthnAutofill()` resolves true, via
`startAuthentication({useBrowserAutofill: true})`. Nobody asked for it, so it reports nothing: a 404
from an API predating passkeys or a declined ceremony passes silently; the one silent re-arm after a
failed verify covers a challenge expired in an open page.

It arms in the landing hero too (`AuthForm` in `open` mode), one POST per signed-out page view; the
lever, if ever needed, is arming on first focus of the email input, not a lower ceiling. In `invite`
mode the hero's `InviteRequestForm` (plain `autoComplete="email"`) arms nothing; `/signin` covers
the returning member. The email input's `autoComplete="username webauthn"` is load-bearing; v13 will
not arm conditionally without `webauthn`.

## Passkey sign-in: Three things about the ceremony that are easy to get wrong

Cancelling: the ceremony is anchored to an input, so `WebAuthnAbortService.cancelCeremony()` runs in
the effect's cleanup, on unmount and at the swap to the "check your email" card; `autofill: !sentTo`
re-runs the effect there. Recognising an abort: match `code === "ERROR_CEREMONY_ABORTED"`, the
documented contract; `err.name === "AbortError"` works only because v13 copies the wrapped
`DOMException`'s `name`. A dismissed sheet (`NotAllowedError`) says nothing: the spec collapses
cancelled, timed out and nothing-matched into one error so a page cannot ask whether an account has
a passkey, and `cause` is unreachable with `lib` at `es2020`. Not touching the magic link's storage:
`signInWithPasskey` routes by the `redirectTo` prop and never calls `rememberPostAuthRedirect`, a
slot for flows that leave the tab; a test pins it. Starting the explicit ceremony cancels the armed
conditional one (v13 allows one at a time); re-arming after the modal settles is not built.

## The divider sits above the optional methods, and the header that has to keep quiet

`AuthForm` draws the single "Or" divider above the optional methods, gated on
`googleClientId || passkey.supported`, because neither `GoogleAuthButton` nor the passkey button can
know whether the other exists; the block disappears when an instance has neither. `next.config.js`'s
`Permissions-Policy` names camera, microphone and geolocation and must not name
`publickey-credentials-get`/`-create`, which stay at their default `self`: naming features there is
opt-in, so a directive that omits these two kills passkey sign-in with a browser error pointing
nowhere near the header.

## Signing is enforced locally, because GitHub cannot do it yet

No git setting prevents an inline `-c commit.gpgsign=false`; two hooks do.
`.claude/hooks/no-unsigned-commits.py` (`PreToolUse` on Bash) rejects a command only where git
reports the key it would disable as on, heredocs stripped first. `.githooks/pre-push` rejects
unsigned commits (`%G?` of `N`; GitHub-signed squash commits report `E`) and needs
`core.hooksPath .githooks` per clone. Both scripts are committed, hence the ignore pattern
`.claude/*` (a plain `.claude/` blocks re-inclusion); the registration is untracked
`.claude/settings.local.json`.

The single `except ValueError` is deliberate: a `python3` that cannot parse the file exits 1,
non-blocking to Claude Code — failing open. The push hook checks `git rev-list`'s exit status: the
remote's advertised sha can name an unfetched commit, and a bare `revs=$(...)` reads the 128 as an
empty range.

Rulesets: `required_signatures` on every branch except `main` (a signature-required `main` cannot
squash-merge another author's PR), a `main` ruleset requiring a squash-merged pull request, and a
`tags` ruleset on `v*`.

## Passkeys come from two places, and the enrollment nudge is the one that matters

Enrollment lives in `components/settings/passkeys-card.tsx` and the dismissible
`components/dashboard/passkey-nudge-card.tsx`, both through `hooks/usePasskeyRegistration.ts`:
`usePasskeySignIn`'s explicit half with no `flow_id` (the bearer token names the owner) and a
client-picked name. A button precedes `credentials.create()` in both, the gesture Safari requires.

The nudge checks, in cost order, WebAuthn support, no dismissal in this browser, then the account's
passkeys, so steady state costs no request. Dismissal is per-browser in `lib/passkey-nudge.ts`: a
new browser is where the offer is relevant again. `restorePasskeyNudge` undoes it from the settings
card, shown only where a dismissal is stored. Its copy depends on the loaded list and the button
says "Undo": for a diver who has since added a passkey the offer cannot return. It is withheld only
while the list request is in flight, never on a failed load (removal needs no API), with
`nudgeWouldReturn` false when the count is unknown. `scripts/screenshots.mjs` pre-writes the
dismissal key via `addInitScript`.

## Passkey enrollment: The list is not gated on the browser's capability, only the Add button is

The settings card lists passkeys regardless of `browserSupportsWebAuthn()` and gates only the Add
button on it: a diver whose passkeys live on a phone must be able to revoke one from a laptop that
cannot create any, and a passkey nobody can see is one nobody can revoke — the reasoning behind the
API reading up to `_LIST_LIMIT` rows rather than stopping at the configured cap. The card removes
itself only when there is nothing to do: no passkeys and no way to add one, or a 404 from
`GET /user/passkeys`, which is an API predating passkeys rather than an error. Any other failure
shows the API's wording and a Try again.

## `onRegistered` runs outside the ceremony's own error handling

`usePasskeyRegistration` awaits the caller's callback after the try/catch around its three requests,
not inside it. The passkey is stored by then, so a list refresh that throws must not surface as
"couldn't add that passkey" — the diver would rerun the ceremony and meet the duplicate-credential
409 after being told the first attempt failed. A callback failure is logged instead.

## The client names the passkey, and the server only caps it

`lib/passkey-name.ts` reads the User-Agent into a coarse "Chrome on macOS", because only the browser
knows what it runs on and asking for a name before the biometric prompt puts a form in front of a
one-tap gesture. Two orderings are load-bearing and pinned by its tests: every Chromium browser also
says "Chrome", so Edge, Opera and Samsung Internet are matched first; and every browser on iOS is
the same WebKit authenticator, so the device alone is the name. An unreadable UA falls back to
"Passkey" rather than nothing, since the API's `name` is `min_length=1` and an empty suggestion
would fail a ceremony the diver has already completed.

## Deleting an account is a request with a date on it, and the date only exists once

`components/settings/delete-account-card.tsx` calls `DELETE /user` through `lib/api/users.ts`, and
the flow follows from one property of that endpoint: the purge date is composed server-side and
handed back exactly once. The grace window is `ACCOUNT_DELETION_GRACE_DAYS`, an operator knob
exposed on no config route, so the dialog can say a grace period exists but not name a day. The
account is dark the moment the call returns (`get_current_user` filters `is_deleted`,
`/auth/refresh` re-resolves the row), so nothing can be polled afterwards; the date arrives on one
response body and is carried from there to the screen that shows it.

The card, `/goodbye` and the API's confirmation email all say that signing in again before the date
brings the account back, and each carries a comment saying so — the failure mode is rewording one of
the three. The copy states what happens, in order: locked out now, everything erased later, the date
by email.

## `/goodbye` takes the date on the URL, because nothing else survives the trip

Deleting ends in `hardNavigate`, for `signOut`'s reasons: the session is over, the fetched dives and
`blob:` URLs should go with the document, and a full page load settles where the diver lands instead
of racing `useAuthGuard`'s bounce to `/signin`. That rules out React state; the access token and
refresh cookie are gone, so `sessionStorage` is the only alternative to a query parameter — a value
to clean up, invisible on reload, no less readable. The parameter is a date, not an identity.

`/goodbye` treats its input as untrusted: absent, unparseable and already-past `purge_after` each
get their own copy rather than "Invalid Date". "Already past" is reached two ways —
`ACCOUNT_DELETION_GRACE_DAYS=0`, and a reload or bookmark after the window ran out — and an elapsed
timestamp cannot tell them apart, so that branch says the date has passed; copy naming the
instance's configuration is false for the second reader.

## "Download my data first" is the archive, and it leaves the dialog open

`ConfirmDialog`'s `secondaryAction` slot carries the GDPR Art. 20 nudge and calls
`exportAPI.download("archive", …)`: the archive is the only export carrying the dive-computer files
and certification scans. The dialog stays open behind it — asking for your data mid-decision is not
changing your mind.

The confirm is blocked while that export is being saved. A successful delete ends in a document
navigation, which kills every open request and object URL, so confirming mid-export destroys the
export on an account that is dark by then. The window is longer than the fetch: `downloadBlob`
returns once it has dispatched a synthetic click, but Firefox and Safari read the blob afterwards
and cancel the save if the URL disappears (`lib/download.ts` holds one for a minute), so the card
stays busy for a two-second settle after handing the file over.

The type-your-username gate is `confirmDisabled`, compared case- and whitespace-insensitively:
friction, not a password.

## Account deletion: The token is dropped on success only

`usersAPI.deleteAccount` calls `clearAccessToken()` after the request resolves, never in a
`finally`. The server has blacklisted both tokens and cleared the refresh cookie by then, so keeping
the in-memory one would be a client pretending to hold a session the API has ended — but a rejected
call (rate limited, offline) changed nothing server-side, and clearing there would sign a diver out
of an account they still have. Same asymmetry as `signOut` after a failed `POST /auth/logout`.

## Signing in offers a deleted account back, and four entry points branch on `deletion_pending`

`AuthOutcome.status` has a third value, `deletion_pending`: the identity was verified, an account
exists inside its deletion grace period, and nothing was written and no session issued.
`AuthContext.applyOutcome` branches on that status rather than on `authenticated` versus
everything-else — an else branch that non-null-asserts `outcome.onboarding_token` stashes an
onboarding session with an `undefined` token for `/auth/complete`, since a `deletion_pending`
outcome carries none. The magic-link page, the six-digit code card, the Google button and
`usePasskeySignIn` all take their destination from that status too, instead of a
`signedIn ? next : "/onboarding"` ternary each.

## One function decides where an outcome lands

`destinationForOutcome` in `lib/auth-redirect.ts` maps a status to a path, and the four call sites
pass the status they were given. The `switch` is exhaustive on `AuthStatus`, so a fourth status is a
type error in one file rather than a silent mis-route in four. It sanitizes `next` itself with
`sanitizeRedirectPath` — three callers take it from a `?next=` prop and the fourth from
`localStorage`, and making each remember is how one forgets. `next` is honoured only for
`authenticated`: onboarding has nothing to return to, and a restore drops it because the account is
not back yet when the destination is chosen.

## The entry points resolve with the whole outcome, not a status

`verifyEmailLink`, `verifyEmailCode`, `signInWithGoogle` and `signInWithPasskey` resolve with the
applied `AuthOutcome`. A status alone would do for three of them; the magic-link page chains
verify-then-restore inside one handler and needs the `restore_token` from that very call, before the
stashed `RestoreSession` exists. `restoreAccount(restoreToken)` therefore takes the token rather
than reading the stash, and `/restore` passes the one it was handed.

## `/auth/verify` chains both halves; the other three cannot

Only the magic link has a side-effect-free precheck: `GET /auth/email/verify/check` answers
`deletion_pending` as `valid: true` plus a flag, so the page's "not valid" branch stays in front and
the button can read _Restore my account_ before anything is spent. A click on that button is the
decision, so the page posts the verify and then the restore and lands on the dashboard.

The chain is gated on the precheck's answer and the outcome's status, not either alone. A deletion
requested between precheck and click arrives at a button that said _Sign in_, and that click must
never quietly cancel a deletion — it falls through to `/restore`, where the offer is made properly.

A typed code, a Google dialog and a biometric gesture are commitments already made, so those three
can only offer the restore after the POST — which is `/restore`.

## `/restore` is `/onboarding`'s counterpart, down to what it cannot survive

Same shape as `/onboarding`: a verified identity that is not yet a session, an in-memory
`RestoreSession` never persisted, a redirect to `/` when opened without one, chrome-free, and
`isAuthenticated` sending an already-restored diver to the dashboard. It additionally says that a
reload loses the offer, because `POST /auth/email/verify-code` claims its request row before
resolving the identity — a code spent on reaching this screen is spent, and someone who closes the
tab needs a fresh email.

`/auth/restore` is in `SESSION_MINTING_PATHS` in `lib/api/client.ts`: a 401 there is the endpoint
refusing the token in the body, not an expired access token, and the refresh path would replace the
API's explanation with "Refresh token missing." That explanation matters — "already permanently
deleted" and "this restore link has already been used" are different failures, only the first a dead
end — and is shown verbatim on both screens.

## The purge date is parsed in one place, because it arrives from two directions

`lib/purge-date.ts` holds the parse guard and the day format. `DELETE /user` hands the date to
`/goodbye` on the URL, and a `deletion_pending` outcome hands the same date to the restore screens;
both can receive something unusable — an edited query string, or the `null` the API sends for a row
with no clock to count from — and rendering "Invalid Date" to somebody reading for a date is the
failure both avoid.

## Avatars are this instance's own, and there is no Gravatar fallback

Avatars are uploaded to this instance's API, and there is no Gravatar fallback behind a flag. A
fallback would carry every cost a gate exists to bound: a third-party host in the CSP, a disclosure
on the privacy page, a hashing dependency, a `d=404` probe on every mount, and an environment
variable a released artifact must document. Initials (`getUserInitials`) are the only fallback.
`flag()` stays for `WEB_HSTS` and `WEB_NOINDEX`; its doc comment and `runtime-config.test.ts`
demonstrate the unrecognized-value warning on `WEB_NOINDEX`.

## Avatars: The digest is the whole client contract

`UserRead` carries `avatar_sha256`, one nullable string answering three questions: whether there is
a picture, which version, and what to append as `?v=`. There is deliberately no URL. The bytes are
owner-only behind an `Authorization` header and the access token lives in memory
(`lib/api/client.ts`), so an `<img src>` at the API could never load them; `UserAvatar` fetches
through the API client via `hooks/useAuthedBlobUrl.ts` and renders from an object URL. Its props are
`{ name, avatarSha, size, className }` — no `email`. Radix's `AvatarFallback` renders until
`AvatarImage` has loaded, so in-flight, failed and no-picture are one state drawn as initials, with
no probe and no broken-image glyph. Staleness is handled by the URL: `?v={sha}` changes with the
picture, the old entry ages out of the five-minute `max-age`, and after upload or remove the card
calls `refreshUser()`, which re-reads `avatar_sha256` for every mounted `UserAvatar` in the same
paint.

## The crop dialog's three traps

Export PNG, never JPEG: `canvas.toBlob("image/jpeg")` composites transparency onto black, and the
server re-encodes to WebP anyway, so the client hands over lossless pixels.

`react-easy-crop` injects its own `<style>` by default, which the nonce-based production CSP drops
(the dev CSP allows `'unsafe-inline'`). `disableAutomaticStylesInjection` plus
`import "react-easy-crop/react-easy-crop.css"` puts the rules under `style-src 'self'`; the
library's `nonce` prop would also work. `NonceProvider` does not cover this — it sets `get-nonce`
for `react-remove-scroll`.

The dialog must not scale on the way in. The cropper sizes itself from `getBoundingClientRect()`,
which reports the box after ancestor transforms, and nothing re-measures once `DialogContent`'s
`zoom-in-95` finishes (its `ResizeObserver` watches the layout box). The 0.95 cancels out of
`cropSize / mediaSize`, so the mask promises 95% while `croppedAreaPixels` returns 100%. The fix is
`data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100` on this one `DialogContent`; an
explicit `cropSize` still derives media size from the scaled rect.

## Avatars: The `accept` list is load-bearing, not decoration

`accept="image/jpeg,image/png,image/webp,image/gif"` is what makes iPhone photos work. Since WebKit
bug 267277, iOS Safari transcodes a HEIC pick to JPEG only when the `accept` list restricts image
types and excludes HEIC. `accept="image/*"` hands over raw HEIC, which no browser decodes into a
canvas; adding `image/heic` is worse, since Safari 17+ then delivers the original and has a
documented bug converting picked PNGs to HEIC. The constant lives in `lib/api/auth.ts` with the
reasoning attached so nobody simplifies it inline. A Files-app pick bypasses `accept` entirely; the
API sniffs bytes regardless, so this is not a security surface.

## The card decodes the file before the cropper ever sees it

`react-easy-crop` has no failure callback: `CropperProps` carry `onMediaLoaded` and `onCropComplete`
and nothing for the other outcome, so a source that never decodes — a Files-app HEIC walking past
`accept` — leaves the dialog with an empty frame, `croppedAreaPixels` never arriving and Save
disabled forever. `AvatarCard.handlePick` therefore decodes the object URL itself and mounts the
dialog only on success, toasting otherwise; `mediaProps={{ onError }}` would catch it a frame later
with a half-open dialog to unwind. The second decode inside `cropToPngBlob` hits the browser cache.

Failures raised in the browser are `AvatarImageError` (`lib/avatar-crop.ts`), because
`getApiErrorMessage` reads an axios response's `detail` and returns its `fallback` for everything
else — never a plain `Error`'s `message` — so the card shows `message` for those and
`getApiErrorMessage` for the rest.

## Avatars: Onboarding has no avatar step

The profile-completion form stays two fields. A Google sign-up arrives with its Google picture
already imported by the API, an email sign-up arrives with initials and finds the editor in
Settings, and an upload-and-crop step at the door is friction where the funnel is most fragile. The
form's `UserAvatar` passes no digest: there is no account yet to fetch one from.

## Signing is a maintainer's setting, and the hook checks before it blocks

Contributors do not sign (`CONTRIBUTING.md`, _Pull requests_), and `core.hooksPath .githooks` sits
under _For maintainers_. No hook reaches a stranger's clone; `main`'s provenance is the squash
commit GitHub signs itself, so the merge method stays squash-only — rebase-merge would copy branch
commits up unsigned.

The Claude hook blocks a signing-disabling command only when `git config --type=bool --get` prints
`true` for that command's key (`commit.gpgsign` or `tag.gpgsign`), in the hook's cwd, not
`$CLAUDE_PROJECT_DIR`. Since a deleted config silences it, the patterns also match key- and
section-named removals (`--unset`, `--unset-all`, `unset`, `--remove-section`, `--rename-section`)
and every quoting of `false` or empty, with word ends `(?![^\s;&|()<>])`. Every gate failure fails
open, as would an exception escaping `main()`.

The script is committed; its registration lives in `.claude/settings.local.json` — see _"The skills
are repo content; what wires up the hook is not"_. Both hook files are byte-identical with
opendiving-api's, whose `DECISIONS.md` carries the long form.

## The PR template restates CONTRIBUTING, at the moment those asks are answerable

`.github/PULL_REQUEST_TEMPLATE.md` adds no demand. What changed and why, the pair of links tying a
cross-repo change to its [opendiving-api](https://github.com/opendiving/opendiving-api) PR, a
`DECISIONS.md` section when something bit you, screenshots when anything visual moved — all already
in CONTRIBUTING's _Pull requests_ and _Two things that will bite you_. The template puts those
questions where they are answered. Its wording tracks CONTRIBUTING's, since two phrasings of one ask
read as two; when one moves, move the other in the same PR.

Prompts, not checkboxes: a checklist trains ticking, and a box nobody verifies buys nothing. Bold
questions deleted when they do not apply still catch the omission that recurs: a web change landing
with its API sibling unlinked.

`npm run format`'s `**/*.md` glob reaches into `.github/`, so the template is wrapped at 100
columns; hand-wrapping it for the textarea is undone by the next format run and flagged by
`format:check` in `code-quality.yml`.

## The issue forms are structured, short, and point at the other repository twice

`.github/ISSUE_TEMPLATE/` holds a bug form, a feature form and `config.yml`. They are YAML forms
because the two questions a self-hosted bug report is useless without — version and install method —
can be required, where a prose template gets them deleted. Everything else is cut: four required
fields on the bug form, one on the feature form; a form long enough to be abandoned collects
nothing.

The install-method options mirror README's three ways in, which run different code: the published
image is same-origin through `app/api/v1/[...path]/route.ts`, a self-built image may carry
`NEXT_PUBLIC_API_URL` baked in, and `npm run dev` is neither. No dive-computer or format-support
form lives here; that funnel is opendiving-api's.

`config.yml` sends questions to `opendiving/opendiving`'s Discussions — one searchable space, on the
repository a stranger meets first — and security reports where [SECURITY.md](SECURITY.md) does.
`blank_issues_enabled` stays `true`: the forms are the paved path, not a gate.

## `lint-and-build` uses no matrix and `pr-title.yml` runs on `synchronize`, so both can be _required_

A ruleset binds a required check by name and by the events it runs on; a passing run displays
neither.

`lint-and-build` in `ci.yml` uses no matrix: GitHub appends matrix values to the check-run name, so
a one-value `strategy.matrix.node-version: [24.x]` reports as `lint-and-build (24.x)` and a ruleset
requiring the bare name matches nothing — and sits at "Expected — waiting for status" forever rather
than failing.

`pr-title.yml` runs on `synchronize`, not only `opened` and `edited`. A push cannot change a title,
but a required check must have passed on the head SHA, so without it a second commit leaves the
check stale and the PR hanging. `label` re-runs harmlessly and is skipped on forks; only
`semantic-title` belongs in a required-checks list.

`.github/renovate.json5` and the Renovate section state that `ci.yml` and `code-quality.yml` hold
six occurrences of `24.x` unreachable by the `github-actions` manager: three step names and three
`node-version:` inputs.

## The Prettier check fails the build, and the other advisory steps stay advisory

`code-quality.yml`'s Prettier step carries no `continue-on-error`: it gates with ESLint,
`tsc --strict` and `npm run build`, because the tool that reports formatting also fixes it —
`npm run format` is the entire remedy. The advisory steps stay so on their merits: depcheck reports
`postcss` and `@tailwindcss/postcss` unused because `postcss.config.mjs` names rather than imports
them; the bundle-analyzer call is a no-op library import; axe has untriaged findings; a
`madge --circular` cycle is a design problem, not a keystroke to undo. It runs first, so a
formatting failure hides the checks below it — accepted over `if: always()` plumbing.

The gate depends on `.prettierrc.json`'s `proseWrap: "preserve"` for `AGENTS.md` (see "The Prettier
override is load-bearing"); if that override goes, this step returns to advisory in the same change.

`npm run ci` does not run `format:check`: the script mirrors `ci.yml`, and `format:check` lives in
`code-quality.yml`; `CONTRIBUTING.md` names it blocking.

## Entry units are a per-device override; the account preference stays the display authority

A per-dimension unit toggle on the dive form's number boxes changes only what a box displays and
parses; the account's `units` preference renders everything saved.

The record is `override ?? account` in `localStorage` (`entry-units.ts`, keys from
`ENTRY_DIMENSIONS`): setting a dimension to the account's system removes its key, so absence means
"follow the account".

The store subscribes, unlike the chart keys: the gear-set dialog opens inside the dive form and
renders weight; `writeEntryUnits`/`clearEntryUnits` notify. Writes happen only in the toggle
handler. `signOut` clears the key after the `authAPI.signOut()` try/catch: an inherited psi label
parses 200 as 13.79 bar.

One toggle per dimension: `max_depth` carries depth's; pressure's sits in the Gas Mixtures header
and renders only while `fields.length > 0`; the gear-set dialog keeps its own weight toggle.
`MixtureGasHint`/`MixtureSetWarning` follow entry units; `/gear`'s list stays on `useUnits()`.
`UnitNumberInput` discards its draft on a flip during render. Tests must install
`useStorage(memoryStorage())`.

## The toggle sits in the label row without being laid out in it, and a flex wrapper is wrong twice

`EntryUnitLabelRow` leaves the `FormLabel` inline in an ordinary block and takes the toggle out of
flow, absolutely positioned and vertically centred. A `flex items-center` wrapper is wrong twice.
`<label>` is `display: inline`, and a flex or grid parent blockifies it: the box shrinks from the
17px content area its font metrics give it to the 14px line box `leading-none` declares, and the
18px toggle sets the row height. And `FormItem`'s `space-y-2` is a margin-bottom, which an inline
box ignores — wrapping the label in anything block-level collects 8px it never had, so the wrapper
carries `mb-0`. The Gas Mixtures header toggle is not this component: its only sibling is an `<h3>`,
already block-level, so flex alignment holds. jsdom does no layout, so the render tests pin
structure only: the label is not a flex or grid item, the toggle is out of flow, and the row cancels
the margin.

## The privacy page describes this app, and there is still no cookie banner

`/privacy` needs no GDPR cookie banner; it needs to be true. It describes this copy of OpenDiving:
no password login, public profiles, forums, photos, ratings, security audits, Data Protection
Officer or `privacy@opendiving.app` address, none of which exist. A policy that overstates what is
collected is not the safe direction to be wrong in.

It is written to the union of two jurisdictions. EU ePrivacy Art. 5(3) has two exemption limbs
(WP194 §1: Criterion A, transmission; Criterion B, strictly necessary for a service the user
requested). UK PECR Schedule A1 ¶¶3–7 has five; ¶5 (statistical), ¶6 (appearance/functionality) and
¶7 (emergency) have no EU counterpart, and ¶6(1)(d) demands a simple, free means of objecting.

`localStorage` is in scope: EDPB Guidelines 2/2023 ¶¶35–39 hold that storage is storage whatever the
medium. ¶44's "does not leave the device" reading covers only the access limb; the write is still
storage.

## Privacy page: "We" is the operator, and §1 says so before anything else

"We" on `/privacy` means the operator of this copy, not the OpenDiving project. §1 states it first:
the software is something anyone can run, this page describes this copy, and under GDPR Art. 4(7)
the operator determines purposes and means and is the controller. The project runs no servers,
receives nothing, and has nothing it could be asked to hand over. Every commitment on the page,
including §4.7's "protect our rights, property, or safety" and §9, is read as the operator's.
Nextcloud (<https://nextcloud.com/gdpr/>) and Mastodon's per-instance policy
(<https://docs.joinmastodon.org/entities/PrivacyPolicy/>) take the same voice.

## Privacy page: The exemptions, key by key

Criterion B (WP194 §2.2) is conjunctive: a requested service, and no function without the storage.

- `refresh_token`: session authentication is strictly necessary (WP194 §3.2); a persistent token is
  exempt only behind a "remember me" tick. This passwordless app has none; the owner's call is the
  muted `AuthForm` note and disclosure-first, which WP29 does not endorse.
- `opendiving:post-auth-redirect` fits Criterion B (WP194 §3.1; UK Sch. A1 ¶4(2)(e)(ii)); its
  24-hour lifetime is reasonable under §2.3, the flow crossing a mail client.
- User-chosen preferences (`theme`, chart-series and chart-period keys, `opendiving:entry-units`,
  the passkey nudge) sit on WP194 §3.6, which exempts UI customisation only short-term; §10 is the
  prominent information longer storage needs, and the §10.3 device-memory switch is the control.
- `opendiving:entry-units` stays a preference, not an identifier, so a user-id stamp is rejected.
- The `-view` keys' anchor timestamp derives from dive dates and is personal data; §10 says so.

## No banner is required, and "not required" is the phrasing that is citable

Exempt storage needs no consent: the ICO allows storage "without the subscriber's or user's consent"
in the exempt cases, and CNIL lists trackers "non soumis au consentement". What survives is
transparency under GDPR Arts. 12–13, because a session token is personal data, and the ICO says
those duties apply "even if you are making use of a PECR exception".

The conclusion is phrased "not required", never "prohibited"; the second is not citable and is the
same overclaim the page exists to avoid. CNIL Recommandation del. 2020-092 Art. 5 ¶49 recommends
informing users of exempt trackers "dans la politique de confidentialité", which is what §10 is.

## The objection condition, and the device-memory switch that meets it

UK Sch. A1 ¶6(1)(d) requires "a simple means of objecting, free of charge, to the storage or access"
— to the storage, not the value, so rewriting a preference is not objecting and a key with `setItem`
and no `removeItem` fails it. The §10.3 device-memory switch is the means: it removes every
remembered preference and stops it returning, and `lib/device-memory.ts` classifies each key as
covered or excluded. Under ¶6(2) one offer "in respect of the initial use" serves every key and
visit.

"Clear your site data" is not the means: the ICO says an operator "must not solely rely on browser
settings", the means must be the service's own, clearing cannot single out a key, and it deletes the
`refresh_token` cookie and signs the diver out. §10 keeps it only as contrast. The condition is
UK-only; ¶4 has no objection limb and the EU none.

## Privacy page: Why §10 names keys rather than categories

§10 lists every browser-storage key by name, not category labels like "Essential Cookies" and
"Preference Cookies". A named key tells a reader what is stored, for how long and whether they can
stop it, and lets a maintainer check the page against the browser's storage inspector, the source
and a test. §4.4–4.6 enumerate flows rather than "third party services" for the same reason. A
category cannot go stale visibly; a list of keys can, which is the point. The count belongs on the
page, where `app/privacy/page.test.tsx` pins it, not here.

## The landing page's "No trackers and no analytics" is still true, and here is the reading

`components/layout/landing-page.tsx` makes the claim and it holds: the software ships no tracking or
analytics technology — not disabled, absent, with no such dependency in the build. Sign-in and map
functionality that contacts a third party is function, not tracking, and each is disclosed on
`/privacy` rather than denied; Google sign-in on a Google-enabled instance is disclosed in §4.9.

§10 does not claim "no third-party cookies". The app sets none, but the operator picks the tile
provider through `MAP_TILE_URL`, and that provider's servers answer the image requests §4.4
discloses and may set cookies of their own, so §10 cross-references §4.4 instead of promising what
the software cannot keep on every instance.

## The rule this project holds itself to, stricter than the law's floor

This project declines the law's analytics exceptions. Two clauses: analytics, A/B testing or
advertising storage ships only with a prior-consent flow and a §10 change in the same PR; every new
browser-storage key owes §10 a row in that PR, enforced by `src/lib/storage-keys.test.ts`.

Four checks: (1) every `opendiving:`-prefixed literal under `src/` appears verbatim in
`app/privacy/page.tsx`; (2) modules with real `setItem`, `localStorage[key] =` or
`document.cookie =` assignments equal a literal list of eight filenames — a tripwire, since
resolving `setItem(CONST)` by regex masks keys, misaccuses files or passes vacuously; (3) no
production module mentions `indexedDB`, `serviceWorker` or `cookieStore` (`sessionStorage` is
excluded: comments mention it, and (2) catches its writes); (4) `lib/device-memory.ts` classifies
every key found as switch-covered or excluded, `theme` by hand.

Stated gaps: `theme` (next-themes' default, no `storageKey`), run-time-assembled keys, comments
naming a write form. The server-set `HttpOnly` `refresh_token` cookie (`lib/api-proxy.ts`) is
disclosed by hand in §10.1.

## Privacy page: §6.3 enumerates every email, and the enumeration is exhaustive on purpose

§6.3 lists everything a diver receives, in three groups — mail following an action on this site,
security notices, the gear-service digest — with contact-form mail parenthesised as mail about you,
sent to `CONTACT_FORM_EMAIL`. Any new `send_*` function in the api owes this section a line;
`app/privacy/page.test.tsx` pins only the first group's count against its list.

"You" in a claim about who receives mail is an identity assumption: `POST /auth/email/request` is
unauthenticated, `send_email_change_confirmation_email` goes to the address typed, and
`DELETE /user` acts on a bearer token alone, so only the deletion confirmation is bound to the
account's address and none is certain to reach the actor. `send_email_changed_notification` goes to
the old address and cannot be silenced. A message added to a group inherits every claim the group's
prose makes, not just the numeral; the invitation has its own reason for being unpreventable. "Three
kinds" in the opening counts groups.

## What the CSP actually buys, and why the storage-key rule is the guard

The CSP does not forbid analytics; the storage-key rule is the guard, and the CSP only narrows the
quiet ways to break it. `connect-src` lists `'self'`, the API origin and the basemap hosts
(`src/proxy.ts`), so a cross-origin beacon is blocked and a same-origin one is not. `script-src`
carries `'strict-dynamic'`, so a bundled analytics script loads with no violation. `img-src` is
`'self' data: blob:` — plus the API origin on a split-origin build — so a `data:` or `blob:` pixel
passes. A shorter list is not a stronger guarantee.

## Privacy page: The numbering in §4 is load-bearing, and conditional sections sit last

This file pins privacy sections by number and by quoted content — §4.4 map tiles, §4.5 geocoder,
§4.6 species cache, §4.7 Legal Requirements, §4.8 invitations, §4.9 Google sign-in — so a reword at
the right number falsifies a pin silently. A stale privacy page is worse than a vague one.

Conditional sections sit last. §4.9 exists only when `GOOGLE_CLIENT_ID` is set, so its absence
leaves no gap. The invitations disclosure is unconditional — `REGISTRATION_MODE` flips with a
restart, and a section that came and went would change under a reader for no stated reason — so it
holds a fixed number and hedges in prose ("where this copy is invite-only"). `page.test.tsx` asserts
§4.8 always present and §4.9 present only when configured. `git grep '4\.8'` misses the page's and
`lib/google-oauth.test.ts`'s regex literals; use `git grep -n -E '4\\?\.[89]'`.

## The ICO's `localStorage` suggestion, read and answered rather than passed over

The ICO's PECR guidance asks operators to consider "automatically removing objects in localStorage
where appropriate"
(<https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-comply-with-the-pecr-rules/>).
That is a should; the binding duty is to justify each key's duration against its purpose. §10.2
does: a preference lasts "until you change it, or until you tell this browser to stop remembering",
the device-memory switch being the second half. A preference removed on request rather than on a
timer answers the suggestion without discarding a choice the diver still wants, so chart-view state
carries no TTL.

## Privacy page: §7 keeps the API's 30 days, and §13 promises nothing about delivery

Two sentences at the page's edges stay as they are. §7's "Personal information is permanently
deleted within 30 days" is byte-identical to what ships, because documents in the API repo,
including a config default, are written against that number. §13 promises nothing about delivery:
`CONTACT_EMAIL` in this repo is display-only while the API's `CONTACT_FORM_EMAIL` decides where a
submission goes, and the two can disagree. §13 links the contact page as "how to reach whoever runs
this copy" without asserting a form works, and renders neither a project-owned address nor the
public issue tracker — a diver filing an erasure request in public, to people who are not the
controller, is the outcome it must not inherit.

## The terms page has two speakers, and the headings are the mechanism

`/terms` describes this software, not a platform: no shared content, forums, passwords, third-party
content licence or `legal@opendiving.app`. §2: you keep your own dive-site list (`user_uuid`-scoped,
`lib/api/dive-sites.ts`). §8: the page changes with the software; no notice mailing exists. §3 lists
every sign-in method, Google hedged in prose ("where this copy offers it") rather than gated on
`GOOGLE_CLIENT_ID`, because the sentence draws a security consequence from completeness. §13 splits:
operator for this copy, project for a software defect. §7 makes AGPLv3 §13's source offer the
operator's.

The mechanism is the heading. §1 defines "the OpenDiving project" and "the operator of this copy",
makes every section the operator's unless its heading says otherwise, and names the three that do:
7, 9 and 10. Bare "OpenDiving" never acts, so a self-hoster can grep for their sentences. §12 keeps
its deferral to wherever the Service is operated and only names its speaker.

## Terms page: Why this page speaks with two voices when no comparable project ships one that does

`/privacy` takes one voice because everything on it is the operator's. `/terms` cannot: one operator
voice would convert the project's liability disclaimer and indemnity into promises by an operator
who never agreed to them. The comparators avoid the problem by having the operator write the page —
Mastodon's `config/templates/terms-of-service.md` speaks as the Server Operator and names Mastodon
GmbH only to disclaim affiliation; Discourse's `tos_topic` in `config/locales/server.en.yml` speaks
as `%{company_name}`; Gitea's `contrib/sample-page/tos.html.sample` is a placeholder sample.
OpenDiving ships the page, so the project has a speaking part they lack.

The operator's as-is paragraph sits at the end of §8, not under §9, whose heading claims the project
as speaker. It carries no monetary cap, arbitration clause or jurisdiction — the parts an operator
would object to having invented for them — and says the operator may replace it with their own
terms.

## AGPLv3 §§15–16 do not reach the diver, which is what makes §9 load-bearing

"The AGPL already disclaims warranty, so terms §9 is spare boilerplate" is wrong. The AGPL's
disclaimers run to licensees: §0 addresses "each licensee" as "you" and says mere interaction with a
user is not conveying; §16 limits liability only "TO YOU" for use of the Program. A diver on someone
else's instance receives an HTTP response, not a copy — not a licensee. §13's source offer binds
modifying operators and is not a transfer; §17's waiver rescues §§15–16 where they already apply and
extends them to nobody (<https://www.gnu.org/licenses/agpl-3.0.en.html>). So the AGPL covers the
project against the self-hoster and leaves the diver uncovered, and terms §9 is the only instrument
closing that gap. §9 therefore carries its speaker in the heading, a third-party-beneficiary
sentence, and "adds to, and does not narrow, sections 15 to 17 of the AGPLv3".

## Terms page: Four things here are judgement, not settled law

This project has no lawyer; these are reasoning, not authority. The AGPL reach conclusion is a
textual reading no court has decided — "probably does not reach", not established. §9's "diving
accidents or injuries" bullet is the least enforceable anywhere (UK UCTA 1977 s.2(1) voids such
exclusions outright); it stays because it costs nothing and evidences no assumed duty, and nothing
is built on it. Third-party-beneficiary enforcement varies by jurisdiction and works only if the
diver assented and the operator shipped the page unedited, neither of which the project controls.
§5's narrow grant is chosen over "no licence is granted to anyone", which is more honest today,
because a future social feature then widens an existing clause rather than introducing licensing
from scratch — a product argument, not a legal one.

## The standing rule: a feature that shows one diver's content to anyone else brings its own grant

Any feature that makes one diver's content visible to anyone else ships its own §5 grant and its own
privacy-page section in the same PR. Today's grant is no wider than running the Service takes —
store your entries, show them back to you, include them in an export you ask for — and widening it
for features that do not exist overstates what a legal page covers. The three plausible futures need
different things, and only one is a copyright question: shared dives need an operator display grant,
probably per act of sharing; a dive-centre view of certifications is a lawful-basis question under
GDPR Art. 6, possibly Art. 9; aggregate statistics need no content licence at all.

## `--warning` is a shared token, not the safety notice's private one

`--warning` has several users: `dive-exposure-card.tsx` colours an alert exposure figure with
`text-warning`, `dive-mixtures-card.tsx` and `mixture-fields.tsx` use it on mixture warnings,
`ui/badge.tsx` has a `warning` variant on `bg-warning`, and `lib/course.ts` returns that variant for
`incomplete` and `provisional` courses. `lib/gear-service.ts`'s `due_soon` uses `--coral` instead
("overdue" is `destructive`). The terms page's safety notice is therefore not load-bearing for the
token; it stays on its own merits, because a dive log disclaiming safety advice should not look like
a footnote, and reads "software for logging dives".

## The footer's column labels are not headings, because the footer is shared chrome

`layout/footer.tsx` renders under every page, so no fixed heading level for its column labels is
correct — it depends on the page's tree. The columns are group labels over link lists, so each is a
`<nav aria-labelledby>` whose label is a `<p>`: reachable by landmark, outside the outline.
`footer.render.test.tsx` pins zero headings from the component.

`CardTitle` (`ui/card.tsx`) takes `as` (`"h2" | "h3" | "h4"`, default `h3`), tag only;
`contact/page.tsx` passes `as="h2"` because its cards are top-level sections.

CI misses both: `code-quality.yml` passes `--include="main"`, the footer is `<main>`'s sibling, and
`heading-order` is `best-practice`, outside `--tags`. `@axe-core/cli` pins a ChromeDriver major;
drive the vendored `axe-core` through `playwright-core` — launch as `scripts/screenshots.mjs` does,
`addScriptTag` `require.resolve("axe-core/axe.min.js")`, `window.axe.run(document, {})` with no
`runOnly`, `page.emulateMedia({ colorScheme })` per theme. In a worktree, drop `NEXT_PUBLIC_API_URL`
from the copied `.env` (CORS) and rewrite the magic link's port.

## The chrome-free routes share `standalone-shell.tsx`, which carries their one `<main>`

`AppShell` alone renders a `<main>`, and the `NO_CHROME_ROUTES` (`/signin`, `/onboarding`,
`/restore`, `/auth/verify`, `/settings/confirm-email`, `/goodbye`) never reach it.
`components/layout/standalone-shell.tsx` is their one wrapper, with the `<main>` inside and
`className` merged onto it, so a seventh screen cannot omit the element. The `<main>` wraps the
wordmark too, because `region` wants every scrap of content in a landmark and one link is not worth
a `<nav>`; `standalone-shell.test.tsx` pins document text equal to landmark text.

Loading frames (`PageSpinner`, or `null` until the in-memory session resolves) carry no landmark
deliberately: `PageSpinner` also renders inside `AppShell` as `variant="inset"`, where its own
`<main>` would be a second one.

Left open: `page-has-heading-one` on `/auth/verify`, `/settings/confirm-email` and `/onboarding`,
and `/goodbye`'s home link (`link-in-text-block`, dark `color-contrast`). Let a `router.replace`
settle before trusting `color-contrast`; a worktree production build needs
`API_INTERNAL_URL=http://localhost:8000`.

## `CardTitle` takes `as="h2"` on every card that is a section of its page

`CardTitle` takes `as="h2"` on every card that is a section of its page — settings, dive detail,
gear, dashboard. The test is "is this card a section", not "is this page failing". The landing
page's feature cards keep `h3` because they sit under
`<h2 class="sr-only">What OpenDiving does</h2>`; `/onboarding` and `/restore` keep it because
neither has an `<h1>` (`page-has-heading-one` is their real defect). Read a promoted card all the
way down: `delete-account-card.tsx`'s inner heading is an `<h3>`, since an `<h4>` under `<h2>` is
the same jump again.

Reading the axe report: it names only the first offending heading per page, so one violation is the
top of a stack — dump `document.querySelectorAll("h1,h2,h3,h4,h5,h6")` beside it. Scan public pages
signed out: signed in, `/` and `/signin` redirect to `/dashboard`, so an authenticated pass reports
the dashboard under three route names and never renders the landing page or sign-in form.

## Ten rows of "Edit" name nothing

Row-action controls in all seven tables (dives, trips, dive sites, certifications, gear items, gear
sets, courses) name their row: `View dive #412`, `Edit Palau 2025`, `Delete Pescador Island`.
Uniqueness among the page's controls is the point: axe's `button-name` and `link-name` pass
`aria-label="Edit"` ten times over, so only reading the controls list catches a bare label. Dive
rows key off `dive.dive_number`, what the row leads with and what a diver says out loud.
Certification rows carry agency and level through `certificationLabel` in
`lib/api/certifications.ts` (`PADI Advanced Nitrox`): certifications have no unique-name constraint
by design, and level alone gives two `Edit Advanced Nitrox` buttons. Gear rows use `gearItemLabel`'s
brand-then-name shape. A qualifier belongs in the name where the diver says it and the collision is
structural; otherwise it is a second sentence. `app/certifications/page.render.test.tsx` and
`app/gear/page.render.test.tsx` render two rows, because a constant name passes a one-row test.

## The gear detail page's service card, where the row is not the unit

`GearServiceCard` on `/gear/[id]` holds two lists whose rows describe the same thing — a schedule
and the service that satisfied it are both "Service (First stage)" — so a row name must say which
list as well as which row. Schedule controls carry the noun (`Edit Service schedule`, matching the
`ConfirmDialog` that opens); history entries carry the date (`Edit Service on Mar 12, 2025`),
because a schedule's kind repeats by design and only `serviced_on` separates entries. A schedule's
identity is `serviceKindLabel(kind)` plus its optional `label`, the pair the API keys on when
matching a logged service with no `gear_service_schedule_uuid`; two schedules of one kind that share
a label are indistinguishable everywhere, so the name cannot recover them. The pause control's
`Pause`/`Resume` text is prefixed, not replaced. `gear-service-card.render.test.tsx` renders two
rows per list, since a constant name satisfies a one-row test.

## Row-action names: The same rule holds for chips in a form field

`DiveSiteMultiSelect`, `SpeciesMultiSelect` and `GearItemMultiSelect` name each chip's remove button
`Remove <label>`, as `TripLocationMultiSelect` does. The field's own label reaches neither the flat
page-wide controls list nor the focus announcement, so bare `Remove` buttons collide like bare
`Edit` rows; the drag handles beside them (`Reorder Blue Hole, position 1 of 2 (primary site). ...`)
already reject the field-label argument. The name is the display label alone, not the muted suffix
(a site's location, a species' binomial, a gear item's type and badges): the suffix is what a diver
does not say, and where two records share a label they share the suffix too. Species are the one
case a binomial would disambiguate; the collision there is incidental, not structural. The gear
handle omits the `position N of M` the site and species handles announce; that asymmetry is
unresolved. Render tests assert both buttons of two rows; `GearItemMultiSelect` has one.

## `role="combobox"` is not allowed on a number input, and fixing that needs a draft string

`VolumeCombobox` is an `<input type="text" inputMode="decimal">`, not `type="number"`: a number
input's implicit role is `spinbutton`, and ARIA allows `combobox` only on text, search, tel, url and
email (axe `aria-allowed-role`). `CreatableCombobox` is already on `type="text"`. The committed
value is a `number`, so every keystroke round-trips through `parseFloat` and `String`, and a text
input then eats a mid-decimal keystroke: "11." parses to `11` and the "." vanishes. A `draft` string
sits between keystrokes and value: the input renders `draft` while typing, the committed number
otherwise, and the draft drops on blur, Escape, Enter and preset pick. `step`/`min` are gone; the
real constraint is `z.number().positive()` in the dive schema. jsdom does not sanitize input values,
so the render tests pin only the logic; typing a decimal is a Chrome check — clear the field first,
or a prefilled volume reads back as "22.211.1", which is not this bug.

## `aria-describedby` never reaches the accessible name

The dashboard chart cards' period pickers are named with `aria-labelledby` listing the `sr-only`
hint's id and the trigger's own id, in that order, so the name reads "Gas consumption period"
followed by the period showing. `aria-describedby` does not contribute to the accessible name, which
leaves the trigger named by whatever `SelectValue` renders — nothing on a period with no registered
item, which axe reports as `button-name`. An `aria-label`, or `aria-labelledby` pointing at the hint
alone, replaces the trigger's text instead of prefixing it and takes the current period out of the
announcement.

## The unit toggle's off half is `text-muted-foreground`, not `text-muted-foreground/60`

`EntryUnitToggle` renders the unselected system in full-strength `text-muted-foreground`, not 60% of
it. The token clears AA on both surfaces it lands on (see `globals.css`); at 60% the 12px text fails
`color-contrast` in both themes. Full strength measures 6.1:1 in light and 5.5:1 in dark. Nothing is
lost: the selected half is `font-medium text-foreground`, so weight and the foreground/muted split
already carry the distinction, the same pair the rest of the app uses for primary against secondary
text.

## "Continue with Google" is a redirect, and Google's code never reaches the browser

`GoogleAuthButton` loads nothing from Google at mount. The sign-in form renders on `/` and
`/signin`, so every visitor there is signed out, and injecting
`https://accounts.google.com/gsi/client` on load sends five requests to two Google-controlled
origins (`accounts.google.com`, `ssl.gstatic.com`) before any choice is made — an unconditional IP
and user-agent disclosure, and a cookie-free load is a fact about one GIS build rather than a
promise. WP29 Opinion 04/2012 §3.7, on the analogous social plug-in shape, requires consent from
logged-out visitors before a third party may use cookies; disclosure does not cure it. Clicking the
button is the consent: nothing reaches Google until the visitor asks for Google, and then they go
there by a top-level navigation. Same instinct as the Gravatar removal — the unconditional
third-party browser call goes away rather than being disclosed.

## Why a hand-built URL rather than any of Google's own mechanisms

`lib/google-oauth.ts` builds the authorization URL itself and performs a top-level navigation to it.
Not a popup, which is subject to blockers and the transient-activation budget, and not a form
submission, which `form-action 'self'` governs. The rejected options all still load `gsi/client`. A
two-click facade, or a one-click facade forwarding into GSI's own button, defers the script rather
than removing it and leaves a "Google's code runs in your browser" paragraph on `/privacy`; the
one-click variant also depends on GSI rendering its button as light DOM (`div[role="button"]`, class
`nsm7Bb-HzV7m-LgbsSe`), which is documented nowhere and is not a contract. One Tap
(`google.accounts.id.prompt()`) is suppressed for two hours after a dismissal, shows nothing without
a live Google session, and under FedCM its no-show is undetectable. GIS's own code flow
(`google.accounts.oauth2.initCodeClient()`) ships inside the same bundle and buys no privacy.

## Google sign-in: PKCE, which the chosen direction is what made possible

The authorization request carries `code_challenge` and `code_challenge_method=S256`; the verifier
travels to this app's API in the request body and on to Google in the exchange. `initCodeClient`
cannot do PKCE — its `CodeClientConfig` has no `code_challenge` field — so building the URL by hand
is what makes it possible. Google's guides do not document it; the OpenID discovery document at
<https://accounts.google.com/.well-known/openid-configuration> advertises
`"code_challenge_methods_supported": ["plain", "S256"]`, and that is the citation. `crypto.subtle`,
which hashes the verifier, needs a secure context; that is no constraint, because every redirect URI
Google accepts is HTTPS or localhost, so a plain-HTTP LAN deployment cannot use Google sign-in under
any design.

## Google sign-in: No `nonce`, and that was measured rather than assumed

The authorization request carries no `nonce`. The ID token never touches the browser: it goes from
Google's token endpoint to this app's API over TLS, for a single-use code that cannot be redeemed
without both the client secret and the PKCE verifier, so a nonce — which guards replay of a token
that travelled through the browser — would be a third value marshalled through browser storage for
no open threat. Google's OpenID Connect page marks `nonce` "(Required)" in a parameter table serving
both flows; OIDC Core makes it optional for the authorization code flow (§3.1.2.1) and required for
implicit (§3.2.2.1), and Google's endpoint accepts `response_type=code` without one while rejecting
`response_type=id_token` with `invalid_request: "Nonce required for response_type id_token."` Cite
the flow-specific _OAuth 2.0 for Web Server Applications_ page, whose parameter lists omit it; its
occurrences of the word are `state` and DPoP, not this nonce.

## Google sign-in: `localStorage`, keyed by `state`, and why the obvious technical choice was the wrong one

Pending attempts live in `localStorage` under `opendiving:google-sign-in-attempts`, TTL-bounded and
consumed on read, like `lib/auth-redirect.ts`'s magic-link destination. `sessionStorage` fits better
(per-tab, dies with the tab, the redirect returns to it), but `/privacy` §10.4 states "There is no
session storage, no IndexedDB database and no service worker", and `storage-keys.test.ts` leaves
`sessionStorage` out of its `ABSENT_MECHANISMS` match, so nothing would catch that falsification.
The record is a map keyed by `state`: `localStorage` is shared across tabs, and a single slot lets
the second of two concurrent sign-ins overwrite the first, failing its `state` check over a sign-in
Google approved. The destination rides inside the record, not in
`rememberPostAuthRedirect`/`consumePostAuthRedirect`, a single read-once `{ path, expiresAt }` key
that would reintroduce the cross-tab overwrite. 30 minutes clears a first sign-in's account chooser,
password, second factor and consent screen; an expired entry is an error over an approved sign-in.

## Google sign-in: The once-guard on the callback is not the state consumption

`/auth/google/callback` guards its single POST with a `useRef` latch that survives a Strict Mode
remount, the shape `/auth/verify` uses. Google's codes are single-use and Strict Mode runs effects
twice in development; consuming the stored attempt before the POST makes the second mount find no
entry and show the "no attempt" error over a successful sign-in, while a "confirm exactly one POST"
check still passes. Both tests assert the absence of the error, not the request count. The callback
exchanges on load rather than on a click: `/auth/verify` waits because its URL arrives by email,
where link-preview scanners load it; an OAuth callback URL is reached only by redirect from Google
and its code is worthless without the API's client secret and the verifier. `?error=` is not an
error state: cancelling at Google's chooser returns `error=access_denied`, which lands at `/signin`
with every method available and the destination carried along.

## Google sign-in: The button is one ordinary `Button`, with no GSI script and no CSP entry

The control is one ordinary `Button`: one accessible name, one tab stop, Enter and Space for free.
No injected script, no `initialize`/`renderButton` effects, no `ResizeObserver` for GSI's fixed
200-400 px width, no `Window` augmentation, and no `aria-hidden` decorative overlay with GSI's real
button stacked at `opacity: 0`. No `?hl=en`: GIS bakes button language into the script response, a
constraint a self-rendered button does not have. `accounts.google.com` appears in no CSP directive
in either configuration — a top-level navigation is governed by none of the fetch directives — and
no `Cross-Origin-Opener-Policy` is needed, since Google requires `same-origin-allow-popups` only for
its popup flows. The policy therefore no longer discloses whether an instance has Google sign-in on.
Google's branding guidelines are not newly engaged: the visible button is fully custom and Google's
rendered pixels are never shown.

## The sign-in form does not remember which method this browser used

`lib/last-auth-method.ts`, the `opendiving:last-auth-method` key, the writes at `AuthContext`'s
entry points and the "Last time you signed in with …" line in `components/auth/auth-form.tsx` do not
exist. The ground is WP194 §3.6: UI-customization storage is exempt only where "the user has
explicitly requested the service to remember" the choice; this key was written automatically at
every sign-in and survived sign-out. Disclosure is honest but does not make storage exempt.
Unrequested writing alone does not disqualify it — the dashboard view keys are written from a mount
effect too (`components/dives/gas-use-card.tsx`) — but those hold up a view lost on reload; this one
bought a cosmetic sentence that never preselected, hid or reordered a method. Keeping the key under
the device-memory control was rejected: the affordance is not worth the hardest paragraph in the
privacy page's legal reading. _"The sign-in form says which method this browser used last"_ records
what it was for.

## One switch against every remembered preference on this device

`lib/device-memory.ts` holds the logic; `components/device-memory-switch.tsx`, rendered on
`/privacy` §10.3 and `/settings`, is its only reader (UK PECR Sch. A1 ¶6(1)(d)). Suppression
interposes on `setItem` at its definition site along `window.localStorage`'s prototype chain
(`test/memory-storage.ts` installs a plain object, so not `Storage.prototype` by name), guards on
the receiver, and reads the flag per write. Per-writer guards fail: `theme` belongs to next-themes,
which has no write site here and rewrites a key another tab removed.
`components/device-memory-installer.tsx` installs at module scope and `app/layout.tsx` renders it,
arming before `gas-use-card.tsx`'s mount-effect write; side-effect imports from the layout (a Server
Component) or `theme-provider.tsx` are rejected, and `device-memory-installer.test.ts` tripwires the
layout. Clearing goes by `opendiving:` prefix plus `theme`, which reaches orphaned keys; suppression
goes by list, and `storage-keys.test.ts` check (4) aligns them. The flag is written before the
removals, `setTheme` resets the initiating tab, `access_token` stays (population of one), and off
clears nothing.

## `TANK_USAGE` is a fourth hand-kept vocabulary mirror, and the first with no parser behind it

`TANK_USAGE` in `lib/api/dives.ts` mirrors `TankUsage` in the API's `schemas/dive_mixture.py` by
hand, like `GAS_ROLES`, `WATER_TYPES` and `GEAR_TYPES`: declaration order is the picker's order, the
API's `extra="forbid"` rejects an invented member on save, and the narrow union type-checks
`TANK_USAGE_LABELS[usage]`. Only the diver sets it. No format the dive form's file import parses
records whether cylinders were breathed alternately or staged (Suunto XML/JSON, FIT, UDDF, `.ssrf`),
so `ParsedDiveMixture` has no `usage` field. DiveJSON's `cylinders[].usage`
(`"parallel"`/`"staged"`) round-trips through logbook import, restoring the diver's own flag.
`mergeMixture` (`lib/dive-import.ts`) still names `usage` explicitly, form-then-nothing: it builds
its result field by field and silently drops any it omits. The new-dive form carries it over from
the last dive, with `role` and gas fractions. `TANK_USAGE_LABELS` (`lib/dive-mixtures.ts`) is one
word per flag; `TANK_USAGE_OPTION_LABELS` in `mixture-fields.tsx` is longer ("Parallel (sidemount /
independent)") because an option row has no sentence around it and the flag changes what the API
computes.

## `gasUseUnavailableReason` nudges toward Parallel, and where the nudge sits is the whole design

Flagged-parallel reasons come first in `lib/dive-gas.ts`'s multi-mixture branch:
`compute_parallel_gas_use` sums a set flagged `parallel` throughout against the dive's duration and
`avg_depth` without a profile, so the attribution sentences are false of it and `avg_depth` is a
multi-cylinder input. Its first ask names depth and pressures together, a sidemount diver's opening
state. Then the nudge: an unflagged multi-cylinder dive is told that flagging Parallel would add the
gas up — as a condition, not an instruction, so a genuinely staged pair with both pressures is not
walked into misattribution. It precedes the no-profile branch, which otherwise captures every
hand-logged pair, and the attribution-shortfall sentence. Two gates: every cylinder carries both
pressures with a positive total drop — the staged-bottle tell; a missing depth is one follow-up ask,
not a gate — and none is flagged `staged`, since gating on any explicit `usage` silences the
half-flagged pair. `dive-gas.test.ts` pins the split.

## `diveModWarning` judges a flagged parallel set of one gas as that one gas

The `length === 1` split in `lib/dive-mixtures.ts` has a third case: a set flagged `parallel`
throughout holding one `(oxygen, helium)` is judged as one gas, 1.4 working limit included. With one
mix breathed throughout, the maximum depth is one that gas saw, so single-cylinder reasoning
applies; a deco gas over 1.4 is normal only under a switch plan. Both halves matter: a flagged pair
with different gases is a switch plan; two identical unflagged cylinders could be a spare switched
to. Nothing is inferred from `DiveGasUse.tanks` here; the flag is the diver's statement that every
cylinder saw the same depths. Fractions are compared, not `gasName`, which rounds 31.6% and 32.4%
both to "EAN32"; `helium` normalizes to `0` because `OxygenFractions` allows it absent while the
form and parsers write a flat zero. `DiveMixturesCard`'s amber MOD cell follows the same predicate,
marking every row, since every row holds the gas named.

## `DiveGasUse`'s doc comments are swept by claim, not by list

`DiveGasUse`'s comments in `lib/api/dives.ts` mirror the `schemas/dive.py` docstrings in claim, not
wording ("multi-tank" for the API's "multi-cylinder"). The claims: `sac_bar_per_min` is null on a
multi-tank dive unless the set is flagged `parallel` throughout with exactly equal volumes, so a
present `rmv` is no promise of a SAC; `tanks: []` arrives on the additive path as well as
single-tank, so `[]` does not mean one cylinder; `attributed_seconds`/`duration` are null wherever
the whole dive is accounted for. Sweep for the claim rather than a list:

```bash
git grep -n -i -E 'multi-tank|multi-cylinder|per-tank|per cylinder|empty array' -- src
```

`per cylinder` catches comment prose that says it where code says per-tank. The consumption card's
average-depth sentence carries no SAC gate, because an unequal-volume parallel set has a null SAC
and a whole-dive RMV divided by `dive.avg_depth`; position guarantees the claim, since the headline
arm renders only where `tanks` is empty, exactly the derivations taken against the dive's average
depth.

## The mixtures table carries no usage badge; `tankUsageSentences` states the flags under it

The mixtures table carries no usage badge; `tankUsageSentences` in `lib/dive-mixtures.ts` states the
flags beneath it ("Cylinders 1 and 2 are flagged Parallel — …"). Every recorded flag stays visible
on the dive page, tied to its cylinder by the table's `#`. A badge in the Gas cell measures 655 px
against the 582 px slot at 1024 px, clipping the MOD column by 73 px. Measure with
`table.style.width = 'min-content'` and `getBoundingClientRect().width`; `scrollWidth` returns the
container's width whenever the table fits. Rejected on measurement: the Volume cell (14 px inline,
56 px stacked — an overflowing table is already at min-content), icons (touch has no hover), and
band-only icons (579 px, but a glyph vocabulary against "Three glyph families, not five"). The
column set stays; role badges are the worst case, and the two-decimal MOD beside them now takes it a
few px past the slot, into shadcn's own scroll. jsdom does no layout; tests pin text only.

## Adding a resource means sweeping the prose that enumerates the resources

Nothing type-checks a sentence enumerating the resource kinds. User-facing copy is swept kind by
kind, because a missing kind is a false statement about which records get exported, erased or
restored: `app/privacy/page.tsx` (several enumerations), `app/terms/page.tsx`,
`components/settings/delete-account-card.tsx` (card and `ConfirmDialog` `description`),
`components/auth/restore-account-card.tsx`, `app/goodbye/page.tsx` (both arms),
`app/auth/verify/page.tsx` (`purgeOn` and dateless branches),
`components/settings/data-export-card.tsx`, `README.md`'s feature list, and
`components/layout/landing-page.tsx`'s closing sentence. Docstrings and comments carry no counts —
"a detail page", "the list pages", never "all four of which" — because a census goes stale on
removal as readily as on addition. Regenerate the copy list rather than trusting this one;
`certifications` exists everywhere:

```bash
git grep -lni certifications -- src/ README.md
git grep -nEi 'list pages?|detail pages?' -- src/
```

Subtract the certification-specific code and what remains is enumeration-bearing prose or a registry
a new kind extends anyway (`layout/header.tsx`, `layout/quick-create.tsx`'s `QuickCreateKind`,
`lib/return-to.ts`, `dashboard/setup-checklist-card.tsx`). The second grep is suggestive only:
comment prose wraps, so a multi-word pattern misses a match split across a line break.

## Courses nest a dialog inside a dialog, and sit in the user menu rather than the nav

`CourseCombobox` mounts its own `CourseDialog`, so in the certification dialog "Add course..." nests
a dialog in a dialog, safely: `dialogFormSubmit` stops the inner submit propagating and Radix
portals both to `document.body`.

Courses mirror Certifications, per `git grep -n '/certifications' src/components/layout/`: a
`NAV_SECTIONS` entry and the user-dropdown item, nowhere else. No dashboard card or checklist step.

The list's search debounces the term that `useInfiniteResource`'s `fetchFn` closes over, because
changing it discards every loaded page. "No courses match" and "no courses yet" are separate empty
states; only the second offers create.

`/dives/new` does not inherit the last dive's course; the course page passes `?course_uuid=`. The
dive page's course is its own Training card, not a Location row. `getDives`' `courseUuid` is
appended last, its parameters being positional `string | undefined`. The resource sweep needs
`git grep -ni c-card -- src/ README.md` too: `git grep -lni certifications -- src/ README.md` misses
`components/layout/landing-page.tsx`.

## The skills are repo content; what wires up the hook is not

`.claude/skills/` is committed (`!.claude/skills/` is the ignore file's one exception) because both
skills describe working on this repo alone: the local magic-link flow and `scripts/screenshots.mjs`.
Their names, `opendiving-web-login` and `opendiving-web-dashboard-screenshot`, carry the repo
because skills load by bare name across sibling repos.

`.claude/settings.json` is not committed; the `PreToolUse` entry for
`.claude/hooks/no-unsigned-commits.py` lives in the untracked `settings.local.json`, and the script
stays tracked on the same argument. Cost: `web-N-*` worktrees come from plain `git worktree add`,
which copies nothing untracked, so that guard does not fire there; `.githooks/pre-push`, inherited
through `core.hooksPath`, still refuses the push. This overrides the ruling under "Signing stopped
being a demand on contributors".

Do not untrack the script too: the next `git pull` deletes an ignored-but-tracked path silently, and
a missing hook command exits non-blocking, so the guard would go quiet in the primary checkout as
well.

## "Add Mixture" sits under the tanks

The button renders after the tank cards, at the foot of the Gas Mixtures section, not in its header.
It sits where the tank it adds appears, so control and effect are adjacent; in the header it would
be the one control pointing backwards, and a four-cylinder dive would scroll back past every card to
add a fifth. On an empty form the sentence "No cylinders recorded for this dive." describes the
state and the button follows as the way out.

It is left in normal flow, not wrapped. It is `inline-flex` (`ui/button.tsx`); measured bare and
wrapped in `flex`, the container is 36px either way, because an `h-9` inline-flex box holds the
strut's descent and `space-y-4`'s `margin-top` applies to atomic inlines. The pressure toggle's row
height derives from the `<h3>`, not this button; see "The Gas Mixtures header toggle is deliberately
not this component".

## Retina tiles are plumbed and switched off, because Carto's `@2x` is a watermark

Carto's keyless tier stamps "API KEY REQUIRED" diagonally across every tile: `light_all`, `dark_all`
and `rastertiles/voyager`, at every zoom sampled, plain and `@2x`, with or without browser headers.
That is why the default basemap is not Carto and why the keyed Carto block in `.env.example` exists.
A tile provider is verified by decoding the image, never by status code and byte count: a
watermarked `@2x` tile is a valid PNG at a plausible ~2.5× the plain size, so
`curl -o /dev/null -w "%{http_code} %{size_download}"` corroborates instead of testing. Density for
a raster template is MapLibre's `{ratio}`; see "The basemap is a MapLibre style, and raster is the
escape hatch".

## The default basemap is OpenStreetMap's own, and the dark theme is a CSS filter

The default basemap is OpenFreeMap's Liberty and Dark, per "The basemap is a MapLibre style, and
raster is the escape hatch". The raster escape hatch documents a key because no keyless raster
provider is fit for a default. Surveyed at one decoded tile (z10/608/432, Safaga) from three
`Referer` values: Carto watermarks every style, `rastertiles/voyager` included;
`tile.openstreetmap.org` and its DE, France, CyclOSM and OpenTopoMap mirrors are clean and labelled
but have no dark variant and no `@2x`; Esri Canvas's Reference layer is a blank tile, so no place
names; Stadia `alidade_smooth` answers 200 only to `Referer: http://localhost:3000/` and 401
otherwise; Wikimedia `osm-intl` 403s off-domain.

Keyed Carto stays in `.env.example`, `{r}` included. `MAP_TILE_API_KEY` fills a `{key}` placeholder
in both templates, so the credential is written once and each provider's parameter spelling (`?key=`
Carto, `?api_key=` Stadia) stays in the operator's template. The key reaches the browser, which
fetches the tiles.

## Stadia is documented beside Carto, because Carto's raster endpoint is legacy

`.env.example` carries a keyed Stadia block beside the keyed Carto one. The provider survey ruled
Stadia out as a default only for its 401 from every domain but `localhost`, which a key fixes. What
earns the block is maintenance, not style: Carto's basemaps FAQ recommends its vector basemaps and
says data updates to the raster ones may stop, so a raster template there risks place names going
slowly stale, while Stadia maintains raster. Only the raster escape hatch is affected; the default
is a vector style.

The block spells out the terms rather than leaving them to the 429: 200k tiles a month against
Carto's 5M, non-commercial use only, a hard limit for the rest of the month once spent, paid plans
from $20/month. The attribution example adds an OpenMapTiles credit, because Alidade is built on it;
attribution is operator-set for provider differences like this.

## The new-dive render test's mocks are identity-stable, so the prefill effect runs once

A mock that rebuilds its return value per call is only safe while nothing depends on its identity.
`src/app/dives/new/page.render.test.tsx` mocks `useAuth`, `useRouter`, `useSearchParams` and
`useToast` with `vi.hoisted` objects returned by identity: the page's last-dive prefill effect ends
in `form.reset` and lists `user` in its dependencies, so a fresh `user` per render re-runs the
effect and the reset re-renders. Nothing fails; the loop competes with every `waitFor`, so tests
time out at random under `npm run ci`. The pin is "reads the last dive once, not once per render",
asserting the `getDives` call count.

Same file: `gearAPI.getGearItem` is mocked as well as `getGearItems`, or the gear picker's lookup
hits a real `/api/v1` on jsdom's `localhost:3000`. `fireEvent.change` sets a controlled `FormField`
in ~3ms where `userEvent.type` costs ~60ms per field, from re-renders rather than the inter-key
delay, so `userEvent.setup({ delay: null })` does not help; type only where keystrokes are the
point.

## A shared mock response object hides a render loop

`mockResolvedValue` hands one object to every call, so a page looping on `user`'s identity reaches
`setItems(response.data)` with the array React already holds, React bails out, and the loop stalls.
A low single-digit call count therefore means "stable" or "looping against a frozen response", and
only `mockImplementation(async () => page([gearItem()]))`, a fresh object per response, tells them
apart.

The pins `reads the gear list once`, `reads the certification list once` and `reads the stats once`
must use `mockImplementation`; with `mockResolvedValue` they pass despite the bug. The dashboard's
waits a beat, since effects run on a task and `findByText` returns before the second pass.
`avatar-card` and `units-card` do not loop but use identity-stable mocks too, so any copied
neighbour is right.

A shared `src/test/` helper is rejected: `vi.mock` factories hoist above imports, so it is reachable
only by `await import()`, and it would only re-export `vi.hoisted` for auth shapes sharing nothing.

## One User-Agent reading, two fallbacks

`lib/passkey-name.ts` names a browser for both the label a new passkey is filed under and the device
hint on a session row, so one page never disagrees with itself. The label is derived here, not
stored: the API keeps the raw `user_agent` as a security record and does not parse it, which would
be a second regex table drifting from this.

The exported pair differ only in the last resort. A passkey falls back to `"Passkey"`, a name the
diver can rename; a session to `"Unknown device"`, since a `curl` row is no passkey and cannot be
renamed. `passkey-name.test.ts` pins that fallback with a case per unreadable input, `curl/8.7.1`
and the empty string (`user_agent` when no header was sent), asserting both halves at once:
`deviceNameForUserAgent` is not `"Passkey"` and the passkey name still is. Every recognised-browser
case passes without the split; only those prove it.

## The current session's row carries nothing, not a disabled control

`SessionsCard` marks the current row and gives it no revoke button, not a disabled one. Ending your
own session is signing out: it clears the refresh cookie and spends the token pair, so a revoke here
would be a worse logout than the menu's and would walk into `AuthContext`'s rule that a failed
logout must not display "signed out" over a live session. The API's 409 is a backstop. An absent
control reads as "not a thing you do here"; a disabled one reads as broken.

"Sign out other sessions" is gated on `sessions.some((one) => !one.current)`, not
`sessions.length > 1`, because it asks the button's own question directly where a row count only
approximates it. The toast reports the count from the response body, the only honest source: the
confirmation fires before the request, so the dialog never knows how many rows there are to end.

## Every closed list on the privacy page has a pin

`app/privacy/page.test.tsx` pins every section whose prose closes a list: §2.2 ("Five things … all
five") by list length plus the word in both places; §3, numberless, by both §2.2 records appearing
among its purposes with "And nothing else." intact; §6.2's ordinals ("The first four", "The last
two") by adding up to its list, plus the export carve-out; §6.1 by the entry that Settings signs a
device out; §7's retention periods as figures, being API constants rather than operator settings.

§2.2's account-security-events list has no pin: its authority is the API's `AuthEventType` enum,
unreadable from here, so the entry claims completeness and the enum is what to re-read. An operator
setting is never stated as a fact; the session cap is "an improbable number of devices". Revocation
takes hold on the next request, as §10.1 and `SessionsCard`'s dialogs say; `lib/api/client.ts`'s
interceptor turns the refused refresh into `AUTH_SESSION_EXPIRED_EVENT`.

## The basemap is a MapLibre style, and raster is the escape hatch

The default basemap is a MapLibre vector style, OpenFreeMap's Liberty and Dark: their labels render
bilingually (Safaga over سفاجا), which no keyless raster basemap does. Liberty over Positron, whose
sea is grey. Style and sprites are vendored; glyphs are hotlinked, since `glyphs` is one URL
template per style and CJK is 89.9 MB.

Raster is configuration: `rasterStyle` wraps `MAP_TILE_URL` into a one-source style with `tileSize`
256 (spec default 512) and renames `.env.example`'s `{r}` to MapLibre's `{ratio}`, since a literal
`{r}` 404s.

`MAP_ATTRIBUTION` belongs to neither mode. `MAP_STYLE_URL` without it is a configuration error and
the app refuses to serve: the request path may not fetch a remote style, a default credit is false
and no credit breaches the licence. Lazy `runtimeConfig()` throws on the first request, so pages 500
while `/healthz` and the `Dockerfile` `HEALTHCHECK` stay green. The unset default and raster mode
stay silent; `runtime-config.test.ts` pins all three.

## The worker is same-origin, and `worker-src 'self'` is what makes the blob path fail loudly

`setWorkerUrl()` points MapLibre at a same-origin copy of `maplibre-gl-worker.mjs`:
`workerFactory()` uses `createWorker(url)` when `isCrossOrigin(url)` is false and falls through to
`fetchAsBlobUrl`/`importAsBlobUrl` only when true. `scripts/copy-maplibre-worker.mjs` copies both
files, since the worker imports `./maplibre-gl-shared.mjs`, and a worker that never starts fires no
error; the map never reaches `load`. `predev`, `prebuild`, `pretest`, `pretest:watch` and
`pretest:coverage` all run it; npm matches pre-hooks by exact name and CI runs `test:coverage`.

`worker-src 'self'` is load-bearing: without it a worker falls to `script-src`, whose
`'strict-dynamic'` skips the source-list check for non-parser-inserted scripts, so a `blob:` worker
would load unreported; `worker-src`'s own check has no carve-out.

The basemap host is a `connect-src` source in both modes, because MapLibre fetches even raster tiles
while `refreshExpiredTiles` is `true`; setting it `false` routes raster back through `img-src`.
`img-src` is `'self' data: blob:` plus the API origin on a split-origin build; `proxy.test.ts` pins
it for all three basemap configurations.

## MapLibre's zoom is one number below the slippy convention

MapLibre measures zoom against a 512 px tile (`_tileSize = 512`) where Leaflet and the slippy
convention use 256, so the same view is one number lower and `coveringZoomLevel` asks a 256 px
raster source for `zoom + log2(512/256)`. The constants are `MIN_ZOOM` 0, `MAX_ZOOM` 17 and
`MAX_FIT_ZOOM` 9, one below their slippy originals; `basemap.test.ts` asserts the relationship, not
the numbers. The vector source's maxzoom 14 overzooms past that by design; `MAX_FIT_ZOOM` keeps a
lone place from opening at street level.

`fitBounds` is MapLibre's, the union is not: `LngLatBounds.extend()` unions raw longitude with
`Math.min`/`Math.max`, and `cameraForBounds`' `adjustAntiMeridian()` cannot repair a union built the
long way round, so Fiji and Samoa would span 354 degrees. `unionBounds` in `lib/basemap.ts` unwraps
every box against the first before unioning. Its unit and browser tests use three places, the
browser one asserting marker order (Suva, Taveuni, Apia), which two places cannot show.

## The contract tests run in a real browser, and two things do not carry over into it

MapLibre needs WebGL2, which jsdom lacks. `vitest-webgl-canvas-mock` is WebGL1-only and
unmaintained, and MapLibre's own `NullWebGL2RenderingContext` is unreachable through its `exports`
map, so adopting it means reimplementing it. `vitest.config.mts` therefore carries a second project:
Vitest 4 browser mode with the Playwright provider driving real Chromium, for files ending
`.browser.test.tsx`. `@playwright/experimental-ct-react` no longer exists.

The full `playwright` package publishes no install script, so `npm install` downloads no browser and
`CONTRIBUTING.md`'s promise holds despite "playwright-core, not playwright"; browsers arrive only
from `npx playwright install`.

Two scoping traps: `resolve.alias` is not inherited by inline projects, so each repeats it, or `@/…`
reads as a missing module; root `setupFiles` are inherited, and `vitest.setup.ts` is a jsdom patch
kit (no-op `ResizeObserver`, false `matchMedia`) that would override Chromium's real
implementations, so `setupFiles` is per project and `vitest.setup.browser.ts` carries only
jest-dom's matchers and cleanup. `@vitest/browser-playwright` peer-pins `vitest` to the exact
version, so they move in lockstep.

## The map is built in a callback ref, and `load` must not fire against a placeholder

`MapCanvas` builds the MapLibre instance in a callback ref: the element is not always there at
mount, React 19 runs the cleanup a ref callback returns, and `setState` in an effect is a cascading
render the lint rejects.

The style is resolved before construction. Built on a placeholder, `load` fires against it, yet
`load` is the only sign a worker started. `map-canvas.browser.test.tsx` waits for `load` on a style
with a GeoJSON source, parsed worker-side, under an explicit timeout; deleting
`public/maplibre/maplibre-gl-shared.mjs` is the negative control.

A theme swap is guarded against the style the map is showing, not the one it was built with:
`basemapStyle` returns the URL string for a configured `MAP_STYLE_URL`, so a built-with guard passes
light→dark and drops dark→light. The pin changes theme twice.

`lib/webgl.ts` detects WebGL2, because MapLibre v6 has no `isSupported()` and its constructor emits
an uncatchable `ErrorEvent` on a missing context.

## The install bundle's map variables are a separate job, in a repository this one cannot reach

`MAP_ATTRIBUTION`, `MAP_STYLE_URL*` and `MAP_TILE_API_KEY` are read here, but the shipped install
bundle lives in the product repository, and its `docker-compose.yml` enumerates each variable it
passes into the web container rather than using `env_file`, so that a compromised Node process
cannot read database credentials from its environment. A variable absent from that list is
unsettable by a self-hoster, whatever this repository's `.env.example` says, and every check here
passes regardless. A change spanning two repositories is two changes, so the bundle is a separate
job; the names to copy across are those in `lib/runtime-config.ts`, the only authority on what this
app reads.

## The picker's contract is its own, and MapLibre is configured to meet it

`components/sites/map-picker.tsx` sets `cooperativeGestures: true`, which covers the
one-finger-scroll, two-finger-pan, ctrl/⌘-wheel rules. Its screen fires on every blocked gesture,
plain wheel included, so `globals.css` hides it, the `locale` strings are emptied (MapLibre's
duplicate this app's sentence), and the picker hints on `cooperativegestureprevented` only for
`gestureType === "touch_pan"`.

`dragPan: { maxSpeed: 0 }` removes inertia, which moves the pin under a click. `clickTolerance` is
5; `doubleClickZoom` is off. `anchorFor` supplies `around`: the pin while on screen (longitude
folded by `nearestWrappedX`, since `Map.project` does not), else the crosshair. `keyboard: false`;
MapLibre's zooms about the centre.

`role="application"` is this component's element (tests select `[role="application"] >`), the credit
sits outside `MapCanvas` to survive its fallback, and MapLibre's canvas gets `tabindex="-1"`. A
`recentre` state set in render is applied in `useLayoutEffect`; listeners attach before the opening
jump; zoom state is seeded, not set (`react-hooks/set-state-in-effect`). `clampCenter` is absorbed;
`emit` still folds through `clampLatitude` and `wrapLongitude`.

## `lib/map-tiles.ts` does not exist; `lib/basemap.ts` bounds the picker and MapLibre owns the rest

`lib/map-tiles.ts` does not exist. `clampLatitude`, `wrapLongitude`, `MAX_LATITUDE`, `LatLon`,
`LatLonBounds`, `WORLD_CENTER` and `DEFAULT_TILE_ATTRIBUTION` are in `lib/basemap.ts`, which bounds
what the picker emits. `parseAttribution` and `AttributionPart` are in `components/attribution.tsx`
beside their one consumer, not in `lib/basemap.ts`: parsing a credit line is not basemap arithmetic,
and half of what reaches `Attribution` is the geocoder's credit. `project`, `unproject`,
`nearestWrappedX`, `clampCenter`, `visibleTiles`, `tileUrl`, `tileSrcSet`, `tileSource`,
`tileOrigins`, `needsDarkFilter` and the `TILE_SIZE`/`MIN_ZOOM`/`MAX_ZOOM` figures have no
successor: MapLibre owns projection, clamping and tile fetching, `resolveBasemap` is the one
resolver, and `basemapOrigins` is what `proxy.ts` derives.

`img-src` names no third party — `proxy.test.ts` asserts `'self' data: blob:` in all three basemap
configurations — because every tile goes through `connect-src` in both of MapLibre's modes; see "The
basemap is a MapLibre style, and raster is the escape hatch".

## A course fills a certification's fields in once, and never touches what the diver typed

Course and certification each carry their own `training_center`, `instructor_name`,
`instructor_number` and `agency`/`agency_other`, because imported history arrives
certification-first. Picking a course in the create dialog copies those fields once.

Rejected: split ownership (loses data on a standalone card, cannot express a referral); a read-time
fallback (ambiguous ownership); fill-only-if-empty (`agency` defaults to `padi`; course A's values
strand after switching to B); always replace (clobbers typing).

The copy replaces exactly the fields it filled; switching A → B empties what B lacks; clearing the
course unlinks and touches nothing. The agency pair is the exception — a course's agency is
optional, a certification's required — so a course naming none copies neither half and the form
keeps its own default. Rejected: blanking it, which would make the seeded "Add certification" the
one flow opening on an unset required field.

The edit dialog gets no prefill: `reset(...)` from the stored card makes every value baseline.
`name` and `notes` are not copied — a course name is not a card's level.
`lib/api/certifications.ts`'s comment holds: nothing derives these at read time. Unlike "A dive's
course is not inherited from the last dive", this runs only on the diver's own pick.

## A silently prefilled field is not a clean field

React Hook Form's `dirtyFields` cannot say whether the diver touched a prefilled field.
`setValue(field, value, { shouldDirty: false })` leaves it out of the map, but in react-hook-form
7.84 editing any field back to its default recomputes `dirtyFields` for the whole form from
`_defaultValues` against `_formValues` (`updateTouchAndDirty` → `getDirtyFields` →
`updateDirtyFields`). A prefilled field differs from its default by construction, so clearing any
unrelated box marks every prefilled field dirty and the prefill silently stops replacing them:
switching course A → B does nothing.

`CertificationDialog` therefore keeps `autofilledRef`, the values it last wrote into those five
fields, starting from the ones the dialog opened with. A field still holding that value is
untouched; anything else is the diver's and is left alone. Accepted: a field typed back to exactly
its opening value reads as untouched and takes the next course's value.
`certification-dialog.render.test.tsx` pins the `dirtyFields` failure mode so a later simplification
fails a test.

## "Add certification" lives in the card that lists them, and the card owns the create flow

The course page's certifications card carries the add button, in its header and empty state, next to
the list it changes. They are named differently ("Add certification", "Add the first certification")
because a screen reader's controls list is flat — see "Ten rows of 'Edit' name nothing".

The card owns the dialog because it fetches its own list in an effect and has no refetch seam; a
`refreshKey` prop or lifting the fetch to the page would work, but a create flow inside the card
makes the refresh a function call. That is also why the card takes the whole `Course` rather than a
`courseUuid`: the dialog wants the course's agency, training centre and instructor, which the page
has already loaded. Creating from here chains into the same `CertificationCardFiles` upload step and
refresh-and-re-point handoff the certifications page uses, because photographing the card is the
point.

## Operator prose describes the basemap, and a renderer sweep anchors on identifiers, not vocabulary

Operator-facing prose describes the basemap, not raster tiles: `README.md` names the basemap as the
second source `connect-src` is derived from; `SECURITY.md`'s out-of-scope list says "the basemap";
`.env.example`'s closing privacy note states the trade for whichever basemap is configured, bundled
one included; the privacy page says "basemap provider" throughout. The heading "4.4 Map Tiles"
stays: vector tiles are tiles, and several entries in this file pin it by number.

A sweep for a renderer change must grep for the identifiers the change deleted or renumbered
(`MAX_FIT_ZOOM`, `PLACED_ZOOM`, `unionBounds`, `nearestWrappedX`), not only for the subsystem's
vocabulary (`raster`, `maplibre`, `img-src`, `connect-src`, `tile`): sections written about what the
map does — how far it opens, what a pixel is worth — match none of the mechanism terms.

## jsdom answers no layout question, and the browser lane only answers one with the stylesheet loaded

jsdom performs no layout: `getBoundingClientRect()` is zeroed and `offsetWidth`/`offsetHeight` are
`0`, so `expect(box.left).toBeGreaterThanOrEqual(frame.left - 1)` passes vacuously against any
markup.

The browser project lays out but loads no stylesheet of this app's: `src/app/globals.css` is
imported by `app/layout.tsx`, which no test renders, so `h-40` is 0px and `flex` computes to
`display: block`. Put `import "@/app/globals.css"` at the top of every browser test that asserts
geometry. A zero box also silences code that measures one: MapLibre skips its container's first
resize observation unless the box differs from the one the map was built at, and treats a zero
height as no size rather than as a difference, so a stylesheet-less resize test can watch a map that
never resizes. A guard written as an absence (`getComputedStyle(el).filter` is `none`) fails on no
markup: put the regression back and watch it fail before believing it. A harness sheet may override
the app's — `map-picker.browser.test.tsx` injects
`[role="application"] { width: 512px; height: 256px }` unlayered in `beforeAll`, outranking
Tailwind's layers to fix client coordinates.

The bar is two conditions: the invariant is genuinely geometric, and its jsdom assertion would pass
vacuously; structural questions stay in the unit project. `CONTRIBUTING.md` links here but
deliberately names only WebGL2 as a reason for the lane.

## The element MapLibre owns carries none of this app's styling

`MapCanvas` renders two divs: the outer is the app's (`absolute inset-0`, any caller `className`, a
`grid`); the inner, handed to the `Map` constructor, carries nothing and fills the outer as its only
grid item.

`maplibre-gl.css` stamps `.maplibregl-map { position: relative; overflow: hidden }` on that element,
unlayered, and an unlayered declaration outranks every `@layer` at any specificity.
`absolute inset-0` there loses to `relative`: the container collapses to zero height and
`overflow: hidden` clips the canvas. The bare inner element gives a vendor rule nothing to outrank;
`min-height: auto` on a grid item resolves to zero for a scroll container.

Rejected: an inline style (outside the app's layout vocabulary; beats a caller's `className`); an
unlayered rule in `globals.css` (it must out-specify `.maplibregl-map`, then beats the next Tailwind
class the same way). `map-picker.browser.test.tsx` keeps only its 512x256 rule, plus a case that
measures the container against the surface.

## The site search has two sources, and only one of them names the dive site

`PlaceSearch` queries the geocoder and `GET /api/v1/dive-sites/suggest`, a read-only catalog, under
`Promise.allSettled`, because the combobox reads any `onSearch` throw as total failure. Catalog hits
come first; the `hint` slot, not a new `CreatableCombobox` prop, marks which is a site.

A pick is `{ kind: "catalog", site }` or `{ kind: "geocode", result }`, and `DiveSiteDialog` forks
on the tag, not on the namespaced row id. A catalog pick always fills Name; a geocoded one does not.
Location is `region, country`, never an ISO code; where neither resolved the field stays as typed,
so `adopt` takes `AdoptedPlace | null`. `suggestDiveSites` guards its own query length because the
combobox calls `onSearch` with `""` on open. Distance is computed here (`haversineMeters`,
`formatDistance`) so the unit preference holds. Catalog `attribution` joins the search credit, never
the map's. `DiveSiteMapField` passes the form's position whole or not at all; the endpoint answers
422 to half.

## A refused save has to be announced, and `role="alert"` alone does not do it

`FormApiError` renders its `role="alert"` region unconditionally, `sr-only` until it has a message,
then `text-sm text-destructive`. A live region that mounts together with its text is not announced,
so a conditional `<p role="alert">` looks right and says nothing. `sr-only` is `position: absolute`,
so the silent region costs no space in a `gap`-based flex column (`UnitsCard`, `NotificationsCard`),
where an in-flow empty `<p>` charges 16px. `form-api-error.browser.test.tsx` pins the out-of-flow
half.

`role="alert"` rather than `role="status"`: this blocks what the diver was doing, matching
`StatusMessage` minus its chrome. One component, not ten copies (eight dialogs on
`useDialogApiError` plus the two cards), because the markup drifts back to the conditional form. The
`accessibility-check` job cannot catch this: axe is a static snapshot analyzer, the job scans one
unauthenticated URL, and the step ends in `|| true`. The guard is a render test asserting the region
exists before the message, as `dive-file-import.render.test.tsx` does.

## Species photos are a plain `<img>` at the API, which is why the base URL had to be exported

Species photos are served without a token and rendered from a plain `<img src>`, not through
`hooks/useAuthedBlobUrl.ts`: that hook re-fetches on every mount, and the life list is two dozen
thumbnails. The bytes disclose nothing — the catalog is global and ownerless, a species uuid is no
existence oracle, the files are Commons images. The instance serves its own stored copy rather than
hotlinking, which would put a third-party host in the CSP and leak each viewer's lookups to
Wikimedia.

Hence the export: `<img src>` has no client to prepend the base, and composing against a literal
`/api/v1` works same-origin but breaks a split-origin build — which local dev is
(`NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`), so a correct photo URL there points at
`:8000`. `process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE_URL` lives in `lib/api-base.ts` beside
`apiCspSource`; `lib/api/client.ts` imports it. `img-src` lists `'self'` and `apiOrigin`; the
comment in `src/proxy.ts` and `src/proxy.test.ts` says every `<img>` points at this instance.

## `next/link` needs a `process` global in the browser test project

`vitest.setup.browser.ts` sets `globalThis.process ??= { env: {} }`. Next's client code reads
`process.env.__NEXT_ROUTER_BASEPATH` at module scope in `next/dist/client/has-base-path.js`; a Next
build inlines it to a literal, but Vite bundles the module as written, so a browser test rendering
`next/link` fails at import with `ReferenceError: process is not defined` — a failed import of the
test file, not a failed assertion, which reads like broken module resolution. It is the inverse of
the rest of `vitest.setup.ts`, which stands in for browser APIs jsdom lacks; this is a Node global.
An empty `env` is correct: every value Next looks for there is optional, and real ones would be
inventing build configuration. The jsdom project is unaffected.

## The row-height guard can only fail with the stylesheet loaded, and an assertion pins the import

`dive-detail-main.browser.test.tsx` pins that a species with no photo still reserves the thumbnail's
box — `SpeciesThumbnail` renders an empty div, never `null` — so rows stay level down the dive
card's table. Nothing about that is checkable in jsdom; the render test pins only whether an `<img>`
is present. The file imports `@/app/globals.css` and carries a third assertion whose only purpose is
to fail when that import goes: the row must be taller than a bare line of text, which is true only
with Tailwind loaded. Without it the two row-height guards pass with the collapse in the markup —
the vacuous pass "jsdom answers no layout question, and the browser lane only answers one with the
stylesheet loaded" describes. Rows are compared within a pixel, not for equality, because the
table's last-row border makes them 81 and 80.5. The all-rows-photo-less case needs two distinct
uuids: React keys two identically-keyed rows as one.

## The author and the operator are two roles, and one party may hold both

`/privacy` and `/terms` treat author and operator as two roles one party may hold, not two parties.
Authorship alone grants the project nothing, but every such sentence is scoped by "where the project
is not the one running this copy"; as operator, the operator's sections speak for it. The per-copy
framing ("this copy", "the operator of this copy") resolves on either kind of instance.

The pages announce no project-operated instance and nothing about aggregation or telemetry (new
collection owing its own disclosure). Terms §9 limits the author's liability and §10 indemnifies the
writing; neither transfers to the same party as operator, and the AGPL finding stands. No project
address is printed: the one that can act is the operator's, which the contact page reaches.

Claims to hunt are about identity ("a different party", "not parties to these Terms"), not servers;
read each section whole.

## Self-hosting is a capability, not the product's identity

Copy describes what the software affords — _self-hostable_, _yours to self-host_, _run it yourself_
— never "a self-hosted dive log", which tells a diver on somebody else's instance they are
self-hosting. So for `README.md`, `landing-page.tsx`'s `#features` card, `SECURITY.md` and
`generateMetadata()` in `app/layout.tsx` and `app/page.tsx` — every instance's tab title and link
unfurl, found only by reading metadata exports as prose.

The guarantee framing stays, re-pointed: anyone can run this and one click hands the log back, not
that _you_ run it. Spatial claims ("on your own server", "your own Postgres database") are out; the
durable promise is the export, true on anybody's hardware. Where deployment is the subject (the
_Self-hosting_ README section, install links) nothing changes. `SECURITY.md` routes vulnerability
reports, so its no-access sentence is conditioned on the operator not being this project. Who a
sentence talks to is fine; what it claims the reader _is_ is the defect.

## Errors are coral at hue 10, and the lightness is the load-bearing half

`--destructive` is `10 88% 42%` light and `10 100% 68%` dark; `--destructive-solid` is `10 88% 40%`
in both. Every other accent is warm-or-cool — `--coral` at 16, `--teal` at 180, `--pressure` at 265
— and a saturated hue-0 red beside them reads as imported. Hue 10, not 16: same family, still a
distinguishable pigment where they meet. They do meet (sign-in is `bg-coral`, delete is
`bg-destructive-solid`), and the collision is accepted: a destructive control that must be
unmistakable carries it in the label or a confirm step, as `ConfirmDialog` does.

The lightness is the load-bearing half. `text-destructive` is body text in `FormMessage`, every
per-field validation message; shadcn's 60.2% default is 3.76:1 on `--background` (AA fails), hue 10
at 42% is 5.5:1 there and 4.6:1 over its own `/10` tint. `StatusMessage` body text stays on
`foreground` at ~17:1: a passing token is no reason to spend contrast.

## Two points apart is a real gap, and nothing may encode the distance between the pair

The `--destructive` / `--destructive-solid` split exists because a colour tuned to sit behind white
text cannot also be read as text. In the light theme the two are two lightness points apart (42%
already carries white at 5.4:1); the split survives for the dark theme, where `--destructive` must
be light enough (68%) to read on near-black and so cannot sit under a white label. Nothing may
encode the distance between them: a token pair whose halves are tuned independently for contrast
drifts in relative lightness. A hover of `bg-destructive` over a `bg-destructive-solid` fill is
invisible on this pair, so both controls on the destructive toast are drawn in
`--destructive-foreground` at varying opacity — a white wash for `ToastAction`'s hover, `/80` for
the close button — which lifts in both themes. `bg-x/10` over `bg-x` is the pattern to look for.

## `ToastClose` uses tokens, and `--ceiling` is the only true red in the app

`ToastClose` uses tokens, not shadcn's
`text-red-300 hover:text-red-50 focus:ring-red-400 focus:ring-offset-red-600` — hardcoded palette
classes on a control small and faint enough to slip past a token sweep and a contrast scan.
`--ceiling` (`0 80% 55%`, the dive profile's deco ceiling) is the only true red in the app, on
purpose: red for a limit is every dive computer's convention, it is a chart stroke rather than UI
chrome, and the two never share a surface.

## Contrast figures are read off the rendered page, and computed colours are never parsed

Every destructive-token contrast figure is read off the rendered page, per _Verifying colour work_.
`ToastClose`'s glyph on the fill measures 4.1:1 light and 4.2:1 dark against a 3:1 bar; it sits at
`/80` rather than `/70`, which measures 3.4:1, clearing 3:1 with nothing in hand.

Two probe traps. Do not parse computed colours: Tailwind v4 emits an opacity modifier as
`color-mix(in oklab, hsl(var(--destructive)) 10%, transparent)`, and `getComputedStyle` returns
`oklab(0.725 0.144 0.093 / 0.1)`, which `c.match(/[\d.]+/g)` reads as RGB and turns a coral tint
into near-black. Paint the ancestor background stack onto a `<canvas>` in order and read the pixel
back. And a runtime probe can only measure class strings copied verbatim from the component:
Tailwind scans source, so `bg-destructive-foreground/15` does not exist when the component carries
`group-[.destructive]:hover:bg-destructive-foreground/15`. Where a state cannot be forced
(`:hover`), read the generated rule out of the served stylesheet.

## The brand mark is original, and marketplace artwork cannot ship here

The mark is three original bubbles (`components/logo.tsx`, `app/icon.svg`): a stock icon is neither
distinctive nor exclusive and smears at 16px. The same component is exported as `DiveIcon` where the
glyph means a dive; the lucide `Waves` in `dive-form-fields.tsx` and `dive-detail-sidebar.tsx` mean
water and stay. `CreateAction.icon` in `layout/header.tsx` is
`React.ComponentType<{ className?: string }>`, so `DiveIcon` needs no `forwardRef`.

Artwork under someone else's terms cannot live in this tree, notice or not: the tree is published,
so it is redistributed. Record provenance when it lands; a missing licence header is settled
upstream (`LICENSE.md`, fork chain, byte comparison). `NOTICE.md` covers the tree
(`icons/google-icon.tsx`, MapLibre's `.mjs`, the OpenFreeMap style JSON and sprite), not
`node_modules/`. `lib/basemap.ts` ships `DEFAULT_BASEMAP_ATTRIBUTION` and throws only when
`MAP_STYLE_URL` is set without `MAP_ATTRIBUTION`. Audit committed images with
`git log --branches --tags --remotes`, never `--all`, which walks `refs/stash`. The runner stage
copies `LICENSE` and `NOTICE.md` with `COPY --from=builder`.

## `main`'s history carries no licensed artwork, and the rewrite that keeps it out has costs

`main`'s history carries no purchased artwork: `coral.png`, `octo.png` and
`coral-reef-background.tsx` are removed from every commit with `git filter-repo --invert-paths`,
since a published repository publishes its history. Rewriting a commit destroys its signature, so
they are re-signed by the maintainer with committer set to author — GitHub verifies against the
committer identity, showing `unknown_key` otherwise. GitHub's merge attestation on them is
unrecoverable; later squash-merges are GitHub-signed.

`git filter-repo` removes the `origin` remote deliberately; "'origin' does not appear to be a git
repository" after a rewrite is that guard, so re-add it before pushing. After a rewrite, type-check
the branches it was not driven from: their imports of the removed path dangle unseen by the driving
branch's CI.

A bundle of the pre-purge refs is the only complete copy of the original history and holds the
artwork, so it has a shelf life. GitHub serves unreachable objects until Support runs `gc`.

## The hero's reef ships as a 19 KB mask, not the 318 KB SVG it came from

The landing hero's reef accent is a svgsilh silhouette under CC0, which permits redistributing the
file itself, as publishing this repository does. Provenance is in `NOTICE.md`. The download is a 318
KB autotrace that `svgo` and rasterising barely shrink, and none of that detail survives 280px at
25% opacity: it ships as a one-channel 512px mask of 19 KB. Measure a decorative asset at the size
and opacity it renders.

A CSS `mask-image` over `background-color: hsl(var(--teal))`, not an `<img>`, keeps the shape on the
token in both themes. `mask-mode: luminance` is required: the file has no alpha, and the default
`match-source` paints the whole box.

`assets/artwork/` keeps the original outside `public/`, so other derivatives stay possible when
svgsilh stops hosting it. `scripts/generate-reef-mask.mjs` reproduces the committed mask byte for
byte, same sha256; check that after any change; an approximating script is how the two diverge.

## The brand accents are their CSS named colours, and `--coral-solid` and `--teal-solid` do not exist

One coral, one teal, each its CSS named colour: `--coral` is `16 100% 65.7%` (`#FF7F50`, matching
`icon.svg`) and `--teal` is `180 100% 25%` (`#008080`). `--coral-solid`, `--coral-text` and
`--teal-solid` do not exist; `bg-coral-solid` does not compile. Tailwind's `coral` and `teal` keys
carry only `DEFAULT` and `foreground` (`tailwind.config.mts`; see _Correction: the service scale is
three brand fills now_).

The cost is contrast: coral text on white and white on a coral fill are 2.5:1 at the hero accent
word (`landing-page.tsx`), header nav active/hover (`header.tsx`), the dashboard stat label on
`group-hover`, the species card hover border, and, in both themes since both tokens are
theme-constant, the sign-in button and `AuthForm`'s submit. Teal is 4.8:1 on white and 3.4:1 on the
dark card, past 3:1 for graphical objects. `--destructive`/`--destructive-solid` keep their tuned
pair because that colour carries meaning. `code-quality.yml`'s axe step ends in `|| true`, so its
`color-contrast` violation fails nothing.

## `dives/(detail)/layout.tsx` owns the dive fetch, so a step keeps the page mounted

A dynamic segment is keyed on its param value, so a step under `dives/[id]` unmounts the page,
losing the dive `useResource` holds and the pager `<a>`'s focus. The fix is a route group above it:
`dives/(detail)/layout.tsx`, reading `useParams().id`, owns the fetch, header and delete flow;
`dives/(detail)/[id]/page.tsx` reads `DiveDetailProvider` for the card grid. The group leaves every
URL, `/dives/[id]/edit` included, unchanged. A step dims the grid (`opacity-50`);
`dives/(detail)/[id]/page.render.test.tsx` pins the dim, and no test reaches the step itself.
Rejected: `cacheComponents` (app-wide, and it keeps the route left, not the one reached) and
refocusing on mount (the skeleton would still flash).

The trip and course lookups outlive the dive, so each is stored with the uuid it resolved and read
only while the dive names it — keyed on `trip_uuid`, not the dive, so a step within a trip keeps the
row. `layout.render.test.tsx` holds the second `getTrip` unresolved to pin it.

## The adjacent-dive pager is two buttons on the title line, and the title row wraps on a phone

The adjacent-dive pager is `‹ Previous` and `Next ›`, two `outline`/`sm` buttons on the title's line
after the dive number, opposite Edit and Delete, not chevrons inside the date subtitle, which read
as punctuation and split on wrap. The back link's row is rejected: right-aligned there, `Next ›`
sits one button-height from `Delete`, the control never hit by accident. The title row is
`flex-wrap` for five-digit numbers on a phone. `PageHeader` has a `nav` slot and stacks its title
row below `sm`; `subtitle` stays `ReactNode` for `DetailPageSkeleton`. Labels are fixed words, never
the neighbour's date: neighbours arrive by a second request while the component stays mounted, so a
derived label would empty mid-click. The date rides `aria-label` and `title`
(`Previous dive: #11, Apr 3, 2021`), the visible word starting that string (WCAG 2.5.3), inside a
`<nav aria-label="Adjacent dives">`. `dive-neighbor-nav.tsx` exports `DiveNeighborNav`; the subtitle
is plain text from `formatDiveStartTime`.

## Admin is superuser routes and web pages, not a panel

`/admin` is a superuser-gated section of this app over superuser-gated API routes, not an admin on
the API (CRUDAdmin, starlette-admin): with no passwords (bearer token in memory, single-use
`SameSite=lax` cookie) a browser navigating to the API origin carries nothing it recognises, and a
page here already holds one.

`app/admin/layout.tsx` runs `useAuthGuard` and renders `NotFoundState` for a non-superuser; the
API's router-level dependency is the gate, `User.is_superuser` reads as false when absent. Nothing
outside `app/admin/` and `components/admin/` imports them; `lib/admin-isolation.test.ts` enforces
it. Copy says what the queue holds, never the registration policy, since the routes work on open
instances. The batch toast counts `POST /admin/invitations`'s outcomes (`invited`,
`already_registered`, `already_invited`, `mail_failed`), never the selection; `mail_failed` reads
"created but not emailed", the row being committed. Selection is per page and cleared with it. The
bundle's Caddy `@api` matcher names `/admin*`, sending a bundled install to the API until the bundle
repository drops it.

## The landing hero holds one of two forms, and the API is what says which

Registration mode is `open` or `invite`; the hero holds `InviteRequestForm` in `invite` and
`AuthForm` only in `open`, since sign-in there ends in refusal. The mode comes from `GET /config`
via `useInstanceConfig`, not this container's environment: a mirrored variable is a server fact the
web cannot check, `runtimeConfig()` (`lib/runtime-config.ts`) is memoised per process, so a flip
restarts the web too, and the bundle hands this container a curated variable list. Rejected: a
`PublicConfig` field fed from a web-side `REGISTRATION_MODE`.

The fetch shares the auth bootstrap's gate, so the hero never swaps forms. A failed fetch resolves
`mode: null` and sign-in renders, which works anywhere and is what the API-less axe scan in
`code-quality.yml` sees. The mode is not stored in the browser: every key is registered in
`lib/storage-keys.ts` and named on `/privacy` §10, and a `public, max-age=60` response earns none,
so a flip shows within a minute.

## The invitations card learns the registration mode from a 404, and knows nothing else

`InvitationsCard` never asks the instance's mode: `GET /user/invitations` answers `404` on an `open`
instance, and the card maps that to `absent`, returning `null` like `SessionsCard` and
`PasskeysCard`. Not `useInstanceConfig`: a second source could disagree with the API; the 404 rides
a request made anyway.

A send prepends the row `POST /user/invitations` returns rather than re-reading; a revoke re-reads,
since `revoked_at` is the server's. Refusals show verbatim in the form's error slot, not a fading
toast. Only this list is paginated, since only invitations grow uncapped; "Show older invitations"
fetches the rest. Appending dedupes by uuid: offset paging over newest-first ordering means a
prepended row, local or another tab's, shifts page 2 onto page 1's last row, so a plain append
renders it twice under one key. `fetchAllPages` in `lib/api/client.ts` carries the same `keyOf`
dedup; the gap a removed row leaves cannot arise here, since a revoke never deletes.

## `Course` has no `cost`: money is modelled once, and a course references it

`Course` has no `cost`: the free-text field is gone from the `Course` and `CourseCreate` types,
`courseSchema`, `CourseDialog` and the `/courses/[id]` info list. Cost is cross-cutting — gear has a
purchase price, a trip a bill, a fill a price — and needs a currency, an amount and a display
convention shared across models, which one string on one model cannot grow into; its own
`FormDescription` ("Whatever you paid, in whatever currency you paid it") argued for its removal.
This is not scaffolding for money handling: when the app models money it does so in one place, and a
course references it rather than carrying a copy. No currency helper exists in `src/` —
`lib/format.ts` exports `formatFileSize` only.

## The `""` → `null` contract belongs to no particular field, and is pinned on `instructor_number`

`course-dialog.render.test.tsx`'s _"sends an explicit null for every field the diver cleared"_ is
written around `instructor_number`, not cost. The contract is `onSubmit`'s mapping: `""` is the
form's "not set" state for every optional field, and an omitted key leaves the stored value alone,
so a cleared field must PATCH `null`. A test whose subject is a mechanism can be filed under
whichever field demonstrates it; read what a test asserts before deleting it with the field it
names, or the suite stays green while coverage of something live disappears.

## A course field's removal reaches outside `components/courses/`

`Course` object literals live wherever a course is selected, not only where one is edited —
`course-certifications-card.render.test.tsx` and `certification-dialog.render.test.tsx`, the latter
under `components/certifications/` because that dialog picks a course. A bare word search for `cost`
is near useless here, since the comments argue about what things cost; anchor on the identifier and
the label:

```bash
git grep -nI -P '(\.cost\b|(?<![\w-])cost\s*[?:]|"cost"|(?<![\w-])Cost(?![\w-]))' -- src README.md
```

The two expected hits are prose in `dive-detail-main.tsx` and `lib/dive-profile.ts`; anything else
is a course-cost site. `gear-service-record-dialog.tsx`'s
`placeholder="Parts replaced, cost, test pressure..."` is a service record's free text and stays.
`README.md`'s courses bullet must not name cost.

## The profile read shape speaks DiveJSON, and the export speaks the same vocabulary

Series come from `GET /dive/{uuid}/recording/{rid}/profile`, serving `RecordingProfileRead`
(`DiveProfileRead` plus `provenance`); the export carries them as `ExportRecording.profile` and the
dive detail summarises on `recordings[].profile`. Both surfaces speak DiveJSON's vocabulary —
`DiveProfileRead.duration` and `.pressures`, `DiveProfileSeries.times` and `.values`,
`DiveProfileEvent.time`, plus `DiveProfileInfo.duration` and `DiveGasUse.duration`, renamed for
consistency, both meaning the profile's span. Rejected: export-local schemas on the API, two
vocabularies forever.

`duration` is overloaded: `Dive.duration` is the logged length, the others the profile's span, which
runs longer; comments in `lib/api/dives.ts` say which. `gasAttributionNote` reads
`DiveGasUse.duration` from `schemas/dive.py`, not the profile schemas. Events past `duration` are
not clamped (spec §6.4); clipping is the chart's job. `ChannelSeries` in `lib/dive-profile.ts` keeps
`t`, being the chart's shape, not the wire's.

No CI job runs both repos (`CONTRIBUTING.md`, _Changes that span both repos_) and they deploy
independently, so a cross-repo contract break lands on the hosted instance in halves, minutes apart;
sequence it API first, web second.

## The `GET /export/divejson` row is three edits, and prose carries no row count

The `GET /export/divejson` row is three edits: a `"divejson"` member on `ExportFormat`, an
`EXPORT_EXTENSIONS` entry that `Record<ExportFormat, string>` forces, and an `EXPORT_ROWS` entry
nothing forces (a mis-wired row type-checks), so `export.test.ts` asserts every union member's route
and the render test pairs each row with its segment. DiveJSON sits first, being the project's own
format. Each row's copy states its difference from the others, a sentence about what one format
lacks being a claim about every other row. Prose drops counts that are not load-bearing —
`dives/page.tsx`, `sites/page.tsx` and `trips/page.tsx` say "the export card's Downloads" — and
load-bearing ones (`export.ts`'s "the four shapes `/export/*` serves") sit beside their list.
Probes: `git grep -w three` in `src/`,
`grep -nE "three (Download|button|export|row|format)|all three" DECISIONS.md`, and
`git grep -niE "export|portab" -- src/app/privacy/`, whose copy names no format.
`lib/api-proxy.test.ts` and `lib/download.test.ts` use `.uddf` as a generic `Content-Disposition`
filename: classify per line, not per file.

## An unknown UTC offset is a third state, and `new Date()` never sees an offset-less string

`Dive.start_time` may carry no offset (`utc_offset_minutes` NULL): wall clock recorded, instant
unknown. ECMAScript parses an offset-less date-time as local, so `shiftByEmbeddedOffset` appends `Z`
first and returns `offsetMinutes: null`; `parseUtcOffsetMinutes`'s `null` survives,
`combineStartTime` writes no offset, `formatDiveStartTime` prints no zone. Nothing the form sends
carries an offset the diver did not choose.

`UtcOffsetSelect`'s "Not recorded" is `allowUnknown`-gated — offered only while the value already
lacks an offset, since the API refuses an offsetless `start_time` on a dive that has one.
`validations/dive.ts` requires the offset in `dateTimeField()` (`diveCreateSchema`) and not in
`updatedDateTimeField()` (`diveUpdateSchema`); the server applies the stored-offset rule, refusing
with a flat 422 `{"detail": "<sentence>"}` read via `getApiErrorMessage`.

`/dives/next-number` and `renumber-dives-dialog.tsx`'s `from_start_time` name an instant and keep
the browser's offset. Mocking `getTimezoneOffset()` cannot catch a parsing defect, so the regression
tests round-trip a naive string and fail in every zone.

## The logbook import card renders a plan, not a result, and the two are one shape

Import is `POST /import/logbook/preview` then `POST /import/logbook` with the same file and the
preview's `token`; `DataImportCard` renders both reports through one `ImportReportView`, so an
approved plan and its result are comparable. The file stays in state beside the token because the
API re-hashes the body and refuses a token minted for other bytes.

"About the original file" renders `ImportReport.conversion`, omitted when `conversion` is `null`.
`restored` keeps its own column, never folded into `created`: un-deleting is the number a backup
restore came for. Notes are a persistent list, never a toast; a non-zero `notes_truncated` marks the
list a prefix and says the counts are not.

A bare document's `not_contained` files are expected, so `noteIsWarning` excludes
`file_not_contained` and `fileRestoreHint` says to import the archive.
`record_remapped_references_follow` and `record_remapped_references_stay` are two sentences, one per
contract. An unrecognised code is information, not a warning — the `certificationAgencyLabel` and
`collectionLabel` stance.

## A sentence about what one format lacks is a claim about all of them, and import keeps proving it

A sentence presenting portability as one-way is half a statement, and none contains "import" to grep
for. The API reads every format its `divejson` converter reads, so the landing page's three-up strip
stays "one click" with import stated in the paragraph above, and the export card's rows say which
formats come back (all but CSV). A rationale comment naming a format is copy and belongs in the
sweep.

`app/privacy/` is the blind spot: its claims name no format. Five groups — Settings capability lists
(§6.1, §6.2, §13), rate-limit disclosures (§2.2), species-picker trigger claims (§4.6; the import's
species pre-pass needs no picker), closed counts of how coordinates arrive (§2.3, §4.4), how stored
files get here (§2.1). Probe the directory, since `page.test.tsx` pins sentences; treat the count as
a floor:

```
git grep -niE "export|portab|species|coordinat|GPS|location reaches" -- src/app/privacy/
```

`settings/page.tsx`'s "the four rows each" counts `DataExportCard`'s rows, not the sibling import
card.

## The import picker mirrors the converter's formats, and everything else about them is tolerant

`LOGBOOK_IMPORT_ACCEPT` is computed from `LOGBOOK_IMPORT_SOURCE_EXTENSIONS`, a
`Record<ImportSourceFormat, readonly string[]>`, so a format added to the union without an extension
fails to compile; `logbook-import.test.ts` restates the map as an independent literal `satisfies`
the same `Record`.

The only lockstep part: the API's list comes from `divejson.read_formats()`, which a Renovate bump
moves, so a reader can reach the import card before this repository names it. `conversion.format`
renders through `importSourceLabel`, falling back to the id until a label exists (`suunto_xml` is
`"Suunto DM5 XML"`); `conversion.groups[].kind` is an opaque string (`conversionKindTone` reads it
as information, `conversionKindLabel` de-snakes it); the picker alone does not widen — a new format
is unpickable until its extension lands.

Nothing in the browser parses a dive file; the API groups findings by `(kind, message)` through the
converter's `grouped()`, and this side owns only presentation, including the "and N more" count
(`count` minus the three `wheres` sent).

## "The original file is kept" is a claim about an upload to a dive, not about an import

A logbook read through the API's DiveJSON converter is discarded after conversion; only the
full-export archive path writes a dive-file row. Every sentence promising the original file back is
scoped to a file uploaded **to a dive** — `README.md`, `privacy/page.tsx` §2.1, `layout.tsx`'s
metadata, the landing page's "Built to outlive the vendor" band.

The tagline drops the promise rather than qualifying it, taking the front door's "vendor exports in,
open formats out, everything in one click"; punctuation is per file, only the claim travels.

The probe anchors on the noun, because Prettier wraps JSX prose across lines:

```
git grep -niE "(original|dive-computer|source) files?" -- src README.md
```

Hits that stay: the README's _Dive-computer import_ bullet, the landing page's **Computer Import**
card, the import card's _About the original file_ heading. A cardinality claim beside the promise
(§2.1's "one per dive"; a dive holds one recording per export) shares no vocabulary with it; sweep
for the count separately.

## A fixture meaning "in the future" is derived, never written down

A fixture whose role is "a date `Date.now()` has not reached" cannot be written down.
`goodbye/page.render.test.tsx` pins `GoodbyeContent`'s not-yet-purged branch with

```ts
const ahead = new Date();
ahead.setUTCDate(ahead.getUTCDate() + 30);
ahead.setUTCHours(12, 0, 0, 0);
```

and reads the expected month and year off `ahead`, never a hardcoded name. Past-facing literals like
`"2020-01-01T12:00:00Z"` stay.

Injecting the clock is the stronger fix: `certificationExpiryStatus`, `certificationRenewals`,
`serviceStatus`, `worstServiceStatus` and `formatServiceDue` take `today` as a trailing parameter
defaulting to `todayIsoDate()`. Their component call sites omit it, so a render test there is
written against the real clock;
`git grep -nE "new Date\(\)|Date\.now\(\)|todayIsoDate\(\)" -- 'src/**' ':!*.test.*'` lists every
place that reads it.

Timezones are a separate axis: run `TZ=UTC`, `TZ=Pacific/Kiritimati` and `TZ=Pacific/Midway`.
Offsets span −12 to +14, so no instant is the same calendar day everywhere. An asserted day is
derived from the fixture through `localDay()` in `test/local-day.ts`, which spells out
`toLocaleDateString("en-US", { year, month: "short", day })` rather than reusing `formatDateTime`.

## A cylinder may record a mix with no vessel, and three fields are `number | null`

`DiveMixture.volume`, `.oxygen` and `.helium` are `?: number | null` in `lib/api/dives.ts`: a UDDF
`<tankdata>` without `<tankvolume>` is a real cylinder. ESLint has no type-aware rules, so a wrong
type compiles clean; `toDiveMixtureInput` and `normalizeMixtures` convert at the boundary.

Blank means blank on import; the manual path keeps its prefill. `mergeMixture` in
`lib/dive-import.ts` has no `DEFAULT_MIXTURE` tier; that default lives only on "Add Mixture".
Defaulting everywhere invents a number for a stored NULL; blank everywhere makes air divers type
`21` and `0`. `MixtureValueSource` reports only `"form"`. `""` is the cleared spelling, never
`undefined`, which react-hook-form refills, via `UnitNumberInput`'s `emptyValue`.

`gasUseUnavailableReason` in `lib/dive-gas.ts` mirrors the guard order of `compute_gas_use`,
`compute_multi_tank_gas_use` and `compute_parallel_gas_use`, placing "Add this tank's size…" and its
siblings where each checks the volume. `diveModWarning` skips an unanalysed cylinder rather than
falling silent; `isSingleGasParallelSet` refuses a set whose first cylinder has no oxygen.

## The dive form hides fields by account preference, and what is stored is the hidden set

`user.dive_form_hidden_fields` names the fields a diver keeps off the dive form; `dive_form_preset`
rows are named sets of the same. Both live on the account, not the device, and the user record
carries the set, so the first paint omits them.

Storing the hidden set makes a new field visible under every preset and "Technical" the empty list.
A preset is a snapshot: applying one copies its `hidden_fields` into the account state, later
toggles change the state only, and the Fields menu marks the preset whose set equals the stored
state. Equality is a list comparison because the API canonicalizes every write;
`canonicalHiddenFields` in `lib/dive-form-fields.ts` does the same before every `PATCH /user`.

Hidden means not in the DOM: the `FormField` is not rendered. react-hook-form's default
`shouldUnregister: false` keeps the value and validates it, so a hidden field is submitted as a
visible one.

## "Untouched" on the new dive form is the visibility layer's own record, never dirty state

Showing a hidden field fills it with what the last dive carried; hiding an untouched one empties it;
a typed field keeps its value. App's guess or diver's is not react-hook-form's `dirtyFields`: it is
recomputed from `_defaultValues`, and `useFieldArray().replace()`, the only write for `mixtures`,
writes `_formValues` instead, so a show-fill reads as dirty.

`useDiveFormVisibility` keeps `CertificationDialog`'s `autofilledRef` rule: per key, the last value
it wrote itself, and a key still holding it is untouched — typing back the carried value reads
untouched, accepted. `resetField(name, { defaultValue })` is not the write: it acts only on a
registered field, and a key hidden at page open is not. The write is `setValue` or `replace`.

The cylinder list is one value: typing into any tank keeps every column; per-cell would empty
neighbouring columns. `useSuggestedDiveNumber` guards on `getFieldState("dive_number").isDirty`, not
form-level `isDirty`.

## Four moments put a hidden field back on screen, and the prefill is not one of them

A value from outside the diver's typing reveals its field for that form only, leaving the stored
set. Each ends in `revealNonEmpty` or `reveal`: the edit form's load (`diveToFormValues` via
`onLoaded`); a parsed dive file (`DiveFileImport`'s `onValuesApplied`); a gear set with a weight
(`DiveGearField`'s `onSetApplied`); the new form's mount for a URL trip, site or course, since Basic
hides `course_uuid`.

Non-empty means not `undefined`, `null`, `""` or `[]`; `0` is a value. The last-dive prefill touches
only visible keys. A revealed key is the diver's, so hiding keeps its value.

A failed submit reveals too: the resolver validates hidden fields, so `handleSubmit`'s invalid
branch reveals every erroring key and focuses the first hidden one, else the save blocks with no
`FormMessage`. `SpeciesMultiSelect` clears its pending report on unmount (a mount-only effect
reading `onPendingChange` via a ref), else hiding Species mid-resolve sticks the submit.

## Persisting a Fields toggle must not reset the form, and `refreshUser` would have

Settings cards persist by `updateProfile` then `refreshUser()`, which replaces the context's `user`
object. Wired that way, a Fields switch re-runs the new-dive prefill, refetching the last dive and
re-stamping `start_time` with `nowStartTime()` under a diver mid-edit.

Two changes, both needed: the prefill effect is keyed on `user.uuid`, not the `user` object, and
`AuthContext`'s `mergeUser` folds what a successful `PATCH /user` stored into the cached user with
no request. `refreshUser` stays right for a settings card, where nothing is mid-edit. The suite pins
the invariant: persisting a toggle never resets the form, re-runs the prefill or refetches the last
dive; anything added to that dependency list must be a value, not an object.

The write is debounced and flushed on unmount, so three switches are one request and a
flip-then-leave still saves. `SAVE_DEBOUNCE_MS` in the hook is the figure's only home.

## The Fields control is a menu with a dialog behind it, and neither is in the form

The control is positioned into the title row (`absolute inset-y-0 right-0`, `type="button"`), as
`EntryUnitLabelRow` does, so the header's height ignores it.

The menu applies presets; Configure opens a dialog of switches and preset housekeeping. A failed
`PATCH /user` toasts from `useDiveFormVisibility`'s `flush`. Escape belongs to the dialog: Radix
listens on `document` in the capture phase.

"Save as" is one name plus Save: an unmatched name creates, a match replaces; not
`CreatableCombobox`, which commits on blur. The trigger reads `Fields: <preset>` or "Custom", so
`useDiveFormPresets` fetches on mount. Neither surface is inside the `<form>`; the name prompt uses
`dialogFormSubmit`. `onOpenAutoFocus` focuses the content container, not the first control.

A switch shows the effective state and edits the stored one. Depth's entry-unit toggle follows the
first visible depth field; pressure's renders only while Gas Mixtures and a pressure box are on
screen.

## The Fields dialog is switches, and it is the sections that share the columns

Rows are `@radix-ui/react-switch`: a field being on the form is a setting, not a selection. On is
`bg-teal`, not `bg-primary`, which is near-black in light and mid-grey in dark, so both states read
grey. Off is `bg-muted-foreground`, not `bg-input`, which the `bg-background` thumb barely separates
from.

Always-shown rows are switches too: on, disabled, named, not `aria-hidden`; `page.render.test.tsx`
reaches the duplicated "Duration" and "Start time" by role.

Section switches are rejected: ARIA forbids `aria-checked="mixed"` on `role="switch"`, so a part-on
group cannot be one.

Each section is one column; from `md` up sections flow through CSS multi-column with
`break-inside-avoid`, since a grid leaves short sections in holes, with margin per section rather
than `space-y-*`.

Groups keep form order, so a diver finds a field where they would look for it;
`DIVE_FORM_FIELD_GROUPS`' doc states the rule. `mixtures` leads its group via `LEADING_GROUP_FIELD`
in the dialog, and a test pins that order.

## `DIVE_FORM_FIELDS` is a fifth hand-kept vocabulary mirror, guarded from both ends

`lib/dive-form-fields.ts` mirrors the API's `DiveFormField` enum, beside `GAS_ROLES`, `WATER_TYPES`,
`GEAR_TYPES` and `TANK_USAGE`. The API validates a hidden set as `list[DiveFormField]`, so a typo is
a 422, not a silently un-hidden field.

The guard is two-sided: the API checks each value names a non-required field of `DiveCreateRequest`
or, under `mixture.`, `DiveMixtureCreate`; this side checks the mirror equals the optional keys of
`diveCreateSchema` and `diveMixtureSchema` minus `NON_HIDEABLE_MIXTURE_SCHEMA_KEYS` (`volume` and
`oxygen` are what a cylinder is; `id` and `gas_number` have no input). Optionality is
`safeParse(undefined)`, not `.optional()`.

A hidden helium is `0`, not blank: `mixture.helium` is hideable (no helium means air) and clears to
`0` since `gasName` refuses a mix with unknown helium. So `revealsField` requires non-empty and
unequal to `EMPTY_DIVE_FORM_VALUES[key]`; `NON_BLANK_EMPTY_FIELD_VALUES` names the exception, tested
directly, not through `nonEmptyDiveFormFields`.

Keys are stored data, so renaming one is a migration. The registry (label, group, empty value per
key) shares the module, so one test covers completeness.

## The request form speaks in two voices, and only `GET /config` can pick the second

`GET /config` carries `project_operated`, `true` only where the project operates the instance, and
`InviteRequestForm` takes a `variant`. `generic`, the default, is true of any household instance;
`waitlist` ("Get early access", "You're on the list") is the project speaking as operator, which
`/privacy` allows.

`landing-page.tsx` picks `waitlist` only on the literal `true`; `false`, a `/config` lacking the
key, and a failed fetch stay generic: that voice is true everywhere, the waitlist voice on one
instance. `landing-page.render.test.tsx` stages all three.

Rejected: operator-configurable copy (four strings that must agree, unreviewed prose, a sanitisation
surface, one operator) and a web env var or hostname sniff, a mirrored server fact, silently wrong
when the host moves.

The variant is a prop decided once, so `invite-request-form.render.test.tsx` pins both voices
without the hook; `useInstanceConfig` returns the whole body, `null` when unknown. The sign-in line
names accounts and invitations only; the operator has the install guide.

## An icon button's name is also its hover hint, and one string is both

`IconTooltip` (`components/ui/tooltip.tsx`) takes one `label` and emits it as the child's
`aria-label` and a hover chip. Call sites never set `aria-label`: a hint and a name that disagree
fail WCAG's Label in Name.

`@radix-ui/react-tooltip` supplies the portal that `overflow-x-auto` rows need. The provider is per
`IconTooltip` so component tests need none, at the cost of `skipDelayDuration` grouping, at 300ms.
`aria-describedby={undefined}` on `Tooltip.Trigger` stops the name announcing twice. It renders no
element of its own (`asChild`).

A press is not a hint request: `hooks/useDragSort.ts` focuses drag handles from `onPointerDown` and
focus opens instantly, so `IconTooltip` sets Radix's pressed flag in the capture phase and vetoes
the focus open with `preventDefault`; refusing from `onOpenChange` leaves the delay window open.

Inside a dialog the first Escape closes the hint, not the dialog: the tooltip is the higher
dismissable layer, and the APG gives Escape to it. `tooltip.render.test.tsx` pins both.

## Icon button hints: The guard is structural, reading the source rather than the DOM

`components/icon-button-hints.test.ts` reads the source, not the DOM: a `<Button>` or `<button>`
whose children render no words may not declare its own `aria-label`. A missing hint has nothing to
query for, so the shape in the source is the only checkable thing. The test blanks comments before
scanning, so an apostrophe in a comment cannot swallow an element. "Renders no words" is narrow:
children count as text if they hold a bare text node or any expression other than a choice between
JSX elements, so `{isBusy ? <Loader2 /> : <Trash2 />}` is an icon while `{label}` is not. That
leaves `entry-unit-toggle`, `data-export-card` and `dive-form-fields-menu`, whose `aria-label`
overrides visible text on purpose, untouched.

## A mocked `useToast` returns one `toast` for the file, or the card refetches forever

`GearServiceCard`'s mount effect lists `toast` in its dependencies — safe against the real hook,
whose `toast` is module-level, and an infinite fetch-render-fetch loop against a mock returning a
new function per render. `gear-service-card.render.test.tsx` mocks `useToast` with one `toast` for
the file, never one per call.

## A dive has recordings, and the first one is primary, picked only by `primaryRecording()`

A dive has `recordings`, an ordered list in which ordinal 0 is primary: its files write the dive's
oxygen-exposure readings, its profile opens the chart, and its samples go into the UDDF export.
`primaryRecording()` in `lib/dive-recordings.ts` is the one place that picks it, rather than an
`[0]` per card. `diveRecordings()` normalizes two facts rather than trusting the call site: the list
is absent, not `[]`, on a list row and on a cached detail payload (the same `?.` discipline as
`species`), and it is sorted by ordinal here even though the API documents the order, because a card
reading `recordings[0]` would otherwise be one response shape away from drawing the wrong device's
figures. A recording is one machine's record of a dive and can hold several files — a Suunto app
JSON beside the same watch's FIT — each filling what the other left blank.

## The dive form holds a _list_ of pending files, and the server decides where each one lands

Both dive pages hold `PendingDiveFile[]` — id, `File`, token, device label — and attach them after
the save, in pick order and one at a time. Serial rather than `Promise.all`, because the API decides
per file whether it joins a recording the dive already has or starts a new one; two attaches racing
would make that depend on which request arrived first. The client never says which recording a file
belongs to, and no prop lets it: the same-recording test compares device, start, sampled span and
the device's counter server-side, over the bytes. The one thing the client decides is what to do
about a match against a different dive, which is the diver's question (`DiveFileImport`'s match
dialog).

## Deleting a stored file re-reads the dive without `useResource`'s `refetch`

Re-reading the dive on the edit page goes through `divesAPI.getDive` and `setResource` by hand,
never `useResource`'s `refetch`. `refetch` re-runs `onLoaded`, which on that page is `resetFromDive`
→ `form.reset(values)`, so a diver's unsaved edits vanish with no error. Re-reading rather than
predicting is right wherever the server changes more than one row: a recording's profile is
re-derived from the remaining files, the recording goes with its last file, and the dive's readings
follow the primary.

## A second file of one recording fills the form, and never overwrites it

`applyParsedDiveToForm` takes a mode: `"prefill"`, for a dive's first file, writes everything it
carries; `"fill-only"`, for every later one, writes only fields the form left empty. The caller
picks `"fill-only"` when another file is already pending or stored, or the API reports a
same-recording match on the dive being edited. Only here can the rule hold for `avg_depth` and
`duration`: every other field is filled server-side at attach under the API's NULL-only rule, but
those two are the form's and no attach path writes them. Emptiness is `isDiveFormFieldEmpty`: a
cleared number input reads back `NaN`, and `0` is a reading (a freedive's `max_depth`), so falsiness
is wrong. Cylinders go through `fillMixture` (`lib/dive-import.ts`), form first, file into the
blanks; pressures move as a pair, and a file with a different cylinder count replaces nothing, since
position is the only pairing signal. A fill returns no `MixtureImportNotes`, having guessed nothing.

## A blank cylinder member survives an attach, and the card must not assume otherwise

A second file of one recording fills the dive's blank mixture columns, but the join is
all-or-nothing: the files must describe the same number of cylinders and agree on every fraction
both record, or nothing is filled. So `oxygen` can legitimately stay NULL after a FIT is attached
beside a JSON. `DiveMixturesCard` handles that — `mixture.oxygen != null` through `RecordedCell`,
and `gasName` returns null on the same input so the badge stays empty — and must keep doing so; an
empty cell after an attach is the join declining, not the UI failing.

## One chart and a switcher, never two curves on one axis

`DiveProfileCard` draws one recording at a time, with a button per recording on a dive that has more
than one. Two depth traces on one axis, each with its own pressure family, is a legend problem, and
the question a diver asks is what this computer saw. The selection is held by uuid, not index:
deleting or promoting a recording reorders the list, and an index would silently point at another
device's curves. It falls back to the first charted recording when the chosen one is gone. Only
recordings with samples get a button, since one without answers 404 at
`GET /dive/{uuid}/recording/{rid}/profile`.

## Merge offers the two neighbours, and says what it does not combine

`DiveMergeAction` in the dive page header offers exactly the dives from
`GET /dive/{uuid}/neighbors`: a computer that surfaced briefly logs one dive as two consecutive
ones, and a second computer's record sits in the same place, so candidates are never more than one
step away. It renders nothing on a dive with no recording, since the API refuses to merge a
hand-entered dive. The dialog says two things the word "merge" hides. Which dive survives is the
server's answer — the earlier by the match gates' clock rule — so the action navigates to whatever
comes back; the losing uuid is soft-deleted and would 404. And the oxygen-exposure readings are not
combined: CNS and OTU are the device's running accounting, and the API leaves `cns_end` as it is.

## The neighbours go stale without the uuid changing, so the page carries a reload token

The pager and `DiveMergeAction` both fetch `GET /dive/{uuid}/neighbors` keyed on the dive's uuid,
which is right for navigation but blind to a merge this dive survives: the absorbed dive stops
resolving while the uuid on screen stays the same, so both would keep offering it — a second merge
failing, or a live arrow bouncing the diver to `/dives` with a load error. Repairing a three-part
split takes two merges in a row, so this is the ordinary path. `neighborsToken` in
`dives/(detail)/layout.tsx` is bumped beside `refreshDive` and read by both; the page owns it
because only the page knows the event happened, and a signal reaching one component repairs the
dialog and leaves the arrow. Hoisting the neighbours themselves to save the second request is
rejected: it would rewrite the pager's uuid-keying and the dead-until-known states a keyboard diver
depends on.

## A recording with no files says so, and which kind of nothing it is

A recording can carry samples and no downloadable file: what logbook import builds from a converted
document, and what a merge of two such recordings leaves. `noFileKeptSentence` gives it a row of its
own; a device silently missing from the file list looks like data loss. Which kind it is comes from
`DiveProfileInfo.provenance` (`file`, `divejson_import`, `merge`), because the recording's shape
cannot say: `files` is empty either way. It is the profile's fact, not the recording's; the API
publishes a closed enum rather than the open-ended `dive_profile.parser_key`; and the sentence has a
fallback with no provenance, for an import that carried a device but neither profile nor files.
`DiveProfile`, the recording profile route's shape and `DiveProfileChart`'s prop type, deliberately
omits the member: a chart has no business requiring provenance. In `DiveRecordingsCard`, a file-less
recording is the only one offered a whole-recording delete, since the per-file route needs a file.

## `step` is a claim about the column, and a wrong one cancels the save in silence

`<input type="number" step="0.01">` declares every value a multiple of a hundredth, and the browser
enforces it: a mismatch is `stepMismatch` and cancels the submit outright. So `step` is only correct
where the column has that precision; `avg_depth`, `weight` and the mixture numbers are `Float`
columns nothing rounds: UDDF yields `2.70000029`, a pound weight commits as 5.9 kg,
`UnitNumberInput` holds "30.526" mid-word until commit, and FIT passes `float(oxygen)` through. No
caller declares a step. `UnitNumberInput` derives it from the dimension (whole units in imperial,
else `isIntegerDimension` answers `1` for `Integer` columns and `"any"` for `Float`), and the prop
is gone from the interface, so passing one fails to compile. `oxygen` and `helium` are plain
`<Input>`s with `step="any"`, keeping `min`/`max`. Arrows now step by 1. Rejected: rounding for
display, which rewrites an untouched value on open, and rounding in the API, which discards the
computer's figure; `formatDepth` already trims display.

## The silent half is the worse half, and it outlives any one step

Native constraint validation runs before any React handler, so a refused submit never reaches
`handleSubmit`, neither its valid callback nor `handleInvalid`, which reveals hidden fields, and
react-hook-form learns nothing. So the dive form is `noValidate` and asks itself:
`describeBlockedSubmit` (`lib/form-validity.ts`) reads `validity.valid` off each control (not
`checkValidity()`, which fires `invalid` events as a side effect), names the first refusal by its
`<label>`, and quotes the browser's `validationMessage`; `reportValidity()` still runs afterwards
for focus and bubble. The message renders through `FormApiError`, the live region already handling
announce-on-mount. Tests must not assert on `validationMessage` text, which differs by engine (jsdom
says "Constraints not satisfied"), and a `<label for>` resolves against the whole document, so
fixtures must not reuse ids. `bottom_temperature` is the regression case because its native 50 °C
ceiling is the one bound the Zod schema does not mirror. The other forms still leave this to the
browser.

## Deleting a file is three different actions, and the confirmation says which

`DELETE /dive/{uuid}/file/{fid}` (`delete_dive_file`) does one of three things: the recording keeps
other files and re-derives its profile; the recording goes with its last file, `renumber_ordinals`
promoting the next to ordinal 0; or a file-less recording survives, its samples a merge's or a
converted document's. The dive's figures, entry and exit positions included, follow the primary
recording and move only when the deletion touched ordinal 0 (`refresh_tech_scalars` takes
`touched_primary`); a file-less primary clears them like none. `deleteFileConfirmation`,
`deleteRecordingConfirmation` and `figuresSentence` in `lib/dive-recordings.ts` take the whole
recording list, so the recordings card and both forms agree. The heading becomes "Delete this file
and its recording?" where the recording goes; every branch mentions the figures; the dialogs mount
only while a deletion is pending, or the neutral heading would show while closing.
`DELETE_DIVE_CONFIRMATION` names the recordings and files a dive delete hard-deletes (`erase_dive` →
`delete_files_for_dive`) without counting, so both pages agree.

## A format list in this file outlives the sweep that catches its siblings

Sentences naming the formats the `divejson` converter reads live in `README.md`, in this file and in
`scripts/`, as well as in copy under `src`. When a reader ships, sweep the whole repository: a probe
scoped `-- src ':!*.test.*'` reaches none of the first three. Squeeze each file to one line before
matching, because Prettier's 100-column wrap splits a list mid-way — `README.md`'s breaks between
`.ssrf` and `Suunto` — so a line-oriented grep matches neither half. A list in this file is present
tense about what the API reads today and is corrected in place, even inside a paragraph that
narrates a correction; a prediction naming a single format is invisible to any format-name probe and
is the sentence most certain to go stale.

## The footer's link columns get a row of their own at tablet widths

`layout/footer.tsx` is `grid sm:grid-cols-3 md:grid-cols-4` with `sm:col-span-3 md:col-span-1` on
the brand block: three tiers, so the 640–767px range gets the three `nav` landmarks side by side
under a spanning brand block rather than the phone's stacked column. At 640px the columns are 176px
and nothing wraps; the widest label, `Code of Conduct`, is 113.1px. Three columns rather than four
because of the brand block, not the labels: at `sm:grid-cols-4`'s 124px the sentence under the
wordmark stacks over four lines instead of one. `md:col-span-1` is not redundant — `col-span-3` set
at `sm:` persists upward, and without the reset the brand block spans three of four desktop columns
and pushes the links off the grid, silently in the class list.

## The lists load on scroll, and a delete leaves the one you are reading in place

`useInfiniteResource` accumulates pages and `LoadMoreTrigger` fetches the next. The Load more button
is the observed sentinel, a real control for keyboard users; the 400px `rootMargin` fires it before
pointer users see it. A failed page latches `loadFailed`, outside `loadMore` so a retry passes:
otherwise `hasMore` stays true and the auto-fire loops behind one `destructive` toast (`TOAST_LIMIT`
is 1).

A page that lands moves the sentinel, and an observer reports only crossings - so `isNear` still
answers for the layout before those rows, and firing on it pours the whole list out. The trigger
calls `useNearViewport`'s `recheck` instead, which re-observes for a fresh answer either way.

`removeItem` drops the row locally and re-derives the cursor
(`floor(items.length / itemsPerPage) + 1`), because offsets below a deletion shift; `keyOf` dedup is
required. `applySaved` swaps the row in place and rewinds the cursor the same derived way, since
lists sort by editable columns and decrements compound.

`RecentDivesCard` takes `complete`, not `limit={100}`: the API clamps `items_per_page` to 100.
`useNearViewport` gates the gear sets card's first fetch. The admin queue's `MAX_SELECTED` mirrors
`MAX_ADDRESSES_PER_BATCH`; select-all takes the first hundred, and the header checkbox reads the
selection, not its own `checked`.

## Load-on-scroll lists: What the two test lanes can and cannot say about this

`vitest.setup.ts` installs the `IntersectionObserver` stub in `src/test/intersection.ts`, because
`new IntersectionObserver` throws in jsdom. The stub reports nothing until a test calls `reveal()`,
so the call states the scenario: the reader has scrolled to the end of the list, or far enough down
`/gear` to reach the sets card (`gear/page.render.test.tsx` needs it).

The browser lane holds that the trigger stays quiet far below the fold, fires on a scroll to the
end, and - the one only a real observer can answer - stops when a landing page pushes it off screen.
It cannot hold the `rootMargin`, and no test in this repository can: that lane runs each test inside
an iframe, and an implicit-root observer's expanded rect is clipped by every intervening scroll
container, the iframe boundary included, so the trigger fires only once genuinely on screen. A
margin regression is invisible to the suite and is a browser walk to catch.

## A merge to `main` publishes `:edge`, and something has to tell Render

A push to `main` publishes `:edge` and `:sha-<12>`, never `:latest` or a version alias: `main` is
not `v`-shaped, so cannot enter the version block, and `inputs.latest` is empty on a push.

Checkout falls back to `github.sha`, not `github.ref`: a branch resolves to its tip at run time, so
a queued run builds a later merge.

The `concurrency` key is `edge` for a `main` push and `release` for everything else. A group cancels
its pending run on a third arrival, fatal for a release queued behind the bump merge's edge build.

Render ignores a moved tag; the job calls a [Deploy Hook](https://render.com/docs/deploy-hooks) with
`imgURL` naming the digest read off `:sha-`. `RENDER_DEPLOY_HOOKS` is comma-separated (the api copy
needs two); absent it passes with a notice, set-but-empty fails. Each hook is `::add-mask::`ed
(substrings are not), and whitespace is stripped with `tr -d ' \t\r'`, not `[:space:]`, which eats
the separators.

## `code-quality.yml` carries no commented-out steps: Renovate skips them and git keeps the text

`code-quality.yml` carries no commented-out steps. A commented-out block is a claim about intent
nobody maintains, and Renovate's `github-actions` manager skips any line whose first non-space
character is `#` before it looks for a `uses:`, so an action pin inside one is unwatched rather than
held. Git keeps the text; `git log -S` returns it with a date attached, which decides whether it is
still worth having.

The `dependency-review` job is written against the current action rather than restored from a
comment — "`dependency-review` is a gate on the diff, and its licence list is derived, not edited"
has the detail. Nothing replaces a Snyk step or a PR quality comment: `vulnerability-scan.yml`
watches the published image, `.github/renovate.json5` watches the manifests, and a report that is a
comment rather than a failing check gets scrolled past. The permissions rationale atop
`code-quality.yml` states its rule directly; `pr-title.yml` is the worked example.

## The legal pages name the operator where the project runs the copy, and only there

`/privacy` and `/terms` render one unnumbered `<section>` above section 1,
`components/legal/operator-block.tsx`, answering what the numbered sections defer to the operator.
Not conditional rewording: the numbering is load-bearing, and the self-hosted rendering stays
byte-identical because the block renders whole or not at all.

The switch is `project_operated` from `GET /config`, nothing else. `lib/api/config.server.ts` asks
the API at `API_INTERNAL_URL`; every outcome but `true` is `false`, with no error path, so a
self-hosted copy with its API down renders unchanged. Both pages set `dynamic = "force-dynamic"`: a
CI-built image has no API to ask and would bake the failed answer in.

`lib/operator.ts` holds name, email and jurisdiction; no postal address, deliberately. The beta-end
export window is 90 days and §7's deletion ceiling is 30: different things, so do not harmonise
them.

`app/privacy/page.test.tsx` and `app/terms/page.test.tsx` assert absences of block-only strings, not
a snapshot; both pages are `async` (`render(await PrivacyPage())`).

## The source offer names the repositories, and still leads with the request

The operator block offers both routes to the source, the request and the repositories, with the
request first, because AGPLv3 section 13 obliges the operator's offer of the source of the modified
version they run, and a repository is evidence of what this copy runs only once the commit the block
points at `/api/v1/health` for ties them. When that reads `unknown`, the request is the way through,
which is the terms page's §7 reason.

`PROJECT_SOURCE_URL` is the organisation, not a repository: a copy is two images from two
repositories plus an install bundle from a third; the legal pages point at the whole product.
`github.com/opendiving/opendiving-web` in the footer and header is this app's own source, a
different claim.

`app/terms/page.test.tsx` and `app/privacy/page.test.tsx` assert the clause that keeps the request
leading, so an edit collapsing either page to "the repositories are public, follow the link" fails.

## The species credit is a link on the API's side, and the picker renders it through `Attribution`

`_WORMS_ATTRIBUTION` in the API is
`[World Register of Marine Species](https://www.marinespecies.org) (CC BY)`. The picker renders
every credit through `Attribution`, per "The geocoder's attribution is a wire format, not display
copy", so it needs no change — `parseAttribution` on a plain string returns one text run, so either
merge order is safe. The fixtures pinning the wording are `species-multi-select.test.ts` and
`species-multi-select.render.test.tsx`.

The trailing `(CC BY)` is a plain run after the link because `parseAttribution` splits into runs and
links rather than matching whole strings; dropping the licence name is the one non-cosmetic failure,
so the render test asserts the anchor's `href` and the `(CC BY)` run separately, not a regex over
visible text, which passes on raw markdown.

The API's cache prefix is `v7`; a cached search answer carries `attribution` for a month, so a
running instance shows the credit only once that API build lands.

## The species page credits the taxonomy, and composes that credit by hand

The classification card's foot on `src/app/species/[id]/page.tsx` reads "Taxonomy: World Register of
Marine Species, CC BY", composed from anchors rather than handed to `Attribution`, for the reason
`SpeciesPhotoCredit` is: a credit with two hyperlinks cannot come from one string, and `Species`
carries no `attribution` field — only `SpeciesSearchResult` does. Source then licence; the photo
credit leads with its author instead.

`NOTICE.md` stays silent on WoRMS: it covers material copied into this tree, and the taxonomy lives
in the API's catalog. The AphiaID row stays plain text — linking the number wants a per-taxon URL
and leaves one labelled fact silently clickable. Wikidata gets no line: its half is the common
names, CC0 asks for nothing, and the picker's second credit exists only for search results naming
upstream Wikidata rows the catalog never stored.

## The deco readouts have a panel, because the depth plot has two edges and they need three

The six deco channels carry three units the depth plot's two edges cannot hold, so a second plot
beneath it shares the time axis, one row per unit: minutes for NDL and TTS, bar for ppO₂, percent
for CNS and both gradient factors. A row exists only while a channel on it is shown. No curve is
drawn against nothing. `profileScalePlacement` in `lib/dive-profile.ts` is a pure function over
channel keys, so a test sweeps its 1 024 cells.

Rejected: the six on the depth plot (ppO₂ on the pressure axis is a flat line; `ProfileAxisKey`
names the quantity, not the unit); a row per channel, splitting paired readings; normalising onto
0–100.

Panel axes are numbered in `--muted-foreground`, since three curves share the percent row. A row is
scaled from its shown channels only, unlike `depthDomain`: a hidden `gf99` of 12 575 would flatten a
23 % CNS clock.

## Hiding a deco channel hides it everywhere, and that was the question worth asking

The crosshair does not quote a channel the diver has switched off, even though with ten toggles and
two labelled edges the crosshair is where an NDL is actually read. `shownValues` and `eventsShown`
keep their guards and `shown` stays the filter; the deco channels widen the vocabulary `shown` draws
from without changing what `shown` means. "The markers have a legend switch, and it is not a fifth
channel" and "Markers are clipped to the plot" record why: a thing drawn in one view and named in
another is the two views disagreeing about what the chart contains. The variant that sounds like a
compromise — crosshair reads everything, accessible summary names only what is shown — is that
disagreement by name. Reversing the rule is its own change and its own entry, not a side effect of
adding channels.

## The chart's `scale` is not the API's constant for `ndl` and `tts`

`ProfileChannel.scale` pairs with `DEPTH_SCALE`/`TEMPERATURE_SCALE`/`PRESSURE_SCALE` in the API's
`schemas/dive_profile.py` for the depth plot's four channels. For `ndl` and `tts` it does not: the
wire carries whole seconds at scale 1, and this chart divides by 60, because a diver reads a
no-decompression limit in minutes and an axis running 0–5 940 in seconds is numbers nobody uses.
That is an encoding-to-reading conversion, not a unit-system one, which is why neither channel has a
`Dimension`. `MM:SS` through `formatDurationForForm` was rejected: a TTS of `18:00` directly under
an elapsed-time axis labelled `18:00` is two quantities in one notation. `scale`'s comment states
both cases on the field, because "these two lists are a pair" is the kind of sentence a reader
trusts.

## The six deco channels have no `Dimension`, and `CHANNEL_DIMENSION` carries the exception, not `units.ts`

`lib/units.ts` deliberately omits ppO₂, CNS and duration from `Dimension` (the same in both unit
systems), and gradient factors are percentages, so six of ten channels have nothing to look up.
`CHANNEL_DIMENSION` therefore holds `Dimension | InvariantUnit`, where the object carries what a
dimension answers and `unit` does not: the spoken word for the accessible summary, and the separator
(`23.4%` attaches as `21.6°C` does; `1.32 bar` and `18 min` do not). `typeof entry === "string"` is
the discriminant, narrowed at each of the four readers rather than through a `dimensionOrNull`
helper, since three of the four want the other branch and would follow it with a cast.

Rejected: unit-invariant dimensions in `units.ts`. That puts `toImperial: (x) => x` four times into
the one module whose job is that a conversion exists; the exception belongs in the chart that has
it.

## Ten channels, ten accents, and what has to be separable is what shares a row

Six chart tokens in `globals.css` — `--ndl`, `--tts`, `--ppo2`, `--cns`, `--gradient-factor`,
`--surface-gradient-factor` — are declared once, never under `.dark`, like `--pressure` and
`--ceiling`. Each clears WCAG's 3:1 against both cards; the measured figures are on the block.

Separation matters within a panel row: minutes holds two curves, percent three, and within each the
hues are 90 degrees apart or more. Across rows they need not be (`--surface-gradient-factor` at 230
is 25 degrees from `--ppo2` at 205), the trade `--ceiling` makes with `--coral`: the plot, legend
and crosshair name each curve, so colour does least.

The two gradient factors are not one hue at two lightnesses: olives far enough apart put the lighter
at 1.97:1 on the light card. The panel's curves are solid: the ceiling's dash marks the one
depth-plot line never measured, and every panel curve is the device's own arithmetic.

## A profile event can arrive with no type, and `other` is not on the wire

DiveJSON §6.6 makes `type` OPTIONAL: an unrecognised event is an absent type beside a required
`label`. The API stores it as `OTHER` and sends null, so `DiveProfileEvent.type` is
`DiveProfileEventType | null | undefined` and the union has thirteen values and no `other`.
`describeEvent` keeps its `default` and `glyphFor` keeps taking a string, per "A closed vocabulary
from another deployable is an open one at the boundary"; that branch catches a null type, a type
this bundle predates and an older API build's literal `"other"`, all returning the device's own
wording.

Three glyph shapes: the gas plan is the diamond, a stop the triangle, the computer talking the
circle. A violated stop keeps the triangle rather than the ceiling's red, since red means only the
ceiling. Alarms are one value per meaning, not per vendor string; the spelling travels in `label`.

## A recording says what it ran, and an absent mode is not open circuit

`DiveRecordingsCard` carries one settings line per recording (`Open circuit · Bühlmann GF 30/85`, or
a model alone), composed by `recordingSettingsLabel` in `lib/dive-recordings.ts`. Per recording,
never per dive: a backup in gauge mode beside a primary on open circuit is ordinary.

An unknown mode prints nothing — not the raw `semi_closed_rebreather`, never a default — so
`MODE_LABELS` has no fallback entry; the vocabulary is closed only in the API's current build. An
absent mode is never open circuit: UDDF's `<divemode>` default is the format's claim, not the
device's.

The device's model name beats the family (`Suunto Fused RGBM 2` over `RGBM`), as
`recordingDeviceLabel` chooses; the family fills in for a bare algorithm (`<buehlmann>`, `zhl_16c`).
Gradient factors attach to the model, both halves or neither. Conservatism is its own clause on the
device's scale; `0` is a setting (`== null`) and a positive value keeps its sign.

## `-v4`: adding a series key bumps `DIVE_PROFILE_SERIES_KEY`, and a bump has three followers

`DIVE_PROFILE_SERIES_KEY` is `-v4`, under the rule that adding a key to a `parseSeriesVisibility`
list needs a bump and removing one does not: an older selection would restore with the six deco
channels off, as if the diver had chosen that, hiding the feature from exactly the people who used
the chart before.

A bump has three followers:

- `COVERED_KEYS` in `lib/device-memory.ts` and §10 of `app/privacy/page.tsx`, both holding the key
  as a literal; `storage-keys.test.ts` check (1) fails the build if they disagree.
- The orphan comment in `device-memory.ts` and its mirror in this file, which count the superseded
  series keys.
- `device-memory.test.ts`'s prefix-clearing fixture, whose comment counts the same set in other
  words ("Two orphans left behind by key bumps and one by a deleted feature") and whose seeded store
  holds the retired keys; a sweep for the first sentence misses it.

## The percent axis stops at 200 %, and the curve that overruns it is drawn leaving the row

`cns`, `gradient_factor` and `surface_gradient_factor` share one panel row; Suunto Ocean exports
carry a broken `gf99` (14 060 on dive `019fcee1-2219-76df-9e5c-b20e3473f304`), flattening the
correct channel under a 15 000 top.

`AXIS_BOUND` in `lib/dive-profile.ts` is 200 for the percent axis and `null` elsewhere; `axisDomain`
fits `niceDomain` below it and returns the flat 0–200 band above. 200 is from the quantity (100 % is
the M-value); 100 sends a healthy 121 off the panel. The overrun leaves the row through a per-row
`clipPath` rather than pinning to the top, where it reads as a measurement; no percentile, which
varies per dive. `dots` is `readouts` minus out-of-row samples. Every panel row is clipped, not the
depth plot.

Rejected: a log axis, its own row for `gradient_factor`, Submersion's per-metric bands, and clamping
the value (DiveJSON §5.4 forbids it).

`clipPrefix` strips `useId` to `[A-Za-z0-9_-]`, since `«r0»` is not legal unescaped in `url(#…)` (as
`components/icons/google-icon.tsx` does).

## The dialog is centred in the visual viewport, not in `100vh`

`DialogContent` (`components/ui/dialog.tsx`) is centred and capped by `--visual-viewport-top` and
`--visual-viewport-height`, which `useVisualViewport` (`hooks/useVisualViewport.ts`) mirrors from
`window.visualViewport`'s `offsetTop` and `height`. Two iOS causes, both invisible on desktop: `vh`
measures the large viewport, so `max-h-[90vh]` overflows the screen with Safari's toolbars up, and
no unit fixes the keyboard, because iOS scrolls the visual viewport rather than resizing the layout
one and `position: fixed` stays anchored. The `:root` fallback in `globals.css` is `100svh` behind
`@supports`, since a custom property holding an unknown unit parses and then drops whatever
substitutes it. Content is `w-[calc(100%-2rem)]` and `rounded-lg` at every width, so the close
button never sits in the corner of the screen.

## Nothing may sit between `DialogPortal` and `DialogContent`

`DialogPortal` wraps each child in a `Presence`, which reads the exit animation off
`getComputedStyle` of the node its ref lands on, reaching it through `Portal` → `Primitive.div` with
`asChild` → `Slot` → `cloneElement(child, { ref })`. A wrapper that is not a `forwardRef` takes that
ref as an ignored prop with no warning from React 19, so `stylesRef.current` stays `null`,
`getAnimationName(null)` answers `"none"`, and the close sends `UNMOUNT` in the same commit: the
dialog pops out while the overlay fades for its 200 ms. Forwarding the ref would not help either,
since `Presence` would measure a frame carrying no animation. The animation has to be on the node
the portal wraps, which is why the visible viewport reaches the content as variables rather than as
a centring parent box, and why translate centring keeps the `slide-in-from-*` classes.

## `DialogContent` runs its hooks on every page that declares a dialog

`useVisualViewport` is called from `VisualViewportEffects`, a component rendering `null` among the
content's children, not from `DialogContent`'s body: `DialogPortal` gates the DOM and renders `null`
while closed, but the component around it is rendered by its parent either way, so a hook in the
body subscribes on every page that declares a dialog. The children mount and unmount with the
portal.

Two details follow from more than one dialog being open at once, which a confirm raised from a form
dialog makes ordinary. The variables are refcounted, so the first to close does not strip them from
the one still open. And each caller registers its own closure rather than the shared
`syncViewportVars`: `addEventListener` de-duplicates identical `(type, listener)` pairs, so a shared
function is one registration that the first `removeEventListener` takes from everybody.

## "Add Mixture" takes the focus nowhere, because iOS opens a focused `<select>`

`useFieldArray().append()` defaults to `shouldFocus: true`, focusing the first field of the new row
that registered a focusable ref. `VolumeCombobox` registers none, so focus lands on the next box —
the ppO₂ limit `<select>`, or the O₂ box where that column is hidden — and on iOS focusing a
`<select>` opens its picker wheel, so one tap on Add Mixture adds a tank and opens a dropdown nobody
asked for. Hence `append({ ...DEFAULT_MIXTURE }, { shouldFocus: false })`.

The app's plain `<select>`s (ppO₂ limit, Role, Usage, water type) are chosen over the shadcn
`Select` because they need `""` as a real selectable option, and any programmatic `.focus()` on one
is a dropdown opening on a phone.

## The dive file picker takes several files, and the batch is applied serially

The input is `multiple` and `importFiles` walks the picked files in order, never `Promise.all`: the
first file prefills and later ones fill blanks only, so racing them would make first-file-wins
depend on response order.

`hasFileAlready` is a local seeded from the prop and set after each accepted file:
`pending`/`recordings` do not re-render mid-loop, so reading them per file would collapse
first-file-wins into last-file-wins.

A bad file does not end the batch, since the diver cannot re-pick "the other three". A match against
another dive pauses it; the files after it ride on the offer (`MatchOffer.rest`), so "Log as a new
dive" resumes and dismissing drops the rest. One toast per pick, counting what landed. `importNote`
is cleared once per pick and only ever assigned a non-`null` note; a later file's `null` would wipe
the first file's note mid-batch.

## The edit form deletes a stored file on save, beside the attaches

`dives/[id]/edit` holds `removedFileUuids` beside `pendingFiles`: a marked row stays struck through
saying `Deleted when you save`, and the Trash icon becomes an Undo. Deleting on confirm would make
Cancel a lie. On submit deletions run first, then attaches, one toast per failure and none stopping
the next.

`deleteFileConfirmation` in `lib/dive-recordings.ts` is untouched — the dive page's recordings card
shares it and deletes immediately. The form wraps it as `removeFileConfirmation`: the first mark
keeps the three-outcome text, the dive on screen being the one the save finds; later marks state
only what is certain — the file goes on save, a recording may be left file-less, an emptied
recording goes with its profile and samples, and what the dive shows can change. No local model of
the save-time cascade (`renumber_ordinals` promotion, profile re-derivation) gets every field right.
`deleteStoredFile` does no re-read; nothing mid-edit changes the server's dive.

## A field under 16px zooms an iPhone in, and it stays zoomed

iOS Safari zooms the page in when it focuses a field whose computed font-size is under 16px, and
never zooms back out. Every later `position: fixed` dialog, laid out against the layout viewport,
then overflows the narrower visual one; no `svh` or `visualViewport` arithmetic reaches a magnified
page.

`Input`'s box is `text-base md:text-sm`: 16px on a phone, 14px from `md:` up. `Textarea` and the
month/year `<select>`s in `calendar.tsx` carry the same classes; a `<select>` zooms like a text box,
and the app's plain `<select>`s (ppO₂ limit, Role, Usage, water type, the units picker) are
`NativeSelect`, which composes `inputClassName`, so they inherit it. `SelectTrigger` needs nothing:
Radix's is a `<button>`, not a field.

`maximum-scale=1` or `user-scalable=no` is rejected: it takes pinch-zoom from everybody, and iOS
ignores both anyway. `input.browser.test.tsx` asserts 16px below the `md` breakpoint and 14px above,
so a fix that drops the breakpoint fails.

## The dialog scrim is positioned absolutely, because iOS clips `fixed` to the layout viewport

With the keyboard up, iOS clips a `position: fixed` box to the layout viewport and keeps painting
page content into a band between that viewport's bottom and the keyboard. No `fixed` geometry
reaches the band, so a `fixed inset-0` `DialogOverlay`, however sized, leaves an undimmed strip
under the modal.

`DialogOverlay` is therefore `absolute`, anchored to `--visual-viewport-doc-top` — page scroll plus
the visual viewport's offset, which `useVisualViewport` writes beside `--visual-viewport-top` and
`--visual-viewport-height` — with `body` `position: relative` so it resolves against the document.
Height is the reported viewport plus a screen of slack, the band's size being unknown to the page;
Radix scroll-locks the page, so overflow costs nothing. Check a dialog opened on a scrolled page:
the anchor is in document coordinates.

A desktop browser at iPhone dimensions cannot reproduce Safari's clipping of fixed layers; put a
readout on the device (`opendiving-web-lan-preview` skill).

## The absolute scrim is `w-screen`, because `body`'s scrollbar margin shortens `right: 0`

`react-remove-scroll`, which Radix wraps the overlay in, puts a `margin-right` on `body` equal to
the scrollbar it removes so the page does not jump sideways as the dialog opens. An absolutely
positioned scrim takes `body`'s padding box as its containing block, so `inset-x-0`'s `right: 0`
lands short by that margin and leaves an undimmed strip down the right edge on every desktop with a
space-taking scrollbar.

The scrim is therefore `w-screen`: `100vw` is the window regardless of `body`'s box, and it cannot
produce a horizontal scrollbar because `body`'s `overflow: hidden` has propagated to the viewport by
then. `left-0` stays, the margin being on the right only.

A Mac's overlay scrollbars make the gap zero, so it is invisible there. To reproduce it, force the
margin with a dialog open and compare the scrim's `getBoundingClientRect().right` against
`window.innerWidth`:

```js
document.body.style.setProperty("margin-right", "15px", "important");
```

## The focused field is put back after the dialog resizes, and the waiting is the whole trick

When the keyboard shrinks the viewport, `DialogContent`'s `max-height` drops with
`useVisualViewport` but the content's `scrollTop` stays put, so a field near the foot falls below
the fold. `useKeepFocusedFieldVisible` (`hooks/useVisualViewport.ts`) re-reveals the focused field
once the geometry settles, with `block: "nearest"` so it is a correction, not a jump.

`DialogContent` carries `transition: all 200ms`, so `max-height` animates and a fixed short wait
finds the field inside a box that has not finished shrinking. The loop re-reveals each frame until
the container's height stops changing; because the box also sits still for the first frames before
the transition starts, `MIN_SETTLE_FRAMES` (16: past 200ms at 60Hz) floors the wait, and
`SETTLE_FRAME_CAP` backstops a box that never stops.

It listens to `resize`, never `scroll`: the visual viewport also scrolls when Safari pans to a
focused field, and correcting on that fights the browser.

## Toasts are swiped away in the direction they already sit

Radix's `swipeDirection` defaults to `right`, but `ToastViewport` stacks toasts across the top of a
phone (bottom-right from `sm` up), and iOS flicks a top banner up. `Toaster` picks the direction
from the placement: `up` below `sm`, `right` above.

`useSyncExternalStore` over `matchMedia` reads the width, not an effect, so the first client render
already knows; the server snapshot is `false`, the mobile-first layout.

The swipe classes carry both axes —
`data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x,0px)]` and the `-y` beside it —
because Radix writes both variables on every swipe and zeroes the off-axis one, so the unused
utility contributes `0px`. The `,0px` fallbacks are never reached but stay: an unresolved `var()`
drops the whole `translate`.

Sliding out follows the corner, so it needs the breakpoint: `slide-out-to-top-full` on a phone,
`sm:slide-out-to-right-full` above; those set different properties, so the `sm:` rule also resets
`--tw-exit-translate-y` to `0`.

## A dimmed label has to contain its own ink, or iOS cuts the subscript off

`Label` sets `leading-none`, so at `text-sm` the line box is 14px while the ink is 17px: anything
below the baseline hangs ~1.5px outside the box. Harmless until something paints the box alone — a
`disabled` switch dims its label through `peer-disabled:opacity-70`, iOS rasterises the composited
opacity layer to the element's box, and the overhang goes with it.

`Inter` loads with `subsets: ["latin"]`, whose unicode-range covers `U+2000-206F` but not
Superscripts and Subscripts at `U+2070-209F`, so `₂` is a fallback glyph overrunning a line box
drawn from Inter's metrics — correct, but why there is overhang.

`leading-5` on the switch rows sizes the line box to its contents: 20px, exactly the switch's `h-5`,
so no row changes height. Raising `Label`'s own line height instead would move every stacked form
label in the app by 6px to cure a clip only these rows produce.

## "Save as" opens on the preset the fields already match

Opening Configure on a set matching an account preset seeds "Save as" with that preset's name under
a "Replaces…" line, so saving edits back under that name is one tap. A set matching nothing opens
empty.

The mount freezes the seed. The match is computed against `visibility.hidden`, which changes on the
first flip, so a name recomputed every render would blank itself on the very edit the diver means to
save. `DiveFormPresetSaveAs` reads `initialName` into `useState` once; it mounts when the dialog
opens because `DialogPortal` renders `null` while closed.

While the presets are still on the wire, the control is keyed on whether the list has resolved, so
their arrival remounts it on the real answer — cheaper than an effect.

Rejected by this repo's lint: a ref frozen in the render body (`react-hooks/refs`) and a `useEffect`
seeding the child when the prop arrives (`react-hooks/set-state-in-effect`).

## A debounce test fakes timers between async helpers, never across one

`"debounces a burst into one request"` in `src/app/dives/new/page.render.test.tsx` runs on a frozen
clock: `vi.useFakeTimers()`, three flips, `expect(updateProfile).not.toHaveBeenCalled()`, then one
`act` advancing exactly `SAVE_DEBOUNCE_MS`. Awaited `userEvent.click`s run on the wall clock, so a
slow runner lets the `useDiveFormVisibility` window elapse mid-burst;
`waitFor(() => expect(updateProfile).toHaveBeenCalled())` returns on the first call, so
`toHaveBeenCalledTimes(1)` passes on the broken run too. `SAVE_DEBOUNCE_MS` comes from the hook, not
a copy.

`userEvent` cannot drive that window: `userEvent.setup({ advanceTimers })` routes through Testing
Library's `asyncWrapper`, which advances its `setTimeout(…, 0)` only
`if (jestFakeTimersAreEnabled())` — `typeof jest !== "undefined"`, false under Vitest
(`node_modules/@testing-library/react/dist/pure.js`) — so the first click hangs. `fireEvent` uses
the synchronous `eventWrapper` and is unaffected. `runOutCooldown` in
`src/components/auth/auth-form.test.tsx` follows the same rule: fake only between async helpers,
never across one.

`"sends the canonical list, and does not reset the form"` needs no change: any call carrying the
list satisfies its `waitFor`.

## The labelling step retries, and "already exists" is not a failure

`.github/workflows/pr-title.yml` reads the labels, creates the missing one, applies it.
`mapfile -t existing < <(gh label list …)` cannot fail — the status belongs to the process
substitution — so an API flap reads as "label missing", and `gh label create` exits non-zero on a
taken name.

`gh_retry` runs a `gh` call up to three times with backoff; a glob of expected non-zero output,
matched first, returns instead. "Already exists" is that glob — another run got there — and
`--force` would overwrite a hand-tuned colour. A call failing all three attempts stops the job with
an `::error::` quoting gh, reads included, since an empty answer misfiles a retitled PR.
`.github/release.yml`'s `"*"` catch-all keeps an unlabelled PR in the notes.

Every repository generating release notes from these labels carries its own copy; nothing checks
they agree — diff them.

## A selection is not a query

While the box's text is a selection the component wrote, the menu shows the unfiltered list,
selected row tinted `bg-accent/50` and scrolled into view; filtering starts at the first keystroke.

`menuQuery({ text, typed })` in `creatable-combobox.tsx` is the rule. `handleInputChange` sets
`typed` and every programmatic write clears it. A flag, not "text equals the selected name":
`handleInputChange` selects an exact match as it is keyed, and a fully typed name would snap the
menu back. `visibleItems`, `emptyMenuLabel`, `searchFailed`, `searchPending` and the search effect
all key on that derived query.

`activeIndex` stays `-1` on open; the once-per-opening scroll waits on `searchPending`, since
`remoteResult` outlives the close.

A filled single-select selects its text on `onFocus` (`onClick` refires under a placed caret),
guarded by `!keepOpenOnSelect && inputValue`: `select()` on an empty field still raises phone
handles, and a `keepOpenOnSelect` field's text is a query.

## Cylinder presets are named AL/HP/LP, and every one of them is offered in both systems

`VolumeCombobox`'s US presets are AL/HP/LP plus nominal cu ft (`AL` aluminium, `HP` 3442 psi steel,
`LP` 2400/2640 psi steel). `S80`-style prefixes read as steel, and plain cu ft is ambiguous in
litres (AL80 11.1 L, HP80 10.2 L). Litres come off manufacturer sheets, cited at the row; nothing
else reads them.

Every preset is offered in both unit systems; `showIn` and `volumeOptionsFor` do not exist, because
a named preset serves the traveller handed an unfamiliar tank, whom a units filter hides it from.
`volumeGroupsFor` keeps the rows browsable under four headings (Metric singles, Twin sets, US
aluminium, US steel), the reader's own two first; headings are `aria-hidden` labels on a
`role="group"` wrapper with no index, so `nextActiveIndex` skips them.

HP117 and LP95 are both 15.0 L, so the list is keyed by label. The mixture must not record working
pressure: a preset is only a litre hint.

## Hidden dive-form fields leave a ragged edge, never a hole

A gap in the middle of a form reads as breakage; a short last row does not. The six readings (both
depths, bottom temperature, visibility, water type, altitude) are one grid guarded by "any of the
six visible"; auto-flow packs survivors, and an odd count leaves one half-width field at the bottom.

`gap-x-4 gap-y-6`: the row gap matches the form's `space-y-6`, so a full row is pixel-identical to a
pair, where `gap-4` would pull reading rows 8px closer.

Dive number pairs with Duration, `dive_number`, `start_time` and `duration` having no `isVisible`
guard. `DIVE_FORM_ALWAYS_ON_FIELDS` must list them in the form's order — a hand-checked invariant,
per `DIVE_FORM_FIELD_GROUPS`' doc.

Only the Trip/Course grid carries `md:[&>:only-child]:col-span-2`, widening a lone Trip to match the
site picker; `md:` matters because below it the grid is one column, and `FormField` rendering
`FormItem` as the grid's direct child is what makes `:only-child` resolve.

## ESLint 10 needs two lines in the config, and neither of them turns a rule off

`eslint-config-next` does not support ESLint 10 (vercel/next.js#89764, blocked on
jsx-eslint/eslint-plugin-react#3979); hand-composing the config would cost the preset's 17 `react/*`
rules. Two blocks in `eslint.config.mjs` bridge it.

`settings.react.version` is read from `react/package.json`, not a stale-prone literal: the preset's
`"detect"` routes `eslint-plugin-react` into `detectReactVersion()`, which calls
`context.getFilename()`, removed in v10 (`contextOrFilename.getFilename is not a function`).

A parser override sends `{js,mjs,cjs,jsx,mts,cts}` through `@typescript-eslint/parser`, because
`eslint-config-next/parser` (Next's `@babel/eslint-parser`) throws
`TypeError: scopeManager.addGlobals is not a function`; `.mts`/`.cts` included, since the preset's
TS block skips them. `@typescript-eslint/parser` is therefore a direct devDependency, not borrowed
from the hoisted `typescript-eslint`.

Neither block disables anything — one control per plugin via `eslint --stdin --stdin-filename`,
re-run on any change here:

| Input                               | Must raise                           |
| ----------------------------------- | ------------------------------------ |
| `dangerouslySetInnerHTML` attribute | `react/no-danger`                    |
| `useState` behind an `if`           | `react-hooks/rules-of-hooks`         |
| `export default () => null`         | `import/no-anonymous-default-export` |
| bare `<img>`                        | `jsx-a11y/alt-text`                  |
| literal `<head>`                    | `@next/next/no-head-element`         |

The `^9` peer warnings are noise. When upstream lands, delete both blocks and the parser
devDependency together; dropping only the parser block lints `.tsx` clean and `eslint .` aborts on
the first non-TypeScript file.

## TypeScript stops at 6.0 because the compiler API left the package in 7.0

TypeScript 7's npm package exports only `./lib/version.cjs` from `"."`: `require("typescript")`
returns `{ version, versionMajorMinor }`, and the compiler API moves to `typescript/unstable/*`.
`typescript-eslint` reads `ts.versionMajorMinor` and throws
`typescript-eslint does not support TS 7.0.` at module load; typescript-eslint#10940 targets TS >=
7.1, so 7.0 is never coming.

Dropping the direct `@typescript-eslint/parser` devDependency does not help: the throw arrives via
`eslint-config-next` → `typescript-eslint`. `npm ci` dies at ERESOLVE, so `lint-and-build`,
`code-quality` and `accessibility-check` fail; a v7 PR with no `package-lock.json` diff is the tell.

6.0 sits inside `typescript-eslint`'s `>=4.8.4 <6.1.0` range and reports what 7 removes: `baseUrl`
in `tsconfig.json` (TS5101; removed, `paths` being tsconfig-relative, rather than silenced with
`ignoreDeprecations: "6.0"`) and `scrollMargin` on the `IntersectionObserver` stub in
`src/test/intersection.ts`. With those, TS 7's native compiler typechecks the tree clean; the
eventual bump is one line in `package.json`, and `npm run lint` is the check.

## `.gitignore` carries `/.vitest/` whole, and no `__screenshots__/` entry

`.gitignore` carries `/.vitest/` whole and no `__screenshots__/` entry.

`attachmentsDir` defaults to `.vitest/attachments`: failure screenshots land in
`.vitest/attachments/failure-screenshots/<test file>/<test name>.png`, and a failed
`toMatchScreenshot` writes its `-reference`, `-actual` and `-diff` images there via
`resolveDiffPath`. The root is ignored rather than `/.vitest/attachments/` because the directory is
Vitest's — `--reporter=blob` defaults to `.vitest/blob`. A missing entry surfaces as a
`gh pr create` untracked-file warning, never a failing test.

`__screenshots__/` holds `toMatchScreenshot`'s reference image via `resolveScreenshotPath`, a
baseline committed like a text snapshot. Ignored, it never reaches the repository: locally the
matcher writes it and still fails ("Review it before running tests again."), under `CI=true` it
writes nothing ("No existing reference screenshot found."), every run. `page.screenshot()`
(`save: true` by default) also writes there, but an untracked debug PNG is visible and deletable,
while an ignored baseline is invisible by construction. No test calls either today.
