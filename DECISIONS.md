# Frontend Decisions & Gotchas

Notes on non-obvious choices and pitfalls hit while building out the web app, so
the reasoning survives independently of any particular chat/agent session. Keep
this updated as new gotchas are discovered.

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
on the fly" combobox. `TripCombobox`/`DiveSiteCombobox` are thin wrappers that
just supply the fetch/create API calls. If a third "pick or create" entity type is
ever needed, wrap `CreatableCombobox` the same way rather than copy-pasting the
interaction logic (filtering, commit-on-blur/Enter, mouse-down-prevents-blur for
option clicks).

## Occasional `.next` cache corruption during builds

`npm run build` has intermittently failed with unrelated-looking errors (`ENOENT`
on `.nft.json` trace files, `Cannot find module for page: /some-route`) that have
nothing to do with the code just changed - confirmed by TypeScript
compiling/linting successfully every time this happened. Fix: `rm -rf .next && npm
run build`. If a build fails in a way that doesn't match the actual diff you just
made, try this before assuming the code is broken.

## Layout width convention

Every page using the shared `Header`/`Footer` uses `max-w-6xl mx-auto px-4
sm:px-6 lg:px-8` for its content container width (matching the profile page,
which was the reference chosen). The landing page (`/`) is exempt - it's built
from several full-bleed alternating sections, a fundamentally different layout
pattern. The dive/trip/dive-site "new"/"edit" forms are also exempt - they
intentionally use a narrower `max-w-2xl` since they're single-column forms, and
they don't render `Header`/`Footer` at all.
