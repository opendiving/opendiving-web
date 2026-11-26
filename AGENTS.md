# opendiving-web

Next.js + TypeScript frontend.

`DECISIONS.md` in this repo holds the reasoning behind most of what follows — grep it for what you
are about to touch and read the matching section. Append to it only when the code cannot carry the
reason; a one-line comment at the site is the better home for most of them. An entry is under 150
words, present tense: what was chosen, what was rejected, why. No history, no symptom narrative, no
verification story — git holds the previous state. It and the other markdown docs are formatted:
run `npm run format` after editing one rather than matching the wrapping by hand.

This file is the one exception — Prettier formats it but leaves its prose wrapping alone, so wrap
new lines at 100 columns by hand. The managed block at the bottom is why; see "The project
instructions live in AGENTS.md" in `DECISIONS.md`.

## Environment & Setup

- Dev server: http://localhost:3000
- Environment: `.env` (create from `.env.example`)
- **API access**: two topologies, and the default is same-origin. Unset, axios' `baseURL`
  (`lib/api/client.ts`) is the relative `/api/v1`, and the catch-all route handler at
  `app/api/v1/[...path]/route.ts` streams each request through to `API_INTERNAL_URL` — a variable
  read per request, which is what lets one prebuilt image run on any domain. Setting
  `NEXT_PUBLIC_API_URL` overrides that base at _build_ time and the browser talks to the API
  directly instead; it is the full base, `/api/v1` prefix included, not just the origin, and
  without the prefix every request 404s. `.env` sets it to `http://localhost:8000/api/v1`, so local
  dev is the split-origin path. Despite the name, `src/proxy.ts` is Next middleware that builds a
  nonce-based CSP, not a proxy; `connect-src` is derived from this variable **and** from the
  basemap configuration (`lib/basemap.ts`), so a split-origin API is a one-variable change — and an
  API or basemap host hardcoded anywhere else will be blocked by CSP rather than merely
  misconfigured.
- **Everything else configurable is read at runtime**, not through `NEXT_PUBLIC_*`. `SITE_URL`,
  `CONTACT_EMAIL`, `GOOGLE_CLIENT_ID` and the basemap variables — `MAP_STYLE_URL`,
  `MAP_STYLE_URL_DARK`, `MAP_ATTRIBUTION` and the `MAP_TILE_*` raster escape hatch — are read on
  the server by `lib/runtime-config.ts`. Only what a client component needs — the Google client
  ID and the basemap — sits on `PublicConfig` and reaches the browser through
  `contexts/ConfigContext.tsx`'s `useConfig()`; `SITE_URL`, `CONTACT_EMAIL`, `WEB_HSTS`,
  `WEB_NOINDEX` and `IOS_APP_ID` stay on `RuntimeConfig` and are read only on the server. Add a new setting to that
  module, never as a new `NEXT_PUBLIC_` variable: those are inlined by the compiler and would be
  frozen into the published image. The prefixed spellings survive as fallbacks, read through a
  computed key so they are not inlined either. `.env.example` documents each one.

- **Never switch commit signing off on the git command line.** Where signing is on in the git
  configuration you are running under, overriding it inline buys nothing — it is the move an agent
  reaches for when it fears a hanging commit, and what it leaves behind is a PR whose every commit
  reads _Unverified_ on GitHub. Two guards say so there: a `PreToolUse` hook
  (`.claude/hooks/no-unsigned-commits.py`), which asks git first and only blocks when signing is
  actually on, and `.githooks/pre-push`. Both scripts ship with the repository and both are switched
  on per machine — the first from the untracked `.claude/settings.local.json`, the second from
  `core.hooksPath` — so neither runs in a checkout that has not asked for it. Where signing is _not_
  configured, commit normally and do not set it up — your commits do not need to be signed, because
  PRs are squash-merged and GitHub signs the commit that lands on `main`. If signing is on and
  genuinely fails, report the error instead of routing around it. See "Signing is a maintainer's
  setting, and the hook checks before it blocks" in `DECISIONS.md`.

Test, lint, format and type-check commands are in `CONTRIBUTING.md`.

## Code Style — TypeScript/JavaScript

- 2-space indent
- `camelCase` for functions and variables
- `PascalCase` for component identifiers, `kebab-case` for the files holding them (e.g.
  `DiveFormSection` in `dive-form-section.tsx`)
- React functional components with hooks
- JSDoc (`/** */`) on `lib/api/` and `hooks/` exports, where editors surface it on hover at every
  call site. Elsewhere a plain `//` comment above the export is fine — what matters is explaining
  intent, not the syntax it's written in.
- TypeScript interfaces/types for all props
- `const` by default, `let` only when necessary
- ~300 lines per component is a review trigger, not a hard cap. Split a file that's doing several
  things; leave one that's a single dense thing (charts, comboboxes) alone — three files of SVG
  maths are worse than one. Static-content pages (privacy, terms) are exempt.

## Consuming the API

The API returns resource schemas directly — no `{ data, error }` envelope — and signals failure with
the status code, which axios turns into a thrown error. Errors carry FastAPI's `{ "detail": ... }`,
a string for most cases and an array of per-field objects for 422; `getApiErrorMessage` in
`lib/api/error.ts` normalizes both, so use it rather than reading `detail` directly. Paginated
endpoints return `{ data, total_count, has_more, page, items_per_page }` — page/size, not
limit/offset.

Full contract, including the status codes in use, is in `opendiving-api/AGENTS.md`.

## Experimental features

A feature that is not ready merges behind a gate and is off unless the instance switches it on:
`GET /config`'s `experimental_features` names it or says `all`. The API is the only source — no
runtime-config member and no `NEXT_PUBLIC_` variable takes part. Read it through
`useExperimentalFeature("<name>")` (`hooks/useExperimentalFeature.ts`), or
`experimentalFeatureOn(config, "<name>")` (`lib/api/config.ts`) where a component already holds the
config; both read a config still loading, a failed read and an API too old to carry the member as
off. The API gates the same name with `require_experimental_feature`.

- **A route** is a thin server page whose client body holds its loading frame while `isLoading`
  and renders `NotFoundState` on `!isOn`, the way `components/admin/proposal-queue.tsx` does for
  `commons_primary`.
- **A navigation entry** is filtered where its list is defined, as `SETTINGS_SECTIONS` is in
  `components/settings/settings-nav.tsx`.
- **A section inside a page** renders nothing while the feature is off.
- **A test supplies the answer** by mocking `useInstanceConfig` with a config whose
  `experimental_features` names the feature, or leaves it out for the off case. The e2e suite's
  `/config` fixture in `e2e/support/api.ts` answers `[]`, so every feature is off there.

## Contribution checks

Read `CONTRIBUTING.md` before editing. Trace the existing route, navigation entry and API support
before adding a feature; distinguish new behavior from exposing or moving an existing capability.

Before replacing a shared control, inventory its deliberate styles, focus rules and touch behavior.
Preserve the rationale comments that still apply. Follow "UI controls use Base UI" in
`DECISIONS.md`. Read the generated source for `data-*` selectors and `dark:` variants, and compare
computed styles in the rendered control.

Verify changed controls on populated screens in the relevant light/dark, mouse/touch, selected and
open states. Check computed styles and interactions, including focus, dismissal and reopening.
Geometry tests need the real stylesheet and a negative control, as `CONTRIBUTING.md` explains.
Wait for observable focus or readiness in interaction tests, not an arbitrary timer. Report physical
iOS and VoiceOver checks separately from browser emulation; passing unit tests proves neither.

Adding hover behavior must preserve keyboard and touch activation, repeat-tap dismissal and
accessible semantics. Reuse `HINT_DELAY_MS` from `components/ui/tooltip.tsx` and trace the control's
pointer, click and focus handlers before adding custom handlers.

For pages that act on a loaded request for the signed-in account, follow
`components/settings/mcp-consent-page.tsx` and its render test: keep the displayed request,
selections and submission bound to that request and account, and test switching either while open.

For review fixes, check review bodies, inline comments and discussion attachments. Track each item
through its code, documentation and verification, and state in the PR description what remains
unverified or blocked. Keep the description current, as if the PR had just been opened, rather than
a log of review rounds or a comment per fix. Follow the cross-repository contribution rule in
`CONTRIBUTING.md`; a pushed API branch with no open PR does not satisfy it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
