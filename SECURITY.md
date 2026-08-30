# Security Policy

OpenDiving is self-hosted software, so "a security problem with OpenDiving" means two different
things with two different owners. Work out which one you have before you send it anywhere.

## Is it an instance, or the code?

**An instance** is a server somebody runs at their own domain, holding their own divers' data. Only
its operator can see it, fix it, or tell the people using it — this project's maintainers have no
access to any instance and no way to reach its users. A misconfigured deployment, an exposed
database, a stale image on someone's box: report it to whoever runs that server. Its contact form,
if it has one, reaches that operator and nobody else.

**The code** is a flaw in this repository that would affect anyone running it. That one is ours, and
the rest of this file is about it.

If an instance is insecure _because_ of something in the code — a default that fails open, a setting
that does less than it says, docs that lead operators into it — that is a code report, and we want
it.

## Reporting a vulnerability in the code

Use GitHub's private vulnerability reporting on this repository:

**[Report a vulnerability](https://github.com/opendiving/opendiving-web/security/advisories/new)** —
or the _Report a vulnerability_ button on the repository's **Security** tab.

That opens an advisory only the maintainers can see. Please don't open a public issue or a pull
request for something exploitable; the fix and the disclosure should arrive together.

You may come across an open issue labelled `image-cve`, naming CVEs in the published image. That is
not an exception to the line above: those are advisories Alpine and NVD published first, filed by
our own scanner so that the base-image rebuild gets done, and `trivy image` against the same public
tag tells you the same thing. This rule is about a defect in _our_ code that nobody has disclosed
yet — that still goes to the private channel above.

No GitHub account, or the form isn't working for you? Email **security@opendiving.app** instead. It
reaches the maintainers and nobody else, and a report that arrives there is handled exactly like one
filed through the form.

**This repository is the web app.** The API, the database and the worker are
[opendiving-api](https://github.com/opendiving/opendiving-api), which is where authentication,
authorization and stored data are actually enforced. If the flaw is clearly on that side, that
repository is where it belongs. If you can't report it privately there, or you're not sure which
side it's on, send it here and we'll route it.

## What to put in it

- **What an attacker gets.** Impact first — read someone else's dives, take over an account, run
  script in another user's browser. It is the part that decides how fast this moves.
- **How to reproduce it.** The request and response, or the page and what you did on it. A working
  reproduction is worth more than a severity rating.
- **Which version.** A release tag, or the commit if you're running `main`. For a pulled image,
  `docker inspect` reports it as `org.opencontainers.image.revision`.
- **Anything unusual about the deployment**, if it matters: your own reverse proxy instead of the
  bundled Caddy, a split-origin build (`NEXT_PUBLIC_API_URL` set), `WEB_HSTS=off`. Those change
  which code paths run.

In scope is anything in this repository: the Next.js app, the security headers and nonce-based CSP
built in `src/proxy.ts`, the same-origin forwarder in `src/lib/api-proxy.ts` that passes each
request and its cookies to the API, session handling in `src/lib/api/client.ts` and
`src/contexts/AuthContext.tsx`, and the `Dockerfile` and published image built from them. Out of
scope: one operator's configuration, the API's own behaviour, and the third-party services an
instance can be pointed at (the basemap, Google sign-in) — though how this app integrates with them
is very much in scope.

## What happens next

A person reads it. There is no rota and no security team behind either channel, so rather than
promise an acknowledgement window we can't keep, here is the honest version: you'll get a reply from
a maintainer, and if a report goes quiet for a couple of weeks, nudge the thread. That is useful,
not rude.

From there we reproduce it, agree with you on how bad it is, fix it on `main` and cut a release.
Nothing is backported, so the supported version is the latest release — for self-hosters the fix
arrives as `docker compose pull && docker compose up -d`. Releases move in lockstep with
opendiving-api, so a fix on one side may ship a matched version on both.

We publish a GitHub advisory once there is a release to upgrade to, crediting you by name unless
you'd rather we didn't. We'd like public details to wait for that release. We are not going to name
a disclosure deadline on your behalf — if you have one, say so in your first message and we'll work
to it or tell you plainly that we can't.

Reporting something in good faith is welcome here. Don't test against an instance you don't run:
those are other divers' logbooks, and this project can't grant you permission to touch someone
else's server.
