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
`Dive.start_time` is a full ISO datetime and doesn't have this problem - only pass
bare date-only strings through the manual-construction helpers.

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
`AuthContext`'s bootstrap effect calls `refreshAccessToken()` (POST `/refresh`,
re-deriving a token from the httpOnly cookie) on every mount instead of
checking `localStorage` for a cached token. `authAPI.isAuthenticated()` now
just reflects whether the current tab happens to hold a token in memory right
now, not whether the user has a valid session overall - use
`refreshAccessToken()` for that.

Note this only protects against *passive*/out-of-band token exfiltration
(storage-scraping malware, other scripts reading storage later, etc.) - a
*live* XSS payload executing in the page can still just call `/refresh`
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
