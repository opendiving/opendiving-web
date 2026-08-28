---
name: opendiving-web-login
description:
  Sign in to the local OpenDiving web app, or get a bearer token for authenticated API calls.
  Sign-in is passwordless, so this drives the magic-link flow by reading the link out of the API
  container's log. Use whenever a task needs an authenticated session on http://localhost:3000 or an
  access token for /api/v1 endpoints.
---

# Sign in to the local OpenDiving stack

There are no passwords. `opendiving-api/src/app/api/v1/auth.py` has four ways in: a magic link, a
six-digit code, Google, and a passkey. Google needs a real Google account and a passkey needs an
authenticator, so automation uses the magic link. The code is not a separate route to set up: one
request issues both and one log line carries both, and spending either one invalidates the other.

Locally `SMTP_HOST` is unset, so `send_magic_link_email` logs the link and the code instead of
emailing them (`opendiving-api/src/app/services/email_service.py`). That log line is the whole
trick. It is a local-development affordance on purpose — anywhere but `ENVIRONMENT=local` the same
branch refuses rather than writing a live credential to disk.

## Before starting

- API up: `docker compose ps` in `opendiving-api` should show `api`, `db`, `redis` healthy. Start
  with `docker compose up` if not.
- Web dev server on http://localhost:3000 — only needed for the browser path, and it is usually
  **already running**. Check before doing anything about it:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000
  ```

  Anything but a connection failure means it's up — use it as-is. Only run `npm run dev` in
  `opendiving-web` if nothing answers, and never start a second one: Next silently falls back to
  port 3001, while the magic link is built from the API's `FRONTEND_URL` and always points at 3000,
  so you'd be clicking links into the other server.

## Pick the account

Use the email the user gave you. There is no default worth guessing at — a local stack's accounts
are whatever its operator seeded, and `you@example.com` below is a placeholder, not an account. To
list what actually exists:

```bash
cd "$(dirname "$(git rev-parse --git-common-dir)")/../opendiving-api" && docker compose exec -T db psql -U postgres -d opendive \
  -c 'select email, username from "user" limit 20;'
```

An email with no account doesn't fail — the flow branches to onboarding and the verify page sends
you to `/onboarding` to choose a name and username, which is the only place a `User` row is ever
created. Don't create an account unless the user asked for one.

## Step 1 — request a link, read it back out of the log

```bash
cd "$(dirname "$(git rev-parse --git-common-dir)")/../opendiving-api" && curl -s -X POST http://localhost:8000/api/v1/auth/email/request \
  -H 'Content-Type: application/json' -d '{"email":"you@example.com"}' && sleep 1 && \
docker compose logs api --since 60s | grep -o 'http://localhost:3000/auth/verify?token=[A-Za-z0-9_.-]*' | tail -1
```

That `cd` is longer than it looks like it needs to be, and is not. A plain `../opendiving-api` is
only right from the primary checkout: a session under `.claude/worktrees/<name>/` resolves it to
`.claude/worktrees/opendiving-api` and dies before the curl. `git rev-parse --git-common-dir` names
the primary checkout's `.git` from either place, so the sibling resolves from both.

Use `--since`, not a small `--tail`: a health check hits the log every few seconds and will push the
line out of a short tail. Take the **last** match — requesting a link invalidates every previous
live link for that email.

Then take **one** of the two paths below. Don't do both for the same email: only one link is live at
a time and verifying it consumes it, so a server-side verify leaves the browser nothing to click.

## Step 2a — browser session

Open the link and click through it, e.g. with the Browser pane:

1. `preview_start {url: "<the link from step 1>"}` — the `{url}` form only opens a browser tab, it
   never launches a server. (Where a `launch.json` defines an `opendiving-web` entry — in this
   maintainer's umbrella checkout, one level above this repo, not in the repo itself — it is
   deliberately command-less, so even `{name: ...}` attaches to the running dev server rather than
   starting one.)
2. `read_page` → click the button labelled **Sign in**
3. Confirm success: the header shows an **Account menu** button and you land on `/dashboard`

The page deliberately does not auto-verify on load — mail-client link scanners were consuming tokens
before a human ever clicked. An explicit click is the design, not an obstacle to route around; see
_"Both magic-link pages require an explicit click before the verifying POST fires"_ in
`opendiving-web/DECISIONS.md`.

Navigating immediately after signing in is fine. It wasn't until recently — same-second refresh
tokens used to collide and bounce the next page load to `/signin`, which is why older notes tell you
to sleep a second first. Fixed by the `jti` on every revocable token (`opendiving-api`
`DECISIONS.md`, _"Every revocable token carries a `jti`"_). If a navigation does land on `/signin`,
treat it as a real regression rather than that timing quirk.

## Step 2b — bearer token, no browser

```bash
cd "$(dirname "$(git rev-parse --git-common-dir)")/../opendiving-api" && ACCESS=$(curl -s -X POST http://localhost:8000/api/v1/auth/email/verify \
  -H 'Content-Type: application/json' -d "{\"token\":\"<token value from step 1>\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["access_token"]) if d.get("access_token") else sys.exit("no session: " + json.dumps(d))') && \
curl -s http://localhost:8000/api/v1/user -H "Authorization: Bearer $ACCESS"
```

That exits and prints the body rather than defaulting to an empty string. It prints the body rather
than the `status` because a failure here often has none: an expired, mistyped or already-spent token
is a 401 carrying FastAPI's `{"detail": ...}`, and step 2a spends the link, so that is the ordinary
way to arrive. On a 200, `AuthOutcome` has **three** statuses and only one carries a token
(`opendiving-api/src/app/schemas/auth.py`). `authenticated` is the signed-in case.
`onboarding_required` means no account exists for the verified identity yet, and `onboarding_token`
goes to `POST /auth/complete`. `deletion_pending` means the account is inside its deletion grace
period: **no session was issued**, and `restore_token` goes to `POST /auth/restore`. An empty bearer
would turn either of the last two into an unexplained 401 on the next call.

The access token expires (`ACCESS_TOKEN_EXPIRE_MINUTES`); the refresh token is an httpOnly cookie
and only useful to a browser. If the token dies mid-task, request a fresh link. Already driving the
app in a browser and need a token for side queries? Lift the `Authorization` header off the app's
own requests instead of spending a second magic link — that's what `screenshots.mjs` does.

## Rate limits

3 requests per email and 15 per IP per 15 minutes, then 429. Counters are fixed-window keys in
Redis, so on a local stack `docker compose exec redis redis-cli flushall` — from the API checkout,
as in step 1 — clears them. It drops the cached responses with them, which is fine locally, and it
signs nobody out: the token blacklist is a Postgres table the Arq worker purges, not a Redis key.

## Already-written automation

`opendiving-web/scripts/screenshots.mjs` runs this entire flow headlessly with `playwright-core`
against the machine's own Chrome. Read it before writing a new script; it already handles the click,
the token lifting, and the `/signin` guard described in step 2a.

## Don't

- Don't paste a magic link anywhere outside this local stack, or into a commit, an issue, or an
  artifact. The URL _is_ a live single-use sign-in credential.
- Don't try this against anything but local. Production has no logged link to read.
