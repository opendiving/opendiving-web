---
name: opendiving-web-dashboard-screenshot
description:
  Retake docs/screenshots/dashboard.png, the README hero image — the dashboard header plus both
  chart cards on their 2025 Year view. Use whenever a change alters what the dashboard looks like
  above the Recent Dives row (the greeting, the stat cards, Gas Consumption, Dive Activity) and the
  README image would otherwise show the old UI.
---

# Retake the dashboard README screenshot

One command. `scripts/screenshots.mjs` owns every part of this — the sign-in, the frame, the year,
the cut — so the job here is to run it, not to reproduce it in a browser.

```bash
npm run screenshots -- you@example.com dashboard
```

Run it from `opendiving-web`, with the account whose dives the README is meant to show in place of
the placeholder — `scripts/screenshots.mjs` spells its usage the same way. It signs itself in with a
magic link it reads out of the API container's log, so **the `opendiving-web-login` skill is not
part of this flow** — only reach for it when the sign-in inside the script is what broke.

Name `dashboard` explicitly. A bare `npm run screenshots -- …` retakes all three images, and the
other two are not stable between runs ("due in 24 days" counts down, the subjects are re-picked from
whatever the log holds that day), so a full retake puts two unrelated images in the diff.

## Before running

Both must already be up; neither is this skill's job to start:

```bash
curl -s -o /dev/null -w 'web:%{http_code} ' http://localhost:3000; curl -s -o /dev/null -w 'api:%{http_code}\n' http://localhost:8000/docs
```

- API not answering → `docker compose up` in `opendiving-api`.
- Web not answering → `npm run dev` here. **Never start a second dev server**: Next falls back to
  port 3001 while the magic link always points at 3000.

## The framing is already correct — don't re-derive it

Everything the shot needs is a constant in `scripts/screenshots.mjs`, with the reasoning in
`DECISIONS.md` ("The README screenshots are generated, at one width that is a breakpoint"):

- **1024px wide**, Tailwind's `lg`, at `deviceScaleFactor: 2` → the PNG lands at 2048 wide.
- **Dark mode**, `reducedMotion: "reduce"`.
- **Height is measured in the page, not written down** — `CUT_BELOW.dashboard` names the _Dive
  Activity_ card, and `cutBelow()` finds the first height past it at which no card is still open,
  moments before the shutter. On this page that is the row below the anchor and nothing further, so
  the frame covers the header and both chart cards and ends on a card boundary. Two hand-measured
  heights went stale within one afternoon; don't add a third.
- **Both cards on Year / 2025**, from the single `CHART_YEAR` constant — the two cards showing the
  same period is the point, since they read as a pair.

So: if the shot comes out framed wrong, fix the constant or the `CUT_BELOW` label in the script and
re-run. Don't crop the PNG by hand, and don't pass a one-off height.

## After running

The script prints `✓ dashboard.png  1024x<height> @2x`. Confirm the file matches:

```bash
file docs/screenshots/dashboard.png && git status --short docs/screenshots/
```

Expect `2048 x <2 × height>` and only `dashboard.png` modified. Then open the PNG and check the
three things the script cannot: the greeting reads correctly, both charts show 2025 bars, and the
bottom edge sits on the gap below Dive Activity with no sliver of Recent Dives.

Commit it on its own — `docs: retake the dashboard screenshot for <whatever changed>`.

**If the run printed `(+ product repo)`, you are not done.** `shot()` writes the same PNG into
`../opendiving/docs/screenshots/` whenever that clone is there, and deliberately commits nothing in
it — see _"The same script writes the product repository's copies"_ in `DECISIONS.md`. That is a
second repo with a modified image in its working tree, and nothing but this paragraph will remind
you:

```bash
git -C ../opendiving status --short docs/screenshots/
```

Commit it there too, on its own, with the same subject.

## When it fails

- **`magic-link request failed: 429`** — the rate limit, 3 per email per 15 minutes. Easy to hit on
  a second or third retake in one sitting, and it fires before the browser even opens. Clear the
  counters rather than waiting it out:

  ```bash
  cd "$(dirname "$(git rev-parse --git-common-dir)")/../opendiving-api" && docker compose exec -T redis redis-cli flushall
  ```

  Local only, and it drops the cached responses along with the counters, which is fine here. It does
  not sign anything out: the token blacklist is a Postgres table the Arq worker purges, not a Redis
  key.

- **`signed out on the way to /dashboard`** — the guard in `visit()` firing, after a link was
  issued. Treat it as a real auth regression, not a flake: it is the failure mode of any token
  handling bug, and the check exists so a run fails here instead of quietly shooting the sign-in
  form.
- **`no magic-link token in the API log`** — API isn't up, or its logs are elsewhere; the script
  looks in `../opendiving-api`, overridable with `API_DIR`.
- **`Gas Consumption has no year "2025" with dives`** — the account has nothing logged that year.
  Override for a one-off run with `CHART_YEAR=2024`, and change the constant only if 2025 has
  genuinely stopped being the right year for the README.
- **`nothing below the Dive Activity card to cut at`, or a heading wait timing out** — the dashboard
  was restructured. Update `CUT_BELOW` / the heading the walk scopes on, in the script.
- **`No Chrome found`** — set `CHROME_PATH`. `playwright-core` drives the machine's own Chrome and
  never downloads one.
