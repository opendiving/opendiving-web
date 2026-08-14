# OpenDiving Web

**A self-hosted dive log, built to outlive every vendor. Your dives, your data — original files
kept, open formats, on your own server.**

OpenDiving is an open-source logbook for scuba divers — recreational and technical: log dives with
multi-tank gas mixtures (nitrox and trimix), import dives straight from your dive computer's export
file — full depth/temperature/tank-pressure profile, deco ceiling and dive events included — group
them into trips, and keep your gear service history and c-cards in one place.

Cloud dive logs come and go — Movescount, Deepblu, Diveboard — and when they go, years of dive
history go with them. OpenDiving is built on a different premise: the app is AGPL-licensed, the data
lives in your own Postgres database, and every dive keeps the original dive-computer export it was
imported from, downloadable at any time. Self-hosting isn't a feature here; it's the guarantee that
no shutdown, acquisition, or paywall can ever take your logbook with it.

![Dashboard](docs/screenshots/dashboard.png)

## Features

- **Dive logging** — times, depths, duration, temperature, visibility, weight, notes, and any number
  of gas mixtures (O₂/He, start/end pressures) per dive. A dive can span multiple dive sites (drift
  dives happen), in order.
- **Technical diving** — trimix and nitrox mixes get derived gas names and per-mix **MOD** at your
  ppO₂ limit, plus END/EAD; the profile chart shades the **deco ceiling** and marks dive events;
  **CNS/OTU** oxygen exposure and surface pressure are kept from imports, per-cylinder ppO₂ limits
  and gas roles included.
- **Dive-computer import** — upload a FIT file (Garmin Descent, Suunto Ocean/D5) or a Suunto
  XML/JSON export and the form pre-fills itself, keeping the file's own UTC offset where it records
  one (FIT and the JSON exports do; Suunto's XML carries no offset at all, so those fall back to
  your current timezone). The original file is stored with the dive and can be re-downloaded
  anytime; the per-sample **dive profile** (depth, temperature, tank pressure, deco ceiling, events)
  is extracted and charted on the dive page.
- **Air consumption** — SAC and RMV are derived automatically, including a **per-tank breakdown**
  across recorded gas switches on multi-tank dives, with a consumption trend chart on the dashboard.
- **Trips** — group dives into a liveaboard or a holiday week, with location and dates.
- **Dive sites** — your personal site list, with every dive you've logged at each site.
- **Gear tracking** — your equipment with per-item dive counts, groupable into gear sets you can
  attach to a dive in one click, plus **service schedules** (annual service, visual inspection,
  hydro test…) with due-soon reminders on the dashboard and by email.
- **Certifications** — keep photos of your c-cards on hand at the dive shop without digging out the
  plastic.
- **Passwordless sign-in** — email magic links or Google; no passwords stored, ever.
- **Dark mode & responsive** — works on the boat, in the dive shop, and on your desk.

|                                                                                                     |                                                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ![A dive, with the profile charted from its dive-computer export](docs/screenshots/dive-detail.png) | ![A gear item with its service schedule and history](docs/screenshots/gear-item.png) |

## Planned

Roadmap items, roughly in priority order — contributions welcome:

- **Full export** — one click to take _everything_ out in open formats (UDDF, CSV, and a complete
  JSON + original-files archive). A data-ownership log without an exit door is a contradiction; this
  ships before anything else.
- **More importers** — Subsurface XML and UDDF (which also covers Apple Watch dives via Oceanic+'s
  UDDF export), then Shearwater Cloud exports; a pluggable importer layer so every format someone is
  stranded with is a migration path in. Longer term,
  [libdivecomputer](https://www.libdivecomputer.org/) for direct hardware support.
- **One-command self-hosting** — a single compose file for the whole stack (web included, TLS
  handled), prebuilt images, SMTP as an alternative to Resend, and versioned migrations so upgrades
  never threaten your data.
- **Statistics** — depth/time records, dives per year, sites map, species log.
- **Sharing** — public link to a dive or trip.
- **iOS companion app** — parked until the server story is done
  ([opendiving-ios](https://github.com/opendiving/opendiving-ios)).

## How it compares

Honest answers to "why not X":

- **[Subsurface](https://subsurface-divelog.org/)** — the open-source reference, with unmatched
  dive-computer support and a full deco planner. It's desktop-first with no web app or self-hostable
  server; OpenDiving is the server-shaped complement — a modern web UI on your own box, API-first,
  reachable from any browser. Use Subsurface to download from cables; a Subsurface import is high on
  the roadmap so both can hold the same log.
- **[Submersion](https://submersion.app/) / [Bubbletrail](https://bubbletrail.app/)** — excellent
  newer open-source _apps_: local-first, on-device databases, Bluetooth downloads. OpenDiving is the
  household-server alternative: one instance, every browser and family member, one backup, an API.
- **Vendor clouds (Shearwater, Garmin, Suunto, Oceanic+)** — where dives are born, not where they
  should live. OpenDiving imports their exports and keeps the original file forever, so switching
  computers never splits your history.

## Getting started

The web app is the frontend for [opendiving-api](https://github.com/opendiving/opendiving-api) —
start that first (one `docker compose up`), then:

```bash
npm install
cp .env.example .env   # points at http://localhost:8000 by default
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with your email, and log your first
dive. Without a configured email provider on the API side, the magic link is printed to the API logs
— handy for local development.

### Scripts

| Command                       |                                                     |
| ----------------------------- | --------------------------------------------------- |
| `npm run dev`                 | Development server                                  |
| `npm run build` / `npm start` | Production build / serve                            |
| `npm run lint`                | ESLint                                              |
| `npm run type-check`          | TypeScript                                          |
| `npm test`                    | Unit tests (`test:watch`, `test:coverage` variants) |

## Tech stack

Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui with Radix primitives, react-hook-form +
Zod validation, axios. The dive-profile and consumption charts are hand-rolled SVG — no charting
library.

## Contributing

Issues and PRs are welcome — from a typo fix to a new importer. Open an issue first for bigger
features so we can agree on the shape. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks
CI runs, and the house rules, and [DECISIONS.md](DECISIONS.md) for the non-obvious choices already
made.

## Related repositories

|                                                                |                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| [opendiving-api](https://github.com/opendiving/opendiving-api) | FastAPI backend (Postgres, Redis, dive-file parsing) |
| [opendiving-ios](https://github.com/opendiving/opendiving-ios) | SwiftUI app (early scaffold, parked)                 |

## License

[AGPL-3.0](LICENSE). In short: run it, change it, self-host it freely — but if you offer a modified
version as a service, you share your changes. Nobody gets to take this closed-source and lock
divers' data away.
