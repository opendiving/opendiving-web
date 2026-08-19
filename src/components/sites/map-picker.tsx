"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTheme } from "next-themes";
import { Minus, Plus } from "lucide-react";
import {
  clampCenter,
  LatLon,
  MAX_ZOOM,
  MIN_ZOOM,
  nearestWrappedX,
  Point,
  project,
  TILE_SIZE,
  tileSource,
  tileUrl,
  unproject,
  visibleTiles,
  WORLD_CENTER,
} from "@/lib/map-tiles";
import {
  GesturePoint,
  useMapGesture,
  useMultiTouchScrollLock,
  useWheelZoom,
} from "@/hooks/useMapGesture";
import { Button } from "@/components/ui/button";
import { Attribution } from "@/components/attribution";

// Close enough to street level to see a jetty, far enough out to see which bay
// it is in - where the map opens when the site already has a position. Deeper
// than the site page's own map fits to, which is deliberate: this one can be
// zoomed out by hand, and that one cannot. See DECISIONS.md.
const PLACED_ZOOM = 12;
// Where it opens when it does not: the whole world, on the shared centre every
// other map with nothing to draw opens on.
const DEFAULT_VIEW = { ...WORLD_CENTER, zoom: MIN_ZOOM };
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

interface MapView extends LatLon {
  zoom: number;
}

export interface MapPickerProps {
  // The site's current position, or null for a site that has none yet.
  latitude: number | null;
  longitude: number | null;
  // Called with the position the diver placed, in decimal degrees.
  onPick: (position: LatLon) => void;
}

/**
 * A raster-tile map for placing a dive site, hand-rolled on `lib/map-tiles.ts`.
 *
 * Loaded through `next/dynamic` by its only caller (`dive-site-map-field.tsx`),
 * so the tile grid, the projection maths and the gesture handling sit in their
 * own chunk, fetched when the dive site dialog opens rather than in the bundle
 * every page pays for. Tiles themselves load as soon as it mounts, which is why
 * `/privacy` says so.
 *
 * This is an enhancement, not the only way in: the latitude and longitude
 * inputs beside it accept the same position typed or pasted, which is what
 * keeps the feature usable without a pointer. The map is still operable from
 * the keyboard on its own terms (arrows pan, +/- zoom, Enter places at the
 * crosshair), because a control that only answers to a mouse is a dead end for
 * anyone who cannot use one.
 */
export function MapPicker({ latitude, longitude, onPick }: MapPickerProps) {
  const { resolvedTheme } = useTheme();
  const source = useMemo(() => tileSource(), []);
  const template = resolvedTheme === "dark" ? source.dark : source.light;

  const hasPosition = latitude !== null && longitude !== null;
  const [view, setView] = useState<MapView>(() =>
    hasPosition
      ? { latitude, longitude, zoom: PLACED_ZOOM }
      : { ...DEFAULT_VIEW },
  );
  // The view as of the last *change*, which is not the same as the view of the
  // last render. Wheel and pointer events arrive faster than React commits - a
  // 120 Hz trackpad against a 60 Hz render - and every one of them computes the
  // next view from the current one. Read from the render closure, a burst of
  // thirty pinch events all start from the same stale zoom and twenty-nine of
  // them are thrown away; measured at 0.04 levels where 1.2 were asked for.
  // The pan path was already immune, because it measures an absolute delta
  // against a snapshot taken at the start of the gesture rather than composing
  // one change onto the last.
  const viewRef = useRef(view);
  // `useLayoutEffect`, not `useEffect`. The render-phase follow below changes
  // the view without going through `applyView` - it cannot, since writing a ref
  // during render is exactly what `react-hooks/refs` forbids - so the ref is
  // caught up here instead. A passive effect is deferred to a later task, which
  // leaves a window in which a wheel event or a pointerdown would baseline
  // against the pre-change view and snap the map back; a layout effect runs
  // inside the same synchronous commit, where no event can be processed.
  useLayoutEffect(() => {
    viewRef.current = view;
  });
  // Everything driven by an event goes through here, so the ref is current for
  // the next event whether or not React has re-rendered in between.
  const applyView = (next: MapView) => {
    viewRef.current = next;
    setView(next);
  };

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const surfaceRef = useRef<HTMLDivElement | null>(null);

  // The tile grid is sized from the element rather than from a fixed width, so
  // it fills the dialog on a desktop and a phone alike without either guessing
  // or a media query that would then have to agree with the CSS.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

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
  // Adjusted during render rather than in an effect. React re-runs the render
  // before committing anything, so the map never paints at the old centre
  // first, where an effect would cost a visible frame at the wrong place and a
  // cascading re-render. Comparing against the *props*, rather than against the
  // view, is what leaves panning alone: a pan moves the view every frame and
  // must not be yanked back to the pin.
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

    if (!isEcho && latitude !== null && longitude !== null) {
      setView((current) => ({
        latitude,
        longitude,
        zoom: isFirstPosition
          ? Math.max(current.zoom, PLACED_ZOOM)
          : current.zoom,
      }));
    }
  }

  // Clamped so the viewport never overhangs a pole, where `visibleTiles`
  // rightly refuses to ask for tiles that do not exist and the overhang renders
  // as bare background. Applied here as well as in the movers below, because a
  // latitude typed into the field arrives without passing through either.
  const centerOf = (of: MapView) =>
    clampCenter(project(of, of.zoom), size.height, of.zoom);
  const center = centerOf(view);
  const origin = {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  };

  // Zoom is continuous, tiles are not: they exist only at whole levels. So the
  // grid is drawn at the nearest one and the whole layer is CSS-scaled to make
  // up the difference, which is what turns a pinch from a series of jumps into
  // a glide. Rounding rather than flooring keeps that scale within
  // [1/sqrt2, sqrt2], so a tile is never stretched by more than ~41% either
  // way; flooring would only ever magnify, up to 2x, and look softer for it.
  const tileZoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.round(view.zoom)),
  );
  const tileScale = 2 ** (view.zoom - tileZoom);

  // The grid is computed in the *tile* level's own pixel space - the centre and
  // the viewport both divided down by the scale the layer will be blown back up
  // by - so `visibleTiles` never has to know that zoom can be fractional.
  const tiles =
    size.width > 0 && size.height > 0
      ? visibleTiles(
          { x: center.x / tileScale, y: center.y / tileScale },
          size.width / tileScale,
          size.height / tileScale,
          tileZoom,
        )
      : [];

  // Where the marker sits on screen. `nearestWrappedX` is what keeps a site at
  // 179°E visible when the view has been panned across the antimeridian.
  const marker = hasPosition
    ? (() => {
        const point = project({ latitude, longitude }, view.zoom);
        return {
          left: nearestWrappedX(point.x, center.x, view.zoom) - origin.x,
          top: point.y - origin.y,
        };
      })()
    : null;

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

  // Turns an offset within the map surface into a position. Reads the view from
  // a ref-free closure on purpose: every caller below already runs in a render
  // where `center`/`origin` are current.
  const positionAt = useCallback(
    (offsetX: number, offsetY: number) =>
      unproject({ x: origin.x + offsetX, y: origin.y + offsetY }, view.zoom),
    [origin.x, origin.y, view.zoom],
  );

  // Every deliberate move of the view goes through here, so the clamp is
  // applied *before* the centre is stored. Clamping only at render would let a
  // drag keep pushing an invisible centre past the pole, and the way back would
  // then start with an equal amount of dead movement.
  const moveTo = (point: Point, zoom: number) =>
    applyView({
      ...unproject(clampCenter(point, size.height, zoom), zoom),
      zoom,
    });

  // From `center`, not from `project(view)`: a latitude typed into the field
  // arrives through neither mover and is stored unclamped, so near a pole the
  // two disagree and the first arrow-key press would be spent re-clamping to
  // where the map already is.
  const panBy = (dx: number, dy: number) => {
    const from = viewRef.current;
    const at = centerOf(from);
    moveTo({ x: at.x + dx, y: at.y + dy }, from.zoom);
  };

  // Zoom is always about a point that must not move: the cursor under a wheel,
  // the centroid of a pinch, and for the buttons and the keyboard - which have
  // no pointer - the pin, or the crosshair when there is no pin.
  //
  // Only while the pin is on screen, though. Anchoring on one the diver has
  // panned away from does the opposite of what it is for: it holds the *old*
  // position still and throws whatever was under the crosshair - the place they
  // panned to in order to zoom in on it - twice as far out, doubling again on
  // every press. Computed against the view being zoomed from rather than the
  // rendered one, so it stays right mid-gesture.
  const anchorFor = (of: MapView, ofCenter: Point, ofOrigin: Point) => {
    const centre = { x: size.width / 2, y: size.height / 2 };
    if (latitude === null || longitude === null) return centre;

    const point = project({ latitude, longitude }, of.zoom);
    const pin = {
      x: nearestWrappedX(point.x, ofCenter.x, of.zoom) - ofOrigin.x,
      y: point.y - ofOrigin.y,
    };
    const onScreen =
      pin.x >= 0 && pin.x <= size.width && pin.y >= 0 && pin.y <= size.height;
    return onScreen ? pin : centre;
  };

  // Pure: the view that zooming `from` by `delta` about `anchor` produces, or
  // null when it is already at a limit. Kept separate from applying it because
  // a pinch zooms the *gesture's baseline* rather than the live view - see
  // `onZoom` below - while a wheel composes onto the live one.
  const zoomView = (
    from: MapView,
    delta: number,
    anchor?: GesturePoint,
  ): MapView | null => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, from.zoom + delta));
    if (zoom === from.zoom) return null;

    const fromCenter = centerOf(from);
    const fromOrigin = {
      x: fromCenter.x - size.width / 2,
      y: fromCenter.y - size.height / 2,
    };
    // Without a pointer to anchor on - the buttons, the keyboard - hold the pin
    // if it is on screen, and the crosshair otherwise.
    const at = anchor ?? anchorFor(from, fromCenter, fromOrigin);
    // Whatever is under the anchor keeps its offset from the centre, which is
    // what "this point does not move" means once the scale has changed.
    const held = unproject(
      { x: fromOrigin.x + at.x, y: fromOrigin.y + at.y },
      from.zoom,
    );
    const after = project(held, zoom);
    const next = clampCenter(
      {
        x: after.x - (at.x - size.width / 2),
        y: after.y - (at.y - size.height / 2),
      },
      size.height,
      zoom,
    );
    return { ...unproject(next, zoom), zoom };
  };

  // The wheel, the buttons and the keyboard: compose onto the live view, since
  // each is a change on top of wherever the map has got to.
  const zoomAt = (delta: number, anchor?: GesturePoint) => {
    const next = zoomView(viewRef.current, delta, anchor);
    if (next) applyView(next);
  };

  // The view the current gesture is measured against, held whole rather than as
  // a centre so a pinch can zoom it. Movement is reported as an absolute delta
  // from here, which is what keeps a long drag free of accumulated rounding -
  // and what makes a two-finger gesture composable, since the zoom and the pan
  // it reports for the same event are both relative to this one view.
  const gestureStart = useRef<MapView>(view);
  const [showTouchHint, setShowTouchHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const gesture = useMapGesture(surfaceRef, {
    onStart: () => {
      // From the live view, not the rendered one - see `viewRef`. A ctrl+wheel
      // zoom followed straight away by a drag would otherwise baseline the drag
      // against the pre-zoom view and snap the map back a step.
      gestureStart.current = viewRef.current;
      setShowCrosshair(false);
      surfaceRef.current?.focus();
    },
    // The map follows the pointer, so the world moves *against* the drag.
    onPan: (dx, dy) => {
      const from = gestureStart.current;
      const at = centerOf(from);
      moveTo({ x: at.x - dx, y: at.y - dy }, from.zoom);
    },
    // Zooms the baseline rather than the live view, and the pan that follows in
    // the same event is then applied to the result. Composing onto the live
    // view instead would count the pan twice, since the live view already
    // carries the previous event's.
    //
    // A zoom refused at a limit leaves the baseline alone, so the pan still
    // lands against a view that matches the origin it was measured from.
    onZoom: (delta, anchor) => {
      const zoomed = zoomView(gestureStart.current, delta, anchor);
      if (!zoomed) return;
      gestureStart.current = zoomed;
      applyView(zoomed);
    },
    onTap: (point) => emit(positionAt(point.x, point.y)),
    onTouchDrag: () => {
      setShowTouchHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(
        () => setShowTouchHint(false),
        TOUCH_HINT_MS,
      );
    },
  });

  useMultiTouchScrollLock(surfaceRef);

  useWheelZoom(surfaceRef, (delta, anchor) => zoomAt(delta, anchor));

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // A modified key belongs to the browser, not to the map: ctrl/cmd with
    // `-`/`=` is page zoom, and alt with an arrow is back/forward. Claiming
    // those would trap someone who relies on browser zoom - and the map takes
    // focus on any pointerdown, so it is easy to land here without ever
    // intending to use the keyboard. `useWheelZoom` splits the wheel the same
    // way round, leaving the plain one to the dialog. Shift is deliberately not
    // in this list: `+` and `_` need it on most layouts.
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // The crosshair tracks how the map is being driven *now*, rather than being
    // snapshotted at focus. the gesture hook focuses the surface itself, so
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
      panBy(...pan[event.key]);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      handled();
      zoomAt(1);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      handled();
      zoomAt(-1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handled();
      emit(positionAt(size.width / 2, size.height / 2));
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
          role="application"
          aria-label="Map. Click to place the dive site."
          aria-describedby="map-picker-help"
          tabIndex={0}
          {...gesture}
          onKeyDown={handleKeyDown}
          // `:focus-visible`, not plain focus. `handlePointerDown` focuses the
          // surface itself so the keys work straight after a drag, so a plain
          // `onFocus` leaves a crosshair sitting at the centre after every
          // mouse click - next to the pin the click just placed, answering a
          // question nobody with a mouse is asking.
          onFocus={(event) =>
            setShowCrosshair(event.currentTarget.matches(":focus-visible"))
          }
          onBlur={() => setShowCrosshair(false)}
          // `touch-pan-y`, not `touch-none`. `touch-none` is what a map wants
          // - it is the only way a one-finger drag reaches the gesture handler
          // rather than scrolling - but this map lives inside a
          // `max-h-[90vh] overflow-y-auto` dialog and covers a large share of
          // it on a phone, so claiming the vertical axis leaves a thumb landing
          // on the map unable to reach Notes or Save at all. Scrolling past the
          // control wins over panning within it, so one finger is the page's
          // and two are the map's - see `useMapGesture`, and
          // `useMultiTouchScrollLock` for the half `touch-action` cannot
          // express.
          //
          // The wheel is split the same way and for the same reason: a plain
          // one is left to scroll the dialog, and only ctrl/cmd+wheel zooms
          // (`useWheelZoom`), which is also what a trackpad pinch sends.
          className="relative h-56 w-full cursor-grab touch-pan-y select-none bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing sm:h-64"
        >
          {/* The fractional part of the zoom, applied to the whole grid at
              once. `origin-top-left` is what makes the tiles' own offsets -
              which are in tile-level pixels - land where they belong once
              scaled, without each needing to know about it. */}
          <div
            data-testid="tile-layer"
            className="pointer-events-none absolute left-0 top-0 origin-top-left"
            style={{ transform: `scale(${tileScale})` }}
          >
            {tiles.map((tile) => (
              /* Plain `<img>`, not `next/image`: these are third-party tiles
                 addressed by z/x/y, so there is nothing for the optimizer to do
                 but proxy them. Positioned by transform rather than by top/left
                 so a pan is a composite, not a layout of every tile. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={tile.key}
                src={tileUrl(template, tile.x, tile.y, tile.zoom)}
                alt=""
                width={TILE_SIZE}
                height={TILE_SIZE}
                draggable={false}
                className="pointer-events-none absolute left-0 top-0 max-w-none"
                style={{
                  transform: `translate3d(${tile.left}px, ${tile.top}px, 0)`,
                }}
              />
            ))}
          </div>

          {showCrosshair && (
            // Only under keyboard focus: it marks where Enter would place
            // the site, which is not a question a diver reaching for the mouse
            // is asking.
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2"
            >
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-foreground/60" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-foreground/60" />
            </div>
          )}

          {marker && (
            <div
              aria-hidden
              // `left-0 top-0` rather than relying on the static position
              // happening to resolve to the container's origin - which holds
              // only while every preceding sibling is also out of flow.
              className="pointer-events-none absolute left-0 top-0"
              style={{
                transform: `translate3d(${marker.left}px, ${marker.top}px, 0)`,
              }}
            >
              {/* Pulled back by half its own size in both axes, so the dot is
                  centred on the coordinate rather than hanging below and to
                  the right of it.

                  `bg-coral`, not `bg-primary`: primary is near-black in light
                  and mid-grey in dark, which is invisible against Dark Matter's
                  near-black tiles. Coral is the one accent deliberately held
                  constant across both themes, and a warm pin on a desaturated
                  basemap is what every map does anyway. */}
              <div className="h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-coral shadow" />
            </div>
          )}

          {showTouchHint && (
            // Shown only after a one-finger drag has already failed to move the
            // map, rather than standing over it permanently: it answers a
            // question the diver has just asked, and nobody on a mouse ever
            // asks it. `aria-hidden` because it describes a touch gesture to
            // people who did not use one - the help text below covers the rest.
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-medium"
            >
              Use two fingers to move the map
            </div>
          )}

          {/* `pointer-events-auto` so the licence links can be clicked, which
              costs a drag that happens to start on this corner. Every map makes
              the same trade. `target="_blank"` is not decoration either: this
              sits in a dialog holding a half-filled form, and navigating away
              in the same tab would throw it away. */}
          <div className="pointer-events-auto absolute bottom-0 right-0 bg-background/80 px-1 text-[10px] leading-4 text-muted-foreground">
            <Attribution value={source.attribution} />
          </div>
        </div>

        <div className="absolute left-2 top-2 flex flex-col gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            aria-label="Zoom in"
            disabled={view.zoom >= MAX_ZOOM}
            onClick={() => zoomAt(1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            aria-label="Zoom out"
            disabled={view.zoom <= MIN_ZOOM}
            onClick={() => zoomAt(-1)}
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
