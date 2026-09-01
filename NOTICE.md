# Third-Party Notices

OpenDiving Web is licensed under AGPL-3.0 (see `LICENSE`). This file covers third-party material
that is copied into this repository's own tree: artwork redrawn by hand into source files, and
vendored build output and assets under `public/`.

It is deliberately not an inventory of the npm dependency graph. Those packages are installed, not
redistributed from here, and each carries its own license text inside `node_modules/` — and inside
the bundle, for the ones whose code reaches the browser.

The brand mark and the landing page's artwork are not listed because they are not third-party:
`src/components/logo.tsx`, `src/app/icon.svg` and the dive profile drawn in
`src/components/layout/reef-backdrop.tsx` are original artwork for this project. See `DECISIONS.md`
for why the mark stopped being a copied icon, and for the standing rule about marketplace artwork
that the same pass produced.

## Google

<https://developers.google.com/identity/branding-guidelines>

`src/components/icons/google-icon.tsx` contains Google's "standard color gradient super G logo",
extracted from Google's own pre-approved Sign in with Google brand icon download. The mark's own
pixels — path data, gradient stops and blur layers — are unmodified; the pill-shaped button
background that shipped alongside it in that download was dropped, since the mark renders inside the
app's own button.

This is a trademark used under Google's branding guidelines, not material under an open-source
license. It carries no permission to use it for anything other than identifying Google's sign-in
service, and a fork that drops Google sign-in should drop the mark with it.

## MapLibre GL JS

<https://github.com/maplibre/maplibre-gl-js>

`public/maplibre/maplibre-gl-shared.mjs` and `public/maplibre/maplibre-gl-worker.mjs` are vendored
build output from `maplibre-gl`, licensed under the 3-Clause BSD License. Both files carry the
upstream license header, which names the exact version and links its full text.

## OpenFreeMap basemap styles

<https://openfreemap.org>

`public/basemap/liberty.json`, `public/basemap/dark.json` and the shared sprite set under
`public/basemap/sprite/` are OpenFreeMap's Liberty and Dark styles, vendored so the map's appearance
cannot change under the app after an upstream restyle (see `DECISIONS.md`). The vendored copies
carry no licence metadata of their own — these styles are used on OpenFreeMap's terms, at the link
above.

These are style definitions, not map data. Credit for the data the styles draw — OpenFreeMap,
OpenMapTiles and OpenStreetMap — is rendered on the map at runtime: `lib/basemap.ts` ships that
credit as the default, and an operator who points `MAP_STYLE_URL` at a style of their own must set
`MAP_ATTRIBUTION` to match it, which the app enforces by throwing rather than crediting the wrong
project.
