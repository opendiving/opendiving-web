# Third-Party Notices

OpenDiving Web is licensed under AGPL-3.0 (see `LICENSE`). This file covers third-party material
that is copied into this repository's own tree — artwork redrawn by hand into source files, and
vendored assets under `public/` — plus two entries that ship in the image rather than in the tree:
MapLibre's worker, generated into `public/` at build time, and MapLibre Native's binary, which the
map renderer draws with.

It is deliberately not an inventory of the npm dependency graph. Those packages are installed, not
redistributed from here, and each carries its own license text inside `node_modules/` — and inside
the bundle, for the ones whose code reaches the browser. MapLibre Native is the exception, and is
listed below: its package carries no license file, and its binary is downloaded at install.

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

## Lucide

<https://lucide.dev>

`src/components/icons/twin-tank-icon.tsx` and `src/components/icons/dive-site-icon.tsx` are built
from Lucide path data copied into the source and modified: the first is `fire-extinguisher` without
its hose and nozzle, drawn twice and joined; the second is `map-pin` with original bubbles in place
of its inner circle. Neither icon is one Lucide inherited from Feather, so Lucide's own ISC license
is the only one that applies, and it asks for this notice to travel with every copy:

> ISC License
>
> Copyright (c) 2026 Lucide Icons and Contributors
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without
> fee is hereby granted, provided that the above copyright notice and this permission notice appear
> in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
> SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
> AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
> NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE
> OF THIS SOFTWARE.

Every other Lucide icon in the app is imported from `lucide-react` and is covered by that package's
own license file, as the introduction above describes.

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

## MapLibre Native

<https://github.com/maplibre/maplibre-native>

`map-renderer/node_modules/@maplibre/maplibre-gl-native/` in the image holds the
`@maplibre/maplibre-gl-native` package, whose install script downloads a prebuilt binary,
`lib/node-v*/mbgl.node`, from its GitHub release. Neither the package nor the binary carries a
license file, so its terms travel here:

```
BSD 2-Clause License

Copyright (c) 2021 MapLibre contributors

Copyright (c) 2018-2021 MapTiler.com

Copyright (c) 2014-2020 Mapbox

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

* Redistributions of source code must retain the above copyright
  notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright
  notice, this list of conditions and the following disclaimer in
  the documentation and/or other materials provided with the
  distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

The binary also contains the libraries MapLibre Native builds in — FreeType, HarfBuzz, RapidJSON and
the Mapbox C++ libraries among them — under the licenses its `LICENSES.core.md` reproduces at the
release tag of the installed version; for 6.4.1,
<https://github.com/maplibre/maplibre-native/blob/node-v6.4.1/LICENSES.core.md>. MapLibre Native is
based in part on the work of the FreeType Team.

## OpenFreeMap basemap styles

<https://openfreemap.org>

`public/basemap/liberty.json` and the sprite set under `public/basemap/sprite/` are OpenFreeMap's
Liberty style, vendored so the map's appearance cannot change under the app after an upstream
restyle (see `DECISIONS.md`). They come from
[hyperknot/openfreemap-styles](https://github.com/hyperknot/openfreemap-styles), whose own licence
is MIT, © 2023 Zsolt Ero; `liberty.json` is what `https://tiles.openfreemap.org/styles/liberty`
serves with two changes: the `sprite` URL is repointed at the vendored copy, and
`scripts/generate-basemaps.mjs` recolours the water, river lines and water labels teal. All four
sprite files are byte-identical to `https://tiles.openfreemap.org/sprites/ofm_f384/` — `ofm.png`,
`ofm@2x.png` and the two `.json` manifests beside them.

`public/basemap/dark.json` is a further modified Liberty: the same script rewrites its paint colours
and changes nothing else, so it carries Liberty's licences below.

The vendored files themselves carry no licence metadata — style JSON has nowhere to put a comment —
so this entry is where it lives. Liberty is a fork with two licences, one for the code and one for
the look:

- **Liberty** is forked from [maputnik/osm-liberty](https://github.com/maputnik/osm-liberty), itself
  a fork of the OSM Bright GL Style, derived from
  [Mapbox Open Styles](https://github.com/mapbox/mapbox-gl-styles) — "Mapbox Open Styles are
  copyright (c) 2014, Mapbox, all rights reserved". The style JSON is under the **3-Clause BSD
  License**; the design is under **CC BY**, 3.0 upstream at Mapbox and 4.0 as redistributed by
  OpenMapTiles and OpenFreeMap.
- **The sprite set** is built by openfreemap-styles from the
  [Maki POI icon set](https://github.com/mapbox/maki/blob/master/LICENSE.txt), which is CC0 1.0
  Universal, plus a right-arrow derived from
  [Wikipedia](https://commons.wikimedia.org/wiki/File:Arrowright.svg) and in the public domain.

All of that permits redistribution, which is the question this repository has to answer about
anything in its own tree: it is published under AGPL-3.0 and a clone carries these files. The BSD
conditions are reproduced here because the JSON cannot carry them, and this file is the
"documentation … provided with the distribution" they name:

> Redistribution and use in source and binary forms, with or without modification, are permitted
> provided that the following conditions are met:
>
> - Redistributions of source code must retain the above copyright notice, this list of conditions
>   and the following disclaimer.
> - Redistributions in binary form must reproduce the above copyright notice, this list of
>   conditions and the following disclaimer in the documentation and/or other materials provided
>   with the distribution.
> - Neither the name of the copyright holder nor the names of its contributors may be used to
>   endorse or promote products derived from this software without specific prior written
>   permission. (Upstream spells this clause "Neither the name of Mapbox" in the Liberty chain.)
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
> IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
> FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
> CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
> DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
> DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
> IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
> OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

The full upstream texts are
[openfreemap-styles](https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md),
[osm-liberty](https://github.com/maputnik/osm-liberty/blob/gh-pages/LICENSE.md) and
[Mapbox Open Styles](https://github.com/mapbox/mapbox-gl-styles/blob/master/LICENSE.md).

**CC BY is satisfied on the map itself, not here.** These are style definitions, not map data, and
both the design licence and OpenMapTiles' own terms ask for a credit reachable from the map rather
than baked into the image. `lib/basemap.ts` ships that credit as the default — OpenFreeMap,
OpenMapTiles and OpenStreetMap — and an operator who points `MAP_STYLE_URL` at a style of their own
must set `MAP_ATTRIBUTION` to match it, which the app enforces by throwing rather than crediting the
wrong project. An operator who keeps the bundled pair must leave that default credit rendered; a
build that hides it is a licence breach, not a styling choice.
