# Contributing to OpenDiving Web

Thanks for wanting to help. Bug reports, a typo fix, a rough edge on a form, a whole new page — all
welcome.

For anything bigger than a small fix, **open an issue first** so we can agree on the shape before
you spend an evening on it. That goes double for changes that need new endpoints: those start in
[opendiving-api](https://github.com/opendiving/opendiving-api).

Found a security problem? An issue is the wrong place for it — [SECURITY.md](SECURITY.md) says where
it goes.

Participation is covered by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

The web app is a frontend for the API, so start that first (one `docker compose up` in
[opendiving-api](https://github.com/opendiving/opendiving-api)), then:

```bash
npm install
cp .env.example .env   # points at http://localhost:8000/api/v1 by default
npm run dev
```

Open <http://localhost:3000> and sign in with your email. With no email provider configured on the
API side, the magic link is printed to the API logs — that's the intended local flow, not a bug.

Node 24 is what this builds and tests on — `.nvmrc` and `package.json`'s `engines` say so, and CI
and the Dockerfile follow. Use `npm ci` rather than `npm install` when you just want a
lockfile-exact install.

## Before you open a PR

CI runs lint, type-check, tests and a build. One command runs the same set locally:

```bash
npx playwright install chromium   # once per machine, see below
npm run ci
```

**The first line is not optional, and skipping it fails rather than skips.** Most tests run under
jsdom; the ones that ask it for something it has not got run in Chromium instead, through Vitest's
browser mode. `npm install` does not fetch a browser — `playwright` publishes no install script, so
that stays true and is deliberate — and the browser has to be asked for once. Without it that
project fails to start, which is the right way round: a test that silently skipped would be worse
than one that stops you.

Individually: `npm run lint` (`lint:fix` to autofix), `npm run type-check`, `npm test`
(`test:watch`, `test:coverage`), `npm run build`. Formatting is Prettier — run `npm run format`
before pushing, or `npm run format:check` to see what it would touch. The code-quality workflow runs
`format:check` too and fails on it, so an unformatted file is a red check, not a note.

`npm run format` covers the markdown at the repo root as well as the code, so `DECISIONS.md` — the
one you will be appending to — is formatted like everything else. Write the section however it comes
out and let Prettier wrap it to 100 columns; there is no need to match the surrounding lines by
hand.

A separate code-quality workflow also runs `tsc --strict`, a dependency and circular-import check,
and an axe accessibility scan of the running app. Most of those are advisory; the strict type check
and the Prettier check above are not — keep both clean.

## How the code is laid out

```
src/app/            App Router pages, one directory per route
src/components/     feature components (dives/, gear/, ...) + ui/ for shadcn primitives
src/lib/api/        axios clients, one module per API area
src/lib/validations/  Zod schemas backing the forms
src/hooks/          shared hooks (pagination, auth guards, drag-sort, ...)
src/contexts/       AuthContext
```

Components in `src/components/ui/` come from shadcn/ui — prefer adding a new primitive there over
hand-rolling one in a feature directory. Charts (the dive profile, the consumption trend) are
hand-written SVG on purpose; there is no charting dependency and we'd like to keep it that way.

Tests are colocated: `foo.ts` gets `foo.test.ts` next to it, run by Vitest. Most of them use jsdom;
a file named `foo.browser.test.tsx` belongs to the second project instead and runs in real Chromium
(see the note above about installing it). Reach for that only when jsdom genuinely cannot answer the
question, because a real browser is slower and the isolation is weaker. What qualifies is a property
of the question rather than a subject area: jsdom has no WebGL2 context, and it performs no layout
at all, so a question about a real renderer or about measured geometry belongs in that lane and
everything else does not.

**A geometry assertion there is vacuous without `import "@/app/globals.css"` in the test file.** The
browser project renders no `app/layout.tsx`, so none of this app's Tailwind is loaded: without that
import `h-12` measures 0px and `flex items-center` computes to `display: block`, and the test passes
against exactly the markup it was written to reject. Read "jsdom answers no layout question, and the
browser lane only answers one with the stylesheet loaded" in [DECISIONS.md](DECISIONS.md) before
writing a test in either project — it has the worked examples, and the negative control to run
against your own.

Coverage is measured over `src/lib/**`, `src/hooks/**`, `src/contexts/**`, `src/components/**` and
`src/app/**`, with floors per directory in `vitest.config.mts`. New helpers in `src/lib/` should
come with tests; bug fixes should come with a test that fails without the fix.

## Two things that will bite you

**Always run a full `npm run build` after touching a Zod schema tied to a form.** Never use
`z.preprocess()` or `.transform()` on fields feeding a `z.input<>`-derived form type — it collapses
the input type and breaks `useForm<T>()`'s binding to `onSubmit` with confusing errors that show up
_only_ in a full build, not in the editor. Keep the schema's input and output types identical and do
the conversion in a plain helper right before the API call (see `normalizeMixtures` in
`lib/validations/dive.ts`).

**Read [DECISIONS.md](DECISIONS.md) before your first PR.** It records the non-obvious choices and
the traps already hit — API client signatures, React Hook Form quirks, auth and token handling. When
you make a decision that would puzzle the next person, append a section to it as part of your PR.

## README screenshots

The images in `docs/screenshots/` are generated, not hand-cropped. With the API and the dev server
both up:

```bash
npm run screenshots -- you@example.com
```

It signs itself in with a magic link read out of the API container's log, so it only works against a
local stack. Chromium comes from your existing Chrome install (override with `CHROME_PATH`);
`playwright-core` only drives it, so `npm install` never downloads a browser.

Copies of these images are on the front page of
[opendiving/opendiving](https://github.com/opendiving/opendiving), which has no way to retake them —
the app is here. So the script writes that repository's copies too when a clone of it sits beside
this one (`../opendiving`, or `PRODUCT_DIR`), from the same shutter press. With no such clone it
says so and writes only this repository's, which is what a contributor with one checkout gets.
Committing the regenerated files over there is a separate, manual step — and so is putting a
newly-named shot on that README, which names the images it renders one at a time. This script writes
files; it does not lay out anyone's page, least of all another repository's. Until that edit is made
there, the two front pages show different sets, and only the files they share are identical.

Every shot uses one width, and the year the two dashboard charts are parked on is a constant beside
it at the top of `scripts/screenshots.mjs`. No dimension is a round number — 1024 is `lg`, where the
detail pages stop stacking their sidebar, and the heights are measured in the page moments before
the shutter — at the first line past a named card where no card is cut through, or at the foot of a
named card where the shot is about one column. The gear page is the exception: its height is a
literal, it is known to end inside a card rather than on a boundary, and it is left alone anyway,
because what would decide a new one is the README row rather than the page. So read the comments
there before changing them, and see [DECISIONS.md](DECISIONS.md) for the rest of the reasoning.

## Design expectations

- **Dark mode and light mode both work.** Use the Tailwind theme tokens rather than hardcoded
  colours, and check both before you push.
- **Mobile matters.** People log dives on a boat. Test narrow viewports.
- **Accessibility isn't optional.** Labelled inputs, keyboard-reachable controls, sensible focus
  order. `react/no-danger` is an ESLint error: introducing `dangerouslySetInnerHTML` needs a
  deliberate disable comment plus a sanitizer, not an unreviewed add.

## Pull requests

- **Your commits do not need to be signed.** PRs here are squash-merged, and GitHub creates and
  signs that one commit with its own key, so what a self-hoster audits on `main` later is signed
  whatever your branch carried. Sign if you already sign — nobody will ask you to set GPG up for a
  pull request.
- Branch off `main`, keep the PR focused on one thing.
- Title the PR as a conventional commit — `<type>[(scope)][!]: <description>`, e.g.
  `feat: chart the dive profile on the dive detail page`. Types: `feat`, `fix`, `refactor`, `docs`,
  `test`, `chore`, `perf`, `ci`, `build`, `revert`. A CI check enforces this, and re-runs when you
  edit the title, so a rejected PR needs no new commit. PRs are squash-merged, so the title becomes
  the commit subject on `main` — commits within your branch can say whatever is useful while
  working. (Older history mixes prefixed and plain subjects; new PRs need the prefix.)
- Say in the description what you changed and why. Screenshots for anything visual — the README is
  screenshot-heavy for a reason.
- **A change that spans both repos starts on the API side.** Open the
  [opendiving-api](https://github.com/opendiving/opendiving-api) PR first, link it from this one and
  this one from it, and expect the api PR to merge first — the endpoint has to exist before the page
  that calls it. Nothing in CI runs the two together, so those two links are all that holds the pair
  together for whoever reviews them.

## AI-assisted contributions

Welcome, and the repo is set up for them on purpose: `AGENTS.md` carries the conventions and
`DECISIONS.md` the traps already hit, both written for your tools as much as for you. Pointing a
coding agent at this codebase is a supported way to work, not something to leave out of the PR
description.

What it doesn't change is who owns the result. The human opening the PR owns what is in it: you ran
it — the app and `npm run ci` — you read the diff, you understood it, and you can answer review
questions about it without going back to the model. Bulk submissions nobody looked at first get
closed without ceremony. That is not a position on the tooling; it is the same bar the rest of this
file sets, and unreviewed output is just the quickest way to miss it.

## What to expect

One maintainer, working on this in spare time. That is the honest shape of it, and worth saying out
loud so that quiet is not read as a verdict: a first reply usually arrives within a few days, a typo
fix may merge the same evening, and something that needs thinking about can sit longer. If a week
goes by with nothing, ping the thread — that is useful, not rude. It almost always means the
notification got buried, not that anyone read your PR and decided against it.

## For maintainers

Commits pushed to this repository's own branches are signed, and a hook keeps them that way. Once
per clone:

```bash
git config core.hooksPath .githooks
```

`.githooks/pre-push` then refuses to push a commit carrying no signature at all. Linked worktrees
share the setting, so that single command covers them too.

That instruction lives here rather than in _Getting set up_ because it is not a contributor's
problem: the commits in a pull request do not need to be signed, and enabling this hook in a clone
that does not sign only walls you out of your own push.

## Cutting a release

Releases are cut deliberately, not minted per merge, and the version moves in lockstep with
[opendiving-api](https://github.com/opendiving/opendiving-api): one product version, so
`opendiving-api:0.4.0` and `opendiving-web:0.4.0` are always a matched pair. A pin that resolves in
one repo and not the other is a broken install, which is why neither repo picks its number alone.
The product's own release is a third tag, cut in
[opendiving/opendiving](https://github.com/opendiving/opendiving) after both images have published —
its workflow refuses to publish unless both exist at that version, which is the check no
per-repository workflow is in a position to make.

A merge to `main` is not nothing, though. It publishes `:edge` and `:sha-<12>` — no `:latest`, no
version alias — and then calls a Render deploy hook, which is how the project's own hosted instance
follows `main`. That channel is deliberately not a release: it never moves a tag anyone is pinned
to, so it is invisible to a self-hoster, and `edge` is not a tag you are asked to follow. A missing
deploy hook is a notice and a green build, not a failure, so a fork publishes the image and deploys
nothing.

This repo's part is small: bump `version` in `package.json` in its own PR, titled
`chore: release v0.4.0`, then tag that bump commit and push the tag. The tag push runs **Publish
Image**, which compares the tag against the manifest and fails the build if they disagree — so
nothing is published from a bump and a tag that say different things.

Everything else — the cadence, how to pick the number, the scanner that finds breaking changes in
the window, the release notes, the order the three tags go in — lives in the product repo's
CONTRIBUTING under
[Cutting a release](https://github.com/opendiving/opendiving/blob/main/CONTRIBUTING.md#cutting-a-release).
It is deliberately in one place: a decision table kept in three repos drifts apart, and that one is
the copy self-hosters read.

## Staying on top of CVEs

Two things are wired up to raise the alarm, and they watch different objects — neither substitutes
for the other. What they raise it _for_ is one of two responses, so start with those.

**Rebuilding a published version.** A published version is never repointed — a bad release gets a
successor, not a rewrite — and a CVE in the base image is the one sanctioned exception. It works
because the `Dockerfile` floats on `node:24-alpine` rather than a digest, so the build resolves a
patched base. Run **Publish Image** by hand with `ref` set to the `v` tag, and tick **Also push
:latest** if that version is still the newest. One run recomputes the version's whole alias set,
which is the point: a hand-picked subset would leave everyone following `latest` or `0.4` on the
vulnerable digest. That is this repository's workflow rebuilding this repository's image — the api
repo rebuilds its own the same way, and a base-image CVE will often want both.

**Cutting a new patch release** is the other response, and the two are not interchangeable. Which
one applies is the split below.

**The published image.** `.github/workflows/vulnerability-scan.yml` scans the newest release every
morning with Trivy — its `X.Y.Z`, `X.Y`, bare major and `latest`, which are one image under four
names, resolved to a digest so it is scanned once — and `edge` alongside it, which is the image the
project's own instance is running and the only one that exists before the first release is cut. It
reports HIGH and CRITICAL findings in both halves of each image: the Alpine packages that come from
`node:24-alpine`, and the npm packages `npm ci` installed into `.next/standalone`. This is the job
that closes the loop with the rebuild above, because the case it catches is a release that was clean
the day it shipped and grew a CVE three weeks later, with no PR in flight and nobody looking.

**The alert is a GitHub issue** labelled `image-cve`, and you are the one who acts on it. The body
splits the findings by what actually fixes them, because they are not the same remedy — and where a
release is involved it names the exact `v` tag to dispatch at:

- **OS package** — the rebuild above. One dispatch recomputes every release alias the scan covers,
  which is why the scan covers exactly those and no more.
- **npm package** — _not_ fixable by a rebuild at any tag. That version comes from the
  `package-lock.json` committed at the tag, and the rebuild checks that tag out and runs `npm ci`
  against it, so it reinstalls the identical version no matter how many bumps have since landed on
  `main`. Merge the bump and **cut a new patch release** — the ordinary flow above, not the in-place
  rebuild.

Rows on `edge` are neither of those, and no dispatch moves that tag — only a push to `main` does.
`edge` is rebuilt off `main`'s own tree, so an OS-package finding there clears itself on the next
merge and an npm one needs the bump merged and nothing else. If nothing is due to merge and it
cannot wait, an empty commit on `main` is the whole of the rebuild.

One issue, edited in place for as long as the finding persists, so a CVE that takes upstream a
fortnight to patch does not generate a fortnight of notifications. The workflow closes it once a
scan comes back clean, and will not reopen it for a set of CVEs you already read and closed; a
_different_ CVE opens a fresh one.

**Proposed changes.** The same workflow runs a second, much cheaper job on every PR and every push
to `main` — Trivy over `package-lock.json`, no `npm ci` and no image built — which _fails the check_
on a HIGH or CRITICAL that has a fix available. That is about a change you are proposing rather than
about what is deployed, so it stays out of the issue. It ignores findings with no fix published,
because there is no move to make on those. It replaced `ci.yml`'s
`npm audit --audit-level=moderate`, and that swap was not a wash — see _What none of this watches_.

**Version bumps.** `.github/renovate.json5` is the other half: it watches `package.json` and
`package-lock.json`, both `Dockerfile` base tags, `.nvmrc`, every pinned GitHub Action, and the four
`npx --yes <tool>@<version>` pins in `code-quality.yml` that belong to no ecosystem and would
otherwise never move at all. Routine updates arrive in one batch on Monday morning; a
vulnerability-driven one ignores the schedule and is titled `fix(deps):`, so it lands in the Fixes
section of the release notes rather than among the chores.

> **Renovate is running, and the
> [Dependency Dashboard](https://github.com/opendiving/opendiving-web/issues/190) issue is where it
> reports.** The Mend-hosted [Renovate GitHub App](https://github.com/apps/renovate) is installed on
> the `opendiving` org and reads `.github/renovate.json5` on its next run, so a change to that file
> takes effect without anyone enabling anything. It is granted per repository, not org-wide: a
> repository added to the org later has to be added to the app's repository list by hand, and
> nothing warns you it hasn't been. **A fork inherits none of this** — the config file travels with
> the code and the bot does not, so a fork installs the app on its own account or runs Renovate
> self-hosted on a schedule with a PAT, and until it does the pins here are frozen and nothing says
> so.

One thing Renovate will not do on its own is move Node. `.nvmrc`, `engines.node` in `package.json`
and the two `Dockerfile` base tags are all reachable to it; `node-version:` in `ci.yml` and
`code-quality.yml` is not, so an auto-opened PR would build the image on a new runtime while CI kept
testing the old one. That update is grouped and held behind a checkbox on the **Dependency
Dashboard** issue: it tells you a new Node is out and waits for a person, who edits the two
workflows by hand.

To check what Renovate would actually do before trusting a change to that file:

```bash
npx --yes --package renovate -- renovate-config-validator .github/renovate.json5
docker run --rm -v "$PWD:/repo" -w /repo ghcr.io/renovatebot/renovate --platform=local --dry-run=extract
```

The first catches a misspelled option; the second prints every dependency each manager found, which
is the only way to see that a custom manager's regex still matches. Run them in a checkout, not a
worktree — the container needs the files, and `--dry-run=extract` writes nothing and needs no token.

**What none of this watches**, stated so it is not mistaken for coverage:

- **Dev dependencies, and anything below HIGH.** That is what the `npm audit --audit-level=moderate`
  job covered, and giving it up is deliberate rather than an oversight: it is the api repo's
  threshold, and a moderate finding with no published fix in a package that never reaches the image
  is a red X with no move attached — the kind of check that gets ignored rather than acted on. The
  dev tree does execute in CI, and the answer to that is the one `ci.yml` and `code-quality.yml`
  already chose — a `contents: read` token with `persist-credentials: false` — not a scanner.
  `npm audit` is still one command away when you want the wider net.
- **Any release but the newest.** This is the scan agreeing with [SECURITY.md](SECURITY.md): nothing
  is backported, so the supported version is the latest release. A dispatch only ever repoints the
  aliases of the version it names, so scanning `0.2` would produce an alert with no supported move
  attached, recurring forever. The four release aliases that _are_ scanned are every form in which
  someone can be pinned to the supported release; `edge` is scanned beside them and is not one of
  them.
- **The `linux/arm64` image**, on the assumption that it installs the same Alpine packages as
  `linux/amd64` and resolves the same lockfile. If that ever stops holding, the scan step is where a
  `--platform` pass goes.
- **Vulnerabilities with no fix published upstream.** They are counted in the issue but drive
  nothing, since no rebuild collects a package that does not exist.

## License

By contributing you agree that your work is licensed under [AGPL-3.0](LICENSE), same as the rest of
the project.
