"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  basemapStyle,
  MAX_ZOOM,
  MIN_ZOOM,
  type Basemap,
  type BasemapStyle,
} from "@/lib/basemap";
import { hasWebGL2 } from "@/lib/webgl";
import { cn } from "@/lib/utils";

// **The whole of what the Content-Security-Policy needed.** MapLibre's renderer
// runs in a web worker, and left to itself it creates one from a `blob:` URL -
// which in a nonce-based policy is equivalent to `unsafe-eval`, and is the
// objection that kept this app on a hand-rolled raster map for as long as it
// did. `workerFactory()` calls `new Worker(url)` directly whenever
// `isCrossOrigin(url)` is false, so naming a copy on our own origin avoids the
// blob path entirely rather than permitting it.
//
// `scripts/copy-maplibre-worker.mjs` is what puts the file there, and it copies
// a sibling alongside it that the worker imports on its first line. Get either
// half wrong and the map mounts, reports nothing, and never fires `load`.
//
// Module scope, so it is set before any `Map` can be constructed: this module is
// only reached through the `ssr: false` dynamic imports below it, so the
// assignment happens in the browser, once, on the way to the first map.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// A pointer that moved less than this between press and release was a tap on a
// place, not a drag that happened to end where it started. MapLibre's own
// default is 3 px; this is the figure the hand-rolled gesture handler used, and
// it is what "click to place the dive site" was tuned against on a phone.
const TAP_SLOP_PX = 5;

export interface MapCanvasProps {
  /** Which basemap to draw, from `useConfig().basemap`. */
  basemap: Basemap;
  /** Which half of the pair. `undefined` counts as light, as it does elsewhere. */
  theme: "light" | "dark";
  /**
   * Whether the map handles its own gestures. Read-only surfaces pass `false`,
   * which switches every handler off; `true` brings in the interaction policy
   * documented on the constructor below - cooperative gestures, no rotation or
   * pitch, and no keyboard of MapLibre's own.
   */
  interactive?: boolean;
  className?: string;
  /**
   * The instance, as it comes and goes - called with the map once it exists and
   * with `null` when it is torn down, the way a callback ref reports an element.
   *
   * A callback rather than a returned value because the caller invariably wants
   * it in state: markers, camera moves and event handlers all have to be set up
   * against a particular instance and undone against the same one.
   */
  onMap?: (map: MapLibreMap | null) => void;
  /**
   * What to draw when the browser cannot run the map at all. Every caller needs
   * one and none of them share wording, so there is no default: a map that
   * silently renders an empty box on a machine without WebGL2 looks broken
   * rather than unsupported.
   */
  unsupported: ReactNode;
  /** Overlays drawn above the canvas - attribution, controls, a crosshair. */
  children?: ReactNode;
}

/**
 * The MapLibre instance, and the two things that have to happen around it: the
 * capability check that decides whether to build one at all, and the style that
 * has to be resolved before it can draw.
 *
 * Deliberately owns no camera and no content. Callers position the map and add
 * their own markers through `onMap`, because the two surfaces this serves want
 * very different things from it - one fits a set of places once and never moves
 * again, the other is a write-back control with an interaction contract of its
 * own.
 */
export function MapCanvas({
  basemap,
  theme,
  interactive = false,
  className,
  onMap,
  unsupported,
  children,
}: MapCanvasProps) {
  // Asked once, eagerly: this module is only ever reached through an
  // `ssr: false` dynamic import, so the first render is already in a browser and
  // `document` exists. Deferring it to an effect would cost a frame of empty map
  // frame on every mount to answer a question that cannot change.
  const [supported] = useState(hasWebGL2);

  // What should be drawn now, and what there was to draw when the map was built.
  // Two pieces of state for what looks like one thing, because a theme change has
  // to reach the *live* map rather than build another one.
  //
  // Constructing with a placeholder style and swapping the real one in
  // afterwards would need only the first, and it is what this did first. It is
  // wrong for one specific reason: `load` then fires against the placeholder,
  // before the real style has even been asked for. That event is the only signal
  // separating a working renderer from a worker that never started - which
  // produces no error and no console line - so making it fire early turns the
  // one check for that failure into a check for nothing.
  const [style, setStyle] = useState<BasemapStyle | null>(null);
  const [initialStyle, setInitialStyle] = useState<BasemapStyle | null>(null);

  // The instance lives in a ref rather than in state because nothing this
  // component renders depends on it; the caller is told about it through
  // `onMap`, and holds it in state there if it needs to.
  const map = useRef<MapLibreMap | null>(null);
  // The style the live map is currently showing, so a swap can tell "already
  // drawn" from "resolved to the same value again". See the swap effect below.
  const applied = useRef<BasemapStyle | null>(null);
  // Read at attach time only, and kept out of the callback's dependencies on
  // purpose: a caller passing an inline arrow would otherwise tear the map down
  // and rebuild it on every one of its own renders.
  const notify = useRef(onMap);
  useEffect(() => {
    notify.current = onMap;
  }, [onMap]);

  useEffect(() => {
    let cancelled = false;
    basemapStyle(basemap, theme)
      .then((resolved) => {
        if (cancelled) return;
        setStyle(resolved);
        setInitialStyle((current) => current ?? resolved);
      })
      .catch((error: unknown) => {
        // Said in production too: an operator who pointed MAP_STYLE_URL at
        // something unreachable gets a blank frame, and this is the only line
        // that says which.
        console.error("[basemap] Could not resolve the map style.", error);
      });
    return () => {
      cancelled = true;
    };
  }, [basemap, theme]);

  // **The map is built in a callback ref, not in an effect**, and both halves of
  // that matter.
  //
  // A callback ref because the element is not always there at mount: a caller
  // with nothing to draw renders `null`, and this component renders the fallback
  // instead when WebGL2 is missing - so an effect that found no element on mount
  // would never look again. React 19 runs the returned cleanup when the element
  // goes or when this callback's identity changes, which is what makes the
  // teardown belong here too.
  //
  // And it is where the instance is created because an effect that called
  // `setState` with it would be a cascading render, which the React lint rules
  // reject outright.
  const attachMap = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !initialStyle) return;
      const instance = new MapLibreMap({
        container: element,
        style: initialStyle,
        interactive,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        // The credit is rendered by the app, as `[label](url)` text, and
        // MapLibre's own control would be a second one on screen. It also
        // renders HTML, which `react/no-danger` makes a deliberate decision here
        // rather than a default - see DECISIONS.md, "Attribution is parsed into
        // parts, not injected as HTML".
        attributionControl: false,
        // Nothing sets `refreshExpiredTiles`, and that is load-bearing rather
        // than an omission. At its default of `true` MapLibre fetches raster
        // tiles as an `ArrayBuffer` - reading the cache header needs the fetch
        // path - so every basemap request in either mode is governed by
        // `connect-src`, which is what `proxy.ts` derives. Setting it to `false`
        // would send raster tiles back through `new Image()` and `img-src`,
        // silently splitting the policy this app builds.
        //
        // **The interaction policy, and every line of it is a behaviour this app
        // already had.** All of it is inert while `interactive` is false, since
        // MapLibre registers no handlers at all then - so this is the picker's
        // contract stated once, in the component that owns the instance, rather
        // than reached into from outside.
        //
        // `cooperativeGestures` is the one that carries the most: one finger
        // scrolls the page instead of panning the map (the surface sits inside a
        // dialog that scrolls within a capped height - `ui/dialog.tsx` - and
        // covers much of it on a phone, so a thumb landing on it has to be able
        // to reach Save), two
        // fingers drive the map, and the wheel only zooms with ctrl/cmd - which
        // is also what a trackpad pinch sends. It sets `touch-action: pan-x
        // pan-y` on the canvas and `preventDefault`s `touchmove` from two
        // touches up, which is the half `touch-action` cannot express. Its own
        // overlay is suppressed in `globals.css`; the app draws its own, off the
        // `cooperativegestureprevented` event.
        cooperativeGestures: interactive,
        // And MapLibre's own wording for it, emptied. Its default mobile string
        // is *exactly* the sentence the app's hint carries, so leaving it would
        // put a second copy of that sentence in the document for anything
        // reading the page - a test included - to find twice.
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": "",
          "CooperativeGesturesHandler.MacHelpText": "",
          "CooperativeGesturesHandler.MobileHelpText": "",
        },
        // **A pan ends when the pointer lifts.** MapLibre's drag handler adds
        // inertia, which this app's own never had, and on a placement control it
        // is worse than a preference: the frame is 160 px tall inside a scrolling
        // dialog, and a map still gliding when the next click lands puts the pin
        // somewhere nobody aimed at. There is no `inertia: false`, so this is
        // said in the units the handler has - a fling capped at no speed eases
        // for no time and travels no distance.
        dragPan: { maxSpeed: 0 },
        // No rotation and no pitch: the map's feature set did not grow with the
        // renderer, and a dive site is a point on a north-up map. `dragRotate`
        // carries the drag-to-pitch with it, roll is off by default, and touch
        // rotation is not a constructor option at all - it is switched off on
        // the handler below.
        dragRotate: false,
        touchPitch: false,
        boxZoom: false,
        // A double click on this map is two placements, not a zoom - the `+`/`-`
        // buttons and ctrl+wheel are how it zooms, and MapLibre's default would
        // fire both at once.
        doubleClickZoom: false,
        // The keyboard belongs to the caller. MapLibre's own handler pans and
        // zooms about the *centre*, which is exactly the behaviour the picker
        // exists not to have (see its `anchorFor`), and it has nothing to say
        // about Enter placing a site.
        keyboard: false,
        clickTolerance: TAP_SLOP_PX,
      });
      if (interactive) {
        // There is no constructor option for this: `touchZoomRotate` enables the
        // combined handler and rotation is turned off on the handler itself.
        instance.touchZoomRotate.disableRotation();
      }
      map.current = instance;
      applied.current = initialStyle;
      notify.current?.(instance);
      return () => {
        instance.remove();
        map.current = null;
        applied.current = null;
        notify.current?.(null);
      };
    },
    [initialStyle, interactive],
  );

  // A theme switch, which is a style swap on the live map rather than a new one:
  // the WebGL context, the camera and the markers all survive it.
  //
  // The guard is against `applied` - what the map is currently *showing* - and
  // not against the style it was built with, which is a distinction with one
  // sharp consequence. For a configured `MAP_STYLE_URL`, `basemapStyle` hands
  // back the URL *string* rather than a parsed document, so the same theme
  // resolves to the same value every time. Comparing against the built-with
  // style then makes light -> dark apply and dark -> light a no-op: the second
  // resolves to exactly the string the map was constructed with, the swap is
  // skipped, and the map stays dark for good. The bundled and raster modes both
  // build a fresh object per call, so neither would ever have shown it.
  useEffect(() => {
    if (!map.current || !style || style === applied.current) return;
    map.current.setStyle(style);
    applied.current = style;
  }, [style]);

  if (!supported) {
    return <>{unsupported}</>;
  }

  return (
    <>
      {/* **Two elements, and the inner one carries no styling of this app's at
          all.** MapLibre stamps `.maplibregl-map { position: relative;
          overflow: hidden }` onto whatever element it is handed, and
          `maplibre-gl.css` is unlayered while Tailwind's output sits in
          `@layer utilities` - so an unlayered vendor declaration outranks any
          utility class on that element whatever its specificity or the source
          order. This component used to hand MapLibre a single
          `absolute inset-0` div and lost that race: `relative` won, `inset-0`
          had nothing to anchor to, the container sat at zero height with its
          absolutely positioned canvas clipped away by the library's own
          `overflow: hidden`, and the map did not render anywhere in the app -
          through five changes and every review of them, because reading the
          markup cannot tell you which of two stylesheets won.

          So the layout lives on an element MapLibre never touches, and the
          element it does own is a bare grid item - stretched to its parent's
          only cell by `align/justify-self: normal`, with `min-height: auto`
          resolving to zero because `overflow: hidden` makes it a scroll
          container. Its size comes from its parent's layout rather than from a
          declaration of ours, so there is nothing here for a future vendor
          rule to outrank. Fixing this with a stronger selector instead would
          be the same race with today's winner reversed, which is why it was
          not done that way.

          `className` lands here too, on the element the app owns: passed to
          the container it would have been subject to the same silent override
          for anything MapLibre sets. */}
      <div className={cn("absolute inset-0 grid", className)}>
        <div ref={attachMap} />
      </div>
      {children}
    </>
  );
}
