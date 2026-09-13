---
name: opendiving-web-lan-preview
description:
  Serve a branch of the web app to a phone or tablet on the same Wi-Fi, signed in, so a real device
  can be walked through a change. Use whenever a task needs the app open on actual hardware — an
  iOS-only bug, a keyboard or touch behaviour no emulator reproduces, "does this look right on my
  phone", "test this on my iPhone", or any verification a desktop browser at a narrow viewport
  cannot honestly settle.
---

# Serving the web app to a phone on the LAN

Some things only a real device can answer. iOS Safari zooms the page in on a field under 16px, opens
a picker wheel for a focused `<select>`, and displaces the layout viewport when the keyboard arrives
— none of which Chrome reproduces at any width, and none of which a simulator has unless Xcode is
installed with a downloaded runtime. When a bug was reported from a phone, the phone is usually the
only place the fix can be confirmed.

This is a **development affordance and nothing else.** It serves an unreleased branch off a laptop
over plain HTTP to whatever is on the same Wi-Fi, and the sign-in link it hands out is a live
credential. Everything here belongs on a trusted home or office network and nowhere else. Do not
reach for a tunnel (ngrok, Cloudflare Tunnel) to get around any of the constraints below: that
publishes a development database holding real dive logs to the open internet, and no amount of
convenience pays for it.

## The shape of it, before the steps

Three facts decide the whole procedure, and each is a dead end if you meet it by surprise.

**It has to be `next dev`, not a production build.** `src/proxy.ts` adds `upgrade-insecure-requests`
to the CSP on every non-dev build. Over plain HTTP that upgrades every chunk to `https://` and the
page loads nothing — `ERR_SSL_PROTOCOL_ERROR` on every asset, a blank app, and nothing in the markup
to say why. That is correct behaviour for the flagship rather than something to work around; it just
means the production lane is closed here.

**The browser must reach the API same-origin.** `core/setup.py` in `opendiving-api` passes
`allow_origins=[settings.FRONTEND_URL]` — a list of exactly one — so a page served from
`http://192.168.x.x:3100` calling the API directly is refused by CORS. The app already has the way
round it: leave `NEXT_PUBLIC_API_URL` unset and axios falls back to the relative `/api/v1`, which
the catch-all route handler at `app/api/v1/[...path]/route.ts` forwards server-side. The phone then
only ever talks to Next, and CORS never enters into it.

**`FRONTEND_URL` is also why the magic link points at the wrong host.** The same variable the CORS
list reads is what the API builds sign-in links from, so every link it logs says
`http://localhost:3000` however you reach the app. Rewriting that host is step 5, and it is the only
thing this skill adds to `opendiving-web-login`.

## Step 1 — the address and the port

```bash
ipconfig getifaddr en0
```

Wi-Fi is `en0` on most Macs; try `en1`/`en6` if that prints nothing. A `169.254.x.x` answer means no
real lease — fix the network first, because everything below will otherwise look like it worked and
be unreachable.

**Pick a port that is not 3000.** The main checkout's dev server lives there, the magic link is
built for it, and a second server on that port means two things fighting over one socket with the
link pointing at whichever won. `3100` is the convention here.

## Step 2 — the worktree's `.env`

`.env` is gitignored, so it never follows a `git worktree add` and a worktree has none at all. Write
one, and mind what it must _not_ contain:

```bash
cat > .env <<'EOF'
API_INTERNAL_URL=http://localhost:8000
SITE_URL=http://192.168.8.92:3100
EOF
```

`API_INTERNAL_URL` is an **origin** — no `/api/v1` suffix, since the request's own path is appended
to it unchanged. `SITE_URL` only feeds `metadataBase` and canonical URLs; it is not load-bearing
here, but leaving it on `localhost` puts the wrong host into page metadata.

**No `NEXT_PUBLIC_API_URL` line.** Copying the main checkout's `.env` is the obvious move and the
wrong one: it sets that variable to `http://localhost:8000/api/v1`, which is inlined at build time
and sends the phone straight at the API, where CORS refuses it. The absence is the configuration.

## Step 3 — let `next dev` serve its own resources to another origin

Next's dev server rejects requests for dev resources from an origin it does not recognise. The
failure is quiet and misleading: HTML and JS arrive, React boots far enough to print its DevTools
banner, and then the page sits on its loading state forever with no effect ever firing and no
request ever made. The one tell is a websocket retrying `ws://<ip>:<port>/_next/hmr` with
`ERR_INVALID_HTTP_RESPONSE`.

Add the address to `next.config.js`:

```js
allowedDevOrigins: ["192.168.8.92"],
```

**This is a tracked file, and the edit is temporary.** It must not reach a commit — a machine's LAN
address is meaningless to anyone else — and an uncommitted modification left behind will block the
next `code-review-loop` or `sync-with-main` run at its clean-tree gate. Reverting it is the first
line of teardown, and worth noting somewhere you will see again in ten minutes.

## Step 4 — start it

```bash
npx next dev -H 0.0.0.0 -p 3100
```

Run it in the background and poll until it answers rather than sleeping a fixed amount:

```bash
curl -s -o /dev/null -w '%{http_code}\n' --max-time 3 http://192.168.8.92:3100/
```

The `-H` is explicit rather than load-bearing — this version of Next already defaults to `0.0.0.0` —
but that default has not always held, and saying it costs nothing.

If macOS raises a firewall prompt for `node`, it has to be allowed or nothing off-machine will
connect.

## Step 5 — a sign-in link the phone can use

`opendiving-web-login` owns the magic-link flow; read it rather than reinventing it. The only
difference here is the host, which the API always writes as `localhost:3000`:

```bash
... | sed 's#http://localhost:3000#http://192.168.8.92:3100#'
```

Hand that URL to whoever is holding the phone, with two warnings, because both look like bugs
otherwise.

**Do not reload the page.** `AUTH_COOKIE_SECURE` defaults to true in the API, so the refresh cookie
is `Secure` and a plain-HTTP origin drops it silently. The access token lives in memory, so the
session survives navigating _inside_ the app indefinitely — and dies the moment the page reloads,
landing on `/signin`. That is a property of the transport, not of the branch. If reloads are
genuinely needed, `AUTH_COOKIE_SECURE=false` in the API's `src/.env` plus a container restart fixes
it — but that mutates the shared dev stack, so ask first.

**Passkeys will not work**, nor anything else gated on a secure context; the magic link is the only
way in. `crypto.randomUUID` is unavailable too, which the app already falls back for — which is why
nothing visibly breaks.

Requesting a link is rate limited to 3 per email per 15 minutes, and walking a device usually costs
two or three attempts. `docker compose exec redis redis-cli flushall` from the API checkout clears
the counters when you run out.

## Say what is being served

Before the walk, say which commit is on the wire:

```bash
git rev-parse --short HEAD && git status --porcelain
```

A running dev server proves that _a_ server is up and nothing about which code it runs. When a
device walk disagrees with what a desktop browser just showed, the first suspect is a server left
over from an earlier branch, or one started before the last few commits landed — restarting it is
cheaper than debugging the difference.

## Teardown

Three things, and the first is the one that bites:

```bash
git checkout -- next.config.js   # the allowedDevOrigins edit must not survive
rm -f .env                       # gitignored, so nothing else will flag it
pkill -f "next dev -H 0.0.0.0 -p 3100"
```

Then confirm with `git status --porcelain`, which should print nothing. A left-behind
`next.config.js` modification is invisible in the app, in the tests and in CI, and surfaces much
later as a review or sync run refusing to start on a dirty tree.

## When it does not work

| What you see                                                           | What it is                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Page stuck on a loading state, no API requests, HMR websocket retrying | `allowedDevOrigins` missing the address (step 3)                    |
| `ERR_SSL_PROTOCOL_ERROR` on every chunk                                | a production build, so `upgrade-insecure-requests` — use `next dev` |
| Requests reach the API and come back CORS-blocked                      | `NEXT_PUBLIC_API_URL` is set; drop it from the worktree `.env`      |
| Phone lands on `/signin` after one navigation                          | the page was reloaded, so the `Secure` refresh cookie was dropped   |
| The sign-in link opens `localhost` on the phone                        | the host was not rewritten (step 5)                                 |
| `429` when asking for a link                                           | the 3-per-15-minutes limit; flush Redis or wait                     |
| Nothing connects at all, though `curl` from the Mac works              | firewall prompt unanswered, or the device is on a different SSID    |
