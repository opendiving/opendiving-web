"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Minus, Plus } from "lucide-react";
import { Marker, type LngLat, type Map as MapLibreMap } from "maplibre-gl";

import {
  clampLatitude,
  MAX_ZOOM,
  MIN_ZOOM,
  WORLD_CENTER,
  wrapLongitude,
  type LatLon,
} from "@/lib/basemap";
import { useConfig } from "@/contexts/ConfigContext";
import { Button } from "@/components/ui/button";
import { Attribution } from "@/components/attribution";
import { MapCanvas } from "@/components/map/map-canvas";

// Close enough to street level to see a jetty, far enough out to see which bay
// it is in - where the map opens when the site already has a position. Deeper
// than the site page's own map fits to (`MAX_FIT_ZOOM`), which is deliberate:
// this one can be zoomed out by hand, and that one cannot. In MapLibre's units,
// so one below the 12 this was before the renderer changed - see
// `lib/basemap.ts` and DECISIONS.md.
const PLACED_ZOOM = 11;
// How long the "use two fingers" hint stays up after a one-finger drag.
const TOUCH_HINT_MS = 1600;
// How far one arrow key press moves the view.
const KEY_PAN_PX = 60;
// ~1.1 m at the equator, and finer than a dive site is a single point to begin
// with. Rounded here rather than by the caller so a placed position is exactly
// what comes back through the form, which is what lets the view tell its own
// pick apart from someone typing into the fields.
const PICK_DECIMALS = 5;

const round = (value: number) => Number(value.toFixed(PICK_DECIMALS));

/**
 * A position MapLibre reported, folded into the ranges the form's own parser
 * accepts.
 *
 * MapLibre keeps longitude unwrapped as the map is panned across the
 * antimeridian, and its inverse projection is not bounded by the Mercator
 * cut-off. Neither matters to the renderer and both matter here: the emitter's
 * output range has to stay a strict subset of what `parseFormPosition` takes, or
 * a placement can come back from the form as `(null, null)`.
 */
const positionOf = (lngLat: LngLat): LatLon => ({
  latitude: clampLatitude(lngLat.lat),
  longitude: wrapLongitude(lngLat.lng),
});

/**
 * The map's own idea of how big it is, which is not always the container's.
 *
 * MapLibre falls back to 400x300 for a container that measures zero and sizes
 * its canvas to whatever it decided, so the canvas is the only element whose box
 * is guaranteed to be the one `project` and `unproject` were computed against.
 */
const frameOf = (map: MapLibreMap) => ({
  width: map.getCanvas().clientWidth,
  height: map.getCanvas().clientHeight,
});

/** Where the view should be looking, as decided by something other than the map. */
interface Recentre {
  latitude: number;
  longitude: number;
  // Whether to raise the zoom to `PLACED_ZOOM`, which only the site's first ever
  // position does.
  raise: boolean;
}

export interface MapPickerProps {
  // The site's current position, or null for a site that has none yet.
  latitude: number | null;
  longitude: number | null;
  // Called with the position the diver placed, in decimal degrees.
  onPick: (position: LatLon) => void;
}

/**
 * A map for placing a dive site, drawn by MapLibre through `MapCanvas`.
 *
 * Loaded through `next/dynamic` by its only caller (`dive-site-map-field.tsx`),
 * so the renderer and its worker sit in their own chunk, fetched when the dive
 * site dialog opens rather than in the bundle every page pays for. The basemap
 * loads as soon as it mounts, which is why `/privacy` says so.
 *
 * This is an enhancement, not the only way in: the latitude and longitude
 * inputs beside it accept the same position typed or pasted, which is what
 * keeps the feature usable without a pointer - and what makes a browser with no
 * WebGL2 a message rather than a dead end. The map is still operable from the
 * keyboard on its own terms (arrows pan, +/- zoom, Enter places at the
 * crosshair), because a control that only answers to a mouse is a dead end for
 * anyone who cannot use one.
 *
 * MapLibre owns the camera. What this component owns is everything the renderer
 * has no opinion about: the round trip with the form, where a zoom is anchored,
 * the keyboard, and the crosshair that says where Enter would place the site.
 */
export function MapPicker({ latitude, longitude, onPick }: MapPickerProps) {
  const { resolvedTheme } = useTheme();
  // From the instance's runtime configuration, so a published image can be
  // pointed at another basemap without a rebuild (`lib/runtime-config.ts`).
  const { basemap } = useConfig();

  const hasPosition = latitude !== null && longitude !== null;

  const [map, setMap] = useState<MapLibreMap | null>(null);
  // The camera's zoom, mirrored into React only so the two buttons can disable
  // themselves at the limits. Everything else reads it off the instance.
  //
  // Seeded with what the camera effects below will open on rather than read off
  // an instance that does not exist yet: this cannot be caught up in an effect,
  // because `setState` called synchronously in one is a cascading render the
  // React lint rules reject outright. Every later value arrives through
  // MapLibre's own `zoom` event.
  const [zoom, setZoom] = useState(() =>
    hasPosition ? PLACED_ZOOM : MIN_ZOOM,
  );
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [showTouchHint, setShowTouchHint] = useState(false);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The props as of the last render, the last position this map handed out, and
  // whether the site has ever had a position at all. Three separate facts,
  // because each answers a different question below and none can be derived
  // from the others.
  const [tracked, setTracked] = useState<{
    props: { latitude: number | null; longitude: number | null };
    emitted: LatLon | null;
    everPlaced: boolean;
  }>({
    props: { latitude, longitude },
    emitted: null,
    everPlaced: hasPosition,
  });

  // Where an *outside* change wants the view. Set during render below and
  // consumed by the layout effect further down, because moving a camera is a
  // side effect and this decision is not one React can make twice.
  const [recentre, setRecentre] = useState<Recentre | null>(() =>
    hasPosition ? { latitude, longitude, raise: true } : null,
  );

  // Follow the position when it changes from *outside* - the diver typing into
  // the latitude field, or pasting a pair - so the map is not left showing
  // somewhere the site no longer is. A position that came back from this map's
  // own click is not an outside change; re-centring on that would drag the map
  // out from under the cursor and zoom in on every click.
  //
  // Hence "did the props change?" *and* "is this what we emitted?" as separate
  // questions. Collapsing them into one - remembering only the position last
  // accounted for - looks equivalent and is not: the emitting render commits
  // before the form's value reaches these props, and in that intermediate
  // render the one piece of state would already have been overwritten with the
  // stale props, so the echo would arrive unrecognised. It only worked as long
  // as the parent happened to update in the same batch.
  //
  // Decided during render rather than in an effect. React re-runs the render
  // before committing anything, so the decision is made against the props that
  // arrived rather than one render later. Comparing against the *props*, rather
  // than against the camera, is what leaves panning alone: a pan moves the view
  // every frame and must not be yanked back to the pin.
  //
  // Zoom is raised only the first time the site ever gets a position. Doing it
  // on every outside change punishes a diver who deliberately zoomed out for
  // context: `useWatch` fires per keystroke, so correcting one digit of a
  // longitude would slam the view back to street level with no way to edit the
  // numbers while staying zoomed out. Following the *centre* per keystroke is
  // wanted - it is live feedback on what was typed - and at the diver's own zoom
  // it reads as the map keeping up rather than as being thrown around.
  //
  // "Ever", latched, rather than "the previous props were null". Half-typed text
  // is not a position: `parseFormPosition` rejects `34.` mid-backspace, the
  // field passes (null, null) for that render, and comparing against the
  // previous render alone would read the very next keystroke as a first
  // placement and zoom in after all.
  if (
    tracked.props.latitude !== latitude ||
    tracked.props.longitude !== longitude
  ) {
    const isEcho =
      tracked.emitted?.latitude === latitude &&
      tracked.emitted?.longitude === longitude;
    const isFirstPosition = !tracked.everPlaced;
    // Cleared once it has been matched. One `emit` produces exactly one props
    // change, so a remembered echo has done its job the moment it is
    // recognised - and keeping it lets it match a second time much later:
    // place a pin, type your way to Bali, then type the first position back,
    // and it would be read as an echo and not followed, leaving the map over
    // Bali with the pin a world off-screen. (Clicking the same spot twice
    // changes no props, so this block does not run and nothing is lost.)
    setTracked({
      props: { latitude, longitude },
      emitted: isEcho ? null : tracked.emitted,
      everPlaced:
        tracked.everPlaced || (latitude !== null && longitude !== null),
    });

    // A cleared position updates the record and leaves the view where it is:
    // there is nowhere to follow to, and jumping somewhere arbitrary because a
    // field was emptied is worse than staying put.
    if (!isEcho && latitude !== null && longitude !== null) {
      setRecentre({ latitude, longitude, raise: isFirstPosition });
    }
  }

  const emit = (position: LatLon) => {
    const rounded = {
      latitude: round(position.latitude),
      longitude: round(position.longitude),
    };
    // A live region only speaks when its text *changes*, so placing twice at
    // the same spot - which the arming rule below reasons about too - would
    // confirm the second keypress with silence. The alternating zero-width
    // space makes the text differ without adding anything to read out. This is
    // the whole feedback channel for a keyboard diver: the coordinates land in
    // two inputs elsewhere in the dialog, and the geocode suggestion that would
    // otherwise speak up does not arrive when the geocoder is off, unreachable,
    // or older than the endpoint.
    setAnnouncement(
      (previous) =>
        `Placed at ${rounded.latitude}, ${rounded.longitude}` +
        (previous.endsWith("\u200B") ? "" : "\u200B"),
    );
    // Recording what was handed out is what stops the round trip back through
    // the form from reading as somebody else having moved the site. It is also
    // why the position is rounded *here* rather than by the caller: it has to
    // be identical to the value that comes back.
    //
    // Unless it is already the current position - pressing Enter twice without
    // panning, or clicking the same pixel again - in which case no props change
    // is coming to consume the record, and leaving it armed would make a
    // genuinely typed return to this position much later look like an echo.
    // Read off `current.props` rather than the props in scope, which for a
    // pointer gesture were captured at pointerdown.
    setTracked((current) => ({
      ...current,
      emitted:
        current.props.latitude === rounded.latitude &&
        current.props.longitude === rounded.longitude
          ? null
          : rounded,
    }));
    onPick(rounded);
  };

  // The map's own listeners are attached once per instance and would otherwise
  // close over the props and state of the render that built it.
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  });

  // **A layout effect, and before the two camera effects below**, so the zoom
  // listener is in place for the jump they make on the very first commit. As a
  // passive effect it would attach after that jump, and a position that arrived
  // while the style was still resolving would leave `zoom` behind the camera -
  // which shows up as the "Zoom out" button disabled over a map nowhere near its
  // limit.
  useLayoutEffect(() => {
    if (!map) return;
    // MapLibre puts `tabindex="0"` on its canvas for a keyboard handler this app
    // switches off (`map-canvas.tsx`). Left there it is a second tab stop inside
    // the surface, and a click landing on it takes focus off the element whose
    // `:focus-visible` decides whether the crosshair is shown.
    map.getCanvas().setAttribute("tabindex", "-1");

    const syncZoom = () => setZoom(map.getZoom());
    // Every gesture, not only one that turns into a drag: the surface has to
    // take focus so the keys work straight after a pan, and a crosshair left
    // over from the keyboard has to go the moment a pointer takes over.
    const began = () => {
      setShowCrosshair(false);
      surfaceRef.current?.focus();
    };
    const pick = (event: { lngLat: LngLat }) =>
      emitRef.current(positionOf(event.lngLat));
    // Shown only after a one-finger drag has already failed to move the map -
    // never for a blocked wheel, which is the diver scrolling the dialog towards
    // Save and has nothing to be told.
    const blocked = (event: { gestureType: "wheel_zoom" | "touch_pan" }) => {
      if (event.gestureType !== "touch_pan") return;
      setShowTouchHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(
        () => setShowTouchHint(false),
        TOUCH_HINT_MS,
      );
    };

    map.on("zoom", syncZoom);
    map.on("mousedown", began);
    map.on("touchstart", began);
    map.on("click", pick);
    map.on("cooperativegestureprevented", blocked);
    return () => {
      map.off("zoom", syncZoom);
      map.off("mousedown", began);
      map.off("touchstart", began);
      map.off("click", pick);
      map.off("cooperativegestureprevented", blocked);
    };
  }, [map]);

  // The view a map with nothing placed opens on: the whole world, on the shared
  // centre every other map with nothing to draw opens on.
  useLayoutEffect(() => {
    if (!map) return;
    map.jumpTo({
      center: [WORLD_CENTER.longitude, WORLD_CENTER.latitude],
      zoom: MIN_ZOOM,
    });
  }, [map]);

  // ...and then wherever the position came from, which on the first commit is
  // the position the dialog opened with. Declared after the effect above so the
  // two run in that order in the one commit where both fire.
  useLayoutEffect(() => {
    if (!map || !recentre) return;
    map.jumpTo({
      center: [recentre.longitude, recentre.latitude],
      zoom: recentre.raise
        ? // A diver already deeper than this is not zoomed *out* by placing a
          // first pin.
          Math.max(map.getZoom(), PLACED_ZOOM)
        : map.getZoom(),
    });
  }, [map, recentre]);

  // The pin. A MapLibre marker rather than an absolutely positioned child, which
  // is what hands the renderer the job of drawing a site at 179E in the copy of
  // the world the view is actually showing after a pan across the antimeridian.
  useEffect(() => {
    if (!map || latitude === null || longitude === null) return;
    const element = document.createElement("div");
    // `bg-coral`, not `bg-primary`: primary is near-black in light and mid-grey
    // in dark, which is invisible against a dark basemap. Coral is the one
    // accent deliberately held constant across both themes, and a warm pin on a
    // desaturated basemap is what every map does anyway.
    element.className =
      "h-3 w-3 rounded-full border-2 border-background bg-coral shadow";
    // Decorative: the announcement below is this placement's channel to anyone
    // not looking at the screen.
    element.setAttribute("aria-hidden", "true");
    // How the tests find it, now that its placement is a transform MapLibre
    // writes rather than one this component does.
    element.dataset.marker = "pin";
    const marker = new Marker({ element })
      .setLngLat([longitude, latitude])
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, latitude, longitude]);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  /**
   * Where a zoom with no pointer behind it should be anchored, or `null` for the
   * centre.
   *
   * Zoom is always about a point that must not move: the cursor under a wheel,
   * the centroid of a pinch - both MapLibre's own - and, for the buttons and the
   * keyboard, the pin, or the crosshair when there is none.
   *
   * Only while the pin is on screen, though. Anchoring on one the diver has
   * panned away from does the opposite of what it is for: it holds the *old*
   * position still and throws whatever was under the crosshair - the place they
   * panned to in order to zoom in on it - twice as far out, doubling again on
   * every press.
   *
   * The longitude is folded to whichever copy of the repeating world sits
   * nearest the view before it is projected. `Map.project` does no such folding,
   * so a site at 179E under a view centred on 179W would otherwise project a
   * whole world away and read as off screen while plainly visible.
   */
  const anchorFor = (instance: MapLibreMap): [number, number] | null => {
    if (latitude === null || longitude === null) return null;
    const near =
      longitude +
      Math.round((instance.getCenter().lng - longitude) / 360) * 360;
    const pin = instance.project([near, latitude]);
    const { width, height } = frameOf(instance);
    const onScreen =
      pin.x >= 0 && pin.x <= width && pin.y >= 0 && pin.y <= height;
    return onScreen ? [near, latitude] : null;
  };

  // The buttons and the keyboard. `around` omitted rather than passed as the
  // centre: that is what MapLibre already does without one, and saying it twice
  // invites the two to disagree.
  const zoomBy = (delta: number) => {
    if (!map) return;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, map.getZoom() + delta));
    if (next === map.getZoom()) return;
    const anchor = anchorFor(map);
    map.easeTo({
      zoom: next,
      ...(anchor ? { around: anchor } : {}),
      duration: 0,
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // A modified key belongs to the browser, not to the map: ctrl/cmd with
    // `-`/`=` is page zoom, and alt with an arrow is back/forward. Claiming
    // those would trap someone who relies on browser zoom - and the map takes
    // focus on any pointerdown, so it is easy to land here without ever
    // intending to use the keyboard. Cooperative gestures split the wheel the
    // same way round, leaving the plain one to the dialog. Shift is deliberately
    // not in this list: `+` and `_` need it on most layouts.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!map) return;

    // The crosshair tracks how the map is being driven *now*, rather than being
    // snapshotted at focus. A pointer gesture focuses the surface itself, so
    // a value frozen at that moment is wrong both ways round: click then use
    // the arrow keys and there is no crosshair to place against, Tab in then
    // click and one lingers beside the pin the click just placed.
    const handled = () => setShowCrosshair(true);

    const pan: Record<string, [number, number]> = {
      ArrowUp: [0, -KEY_PAN_PX],
      ArrowDown: [0, KEY_PAN_PX],
      ArrowLeft: [-KEY_PAN_PX, 0],
      ArrowRight: [KEY_PAN_PX, 0],
    };
    if (pan[event.key]) {
      event.preventDefault();
      handled();
      map.panBy(pan[event.key], { duration: 0 });
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      handled();
      zoomBy(1);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      handled();
      zoomBy(-1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handled();
      // The centre, which is exactly what the crosshair marks.
      emit(positionOf(map.getCenter()));
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md border">
        <div
          ref={surfaceRef}
          // `role="application"` so a screen reader hands the arrow keys to the
          // map instead of spending them on its own reading cursor. Justified
          // by the keys below being the whole interaction - and safe because
          // the same position can always be typed into the fields beside it.
          // On this element rather than on MapLibre's container, which the
          // renderer owns and rebuilds: the crosshair and the hint are its
          // siblings, and the tests select through it for exactly that reason.
          role="application"
          aria-label="Map. Click to place the dive site."
          aria-describedby="map-picker-help"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          // `:focus-visible`, not plain focus. A pointer gesture focuses the
          // surface itself so the keys work straight after a drag, so a plain
          // `onFocus` leaves a crosshair sitting at the centre after every
          // mouse click - next to the pin the click just placed, answering a
          // question nobody with a mouse is asking.
          onFocus={(event) =>
            setShowCrosshair(event.currentTarget.matches(":focus-visible"))
          }
          onBlur={() => setShowCrosshair(false)}
          className="relative h-40 w-full select-none bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-48"
        >
          <MapCanvas
            basemap={basemap}
            theme={resolvedTheme === "dark" ? "dark" : "light"}
            interactive
            onMap={setMap}
            unsupported={
              <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
                This browser cannot display the map. The coordinates can still
                be typed into the fields above.
              </p>
            }
          />

          {showCrosshair && (
            // Only under keyboard focus: it marks where Enter would place
            // the site, which is not a question a diver reaching for the mouse
            // is asking.
            <div
              aria-hidden
              data-testid="crosshair"
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2"
            >
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-foreground/60" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-foreground/60" />
            </div>
          )}

          {showTouchHint && (
            // Shown only after a one-finger drag has already failed to move the
            // map, rather than standing over it permanently: it answers a
            // question the diver has just asked, and nobody on a mouse ever
            // asks it. `aria-hidden` because it describes a touch gesture to
            // people who did not use one - the help text below covers the rest.
            // MapLibre draws a screen of its own for the same event, with the
            // same sentence; `globals.css` hides it and `map-canvas.tsx` empties
            // its wording, because it flashes for a blocked wheel too.
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-sm font-medium"
            >
              Use two fingers to move the map
            </div>
          )}

          {/* Outside `MapCanvas` so the credit survives a browser with no
              WebGL2, where that component renders its fallback and nothing
              else. `target="_blank"` is not decoration either: this sits in a
              dialog holding a half-filled form, and navigating away in the same
              tab would throw it away.

              A gesture never starts here, and that is now structural rather than
              a guard: MapLibre's handlers are on its own canvas container, which
              this is a sibling of rather than a child. */}
          <div className="absolute bottom-0 right-0 z-10 bg-background/80 px-1 text-[10px] leading-4 text-muted-foreground">
            <Attribution value={basemap.attribution} />
          </div>
        </div>

        <div className="absolute left-2 top-2 z-10 flex flex-col gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            aria-label="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => zoomBy(1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            aria-label="Zoom out"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => zoomBy(-1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      <p id="map-picker-help" className="text-sm text-muted-foreground">
        Click to place the site, and drag to pan. Two fingers pan and pinch to
        zoom; <kbd>Ctrl</kbd>/<kbd>⌘</kbd> and the wheel zooms. With the map
        focused, arrow keys pan, <kbd>+</kbd>/<kbd>-</kbd> zoom and{" "}
        <kbd>Enter</kbd> places it at the crosshair.
      </p>
    </div>
  );
}

export default MapPicker;
