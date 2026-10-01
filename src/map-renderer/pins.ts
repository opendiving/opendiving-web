// A picture's pins, drawn into its pixels as the browser's markers look:
// `markerClassName` in `components/map/locations-map.tsx` - a 12 px coral dot
// with a 2 px border in the theme's background colour, and a recorded fix as
// the inverse ring with the background at 80 % in its middle. A GeoJSON source
// rather than pixels of our own, so MapLibre draws a place at 178E in whichever
// copy of the world the camera shows - a trip to Fiji and Samoa keeps both.
//
// The pins are in the picture rather than laid over it because nothing could
// reach them there anyway: a card's stretched link covers its backdrop, so a
// pin's hover title and pointer events already reach nobody.

import type { PlacedLocation } from "@/lib/map-picture";
import type { Theme } from "./payload";

// `--coral` and each theme's `--background` in `app/globals.css`, which
// `pins.test.ts` reads so the two cannot drift apart.
export const PIN_COLOURS: Record<Theme, { coral: string; background: string }> =
  {
    light: { coral: "#ff7f50", background: "#ffffff" },
    dark: { coral: "#ff7f50", background: "#161618" },
  };

export const PINS_SOURCE = "opendiving-pins";
const SHADOW_LAYER = "opendiving-pin-shadows";
const PINS_LAYER = "opendiving-pins";

/** The pins of `placed` as a GeoJSON source, in the order the browser adds them. */
export function pinsSource(placed: readonly PlacedLocation[]) {
  return {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: placed.map(({ latitude, longitude, variant }, order) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: { variant, order },
      })),
    },
  };
}

/**
 * The two layers that draw them: Tailwind's `shadow` under each, then the dot
 * or the ring. A later marker sits over an earlier one, as a later DOM element
 * does.
 */
export function pinLayers(theme: Theme) {
  const { coral, background } = PIN_COLOURS[theme];
  const isFix = ["==", ["get", "variant"], "fix"];
  return [
    {
      id: SHADOW_LAYER,
      type: "circle",
      source: PINS_SOURCE,
      layout: { "circle-sort-key": ["get", "order"] },
      paint: {
        // `0 1px 3px rgb(0 0 0 / 0.1)` around a 6 px radius: one circle a
        // blur's width wider, a pixel down.
        "circle-radius": 7.5,
        "circle-blur": 0.4,
        "circle-color": "#000000",
        "circle-opacity": 0.1,
        "circle-translate": [0, 1],
      },
    },
    {
      id: PINS_LAYER,
      type: "circle",
      source: PINS_SOURCE,
      layout: { "circle-sort-key": ["get", "order"] },
      paint: {
        // MapLibre strokes outside the radius, so 4 + 2 is the marker's
        // border-box 12 px.
        "circle-radius": 4,
        "circle-stroke-width": 2,
        "circle-color": ["case", isFix, background, coral],
        "circle-opacity": ["case", isFix, 0.8, 1],
        "circle-stroke-color": ["case", isFix, coral, background],
      },
    },
  ];
}
