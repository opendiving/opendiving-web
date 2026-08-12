# OpenDiving Web

**A self-hosted dive log. Your dives, your data — in open formats, on your own server.**

OpenDiving is an open-source logbook for scuba divers: log dives with gas mixtures and
multiple sites per dive, group them into trips, import dives straight from your dive
computer's export file — full depth/temperature/tank-pressure profile included — and
keep your gear service history and c-cards in one place.

Cloud dive logs come and go, and when they go, years of dive history go with them.
OpenDiving is built on a different premise: the app is AGPL-licensed, the data lives in
your own Postgres database, and every dive keeps the original dive-computer export it
was imported from, downloadable at any time.

![Dashboard](docs/screenshots/dashboard.png)

## Features

- **Dive logging** — times, depths, duration, temperature, visibility, weight, notes,
  and any number of gas mixtures (O₂/He, start/end pressures) per dive. A dive can span
  multiple dive sites (drift dives happen), in order.
- **Dive-computer import** — upload a Suunto export (XML or JSON) and the form
  pre-fills itself. The original file is stored with the dive and can be re-downloaded
  anytime; the per-sample **dive profile** (depth, temperature, tank pressure) is
  extracted and charted on the dive page.
- **Air consumption** — SAC and RMV are derived automatically for single-tank dives,
  with a per-dive breakdown and a consumption trend chart on the dashboard.
- **Trips** — group dives into a liveaboard or a holiday week, with location and dates.
- **Dive sites** — your personal site list, with every dive you've logged at each site.
- **Gear tracking** — your equipment with per-item dive counts, groupable into gear
  sets you can attach to a dive in one click, plus **service schedules** (annual
  service, visual inspection, hydro test…) with due-soon reminders on the dashboard
  and by email.
- **Certifications** — keep photos of your c-cards on hand at the dive shop without
  digging out the plastic.
- **Passwordless sign-in** — email magic links or Google; no passwords stored, ever.
- **Dark mode & responsive** — works on the boat, in the dive shop, and on your desk.

| | |
|---|---|
| ![A dive, with the profile charted from its dive-computer export](docs/screenshots/dive-detail.png) | ![A gear item with its service schedule and history](docs/screenshots/gear-item.png) |

## Planned

Roadmap items, roughly in priority order — contributions welcome:

- **More dive computers & formats** — FIT (Garmin/Suunto), UDDF, and Subsurface
  imports, with an eye on [libdivecomputer](https://www.libdivecomputer.org/) for
  broad hardware support.
- **Full export** — one click to take *everything* out in open formats (UDDF, JSON,
  CSV). Getting data out will always be as easy as getting it in.
- **Statistics** — depth/time records, dives per year, sites map, species log.
- **Sharing** — public link to a dive or trip, e.g. for instructors verifying
  experience.
- **Community** — find dive buddies and share sites.
- **iOS companion app** — with Bluetooth download from dive computers and offline
  logging ([opendiving-ios](https://github.com/opendiving/opendiving-ios)).

## Getting started

The web app is the frontend for
[opendiving-api](https://github.com/opendiving/opendiving-api) — start that first
(one `docker compose up`), then:

```bash
npm install
cp .env.example .env   # points at http://localhost:8000 by default
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with your email, and log
your first dive. Without a configured email provider on the API side, the magic link
is printed to the API logs — handy for local development.

### Scripts

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript |
| `npm test` | Unit tests (`test:watch`, `test:coverage` variants) |

## Tech stack

Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui with Radix primitives,
react-hook-form + Zod validation, axios. The dive-profile and consumption charts are
hand-rolled SVG — no charting library.

## Contributing

Issues and PRs are welcome — from a typo fix to a new importer. Open an issue first
for bigger features so we can agree on the shape. See
[CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks CI runs, and the house rules,
and [DECISIONS.md](DECISIONS.md) for the non-obvious choices already made.

## Related repositories

| | |
|---|---|
| [opendiving-api](https://github.com/opendiving/opendiving-api) | FastAPI backend (Postgres, Redis, dive-file parsing) |
| [opendiving-ios](https://github.com/opendiving/opendiving-ios) | SwiftUI companion app (early stage) |

## License

[AGPL-3.0](LICENSE). In short: run it, change it, self-host it freely — but if you
offer a modified version as a service, you share your changes. Nobody gets to take
this closed-source and lock divers' data away.
