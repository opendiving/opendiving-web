# Contributing to OpenDiving Web

Thanks for wanting to help. Bug reports, a typo fix, a rough edge on a form, a whole new
page — all welcome.

For anything bigger than a small fix, **open an issue first** so we can agree on the shape
before you spend an evening on it. That goes double for changes that need new endpoints:
those start in [opendiving-api](https://github.com/opendiving/opendiving-api).

Participation is covered by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

The web app is a frontend for the API, so start that first (one `docker compose up` in
[opendiving-api](https://github.com/opendiving/opendiving-api)), then:

```bash
npm install
cp .env.example .env   # points at http://localhost:8000 by default
npm run dev
```

Open <http://localhost:3000> and sign in with your email. With no email provider
configured on the API side, the magic link is printed to the API logs — that's the
intended local flow, not a bug.

Node 24 is what CI uses. Use `npm ci` rather than `npm install` when you just want a
lockfile-exact install.

## Before you open a PR

CI runs lint, type-check, tests and a build. One command runs the same set locally:

```bash
npm run ci
```

Individually: `npm run lint` (`lint:fix` to autofix), `npm run type-check`, `npm test`
(`test:watch`, `test:coverage`), `npm run build`. Formatting is Prettier — run
`npm run format` before pushing, or `npm run format:check` to see what it would touch.

A separate code-quality workflow also runs `tsc --strict`, a dependency and
circular-import check, and an axe accessibility scan of the running app. Most of those are
advisory, but the strict type check is not — keep it clean.

## How the code is laid out

```
src/app/            App Router pages, one directory per route
src/components/     feature components (dives/, gear/, ...) + ui/ for shadcn primitives
src/lib/api/        axios clients, one module per API area
src/lib/validations/  Zod schemas backing the forms
src/hooks/          shared hooks (pagination, auth guards, drag-sort, ...)
src/contexts/       AuthContext
```

Components in `src/components/ui/` come from shadcn/ui — prefer adding a new primitive
there over hand-rolling one in a feature directory. Charts (the dive profile, the
consumption trend) are hand-written SVG on purpose; there is no charting dependency and
we'd like to keep it that way.

Tests are colocated: `foo.ts` gets `foo.test.ts` next to it, run by Vitest with jsdom.
Coverage is measured over `src/lib/**`, which is where the logic worth unit-testing
lives — validation schemas, formatting, gas and profile math, API error mapping. New
helpers in `src/lib/` should come with tests; bug fixes should come with a test that fails
without the fix.

## Two things that will bite you

**Always run a full `npm run build` after touching a Zod schema tied to a form.** Never
use `z.preprocess()` or `.transform()` on fields feeding a `z.input<>`-derived form type —
it collapses the input type and breaks `useForm<T>()`'s binding to `onSubmit` with
confusing errors that show up *only* in a full build, not in the editor. Keep the schema's
input and output types identical and do the conversion in a plain helper right before the
API call (see `normalizeMixtures` in `lib/validations/dive.ts`).

**Read [DECISIONS.md](DECISIONS.md) before your first PR.** It records the non-obvious
choices and the traps already hit — API client signatures, React Hook Form quirks, auth
and token handling. When you make a decision that would puzzle the next person, append a
section to it as part of your PR.

## README screenshots

The images in `docs/screenshots/` are generated, not hand-cropped. With the API and the dev
server both up:

```bash
npm run screenshots -- you@example.com
```

It signs itself in with a magic link read out of the API container's log, so it only works
against a local stack. Chromium comes from your existing Chrome install (override with
`CHROME_PATH`); `playwright-core` only drives it, so `npm install` never downloads a browser.

Every shot uses one frame, and the month the consumption chart is parked on is a constant beside
it at the top of `scripts/screenshots.mjs`. Neither dimension is a round number — 1024 is `lg`,
where the detail pages stop stacking their sidebar, and 1086 is where the dashboard's
consumption card ends — so read the comments there before changing them, and see
[DECISIONS.md](DECISIONS.md) for the rest of the reasoning.

## Design expectations

- **Dark mode and light mode both work.** Use the Tailwind theme tokens rather than
  hardcoded colours, and check both before you push.
- **Mobile matters.** People log dives on a boat. Test narrow viewports.
- **Accessibility isn't optional.** Labelled inputs, keyboard-reachable controls, sensible
  focus order. `react/no-danger` is an ESLint error: introducing `dangerouslySetInnerHTML`
  needs a deliberate disable comment plus a sanitizer, not an unreviewed add.

## Pull requests

- Branch off `main`, keep the PR focused on one thing.
- Title the PR as a conventional commit — `<type>[(scope)][!]: <description>`, e.g.
  `feat: chart the dive profile on the dive detail page`. Types: `feat`, `fix`, `refactor`,
  `docs`, `test`, `chore`, `perf`, `ci`, `build`, `revert`. A CI check enforces this, and
  re-runs when you edit the title, so a rejected PR needs no new commit. PRs are
  squash-merged, so the title becomes the commit subject on `main` — commits within your
  branch can say whatever is useful while working. (Older history mixes prefixed and plain
  subjects; new PRs need the prefix.)
- Say in the description what you changed and why. Screenshots for anything visual — the
  README is screenshot-heavy for a reason.
- If the change depends on an API change, link the corresponding
  [opendiving-api](https://github.com/opendiving/opendiving-api) PR.

## License

By contributing you agree that your work is licensed under [AGPL-3.0](LICENSE), same as
the rest of the project.
