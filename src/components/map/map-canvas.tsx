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

export interface MapCanvasProps {
  /** Which basemap to draw, from `useConfig().basemap`. */
  basemap: Basemap;
  /** Which half of the pair. `undefined` counts as light, as it does elsewhere. */
  theme: "light" | "dark";
  /**
   * Whether the map handles its own gestures. Read-only surfaces pass `false`,
   * which also switches off the keyboard handling and the scroll capture.
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
      });
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
      <div ref={attachMap} className={cn("absolute inset-0", className)} />
      {children}
    </>
  );
}
