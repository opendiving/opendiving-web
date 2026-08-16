# opendiving-web

Next.js + TypeScript frontend.

`DECISIONS.md` in this repo holds the reasoning behind most of what follows — read the relevant
section before changing anything unfamiliar, and append to it when you hit a new gotcha. It and the
other markdown docs are formatted: run `npm run format` after editing one rather than matching the
wrapping by hand.

This file is the one exception — Prettier formats it but leaves its prose wrapping alone, so wrap
new lines at 100 columns by hand. The managed block at the bottom is why; see "The project
instructions live in AGENTS.md" in `DECISIONS.md`.

## Environment & Setup

- Dev server: http://localhost:3000
- Environment: `.env` (create from `.env.example`)
- **API access**: the browser calls the API directly — axios `baseURL` in `lib/api/client.ts` — with
  no server-side proxy in between. Set `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1` in `.env`
  — it is the full base, `/api/v1` prefix included, not just the origin, and without the prefix
  every request 404s. Despite the name, `src/proxy.ts` is Next middleware that builds a nonce-based
  CSP, not a proxy; it reads that same variable to derive `connect-src`, so repointing the app at
  another API host is a one-variable change — and an API host hardcoded anywhere else will be
  blocked by CSP rather than merely misconfigured.

Test, lint, format and type-check commands are in `CONTRIBUTING.md`.

## Code Style — TypeScript/JavaScript

- 2-space indent
- `camelCase` for functions and variables
- `PascalCase` for component identifiers, `kebab-case` for the files holding them (e.g.
  `DiveFormCard` in `dive-form-card.tsx`)
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
