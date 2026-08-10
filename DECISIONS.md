# Frontend Decisions & Gotchas

Notes on non-obvious choices and pitfalls hit while building out the web app, so
the reasoning survives independently of any particular chat/agent session. Keep
this updated as new gotchas are discovered.

## Dive/trip/dive-site API calls take `uuid` strings, not `username`/numeric ids

`divesAPI`/`tripsAPI`/`diveSitesAPI`/`diveStatsAPI` (in `lib/api/*.ts`) used to take
a `username: string` as their first argument, matching backend routes nested under
`/{username}/...`. The backend flattened these to plain routes (`/dive`, `/dives`,
`/dive/{id}`, etc., see the API's `DECISIONS.md`), so these functions - and every
component that calls them (`RecentDivesCard`, `RecentTripsCard`, `TripCombobox`,
`DiveSiteMultiSelect`, `NewTripDialog`, `NewDiveSiteDialog`, `DiveFormFields`, and
every `dives/`/`sites/`/`trips/` page) - took/forwarded a `userId: number` (from
`user.id` in `AuthContext`, not `user.username`) for a while instead. The backend
then moved from numeric ids to string `uuid`s everywhere (see the API's
`DECISIONS.md`), so as of the frontend's `uuid` commit these functions take a
`userUuid: string` (from `user.uuid`) instead of `userId: number`:
- Create calls (`createDive`/`createTrip`/`createDiveSite`) take the full request
  object as a single argument, with `user_uuid` included in its body - there's no
  separate leading `username`/`userId`/`userUuid` parameter for these.
- List calls (`getDives`/`getTrips`/`getDiveSites`/`getDiveStats`) take `userUuid`
  as their first argument and send it as a `user_uuid` query param.
- Single-resource calls (`getDive`/`updateDive`/`deleteDive` and the trip/dive-site
  equivalents) don't take a user identifier at all - just the resource `uuid` - since
  the backend authorizes these by comparing the fetched object's owner to the
  logged-in user, not by an identifier in the URL.

The `/user/{username}` account-management endpoints (`authAPI.updateProfile`/
`changePassword`) were changed the same way, ending up on the backend's `/user/{uuid}/...`
routes (see the API's `DECISIONS.md`) - `authAPI.updateProfile`/`changePassword`
now take a `userUuid: string` (`user.uuid`) as their first argument instead of
`username`/`userId`. `GET /user/me` (`authAPI.getCurrentUser`) is unaffected - it's
an exact literal path, not a `{username}`/`{id}`/`{uuid}` placeholder, and always
resolves the caller's own account from their auth token.

(This no longer reflects `updateProfile`'s or `getDiveStats`'s current signatures -
see "Current-user endpoints moved off `/user/me`/`/user/{uuid}` onto a bare
`/user`" below.)

## Never use `z.preprocess()`/`.transform()` on fields feeding `z.input<>`-derived types

Several form pages derive their form-data type from Zod via `z.input<typeof schema>`
(e.g. `DiveCreateInput`, `DiveUpdateInput`). `.preprocess()`/`.transform()` collapse
the *input* type to `unknown` or to the transformed output type, which breaks
`useForm<T>()`'s generic binding to `onSubmit` with confusing "two different types
with this name exist, but they are unrelated" errors - and this only surfaces
during a full `next build`, **not** during `diagnostics`/editor type-checking.

The established pattern instead: keep the Zod schema's input and output types
identical (e.g. `z.union([z.literal(""), z.number()])`, no `.transform()`), and do
any real conversion (like `"" -> undefined`) in a plain TS helper function called
explicitly right before the API call (see `normalizeMixtures`, `normalizeTripDates`
in `lib/validations/*.ts`).

**Always run a full `npm run build` after touching any Zod schema tied to a form**
- `diagnostics` alone has repeatedly missed this class of bug.

## The "cleared field resets to default" React Hook Form quirk

Setting a *live* RHF field value to `undefined` mid-edit makes RHF fall back to
displaying that field's default value (RHF can't distinguish "explicitly cleared"
from "never set"). This affects any optional numeric/date field with a
non-empty-string default.

Fix pattern used throughout: use the empty string `""` as the live "cleared"
sentinel (never `undefined`) for these fields, and only convert `"" -> undefined`
in a normalize helper called right before sending to the API. See
`diveMixtureSchema.start_pressure/end_pressure` and `tripCreateSchema.start_date/
end_date` for the two example call sites (numeric and date-string respectively).

## Explicit field construction beats spread-then-override for generics

`normalizeMixtures()` originally tried `{ ...mixture, start_pressure: ... }` with
a generic type parameter for `mixture`. TypeScript did not reliably narrow the
overridden property away from the original (wider, union-typed) property when the
source object's type was generic - the `""` placeholder type leaked back into the
inferred return type and broke assignability to the API's `DiveMixture[]` type.
Switching to explicitly listing every output field (no spread, no generics) fixed
it immediately and is the safer default for any similar "normalize before submit"
helper.

## Bare `YYYY-MM-DD` dates must not go through `new Date(dateString)`

`new Date("2024-06-01")` parses as UTC midnight. Displaying that in a
negative-UTC-offset timezone (most of the Americas) can show the *previous* day.
Any date-only field (trip `start_date`/`end_date`) is formatted via
`formatDateOnly()`/`formatTripDateRange()` in `lib/date-time.ts`, which manually
splits the string and constructs a *local* `Date(year, month-1, day)` instead.
`Dive.start_time` is a full ISO datetime, so it doesn't have *this specific*
off-by-one-day problem - but see the next section, since displaying/editing it
correctly still can't just go through `new Date(dateString)` and local getters.

## A dive's `start_time` displays/edits in its own timezone, never the browser's

`Dive.start_time` is always an offset-aware ISO 8601 string, e.g.
`"2021-04-04T10:04:47.910+02:00"` - the offset is the dive's *own* original
timezone (wherever/whatever logged it), not the viewer's. A dive logged at
09:00 in Thailand should always show 09:00, whether it's viewed from Thailand,
the US, or anywhere else.

The naive approach - `new Date(start_time)` then `.getHours()`/`toLocaleString()`
- is wrong here: those always convert to the *browser's* timezone, silently
showing a different wall-clock time than what was actually logged. All of the
helpers in `lib/date-time.ts` avoid this by working with the offset embedded
in the string directly, never through browser-local getters:
- `parseUtcOffsetMinutes()` extracts the embedded offset (or `null` for a
  naive string with none).
- `formatDiveDateTime()`/`formatDiveTimeOnly()` (display) shift the
  underlying instant by that offset and format with `timeZone: "UTC"`, so
  `Intl`/`toLocaleDateString` reads the shifted instant back as the original
  wall-clock time regardless of the browser's own zone.
- `splitStartTime()`/`combineStartTime()` convert between that single string
  and a "YYYY-MM-DD HH:mm:ss" wall-clock string + a UTC offset in minutes -
  the two pieces the underlying `DateTimePicker`/`UtcOffsetSelect` inputs
  actually edit.

`formatDateTime()`/`formatTimeOnly()` (plain, no `Dive`-prefix) are unaffected
and still show the *viewer's* browser-local time - correct for `created_at`
and any other plain metadata timestamp, just not for a dive's `start_time`.

**The form only ever has one `start_time` field**, in the exact offset-aware
shape the API uses - there's no separate `start_time_utc_offset_minutes` form
field to keep in sync with it. `DiveStartTimeField`
(`components/dives/dive-start-time-field.tsx`) is the *only* place that calls
`splitStartTime()`/`combineStartTime()`: it renders the `DateTimePicker` +
`UtcOffsetSelect` pair, splitting its single `value` prop for them to display
and recombining their changes back into one string via `onChange`. Every
caller - the create/edit forms, `dive-file-import.tsx`, `lib/validations/dive.ts`
- only ever reads/writes that one string, identical to `Dive.start_time` over
the API. New dives default it to `nowStartTime()` (now, in the browser's own
offset via `getBrowserUtcOffsetMinutes()` - the negation of
`Date.prototype.getTimezoneOffset()`) - the best available guess for someone
logging a dive shortly after diving it. Importing a dive-computer file
(`normalizeParsedStartTime()` in `dive-file-import.tsx`) uses the file's own
embedded offset if it has one, and falls back to that same browser default if
the file's `start_time` is naive (e.g. Suunto XML's `StartTime`, which has no
offset at all).

## FastAPI 422 errors can be an array, not a string - never render `detail` directly

Pydantic validation errors return `detail` as an array of `{type, loc, msg, input}`
objects; other errors (duplicate name, etc.) return `detail` as a plain string.
Rendering the array directly in JSX crashes React ("objects are not valid as a
React child"). Every error-handling call site uses `getApiErrorMessage()`
(`lib/api/error.ts`) to normalize both shapes into a displayable string - use it
for any new API call, don't reach for `error.response?.data?.detail` directly.

## The generic `CreatableCombobox` pattern

`components/ui/creatable-combobox.tsx` is a generic "pick existing or create new
on the fly" combobox. `TripCombobox` is a thin single-select wrapper that just
supplies the fetch/create API calls. `DiveSiteMultiSelect` wraps it too, but for
picking *several* dive sites (a dive can have more than one, e.g. a drift dive
that crosses named sites) - it renders `CreatableCombobox` as the "add a site"
input (always called with `value={undefined}` so it clears after each pick) plus
its own reorderable list of already-added sites above it. If a third "pick or
create" entity type is needed, wrap `CreatableCombobox` the same way rather than
copy-pasting the interaction logic (filtering, commit-on-blur/Enter,
mouse-down-prevents-blur for option clicks).

## Duration is a free-typed, regex-validated "MM:SS" string in the form

`Dive.duration` on the API/`Dive`/`DiveCreate`/`DiveUpdate` types is always
seconds, but the dive **form** field holds a plain `"MM:SS"` string (e.g.
`"45:30"`), exactly like `start_time` holds a `"YYYY-MM-DD HH:mm:ss"` string -
see `dateTimeField()`/`durationField()` in `lib/validations/dive.ts` for the
matching pattern (required, regex-validated, no `.transform()` per the Zod
rule above). The user can type anything into the plain `<Input>`; Zod's
`durationField()` regex (`^\d{1,3}:[0-5]\d$`) is the only validation, surfaced
via the normal `<FormMessage />` - there's no live reformatting/auto-correction
as they type (an earlier version tried that with a dedicated `DurationInput`
component and local text-buffer state; it was simpler to just validate the raw
string like every other form field).

Conversion to/from the API's seconds representation happens right before
submit / right after fetch via `parseFormDuration()`/`formatDurationForForm()`
in `lib/date-time.ts` (mirroring `parseFormDateTime()`/`formatDateTimeForForm()`).
If a duration ever needs editing elsewhere, reuse `durationField()` +
those two helpers rather than re-deriving minutes from seconds inline (the
dive form used to do that with a single "total minutes" number input, which
lost sub-minute precision on read - e.g. a 45:30 dive displayed and
round-tripped as 46 minutes).

## Occasional `.next` cache corruption during builds

`npm run build` has intermittently failed with unrelated-looking errors (`ENOENT`
on `.nft.json` trace files, `Cannot find module for page: /some-route`) that have
nothing to do with the code just changed - confirmed by TypeScript
compiling/linting successfully every time this happened. Fix: `rm -rf .next && npm
run build`. If a build fails in a way that doesn't match the actual diff you just
made, try this before assuming the code is broken.

## Layout width convention

Every page rendered inside the shared chrome uses `max-w-6xl mx-auto px-4
sm:px-6 lg:px-8` for its content container width (matching the profile page,
which was the reference chosen). The landing page (`/`) is exempt - it's built
from several full-bleed alternating sections, a fundamentally different layout
pattern. The dive/trip/dive-site "new"/"edit" forms are also exempt - they
intentionally use a narrower `max-w-2xl` since they're single-column forms.

This is purely a content-width choice, not a chrome one: `Header`/`Footer` are
no longer rendered per-page (see the `AppShell` entry below), so the
"new"/"edit" forms *do* sit inside the shared header/footer now - they just
constrain their own inner content to `max-w-2xl` instead of `max-w-6xl`.

## `Header`/`Footer` live once in `AppShell`, not per-page

`components/layout/app-shell.tsx`, mounted near the root of `app/layout.tsx`,
renders `Header`/`Footer` around `children` for every route except a hardcoded
`NO_CHROME_ROUTES` list (currently just `/signin`/`/signup`, which render
their own standalone centered-card layout). Pages used to each import and
render `Header`/`Footer` themselves, passing `currentPage`/
`showDashboardActions` props - that duplicated the chrome JSX on every page
and, worse, meant `Header`/`Footer` fully unmounted and remounted on every
navigation (visible jank, plus any header-local state resetting).

`Header` no longer takes `currentPage`/`showDashboardActions` props - it calls
`usePathname()` itself and derives the active nav item from the
`NAV_SECTIONS` prefix table in `header.tsx`. Adding a new top-level nav item
means adding a `{ prefix, page }` entry there, not threading a new prop
through every page.

If a new route needs to opt out of the shared chrome (e.g. another
standalone/full-bleed page like `/signin`), add its path to
`NO_CHROME_ROUTES` in `app-shell.tsx` rather than trying to suppress
`Header`/`Footer` from within the page itself - there's no longer a per-page
mechanism for that.

## Shared list-page pattern: `useAuthGuard` + `usePaginatedResource` + `useDeleteResource`

The dives/trips/dive-sites list pages (`app/dives/page.tsx`,
`app/trips/page.tsx`, `app/sites/page.tsx`) used to each hand-roll the same
~100 lines: an auth-redirect effect, fetch-on-mount + pagination state, a
native `confirm()` + delete + toast + refetch flow, and a "Showing X to Y of
Z" footer. That's now factored into three hooks plus two shared components -
any new paginated/deletable resource list should reuse them rather than
re-deriving the pattern:

- `hooks/useAuthGuard.ts` - redirects to `/signin` once the auth check
  settles and the user isn't signed in (mirrors `useRedirectIfAuthenticated`
  for the opposite case: public-only pages redirecting *signed-in* users
  away).
- `hooks/usePaginatedResource.ts` - takes a `(page, perPage) =>
  Promise<{data, total_count, has_more}>` fetcher and returns
  `items`/`isLoading`/`totalCount`/`currentPage`/`hasMore`/`fetchPage`/
  `refetch`. Pair with `components/ui/pagination-footer.tsx`
  (`<PaginationFooter />`) for the "Showing X to Y of Z" + Previous/Next UI -
  it renders nothing if everything fits on one page.
- `hooks/useDeleteResource.ts` - takes a `(id) => Promise<...>` delete
  function and returns `deletingId`/`pendingId`/`requestDelete`/
  `cancelDelete`/`confirmDelete`. Pair with `components/ui/confirm-dialog.tsx`
  (`<ConfirmDialog open={pendingId !== null} ... />`) instead of the blocking
  native `confirm()` - it's stylable, testable, and doesn't freeze the tab.

Wire `usePaginatedResource`'s `refetch` as `useDeleteResource`'s `onDeleted`
so a successful delete refreshes the current page.

## Access token lives in memory only, never in `localStorage`

`lib/api/client.ts` used to store `access_token` in `localStorage`, which any JS
running on the page (XSS, a compromised dependency, a browser extension, an
error-reporting SDK that serializes storage) can read directly via
`localStorage.getItem`. The refresh token was already safe (`httponly`,
`secure`, `samesite=lax` cookie set by the API - see `login.py`), so only the
access token needed fixing.

It's now a plain module-scoped variable in `client.ts`, exposed via
`getAccessToken`/`setAccessToken`/`clearAccessToken` - not React state/context,
since the request interceptor just needs the latest value at request time, not
a re-render. Because it's in-memory only, it doesn't survive a page reload, so
`AuthContext`'s bootstrap effect calls `refreshAccessToken()` (POST `/auth/refresh`,
re-deriving a token from the httpOnly cookie) on every mount instead of
checking `localStorage` for a cached token. `authAPI.isAuthenticated()` now
just reflects whether the current tab happens to hold a token in memory right
now, not whether the user has a valid session overall - use
`refreshAccessToken()` for that.

Note this only protects against *passive*/out-of-band token exfiltration
(storage-scraping malware, other scripts reading storage later, etc.) - a
*live* XSS payload executing in the page can still just call `/auth/refresh`
itself and ride the session for as long as the page stays open, since the
browser attaches the httpOnly cookie automatically. Actual XSS prevention
(escaping, CSP - see below) is what closes that gap, not token storage
choice alone.

## Strict, nonce-based CSP via `src/proxy.ts` - Node server only

`src/proxy.ts` (Next.js 16 renamed the `middleware` file convention to
`proxy` - see https://nextjs.org/docs/messages/middleware-to-proxy; the
exported function is named `proxy`, not `middleware`) generates a fresh,
unpredictable nonce on every request and sets a `script-src 'nonce-...'
'strict-dynamic'` CSP - no unqualified `'unsafe-inline'` in any browser that
understands nonces. The nonce is threaded to Server Components via the
`x-nonce` request header; `app/layout.tsx` reads it via `headers()` and
passes it to `next-themes`' `ThemeProvider` (its no-flash-of-wrong-theme
bootstrap `<script>` needs a matching nonce to be allowed to run). Next.js
automatically propagates the same nonce into its own internal
hydration/RSC-payload `<script>` tags and the CSS/font preload `Link`
headers once the request header is set this way - no extra wiring needed
beyond the one `nonce={nonce}` prop.

This only works because the app runs as a persistent Node server
(`output: "standalone"`, see the `Dockerfile`). Two things to know before
touching this:

- Reading `headers()` in the root layout forces every route to render
  dynamically (`ƒ` instead of `○` in the `next build` output) - there is no
  statically-prerendered page anymore. This is an accepted, deliberate
  trade-off for the stronger CSP, not a regression to "fix".
- If the app ever moves to a static export (`output: "export"`), this
  entire mechanism breaks: `next build` explicitly lists `Proxy`, `Headers`,
  and dynamic APIs like `headers()` as unsupported there (confirmed by
  actually trying it - the build fails immediately, first on the `[id]`
  routes missing `generateStaticParams()`, and would fail again on `proxy.ts`
  even after fixing that). A nonce also fundamentally can't work against a
  static file anyway, since it must be unique per response and a static
  export serves the same bytes to everyone. If/when static hosting happens,
  this needs to be replaced with a build-time hash-based CSP or a CDN/host-level
  static header config instead - see chat history from the security-hardening
  session for the explored options (query-param/rewrite-based routing for the
  `[id]` pages, hash-generation postbuild script for CSP).
- `eslint.config.mjs` has `"react/no-danger": "error"` as a guardrail - the
  codebase has no `dangerouslySetInnerHTML` today (React's default escaping
  is the actual first line of defense), and any future use of it needs an
  explicit `eslint-disable` plus a sanitizer (DOMPurify/`rehype-sanitize`),
  not an unreviewed add.
- `style-src-attr` is intentionally its own directive with plain
  `'unsafe-inline'` (no nonce), separate from the nonce-gated `style-src`.
  Per the CSP spec, a nonce/hash in a directive disables that directive's
  `'unsafe-inline'` fallback, and inline `style="..."` attributes set by
  UI libraries (Radix's `pointer-events`/positioning styles, etc.) can't
  practically carry a matching nonce - there's no way to tag every element
  a third-party component renders. Inline style *attributes* can't execute
  script in any modern browser (unlike injected `<style>`/`<script>`
  elements), so this is a narrow, deliberate relaxation; `style-src` (which
  governs actual `<style>` blocks) stays nonce-only in production.
- `style-src` itself only carries the nonce in production; in dev it falls
  back to plain `'unsafe-inline'`. Next's own dev-mode tooling - Fast
  Refresh, the dev/error overlay, webpack/Turbopack's CSS hot-injection -
  injects inline `<style>` tags with no nonce at all, unrelated to any app
  code (documented upstream, e.g. vercel/next.js#87343); a strict nonce
  here just breaks dev styling for reasons outside this app's control.
  Production never inline-injects CSS - it ships static, hashed
  `<link rel="stylesheet">` files covered by `'self'`, so the nonce
  requirement costs nothing there.
- Radix components that lock body scroll (`Dialog`, `Popover`,
  `DropdownMenu`, ...) pull in `react-remove-scroll` ->
  `react-style-singleton`, which injects a `<style>` tag straight into
  `document.head` via raw DOM APIs - completely outside React/Next's own
  nonce propagation. It looks up a nonce via the `get-nonce` package's
  `getNonce()`, which only returns one if something already called
  `setNonce()` (or set the webpack-specific `__webpack_nonce__` global) in
  the browser. `src/components/nonce-provider.tsx` is a tiny client
  component, mounted near the root of `app/layout.tsx`, that calls
  `setNonce(nonce)` synchronously in its render body (not a `useEffect`) so
  it's guaranteed to run before any descendant's mount-time effects -
  React finishes calling every component function in the tree before
  committing and running effects, so this ordering is reliable even though
  the scroll lock itself only activates later (e.g. when a dialog opens).
  Without this, opening the first `Dialog`/`Popover`/etc. throws a
  `style-src-elem` CSP violation for react-remove-scroll's un-nonced style
  tag.

## Unified auth flow: `/signin`/`/signup` are gone, replaced by `AuthForm` on the landing page

The password-based `SignInForm`/`SignUpForm` (and their `/signin`/`/signup` pages)
were removed entirely, matching the API's move to a passwordless, single-entry-point
auth flow (see the API's `DECISIONS.md`). There is now exactly one form,
`components/auth/AuthForm.tsx` - an email field, a "Continue" button, and "Continue
with Google" - and it lives directly in the landing page's hero section
(`app/page.tsx`, `#get-started`), not behind a dedicated route or a modal. `Header`'s
authenticated-out state is now a single "Sign In" button linking to `/#get-started`
rather than separate Sign In/Sign Up buttons.

Three new routes carry the rest of the flow:
- **`app/auth/verify/page.tsx`** - what the emailed magic link actually points to
  (`{FRONTEND_URL}/auth/verify?token=...`). Deliberately a page that *calls* `POST
  /auth/email/verify` from a `useEffect`, rather than the link target being that API
  call directly - an email client or link-scanner prefetching the URL only ever
  loads this page (a harmless GET), it never runs the app's JS, so it can't
  accidentally burn the single-use token before the real user clicks it. A `useRef`
  guard (`hasRun`) stops React Strict Mode's double-invoked effects in development
  from doing the same.
- **`app/onboarding/page.tsx`** - profile completion (name + username, email
  read-only), shared by both auth methods. It reads from `AuthContext`'s
  `onboarding` state, which only ever exists in memory (set by `verifyEmailLink`/
  `signInWithGoogle` when the backend returns `status: "onboarding_required"`) and
  is never persisted - a direct page load/refresh has nothing to recover, so the
  page bounces back to `/` instead of erroring.
- **`AuthContext`** grew `onboarding`/`completeProfile`/`clearOnboarding` alongside
  the rewritten `requestEmailLink`/`verifyEmailLink`/`signInWithGoogle` - the latter
  two now return a `boolean` (`true` = signed in, `false` = onboarding started)
  instead of `void`, since the caller (the verify page, or `GoogleAuthButton`) needs
  to decide whether to route to `/dashboard` or `/onboarding`.

`useAuthGuard`'s default `redirectTo` changed from `/signin` to `/` - the landing
page *is* the sign-in surface now, so there's no separate page to send signed-out
visitors to. `NO_CHROME_ROUTES` in `app-shell.tsx` changed from `/signin`/`/signup`
to `/onboarding`/`/auth/verify` (the two remaining standalone, chrome-free pages).

Settings' "Change Password" card was deleted outright (`app/settings/page.tsx`,
`lib/validations/settings.ts`'s `passwordSchema`) - there's no password anywhere
to change. Profile editing (name/username/email) is unaffected; it was never part
of the auth flow itself, just a `PATCH /user/{uuid}`.

### `GoogleAuthButton` talks to `google.accounts.id` directly - `@react-oauth/google` was removed

This app used to render Google's button through the `@react-oauth/google` package
(`GoogleOAuthProvider` in `app/layout.tsx`, `GoogleLogin` in `GoogleAuthButton`).
It's no longer a dependency at all - removed (`npm uninstall @react-oauth/google`)
after it turned out to make one specific, real requirement impossible to satisfy
cleanly: forcing the button's language to English regardless of the visitor's
browser/Google account locale (a real bug report: a German-locale browser saw "Mit
Google anmelden", while every other string in this app - which has no i18n at all -
is always English).

The first attempt was to pass `locale="en"` to `GoogleLogin`. That did nothing.
Per Google's own docs (Sign In With Google → Display the button → "Button
Language"): the button's language is only reliably overridden by adding an `hl`
query parameter to the **script URL itself**
(`https://accounts.google.com/gsi/client?hl=en`) - the `locale`/`data-locale`
config value is documented as a companion to that, not a substitute for it; the
actual translated strings are baked into the script response at load time, based
on the request's `hl` param (or failing that, the browser's `Accept-Language`/the
signed-in Google session's own language). `@react-oauth/google`'s script loader
(`GoogleOAuthProvider`'s internal `useLoadGsiScript`) hardcodes the plain,
un-parameterized URL with no prop to add a query string to it - so there was no way
to get the `hl` parameter in via that library at all, short of loading a *second*
copy of the same script with `?hl=en` ourselves alongside it. That second option
was considered and rejected: both scripts would race to define the same
`window.google.accounts.id` global, and whichever `onload` fired last would win -
inherently non-deterministic, and liable to silently regress back to the wrong
language depending on network timing.

So `GoogleAuthButton` now calls the vanilla `google.accounts.id.initialize()`/
`renderButton()` JS API itself, after loading `.../gsi/client?hl=en` with its own
(deduplicated - see `loadGsiScript`'s module-level promise) `<script>` tag - the
same API `@react-oauth/google` was itself a thin wrapper around, so nothing was
lost by dropping it; this app only ever used its single, simplest feature (a
standard `GoogleLogin` button, not one-tap/auto-sign-in/the custom-button hooks).
This also has a nice side effect on the unrelated `[GSI_LOGGER]` "initialize() is
called multiple times" dev warning `@react-oauth/google` used to cause (see the
previous version of this entry, and `git log` for the full story of why
`reactStrictMode` was briefly toggled off and then back on over it): this
hand-rolled version calls `initialize()` from its own effect exactly once (guarded
by `[clientId, onError]` deps and a ref for the actual callback logic, so it never
needs to re-run), and calls `renderButton()` - which is *meant* to be called
repeatedly, once per desired appearance change - from a separate effect keyed on
`[ready, width, resolvedTheme]`. The warning simply doesn't apply to code that only
ever calls `initialize()` once per script load.

Google's Sign-In button renders inside its own iframe, so it can't be reached with
our own CSS at all - only through `renderButton`'s own config options.
`GoogleAuthButton` sets:
- **`theme`** - tracks `next-themes`' `resolvedTheme`: `"outline"` (a white
  button with a gray border) in light mode, matching the white card it sits on;
  `"filled_black"` in dark mode, matching the near-black card background
  (`--card` in `globals.css`). Using the same `"outline"` theme in dark mode would
  render a stray white box that doesn't match anything else on the page.
- **`shape="rectangular"`** - the closest of GSI's four shapes to `Button`'s own
  `rounded-md` corners; `"pill"` (fully rounded) would stand out as visibly more
  rounded than every other button on the page.
- **`text="continue_with"`** - renders "Continue with Google", matching this
  form's own "Continue"/"Continue with Google" copy instead of GSI's default
  "Sign in with Google" (which would be an odd thing to show a new user, given
  this one button covers both sign-in and sign-up - see above).
- **`logo_alignment="center"`** - centers the Google logo + text as a unit,
  matching how the icon and label center together inside our own `Button`s
  (e.g. the `ArrowRight` next to "Continue"), instead of GSI's default of
  pinning the logo to the left edge.

Width needed more than a static config value: GSI's `width` is a fixed pixel
number (clamped by Google itself to 200-400px), not a CSS percentage, so it can't
just be told `w-full` the way the "Continue" button above it can.
`GoogleAuthButton` measures its own wrapping `<div>` (which - being an ordinary
block box in the same padded card as the "Continue" button - is exactly as wide as
it, and also `renderButton`'s own target element) via a `ResizeObserver`, and feeds
that measured width (clamped to GSI's 200-400 range) into the next
`renderButton()` call, so the two buttons end up pixel-width-matched and stay in
sync if that width ever changes (e.g. the viewport being resized).

A minimal `declare global { interface Window { google?: ... } }` augmentation
covers just the two methods actually used (`initialize`, `renderButton`) - no need
to pull in `@react-oauth/google`'s (or `@types/gapi.auth2`-style) full type
definitions for a two-method surface.

### The button's border radius and dark-mode outline aren't config options - GSI's own pixels can't be reached, so a wrapper draws the missing edge instead

A follow-on request: match the button's corner radius to `Button`'s own
`rounded-md`, and fix how the button visually disappears in dark mode (the
`filled_black` theme has no border of its own, and blends into the near-black
`--card` background it sits on).

The first idea - reaching for a *fully* custom-graphic button, along the lines of
[Google's "Building a button with a custom graphic" guide](https://developers.google.com/identity/sign-in/web/build-button)
- turned out to be a dead end: that guide is for the **deprecated** `gapi.auth2`
library (the page says so explicitly), not the Google Identity Services library
this app actually uses. GIS deliberately has no equivalent of `gapi.auth2`'s
`attachClickHandler(anyElement, ...)` for the ID-token/credential flow - only
`renderButton()` can trigger it, and it only exposes the config already listed
above (`theme`/`shape`/`text`/`logo_alignment`/`width`) - no border-radius, and no
way to remove the light backing chip GSI always puts behind the multicolor "G"
logo on dark themes (it's there so the logo stays legible against a dark fill).

A fully pixel-perfect custom button *is* still technically achievable by
overlaying an invisible (`opacity: 0`) real `renderButton()` output on top of a
fully custom-styled visible button, so clicks land on the real, invisible one -
but that was set aside for now: making the real interactive button invisible also
makes its native keyboard-focus ring invisible, a real accessibility regression
that would need extra work to paper over convincingly.

What shipped instead, as the safer option: a `border border-input rounded-md
overflow-hidden` wrapper around GSI's own rendered button (`GoogleAuthButton`),
matching `Button`'s own outline styling. This doesn't touch GSI's own pixels at
all - it just draws a visible edge around whatever GSI renders inside (fixing the
actual dark-mode complaint: the button having no boundary at all against the
card), and `overflow-hidden` neatly clips GSI's own (very slightly rounded
"rectangular"-shape) corners flush with our own `rounded-md` corner underneath.
The light logo-backing chip in dark mode is unaffected either way - it's GSI's own
pixels, inside the border, not something a wrapper can reach - and is left as an
accepted, common trait of Google's own dark-themed button (see plenty of other
sites' dark modes) rather than something worth the accessibility trade-off above
to fully eliminate.

### `colorScheme` on the render target, kept in sync with `resolvedTheme` (not hardcoded to `"light"`)

A reasonable follow-up question, prompted by [a Medium post](https://medium.com/@ludvig.flyckt/fixing-the-react-google-auth-button-background-in-dark-mode-150e12220256)
describing a real `@react-oauth/google` dark-mode fix: wrapping the button in a
`<div style={{ colorScheme: "light" }}>`. That post's fix is for a *different*
symptom than the logo-backing chip above, though: it's for sites that always want
a light-styled Google button (`theme="outline"`/`"filled_blue"`) but see the
surrounding iframe/UA chrome pick up a stray dark background regardless - `color-
scheme` is a real CSS property (distinct from GSI's own `theme` config) that hints
to the browser which UA-native rendering defaults (initial/unstyled backgrounds,
form-control chrome, etc.) to use, and this app set it nowhere at all, leaving it
to the browser's default OS-preference-based inference - which has no guaranteed
relationship to *this app's own* manually-toggled dark/light state (`next-themes`
is a `class`-based toggle, entirely independent of the OS's `prefers-color-scheme`,
so a visitor's OS could easily disagree with what this app is currently showing).

At the time, `GoogleAuthButton`'s render target was set to
`colorScheme: resolvedTheme === "dark" ? "dark" : "light"` - kept explicit and in
sync with the same `resolvedTheme` driving GSI's `theme` config then, rather than
left to a browser/OS guess that may or may not agree with it (a reasonable change
to make regardless of what it does or doesn't fix visually, since there's no
reason for a UA-level rendering hint to ever disagree with what the app already
knows), while flagging that it wasn't expected to touch the logo-backing chip -
that's an explicit background GSI's script draws for contrast against a solid
fill, not an unstyled/transparent region deferring to a UA color-scheme default.

That prediction held: the chip was still there after shipping it. See the next
entry for what actually resolved this.

### Resolution: `theme` is always `"outline"`, regardless of the app's own light/dark mode

With the logo-backing chip confirmed as genuinely unreachable (not a CSS/config
issue - see both entries above), the two remaining options were: (1) accept a
fully custom button via the invisible-`renderButton()`-overlay trick from above,
accessibility trade-off included, or (2) stop trying to make GSI's button itself
look dark at all, and just show the same clean, fully-`"outline"` (light) button
in both of this app's themes - trading an exact dark-mode match for a button
that's simply, consistently correct-looking everywhere. Option 2 shipped first,
as the cheaper, zero-risk change - `GoogleAuthButton` no longer reads
`resolvedTheme`/`next-themes` at all, since `theme: "outline"` and
`colorScheme: "light"` are now both unconditional. This is a genuinely common
pattern - plenty of sites keep Google's button light regardless of their own
site's theme, rather than fight GSI's limited dark-theme options.

The `border border-input rounded-md overflow-hidden` wrapper (see above) still
earns its keep even with an all-light button: `outline` theme's own border color
is a fixed light gray that would otherwise contrast poorly against this app's
dark `--card` background at the seam where GSI's iframe meets our own layout;
the wrapper's border (drawn in our own `--input` color, which *does* adapt to
dark mode) keeps that edge visible and consistent in both themes.

If a truly dark-native button (no light patches anywhere) becomes worth the
accessibility trade-off later, the fully custom overlay approach from above is
still the one documented path to get there.

### Resolution, take two: the fully custom overlay button, with the focus-ring trade-off actually mitigated

The all-`"outline"` button above shipped first as the cheap, zero-risk fix, but
was revisited in favor of the fully custom button after all: `GoogleAuthButton`
now renders its own `Button`-styled visual (own inlined "G" logo -
`components/google-icon.tsx`, see the next entry for exactly where that came
from - exact `rounded-md` corners, follows the app's theme like any other
button) with GSI's *real* `renderButton()` output stacked exactly on top of it at
`opacity: 0`. Clicks land on the real, invisible button; nobody ever sees its
actual pixels, so none of GSI's theme/shape/logo-chip limitations matter anymore -
only its *size* (via `width`, still measured the same way as every earlier
version) and its role as the click/keyboard target.

The accessibility concern flagged when this option was first raised - making the
real interactive element invisible also hides its native focus ring - turned out
to have a clean, pure-CSS mitigation: `:focus-within`/`:hover` (and `:has()`)
match an ancestor whenever *any* descendant matches, including a descendant
that's a focused/hovered cross-origin `<iframe>` (browsers treat a focused iframe
as matching `:focus`/`:focus-visible` on the iframe element itself, which is
enough for these ancestor-matching pseudo-classes to pick it up, no JS required).
So the visible and invisible buttons share one `group`-marked wrapper, and the
*visible* decorative button's hover/focus-ring styling is driven by Tailwind's
`group-hover:`/`group-has-[:focus-visible]:` variants - reacting correctly to
interaction with the real (invisible) button, without ever touching it directly.

The first version of this used `group-focus-within:`, not `group-has-
[:focus-visible]:`, for the ring - and immediately showed an unwanted bright ring
after an ordinary *mouse click*, not just keyboard Tab navigation. That's exactly
what `:focus-within` is defined to do (match on *any* focus, mouse- or
keyboard-triggered alike) - the same thing `:focus` (as opposed to
`:focus-visible`) does on a plain element, and precisely why native `<button>`s
use `focus-visible:` rather than `focus:` for their own ring in this codebase
(see `buttonVariants` in `components/ui/button.tsx`). `group-has-[:focus-visible]:`
(Tailwind's `has-*` arbitrary-variant syntax, generating `.group:has(:focus-
visible) *`) is the ancestor-matching equivalent of that same distinction - it
only matches when the browser judges the underlying focus as keyboard-driven,
rather than on every focus. The ring classes (`group-has-[:focus-visible]:ring-2
group-has-[:focus-visible]:ring-ring group-has-[:focus-visible]:ring-offset-2`)
otherwise intentionally mirror `Button`'s own `focus-visible:` styling exactly,
for the same visual result.

The decorative visual button is `aria-hidden="true"` with `pointer-events-none`
(defensive - the real button's higher `z-10` already guarantees it receives every
click regardless) - only the real button is ever exposed to assistive tech, and
it carries its own correct accessible name from GSI's `text: "continue_with"`
config, matching what's shown visually.

### `google-icon.tsx`'s "G" mark is extracted directly from Google's own pre-approved asset download - not hand-reconstructed

The first version of `components/google-icon.tsx` used the classic, flat
4-quadrant "G" (solid `#4285F4`/`#34A853`/`#FBBC05`/`#EA4335` fills) - the
long-standing mark, and still byte-accurate for *that* version of the logo. But
Google's current [Sign in with Google branding guidelines](https://developers.google.com/identity/branding-guidelines)
specifically require "the standard color **gradient** super G logo" - Google
refreshed the mark itself on May 12, 2025 from flat quadrant fills to an actual
gradient blend between them, and the branding guidelines page mandates that
current version specifically ("Don't ... use an outdated Google 'G' for the
button").

Getting the *exact* current asset mattered enough here to not guess: this tool's
`fetch` can extract readable text from HTML pages, but not raw SVG/binary file
contents (tried several direct asset URLs first - all came back as unparseable/
empty), so there was no way to byte-verify a hand-reconstructed gradient against
Google's real one from this environment alone. The actual fix: the user
downloaded Google's own pre-approved icon bundle directly from the branding
guidelines page ("Download Pre-Approved Brand Icons") and pasted one of the
SVGs in - the dark-theme, pill-shaped, icon-only, Android+Web variant.

That file is a full pre-styled *button* (pill-shaped `#131314` background,
`#8E918F` stroke, plus the "G" mark), not just the logo mark alone - only the
logo needed extracting, since this app's button already supplies its own
background/border/shape (and per the guidelines, the "G" mark's own color is
fixed regardless of button theme, so pulling it from the dark-theme download
specifically doesn't matter - light/dark/neutral variants all use the identical
mark). What got kept, verbatim: the mask path that traces the actual "G"
letterform, and the entire gradient-producing layer it masks - a CSS
`conic-gradient()` (rendered via a `<foreignObject>`, since SVG has no native
conic/angular gradient paint server) plus several soft, blurred colored
ellipses layered on top for the same painterly color blending Google's own
asset uses, rather than a flat conic sweep. What got dropped: the pill
background/stroke paths, and Figma-export-only metadata
(`data-figma-gradient-fill`, `data-figma-skip-parse`) that browsers never read
and JSX can't cleanly hold anyway. The outer `viewBox` was cropped from the
original `0 0 40 40` (the whole button, mostly empty space around the mark) down
to `10 10 20 20` (the mark's own bounding box) - safe to do without recomputing
any of the inner coordinates, since a `viewBox` change only changes which
region of the same coordinate space is visible/scaled, and the mask already
confines everything to the "G" shape regardless of how far the gradient/blur
layers extend past it.

The original file hardcodes its mask/clip-path/filter `id`s (safe only because
it's a lone, standalone SVG file, never composed with anything else) - since
`GoogleIcon` is a React component that could in principle render more than once
on a page, every one of those ids is namespaced through `React.useId()` instead,
so multiple instances (however unlikely in practice) can never collide.

One real bug from the first pass at this extraction: the icon rendered as almost
solid black, with only a sliver of color peeking through at the edges. Root
cause - the root `<svg>` in Google's original file carries `fill="none"` as a
presentation attribute, and `fill` is inheritable in SVG; that root-level `none`
is the only reason the small fallback `<path>` sitting alongside the
conic-gradient `<foreignObject>` (present purely for Figma's own re-import -
its `data-figma-gradient-fill` attribute is metadata Figma reads, not something
any browser renders) stays invisible. Rewriting this as a React component and
dropping that root `fill="none"` (along with the Figma-only metadata
attributes) left that fallback path with no `fill` of its own, so it fell back
to SVG's actual initial value - solid black - and painted right over the
gradient beneath it, in document order. Restored by adding `fill="none"` to
`GoogleIcon`'s own root `<svg>`, matching the original.

Remaining trade-offs, accepted: this relies on the real and decorative layers
staying pixel-aligned (both simply fill the same `relative` wrapper via
`inset-0`, so this only breaks if that structure changes), and on browsers'
focused-iframe-matches-:focus behavior, which is old, stable, and consistently
implemented, but still an assumption about GSI's internals rather than a
documented contract with Google.

## Changing your account email is a request/confirm flow, not a plain field edit

`lib/validations/settings.ts`'s `profileSchema` no longer has an `email` field -
matching the API dropping it from `UserUpdate` entirely (see the API's
`DECISIONS.md`). `app/settings/page.tsx`'s profile form only ever touches
name/username now; email lives in its own `components/settings/EmailChangeCard.tsx`,
a small request/confirm UI: enter a new address, submit
(`authAPI.requestEmailChange`), get back the same generic "check your new email"
message regardless of whether that address is already taken by someone else, and the
change only actually applies once the emailed link is confirmed.
`requestEmailChange` takes only `newEmail` - the backend's `POST
/user/email-change/request` always operates on the caller's own account (from the
access token), so `EmailChangeCard` doesn't need (and no longer takes) a `userUuid`
prop.

`EmailChangeCard` used to hide the "new email" field behind a "Change email" button
(an `isEditing` toggle) - removed in favor of always showing the field and a single
full-width "Send confirmation link" button, matching the Profile Information card's
always-visible form (and its full-width "Save Changes" button) next to it, and
avoiding an extra click for what's usually a rarely-used but still one-step action.
There's no separate "Cancel" button either - with the field always visible, there's
no edit mode to cancel out of; a mis-typed address is just overwritten or left as-is.
Both settings cards (`app/settings/page.tsx`'s Profile Information card and
`EmailChangeCard`) use the same `flex flex-col h-full` (card) / `flex flex-col
flex-1` (content/form) / `flex-1` (fields wrapper) structure so their action buttons
land at the same vertical position regardless of how much taller one card's field
list or inline alerts make it - the fields wrapper absorbs the extra height and the
button stays pinned to the bottom of the (grid-stretched, so equal-height) card,
rather than trailing directly after the last field the way it did before.

That confirmation link points at `app/settings/confirm-email/page.tsx` - structurally
similar to `app/auth/verify/page.tsx`. It's in `NO_CHROME_ROUTES` for the same reason
`/auth/verify` and `/onboarding` are - a standalone, centered-card confirmation
screen, not a page meant to sit inside the normal app chrome. On success it calls
`refreshUser()`, which is a harmless no-op unless the visitor happens to still be
signed in on that same browser/tab (the link is just as likely to be opened
elsewhere, e.g. a different device's mail app).

### Both magic-link pages require an explicit click before the verifying `POST` fires

A real user reported clicking a confirmation link and seeing "invalid or expired",
despite their email having actually changed in the DB. Root cause: many mail clients
(Outlook/Microsoft Defender "Safe Links", iOS Mail's rich link previews) render links
using a real, JS-executing browser to generate a preview/security-scan *before* a
human clicks them, which - when both pages auto-verified from a `useEffect` on load -
silently consumed the token first.

Two other fixes were tried and abandoned before landing here:
- A same-browser "pairing" cookie (paired at request time, checked at verify time) to
  tell a scanner apart from the real user - rejected because requesting a link on one
  device/browser and opening it from another (e.g. laptop -> phone's mail app) is a
  completely normal, common flow, not a corner case; pairing would've punished it as
  if it were suspicious.
- Auto-verifying unconditionally on load, relying solely on the backend's
  idempotent-reuse handling (see below) to paper over a scanner having already
  consumed the token - genuinely zero-click, but still lets automation silently
  trigger the *real* sign-in/email-change before a human ever acts, which is the
  actual thing being protected against, not just the confusing error message.

The fix that stuck mirrors what the sign-up flow already gets "for free": completing
a *new* account requires a real person to fill in and submit the profile-completion
form (`/onboarding`) - something automation won't do - so no sign-in/account-creation
ever happens without genuine user interaction. `/auth/verify` and
`/settings/confirm-email` now apply the same principle to the other two flows: both
render a `"ready"` state with a plain button ("Sign in" / "Confirm email change") and
only call `verifyEmailLink`/`verifyEmailChange` from that button's `onClick`, never
automatically. A preview/scan can load and render the page, but it can't fake a real
click, so the token isn't touched - and no session is issued, no email is changed -
until an actual person acts.

The backend's idempotent handling of an already-used-but-not-invalidated token (see
the API's `DECISIONS.md` - `AuthenticationRequest.used_at` vs. `invalidated_at`) is
still in place and still useful (e.g. a double click, or a slow network retry), but
is defense-in-depth layered under the click requirement, not a substitute for it.

Once `/settings/confirm-email` reaches its `"success"` state, it auto-redirects to
`/settings` after a 3s `setTimeout` (cleaned up on unmount/state change) - there's
nothing more to do on this standalone confirmation page once the change is applied,
so it sends the user back on its own rather than leaving them stranded there. The
"Back to settings" link stays visible too, for anyone who wants to leave sooner.
`/auth/verify` doesn't need this: a successful sign-in already navigates itself, via
`router.replace("/dashboard")`/`"/onboarding"`, right after `verifyEmailLink` resolves.

### The button itself shouldn't show for a link that's already been used

Follow-on report: pressing the browser's **back** button after already confirming
an email change lands back on `/settings/confirm-email` with the "Confirm email
change" button still there, and clicking it again "succeeds" (the backend's
idempotent-reuse leniency treats it as a harmless repeat - see the API's
`DECISIONS.md`). That leniency is meant for races, not for making a stale,
already-actioned link look repeatedly actionable to a human revisiting it.

Both pages now call a new, side-effect-free precheck on mount - `authAPI.checkEmailLink`/
`checkEmailChangeLink` (`GET /auth/email/verify/check` / `GET
/user/email-change/verify/check`) - *before* ever showing the confirm button. A new
`"checking"` state (distinct from `"verifying"`, which is what happens *after* the
button is pressed) covers this brief lookup. If the link is already used,
invalidated, or expired, the page goes straight to the `"error"` state - the button
never appears at all. Only a still-live token reaches `"ready"`. A `useRef` guard
(`checkedRef`) keeps this check from firing twice under React Strict Mode's
double-invoked effects - harmless either way since the check has no side effects,
but wasteful to double up on.

The check response also carries the token's target email, which both pages now
surface: `/auth/verify`'s `"ready"` state reads "Click below to sign in as
`{email}`", and `/settings/confirm-email`'s reads "...change your account's email to
`{email}`". The confirm-email page also shows the new email in its `"success"`
state ("Your email address has been updated to `{email}`"), taken from
`verifyEmailChange`'s response rather than the precheck (the precheck's `email` isn't
re-read at that point).

`AuthForm`'s "Check your email" screen has a "Resend link" button gated by a
client-side, per-component 30s countdown (`RESEND_COOLDOWN_SECONDS`) - implemented
as a `setTimeout` that reschedules itself and decrements `cooldown` by one each
second, rather than a mount-tied `setInterval`, so it naturally stops at zero and
restarts cleanly if a resend bumps `cooldown` back up. This is purely a UX nicety
(immediate, friendly feedback instead of a dead button) - the real limit is
server-side (`MagicLinkSettings` in the API's `core/config.py`) and is what actually
prevents abuse; a resend that races past the countdown still just surfaces
whatever generic message `RateLimitException` returns.

## Current-user endpoints moved off `/user/me`/`/user/{uuid}` onto a bare `/user`

The backend consolidated its current-user-only routes onto a bare `/user` (no
`/me`, no `{uuid}` - see the API's `DECISIONS.md`), as a first step toward
separating "my account" (full data, always the signed-in caller) from a future
public-profile endpoint for *other* users (limited fields, no `email`, not built
yet). `lib/api/auth.ts` was updated to match:
- `authAPI.getCurrentUser()` now calls `GET /user` instead of `GET /user/me`.
- `authAPI.updateProfile(profileData)` now calls `PATCH /user` and no longer takes
  a `userUuid` argument - it always operates on the signed-in caller, so the
  `settings/page.tsx` call site dropped the `user.uuid` it used to pass.

`lib/api/dive-stats.ts`'s `diveStatsAPI.getDiveStats()` was missed in the initial
pass (it kept calling the old `GET /user/${userUuid}/dive-stats`, which now 404s,
rather than the new `GET /user/dive-stats`) and was fixed afterward along with its
two call sites (`dashboard/page.tsx`, `profile/page.tsx`) - `getDiveStats()` no
longer takes a `userUuid` argument either, for the same reason `updateProfile`
doesn't.

There is currently no way to fetch or manage another user's data through this API
at all - that's deliberate until the public-profile endpoint exists.

## Parsed dive-file mixtures need `useFieldArray().replace()`, not `form.setValue()`

`applyParsedDiveToForm` (`dive-file-import.tsx`) filled in every top-level field
from `/dive/parse`'s response via a plain `form.setValue(...)`, but the API's
`ParsedDiveSchema.mixtures` was never applied to the form's `mixtures` field
array at all - parsed gas mixtures were silently dropped even though the
backend now returns them (see the API's `DECISIONS.md` on `SuuntoJsonParser`
gas mixtures).

The fix isn't just adding a `setDiveFormValue(form, "mixtures", ...)` call:
`MixtureFields` (`mixture-fields.tsx`) renders the array via its own
`useFieldArray({ name: "mixtures" })` call, which tracks its own `fields`
state (each row keyed by a generated `id`) independently of the underlying
form value. Overwriting the value directly with `setValue` doesn't reliably
keep that row-key bookkeeping in sync, so `applyParsedDiveToForm` now takes an
explicit `replaceMixtures` parameter and calls it with the parsed mixtures
(converted from the API's nullable/no-`id` shape to `DiveMixtureInput` via a
small `toMixtureFormValue` mapper) instead of replacing the array's contents
wholesale.

`ParsedDive` (`lib/api/dives.ts`) also gained a proper `ParsedDiveMixture`
interface/`mixtures` field - it was previously only implicitly typed via the
catch-all `[key: string]: unknown` index signature, which meant nothing caught
this at the type level.

**Follow-up bug, and the actual fix**: the first version of `replaceMixtures`
came from a *second*, separate `useFieldArray({ name: "mixtures" })` call made
directly inside `DiveFileImport`, on the assumption that react-hook-form keeps
multiple field-array subscriptions on the same `control`/`name` in sync with
each other. That assumption is wrong for shrinking: calling `replace()` on one
`useFieldArray` instance does **not** reliably shrink another separate
instance's `fields` when the new array is shorter - confirmed with an isolated
repro (two `useFieldArray({ name: "mixtures" })` calls sharing one `control`;
calling `replace()` via one instance's handle left the other instance's
`fields.length` unchanged). In practice this meant: importing a parsed file
with *fewer* mixtures than the form currently had left the extra trailing
row(s) behind instead of removing them (growing or exactly-matching counts
happened to work, which is why it wasn't caught earlier).

The real fix: there must be only **one** `useFieldArray({ name: "mixtures" })`
call for the whole form, created once at the nearest common ancestor of
everything that needs it. `mixture-fields.tsx` exports a `MixtureFieldArray`
type (`UseFieldArrayReturn<MixtureFieldsValues, "mixtures">`) and a
`useMixtureFieldArray(control)` hook that creates one, already cast to that
type (see the next section for why the cast is needed and where it now lives).
The two page components (`dives/new/page.tsx`, `dives/[id]/edit/page.tsx`)
call `useMixtureFieldArray(form.control)` once, right next to their
`useForm()` call, and pass the result down (now via `DiveFormCard`, see
below) to both `DiveFormFields`/`MixtureFields` and `DiveFileImport`. Neither
of those two ever creates its own `useFieldArray` anymore.

## `dives/new`/`dives/[id]/edit` pages' shared structure extracted into `DiveFormCard`/`PageHeader`/`PageSpinner`

The two dive form pages had a lot of identical structure wrapped around the
genuinely page-specific logic (loading the existing dive vs. pre-filling from
the last one, the create vs. partial-update payload shape, different
labels/routes). Extracted the parts that were byte-for-byte identical (or
identical modulo a handful of string/callback props) into shared components,
rather than leaving each page to re-assemble the same JSX:

- `useMixtureFieldArray(control)` (`mixture-fields.tsx`) replaces the
  `useFieldArray<TConcreteFormType, "mixtures">({...}) as unknown as
  MixtureFieldArray` block (plus its explanatory comment) that was duplicated
  verbatim in both pages - the generic parameter and the cast now live in one
  place instead of two.
- `DiveFormCard` (`dive-form-card.tsx`) wraps the `Card`/`Form`/`form` +
  `DiveFileImport` + `DiveFormFields` + `DiveFormActions` block, which was
  identical between the two pages apart from `mode`, `userId`, `onSubmit`, and
  the three action-row strings (`cancelHref`/`submittingLabel`/`submitLabel`) -
  now the only per-page inputs left.
- `DiveFormPageHeader` (`dive-form-page-header.tsx`) wrapped the back-button +
  title/subtitle block above the card, parameterized by `backHref`/
  `backLabel`/`title`/`subtitle`. It no longer exists - it was generalized into
  the resource-agnostic `PageHeader`, see the follow-up below.
- `PageSpinner` (`components/ui/page-spinner.tsx`) wraps the full-viewport
  `<Loader2>` spinner used for the auth-loading state in both pages (and
  `new`'s `Suspense` fallback). This exact markup is also duplicated across
  several other pages (`sites/new`, `sites/[id]/edit`, `trips/new`,
  `trips/[id]/edit`) that weren't touched here since they were out of scope -
  worth switching them to `PageSpinner` too next time one of them is touched
  anyway.

Each page now reduces to: its own data-loading effect(s), its own `onSubmit`,
and a handful of early-return loading/error states, followed by one
`PageHeader` (`DiveFormPageHeader` at the time - see below) + one
`DiveFormCard`. The edit page's dive-not-found and
in-card loading states were left as page-local JSX (not extracted) since
they're not shared with the create page at all.

**Follow-up:** this was later generalized. `DiveFormPageHeader`'s markup
moved into a resource-agnostic `PageHeader` (`components/ui/page-header.tsx`,
adding an optional `actions` slot for right-aligned buttons); `dive-form-page-header.tsx`
was deleted and both dive pages now import `PageHeader` directly instead.
`sites/new`, `sites/[id]/edit`, `trips/new`, `trips/[id]/edit` were switched
to `PageSpinner` + `PageHeader` (their auth-loading spinner markup was
byte-for-byte identical to `PageSpinner`, so this is a no-op visually), and
the detail pages (`dives/[id]`, `sites/[id]`, `trips/[id]`) had their
back-button + title/subtitle + Edit/Delete-button header rows switched to
`PageHeader` with `actions`. Note: the list pages (`dives`/`sites`/`trips`)
and detail pages' auth/data-loading spinners intentionally use
`min-h-[60vh]` (they render below `AppShell`'s header/footer) rather than
`PageSpinner`'s `min-h-screen`, so those were left alone.

The same six pages (the three `[id]/edit` pages and the three `[id]` detail
pages) also had two more duplicated inline blocks: the `isLoading<Resource>`
spinner (`<div className="flex items-center justify-center py-12"><Loader2 .../></div>`)
and the `!<resource>` not-found state (centered message + "Back to X" button).
These were extracted into `SectionSpinner` (`components/ui/section-spinner.tsx`)
and `NotFoundState` (`components/ui/not-found-state.tsx`, taking
`message`/`backHref`/`backLabel`) respectively - both intentionally don't
include the outer container `div`, since its class differs slightly between
edit pages (`container mx-auto px-4 py-8`) and detail pages
(`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8`). `SectionSpinner` is distinct
from `PageSpinner`: the former is for a loading section within an
already-rendered page shell, the latter is full-viewport for the top-level
auth-loading gate.

## Mixture form/display numbers needed updating to match the API's 2-decimal precision

Once the backend started rounding parsed mixture `oxygen`/`helium`/
`start_pressure`/`end_pressure` to 2 decimal places (see the API's
`DECISIONS.md`), a few spots in the frontend that assumed coarser precision
needed fixing to actually display/accept it correctly:

- `mixture-fields.tsx`'s O₂/He/start-pressure/end-pressure `<Input
  type="number">`s used `step="0.1"`, inconsistent with `max_depth`/`avg_depth`/
  `bottom_temperature` in `dive-form-fields.tsx` (`step="0.01"`) and the API's
  actual precision. Changed to `step="0.01"` to match.
- The "Volume (L)" field was a `<Select>` over 3 hardcoded tank-size presets
  (11.1/12/22.2 L). A parsed value that doesn't match one exactly (e.g. a
  D5-style JSON export's `22.0 L`, one tenth of a liter off from the `22.2`
  preset) left the select showing empty/unselected despite the underlying
  field holding a valid value. First attempted fix: inject the field's
  current value as a one-off extra `<SelectItem>` when it doesn't match a
  preset - this actually made things worse, showing a literal "NaN L" for
  exactly this case. Root cause: shadcn/Radix `Select`'s `SelectContent`/
  `SelectItem`s are portal-rendered and only registered once the dropdown has
  actually been opened, so the closed trigger's `SelectValue` has no item to
  resolve a label from for a value it's never "seen" - which some path in
  that resolution turns into `NaN` rather than falling back to the
  placeholder.

  Fixed for good by extracting the field into its own `VolumeCombobox`
  component (`volume-combobox.tsx`), built the same way `CreatableCombobox`
  already is (a plain `<input>` + a manually-rendered absolute-positioned
  dropdown of `<button>`s, not Radix `Select`) - so there's no item-registration
  step to go wrong for an arbitrary value in the first place. It supports
  picking one of a curated list of common cylinder water capacities (metric
  steel sizes, plus common US aluminum cylinders labeled with both their
  liter capacity and familiar cu-ft-based size, e.g. `11.1 L (S80)`), or
  typing/committing any other number directly - covering parsed values that
  don't match a preset without losing the one-click convenience of the
  presets for the common case. Unlike `CreatableCombobox`, the dropdown
  always shows every preset regardless of what's typed (no filter-as-you-type)
  - there are few enough of them that filtering only gets in the way of
  browsing/comparing them, and the field also just as commonly gets its value
  from a click as from typing a custom number.

  Simplified further: the input is a plain `type="number"` (matching the
  other mixture fields) showing only the bare value (e.g. `11.1`, never
  `"11.1 L (S80)"`) - a preset's descriptive label is only ever shown in the
  dropdown, as a hint for *picking* a preset, not echoed back into the input
  once selected. This dropped the separate text-vs-number `inputValue` state
  and the label-parsing branch in `commit()` entirely, since the displayed
  value is now always just `value` itself with no text-based round-tripping.
  The old custom "Clear" (X) button was also dropped once the input became a
  plain native `type="number"` - clearing via select-all+delete/backspace
  already works out of the box, so a bespoke clear affordance was redundant.
- `dives/[id]/page.tsx`'s dive-detail view displayed `mixture.oxygen.toFixed(1)}%`
  but `mixture.helium}%` with no formatting at all - inconsistent with each
  other, and the `toFixed(1)` actively hid a second decimal digit that's now a
  real, meaningful value (e.g. `20.99%` rendering as `21.0%`). Both now render
  the raw number, matching how `volume`/`start_pressure`/`end_pressure` are
  already displayed elsewhere in the same table.

## Gear sets are loaded into the dive form, never linked from the dive

The dive form's gear section (`components/gear/dive-gear-field.tsx`) has three
parts: a "Load a gear set..." picker, the item list itself
(`GearItemMultiSelect`), and a "Save as set" button. Picking a set **replaces**
the form's `gear_item_uuids` with that set's items; from that moment the two are
independent - adding or removing an item on the dive never writes back to the
stored set, and the dive is saved with items only (the API has no
`gear_set_uuid` on a dive at all - see the backend DECISIONS.md).

Three deliberate UX choices around that:

- **Replacing a non-empty list asks first.** Loading a set into an empty list -
  the common case - stays a single click, but if the diver has already picked
  gear (or loaded a different set), a `ConfirmDialog` names what's about to be
  thrown away. Cheap insurance against one mis-click wiping a hand-built list.
- **The picker un-selects itself once the list is edited.** `GearItemMultiSelect`
  takes an `onManualChange` callback fired only on user-driven add/remove (not
  on a programmatic `onChange` from loading a set), which clears the picker's
  selected set. Otherwise it would keep claiming the dive is "Sidemount" after
  the diver swapped half the kit out.
- **"Save as set" reuses the set form rather than being its own flow.**
  `GearSetDialog` is the same component the gear page uses to create/edit a set;
  from the dive form it just gets `initialItemUuids` plus
  `allowChoosingTarget`, which adds a "Save to" dropdown offering the user's
  existing sets alongside "Create a new set". One component, one set of
  validation rules, two entry points.

## The gear picker fetches archived items but won't offer them

`GearItemMultiSelect` calls `fetchAllGearItems(userId, true)` - i.e. *including*
archived gear - then filters archived items out of the dropdown. The two aren't
in conflict: an older dive (or a set built before a piece of kit was retired) can
legitimately reference archived gear, and without it in the fetched list those
selections would render as a bare `Gear #<uuid>` instead of their real name. They
show with an "Archived" badge and can be removed, just not newly added.

The same "fetch every page" loop as `DiveSiteMultiSelect` applies (see
`fetchAllGearItems`/`fetchAllGearSets` in `lib/api/gear.ts`): these are
client-side-filtered pickers, not paginated list views, so they need the user's
full set.

New-dive prefill (`dives/new/page.tsx`) carries the previous dive's gear over -
divers reuse the same kit dive after dive - but skips archived items, since the
picker wouldn't offer them for a new dive either.

## Gear is created and edited in dialogs, not on `new`/`edit` pages

Trips and dive sites each get `/x/new` and `/x/[id]/edit` pages. Gear doesn't:
`GearItemDialog` and `GearSetDialog` handle both create and edit, and `/gear` is
a single page listing items and sets together.

A gear item is four fields (name, brand, rented, notes), and the flow that
matters most is adding one *from inside a half-filled dive form* - navigating
away to a page and back would mean either losing that form or building
draft-persistence for it. Both dialogs take an optional existing record: passing
one edits it in place, omitting one creates. `/gear/[id]` still exists as a
detail page, since it hosts the "Dives with this Gear" list that makes an item's
dive count explorable.

## `ui/checkbox.tsx` is a plain `<input type="checkbox">`

Every other `ui/` primitive wraps a Radix component, but `@radix-ui/react-checkbox`
isn't a dependency and this is the app's only checkbox (the "Rented" field and the
gear list's "Show archived" toggle). A styled native input keeps focus, keyboard
and screen-reader behaviour for free without adding a package - so it takes
`checked`/`onChange` rather than Radix's `checked`/`onCheckedChange`, which is
worth remembering if a second checkbox ever needs `indeterminate` styling.

## A dialog's submit event bubbles into the form that opened it

Every "quick add" dialog - new gear item, new gear set, new dive site, new trip -
is rendered *from inside the dive form*, because the pickers that open them are
dive form fields. Each dialog contains its own `<form>`, and all four were
wiring it up as `onSubmit={form.handleSubmit(onSubmit)}`.

That silently submits the dive form too. Radix portals `DialogContent` out to
`document.body`, so there are no nested `<form>` elements in the DOM and the
setup looks fine - but React bubbles events through the **React** tree, not the
DOM tree, so the dialog's submit event still lands in the dive form's own
`onSubmit`. `handleSubmit` calls `preventDefault()` but never
`stopPropagation()`, so nothing stops it.

Symptom: add a gear item from the dive form and the item saves correctly, then
the dive form behind the dialog runs its own `handleSubmit`, fails validation on
whatever isn't filled in yet ("Duration is required") and scrolls to that field.
Pressing Enter in any dialog input does the same thing, via implicit submission.

`lib/dialog-form.ts`'s `dialogFormSubmit()` wraps the handler and stops
propagation first:

```tsx
<form onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}>
```

**Any new dialog containing a form must use it** - the bug is invisible until
the dialog happens to be opened from inside another form, and then it presents
as a mysterious validation error on a form the user never submitted.

Verified with a throwaway jsdom test that mounted a portalled form inside an
outer form: the outer `onSubmit` fires on the inner form's submit, and stops
firing once wrapped. `lib/dialog-form.test.ts` keeps the helper's contract
(stop-before-handle, event passthrough, errors not swallowed) covered.

## Gear types are a closed vocabulary shared with the API, not free text

`GEAR_TYPES` in `lib/api/gear.ts` mirrors the API's `GearType` enum. It's a fixed
list rather than a text field so the same kind of kit is named the same way
across a diver's whole list, which is what makes the type worth showing at all.

Two details worth keeping:

- **Order is meaningful.** The array is declared in the order kit is normally
  listed, not alphabetically, and it's what drives the picker's option order - so
  it reads "Mask, Snorkel, Fins..." rather than "BCD, Boots, Camera...".
- **`gearTypeLabel()` falls back to the raw value** for a type this build doesn't
  know. The API can grow a category before the frontend ships the matching label,
  and rendering the slug beats rendering a blank cell. A test walks `GEAR_TYPES`
  to catch the opposite mistake - a type added without a label.

Type is optional. `""` is the form's "not set" state (React Hook Form re-displays
a field's default whenever its value resolves to `undefined` - see "The 'cleared
field resets to default' React Hook Form quirk"), converted to an explicit `null`
on update so clearing it actually clears it, and simply omitted on create.
Radix's `SelectItem` can't take an empty string value, so the dropdown's "No
type" option uses a `__none__` sentinel - the same pattern as `GearSetDialog`'s
"Create a new set".

## `ComboboxItem.location` was renamed to `hint`

`CreatableCombobox` has always had an optional second line of text after an
item's name, documented as "purely cosmetic" but named `location` because dive
sites were its only caller. The gear picker wants the same slot for an item's
type ("Apeks XTX50, Regulator") - kit often has cryptic model names, so the
category is what makes the dropdown scannable. Renamed to `hint`, which is what
the field always was.

## Drag-to-reorder uses Pointer Events and no library

The dive form's gear list is sortable by dragging its grip handle
(`hooks/useDragSort.ts`). Three choices worth keeping:

- **Pointer Events, not the HTML5 drag-and-drop API.** HTML5 DnD emits no events
  for touch, so a phone couldn't reorder at all - the app has a mobile nav, so
  that's not a theoretical gap. Pointer events cover mouse, touch and pen through
  one code path. The handle needs `touch-action: none` (supplied by the hook, so
  consumers can't forget it) or the browser scrolls the page instead of letting
  the drag through.
- **Move listeners go on `window`, and `setPointerCapture` is deliberately not
  used.** Capture is the obvious tool and was the first implementation, but it is
  wrong here: the capturing element sits *inside* the row being reordered, so the
  moment the list rearranges React moves that row in the DOM, the browser releases
  the capture and fires `lostpointercapture` - killing the drag mid-gesture. It
  bit hardest when dragging past either end, where a swap fires immediately and
  the row was "lost" on the first movement. Window listeners don't care about the
  DOM moving underneath them, so a drag ends only on a real pointerup/cancel.
- **The dragged row is translated to follow the pointer** (`dragOffset`). Without
  it the row stayed in place until it happened to reach its destination, which
  reads as the drag never having started. The offset is re-based at each swap
  (`desiredTop - targetRect.top`) so the row doesn't jump by a row height at the
  moment the list rearranges, and is otherwise self-correcting: each move nudges
  by the difference between where the row is and where the pointer wants it,
  which survives reorders and reflows without tracking layout by hand.
- **A swap walks past every neighbour the row has cleared, not one per event.** A
  quick flick emits only a handful of pointermove events; single-stepping left the
  list crawling behind the pointer.
- **No @dnd-kit / react-beautiful-dnd.** This is one short vertical list on one
  screen; a drag library would be a dependency and a bundle for that.
- **The handle is a real `<button>` with Up/Down keyboard support.** A drag-only
  implementation quietly assumes a pointer, which would make reordering
  impossible for keyboard users. Its `aria-label` says so, since "drag to
  reorder" alone would be a dead end. Because rows are keyed by item uuid, React
  moves the DOM node on reorder rather than recreating it, so focus follows the
  item and repeated arrow presses keep working.

The list reorders live as the pointer crosses a row rather than only on drop, so
`onReorder` fires many times per gesture - hence `moveItem()` returns the *same
array reference* for a no-op move, which keeps a pointermove within one row from
queueing a pointless form-state update.

Swapping compares the dragged row's own centre against its neighbours' centres,
not "which row is the pointer inside?". The pointer-inside test did nothing while
the pointer sat in the gap between two rows, and tied the swap to where the
pointer was rather than to where the row had visibly got to.

`resolveSwapTarget()` is exported separately from the hook purely so it can be
unit-tested: it's the only pure logic (centre crossing, multi-step walking,
parking at the ends, tolerating not-yet-mounted refs) and testing it through
simulated pointer events in jsdom would mostly be testing stubs, since jsdom has
no layout and `getBoundingClientRect` returns zeroes. The gesture as a whole was
verified in a real browser instead, against a throwaway unauthenticated page:
follows the pointer 1:1 from the first pixel, swaps at the halfway crossing with
the row staying exactly under the cursor, survives being dragged far outside the
list in both directions, and leaves no transform or lifted styling behind on
release.

A second pointer going down mid-drag is ignored, or a stray finger on a
touchscreen would start a second gesture whose listeners fight the first over the
same offset.

Dive sites use the same handle, and their up/down arrow buttons were removed
rather than kept alongside it: the handle already answers Up/Down when focused,
so the arrows were a third and fourth control per row doing what the grip does.
Dive site order is semantically load-bearing (position 0 is the primary site,
shown as "Site +2" wherever only one fits), so their handle's `aria-label` names
the position and calls out the primary slot - dragging blind is fine when order
is cosmetic, less so when it decides which site the dive is filed under.

## The combobox opens on click as well as focus, and stays open for multi-select

`CreatableCombobox` originally opened its menu only in `onFocus`. Two consequences,
both reported as bugs:

- **Picking an existing item left the picker stuck.** `handleSelect` closed the
  menu, but the item's `onMouseDown` preventDefault deliberately keeps focus on
  the input - so the input stayed focused with the menu closed. A `focus` event
  doesn't fire on an already-focused element, so clicking the input did nothing:
  the only way back was to click away and click in again. Adding a second dive
  site or gear item therefore took three clicks instead of one.
- Any other path that closes the menu while keeping focus (Escape, a dialog
  restoring focus on close) landed in the same dead end.

Two fixes, deliberately both:

- `onClick` on the input also opens the menu. That's the general guard - whatever
  closes the menu, a click always brings it back, with no dependence on focus
  having actually changed.
- `keepOpenOnSelect` keeps the menu up after a pick and clears the typed filter,
  so several items can be added in a row. Set by `DiveSiteMultiSelect` and
  `GearItemMultiSelect`, whose picked items move into the list above them.
  `TripCombobox` leaves it off: it fills a single field, so closing the menu and
  showing the chosen name in the input is the right outcome there.

Verified in a real browser against a throwaway page: picking an item leaves the
input focused and empty with the menu open and the picked item gone from the
options, two picks land back to back with no clicking away, and clicking an
already-focused input with a closed menu reopens it.

## Dropdowns are navigable with Up/Down and Enter

Both of the dive form's dropdown implementations - `CreatableCombobox` (dive
sites, trips, gear) and `VolumeCombobox` (cylinder presets) - highlight rows with
Up/Down and take the highlighted one with Enter. They share `nextActiveIndex()`,
so they move identically.

The details worth keeping:

- **The menu opens with nothing highlighted (`activeIndex === -1`).** Enter then
  keeps its original meaning - commit the typed text, which is what matches an
  exactly-typed name or creates one via `onCreate` - rather than silently picking
  whichever row happened to be first. Down enters the list from the top, Up from
  the bottom.
- **Movement clamps rather than wrapping.** Running off the end of a long list
  and silently reappearing at the other end is disorienting.
- **The "Add new..." row is option 0, not a special case.** It's a row in the
  menu like any other; skipping it would make it the one thing in the list you
  can't reach by keyboard.
- **Typing resets the highlight**, since re-filtering would otherwise leave the
  index pointing at a different row than the one being looked at. Hovering with
  the mouse moves the highlight too, so mouse and keyboard can't end up
  disagreeing about which row is active.
- The input carries `role="combobox"` + `aria-expanded`/`aria-controls`/
  `aria-activedescendant`, and rows carry `role="option"`/`aria-selected`, so a
  screen reader follows the highlight without focus ever leaving the input.
  The highlighted row is scrolled into view (`block: "nearest"`) - the menu is
  only 15rem tall, so arrowing down a long list otherwise walks off the bottom.

One deliberate behaviour change: `VolumeCombobox`'s input is `type="number"`,
where Up/Down natively step the value by `step` (0.01 here). Navigating the
preset list is the far more useful binding and nudging a volume by a hundredth of
a litre isn't something anyone reaches for, but it *is* a change - if the
stepping is ever wanted back, that's the one dropdown to reconsider.

## Weight sits with the gear, not with the environment readings

`weight` (kilograms of ballast, a plain per-dive number on the API's `Dive` -
see the backend DECISIONS.md for why it isn't a gear item) is rendered directly
below the gear picker in `DiveFormFields`, and inside the "Gear" card on the
dive detail page - not alongside Bottom Temperature/Visibility.

The split the form makes is *what the diver observed* vs. *how the diver was
configured*: depth, temperature and visibility are readings taken from the dive,
while gear and weight are choices carried into it. Weight is also the field a
diver most often looks up in an old log precisely to check it against the suit
and cylinder they were using, so it wants to be next to them.

Two follow-on details:

- **The detail page's Gear card renders when *either* is present.** `hasGearInfo`
  is `gear_items.length > 0 || weight != null`, mirroring `hasEnvironmentInfo`
  above it - a dive can have a recorded weight and no itemized gear (or gear and
  no weight), and neither should hide the other.
- **`dives/new` pre-fills it from the last dive**, alongside the gear list and
  mixtures. Weight is a property of the kit and exposure suit, so it rarely
  changes between consecutive dives; the same reasoning that carries the gear
  over carries the weight.

Zod uses `min(0)` rather than `positive()` (unlike the depths), matching the
API's `ck_dive_weight_non_negative`: zero is a real entry, distinct from an
omitted one.

## Loading a gear set fills in the dive's weight too

A `GearSet` carries an optional `weight` (kg) - the ballast the diver normally
uses with that configuration - and picking a set in the dive form applies it
alongside the item list. The dive keeps its own copy from then on; the set is
never linked (see "Gear sets are loaded into the dive form, never linked from
the dive").

Three rules make this predictable:

- **A set with no weight changes nothing.** `applySet` only calls
  `onWeightChange` when `set.weight != null`. A set that doesn't record a weight
  isn't asserting "dive with zero lead", so it leaves the field alone. This is
  also why `gear_set.weight` is nullable rather than defaulting to 0 - see the
  backend DECISIONS.md.
- **The weight isn't separately guarded by the replace confirmation.** The
  `ConfirmDialog` still fires on a non-empty item list only, and the set's weight
  rides along with the items. An earlier version also confirmed when the set
  would overwrite a weight the diver had typed, and named whichever was at stake
  in the dialog copy - about 18 lines to protect one visible number that takes a
  second to retype. The item list earns a confirmation because rebuilding eight
  hand-picked items is laborious; a single number doesn't.
- **"Save as set" carries the dive's weight into the dialog.**
  `initialWeight={weight}` mirrors `initialItemUuids={value}` - whatever is on
  the dive is the obvious default for the set being saved from it.

`DiveGearField` therefore takes `weight`/`onWeightChange` props even though it
doesn't render the input. In `DiveFormFields` the gear `FormField` is **nested
inside** the weight one so both `field` objects are in scope: the alternative,
registering `weight` twice (once via `useController` for the set logic, once via
`FormField` for the input), works in react-hook-form but leaves two subscriptions
to the same name for no benefit.

## Service status is derived in the browser, because a cached "days remaining" is a lie

The API deliberately never returns a service status for a gear item - only
clock-stable facts: `next_due_on`, `next_due_at_dive_count`, `last_service_on`, plus
the item's existing `dive_count`. Status depends on *today's date*, and the API's
single-gear-item cache is an hour long (the list is 60s), so a server-computed "due in
1 day" would still say "due in 1 day" tomorrow morning.

So `serviceStatus()` in `src/lib/gear-service.ts` does that arithmetic here, at render
time, where "today" is always actually today. It's a near-line-for-line twin of
`service_status` in the API's `services/gear_service.py`, which exists solely for the
reminder email - the one consumer with no browser. The constants are named identically
on both sides (`SERVICE_DUE_SOON_DAYS = 30`, `SERVICE_DUE_SOON_DIVES = 10`), so a
single `grep SERVICE_DUE_SOON` finds the pair; change one and you must change the other.

Both interval arms are evaluated and the more urgent wins, which is what implements
"annually or every 100 dives, whichever comes first". `worstServiceStatus()` collapses
an item's schedules into the one badge shown in the gear list, and returns **`null`**
rather than `"ok"` when there are no schedules at all - nothing being tracked is not
the same as everything being fine, and `ServiceStatusBadge` renders that as a muted
dash.

## `lib/gear-service.ts` holds the logic, `lib/api/gear-service.ts` holds the transport

Two modules with almost the same name, split on purpose. `lib/api/gear-service.ts` is
the usual hand-written types + axios calls (`SERVICE_KINDS`, `serviceKindLabel`, the
`gearServiceAPI` object) mirroring the API's Pydantic schemas, exactly like
`lib/api/gear.ts`. `lib/gear-service.ts` is pure functions - no axios, no React - so
the rules that actually matter (status thresholds, date arithmetic, the due-text
phrasing, the type presets) are unit-testable and covered.

That split isn't cosmetic: `vitest.config.mts` only collects coverage for `src/lib/**`,
and component-level code is generally untested here, so anything worth testing has to
live in `lib/`. `gear-service.test.ts` is where the whole status truth table lives.

`lib/api/gear.ts` imports `GearServiceScheduleSummary` from `lib/api/gear-service.ts`
as `import type` - the API side made the mirror-image choice (`schemas/gear_service.py`
imports nothing from `gear_item.py`) so the pair points one way only and can never
become a cycle.

## Service dates are `YYYY-MM-DD` and never touch `new Date(dateString)`

`next_due_on`, `starts_on`, `serviced_on` and `last_service_on` are all bare dates, so
they fall squarely under the trap documented in "Bare `YYYY-MM-DD` dates must not go
through `new Date(dateString)`": that parses as UTC midnight, which is the previous day
anywhere west of Greenwich, and would make every due date read as one day closer than it
is.

`daysBetweenIsoDates()` builds both ends from split parts (`new Date(y, m-1, d)`), same
as `formatDateOnly()`. Using local midnight for both also makes it immune to DST - the
two Dates shift by the same offset, and rounding the millisecond difference absorbs the
one 23- or 25-hour day in between. `todayIsoDate()` is built from local getters rather
than `toISOString()` for the same reason. The tests assert exact day counts across both
DST transitions, and the suite is run under UTC-8 through UTC+14.

## Gear service uses two dialogs, and both need `dialogFormSubmit`

`GearServiceScheduleDialog` and `GearServiceRecordDialog` follow `GearItemDialog`
exactly - dialogs rather than pages, because they're a handful of fields always reached
from a gear detail page you want to stay on, and the same three-way open state (`null` =
closed, `undefined` = creating, an object = editing).

Both contain a `<form>`, so both wrap their submit in `dialogFormSubmit()` per "A
dialog's submit event bubbles into the form that opened it". They aren't opened from
the dive form today, but the rule is about the React tree, not the current call sites,
and it costs nothing.

Both interval fields use the `""`-means-cleared convention already used by
`gearSetSchema.weight`, mapped to an explicit `null` on PATCH so an interval can
actually be removed rather than being ignored as an omitted key. The
"at least one interval" rule is an object-level `.refine()`, which - unlike a
`z.preprocess()`/`.transform()` - leaves `z.input<>` untouched (see "Never use
`z.preprocess()`/`.transform()` on fields feeding `z.input<>`-derived types").

## Per-gear-type service presets are prefills, not safety advice

Opening "Add Schedule" on a cylinder starts at "visual inspection, every 12 months";
on a regulator at "service, every 12 months or 100 dives". These come from
`defaultSchedulesForGearType()` and exist purely to save typing.

They are **not** authoritative. Manufacturer service intervals differ, and cylinder
test periods are set by jurisdiction (five years across much of the US and EU, two and
a half in some regimes for some cylinder types). Every field stays editable, nothing is
filled in silently on save, and the dialog says so in as many words. This is
dive-safety-adjacent UI and must not read as advice - if the preset list is ever
extended, keep that framing.

Gear with no meaningful convention (a mask, a knife) and gear with no type set get
`[]`, not a made-up default.

## The dashboard's "Service due" card renders nothing when nothing is due

`ServiceDueCard` returns `null` when no schedule needs attention, and also when its
fetch fails (logged, not surfaced). A permanent "all your gear is fine" tile is
dashboard noise that trains people to stop reading the dashboard; a supplementary card
erroring out shouldn't make the whole page look broken either.

It calls `GET /gear-service-due`, which deliberately takes no date horizon - a
server-side "due within N days" filter would bake today's date into a cached response
and go wrong at midnight - so the bucketing happens client-side, through the same
`serviceStatus()` every other surface uses.

The gear *list* needs no extra request at all: `GET /gear-items` embeds each item's
schedules (`item.service`), and the badge is derived from those.

## The gear reminder toggle lives in its own settings card, and saves on change

`NotificationsCard` is factored out like `EmailChangeCard` rather than being bolted
onto the profile form, since it's a different concern and will grow if more email
preferences appear.

It saves immediately on change rather than behind a "Save Changes" button: it's a
single boolean, and a toggle that needs confirming reads as broken. It sends only
`{ gear_service_emails }` - `PATCH /user` is `extra="forbid"`, so sending anything else
alongside would 422.

`User.gear_service_emails` is optional in the TS type and falls back to `true` when
absent, matching the server-side default, so the toggle renders correctly against an
API that predates the field.

## Private card images render from a blob URL, which needs `blob:` in `img-src`

Certification card files are owner-only: `GET /certification/{uuid}/file/{side}` requires
an `Authorization` header. An `<img src>` cannot send one, and there is no ambient
credential to fall back on either - `lib/api/client.ts` holds the access token in memory
and only the *refresh* token is a cookie. So a plain `src` pointing at the API would 401.

`hooks/useAuthedBlobUrl.ts` fetches through the API client with `responseType: "blob"`,
wraps the result in `URL.createObjectURL`, and revokes it whenever it's replaced and on
unmount (object URLs are held by the document until explicitly released - skipping that
leaks the whole blob for the life of the page).

That required the one CSP change in `proxy.ts`: blob URLs are **not** covered by
`'self'`, so `img-src` needed an explicit `blob:` or the `<img>` is blocked. It widens
nothing an attacker could reach - a `blob:` URL can only name data this document already
created.

The hook keeps a single "settled result" object rather than three flags, and derives
`isLoading` from `result === null`. That isn't cosmetic: setting an `isLoading` flag
synchronously in the effect body trips `react-hooks/set-state-in-effect`, which is an
error in this config.

Known cost: the blob is re-fetched on every mount, so a card shown in both the list and
a dialog is fetched twice. Fine for a handful of cards with `Cache-Control: private,
max-age=300` and `ETag` revalidation behind it; it would need real thought at gallery
scale.

### Keying that fetch on (certification, side) is not enough - it breaks Replace

The card image lives at a stable URL whose *contents can change*, which breaks two
caches at once. Replacing an image would upload fine, the filename beside it would
update, and the picture would not move:

1. `fetchBlob` was `useCallback(..., [certificationUuid, side])`. Neither changes when a
   file is replaced, so `useAuthedBlobUrl`'s effect never re-ran and the previous object
   URL stayed on screen.
2. Even once it does refetch, `max-age=300` lets the *browser* serve the old bytes from
   its own HTTP cache for five minutes, since the URL is identical.

Both are fixed by `certificationFileVersion(file)` in `lib/certification.ts`, which is
in the `useCallback` deps *and* sent as a `v` query param the API ignores. `updated_at`
moves on every replace; `uuid` covers delete-then-upload, which inserts a new row rather
than updating the old one - and would otherwise produce a token identical to the
original (`updated_at` is null on both). It deliberately does **not** fold in `side`,
which is already in the URL, so repeat views of an unchanged card still hit the cache.

It lives in `lib/` rather than inline in the component specifically so it can be tested -
`certification.test.ts` covers replace, second replace, and delete-then-reupload, since
none of that is visible to a type checker and all of it looks correct while being wrong.

## PDFs are download-only, never previewed inline

Rendering a PDF inline means an `<object>` or `<iframe>`, and `proxy.ts` sets
`object-src 'none'` with a narrow `frame-src`. Loosening either to display
*user-uploaded documents* is a bad trade for a preview, so a stored PDF shows as a
labelled file with a Download button instead. Most c-cards get photographed rather than
scanned, so the image path is the common one.

Downloading goes through the API client for the same reason rendering does - a plain
`<a href>` to the endpoint would 401 - so it fetches the blob, clicks a synthetic anchor
and revokes the URL immediately.

## `useWatch`, not `form.watch()`

`CertificationDialog` shows the `agency_other` field only when the agency is `other`.
`form.watch("agency")` returns a fresh function every render that can't be memoized,
which `react-hooks/incompatible-library` flags; `useWatch({ control, name })` is the
supported equivalent. Worth knowing because the error it produces is reported against
the `useForm()` call, and while it's present the react-hooks plugin stops analysing the
rest of the component - so fixing it can *reveal* previously-silent `set-state-in-effect`
errors elsewhere in the same file.

## Certification expiry is derived in the browser, and `null` means "don't badge"

`lib/certification.ts` reuses `todayIsoDate`/`daysBetweenIsoDates` from
`lib/gear-service.ts` rather than reimplementing date maths (both avoid
`new Date(dateString)` on a bare date, which parses as UTC midnight and lands a day early
in western timezones).

`certificationExpiryStatus` returns `null` for both "no expiry date" and "expires, but
not soon" - there is no "valid" state. Most recreational certifications never expire, so
badging them all green would bury the two rows that actually need attention. Same
reasoning as `worstServiceStatus` returning `null` for untracked gear.

The window is 90 days, not gear's 30: renewing a rescue or first-aid card means booking
onto a course with an instructor, not dropping a regulator at a shop.

## Card uploads are a separate step from creating the certification

The API takes card images on `PUT /certification/{uuid}/file/{side}`, not as multipart on
create, so the dialog creates the certification first and then opens the card-images
dialog. Creating a new certification hands straight off to that second dialog - adding
the photo is the point of the feature, so making the diver find the button afterwards
would bury it.

After any upload or delete the list's embedded file metadata is stale, so the page
refetches the single certification *and* the list, and re-points the open dialog at the
refreshed row - otherwise the panel being looked at keeps showing what it loaded with.
