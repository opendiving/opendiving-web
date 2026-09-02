# Third-Party Notices

OpenDiving Web is licensed under AGPL-3.0 (see `LICENSE`). This file covers third-party material
that is copied into this repository's own tree — artwork redrawn by hand into source files, and
vendored assets under `public/` — plus one entry, MapLibre's worker, that is generated into
`public/` at build time and ships in the image rather than in the tree.

It is deliberately not an inventory of the npm dependency graph. Those packages are installed, not
redistributed from here, and each carries its own license text inside `node_modules/` — and inside
the bundle, for the ones whose code reaches the browser.

The brand mark is not listed because it is not third-party: `src/components/logo.tsx` and
`src/app/icon.svg` are original artwork for this project. See `DECISIONS.md` for why the mark
stopped being a copied icon, and for the standing rule about marketplace artwork that the same pass
produced.

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

## svgsilh — the hero's reef

<https://svgsilh.com/image/1298776.html>

`assets/artwork/reef-svgsilh-1298776.svg` is svgsilh's "ocean coral reef marine" image, released
under [Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
`public/reef-mask.png` is the silhouette derived from it by `scripts/generate-reef-mask.mjs`, and is
the only one of the two that ships: the source is kept out of `public/` so it is served to nobody
and never reaches the image. CC0 is a public-domain dedication: it permits redistribution and
modification, and requires no attribution. This entry exists because provenance that is not written
down cannot be recovered later, not because the licence asks for it.

Two things worth knowing rather than rediscovering. The dedication is svgsilh's blanket assertion
across its library, applied to artwork it derived from a Pixabay original — Pixabay's own terms
became more restrictive in 2019, so the claim rests on svgsilh's upstream having predated that,
which its age supports but does not prove. And what ships is not the file as downloaded: the 318 KB
SVG was reduced to a 19 KB two-colour mask (see `DECISIONS.md`), which CC0 permits without
qualification.

## MapLibre GL JS

<https://github.com/maplibre/maplibre-gl-js>

`public/maplibre/maplibre-gl-shared.mjs` and `public/maplibre/maplibre-gl-worker.mjs` are build
output from `maplibre-gl`, licensed under the 3-Clause BSD License. Both files carry the upstream
license header, which names the exact version and links its full text.

They are the one entry here that is _not_ in the tree: `/public/maplibre/` is gitignored, and
`scripts/copy-maplibre-worker.mjs` copies both files out of `node_modules` at `predev`, `prebuild`
and `pretest`. A clone contains neither. They are listed because they reach the published image and
the browser bundle, which is where a notice has to travel — but a reader looking for them in a fresh
checkout will not find them.

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
