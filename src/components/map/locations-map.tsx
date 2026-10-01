"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Marker,
  MercatorCoordinate,
  type LngLatBoundsLike,
  type Map as MapLibreMap,
} from "maplibre-gl";

import {
  MAX_FIT_ZOOM,
  MIN_ZOOM,
  unionBounds,
  WORLD_CENTER,
  type LatLonBounds,
} from "@/lib/basemap";
import { useConfig } from "@/contexts/ConfigContext";
import { formatTripLocationNames } from "@/lib/trip-locations";
import { MapCredit } from "@/components/map/map-credit";
import { MapCanvas } from "@/components/map/map-canvas";
import {
  findSnapshot,
  rememberSnapshot,
  type MapSnapshot,
} from "@/components/map/map-snapshots";
import {
  bandIn,
  FIT_PADDING,
  placedLocations,
  SIDE_FADE_WIDTH,
  SNAPSHOT_HEIGHT,
  SNAPSHOT_WIDTH,
  type MappableLocation,
  type PlacedLocation,
} from "@/lib/map-picture";
import { cn } from "@/lib/utils";

const corners = (bounds: LatLonBounds): LngLatBoundsLike => [
  [bounds.west, bounds.south],
  [bounds.east, bounds.north],
];

// How far in from a picture's sides its pins are kept, in the picture's own
// pixels: clear of the frame's edge where the frame is narrower than the
// picture, and of the side fades where it has them. A frame wider than the
// picture fits its places into the picture rather than across the frame, since
// the picture is all of the map it will ever show.
const pictureSide = (frameWidth: number, sideFade: boolean | undefined) =>
  Math.max(
    (SNAPSHOT_WIDTH - frameWidth) / 2 + FIT_PADDING,
    sideFade ? SIDE_FADE_WIDTH : FIT_PADDING,
  );

// A backdrop's credit is inset this far from the frame's top-left corner, or
// from under the controls covering its top. Without one, the places fit under
// those controls alone.
const CREDIT_INSET = 4;
const creditBottom = (credit: HTMLElement | null, coveredTop: number) =>
  credit ? CREDIT_INSET + coveredTop + credit.offsetHeight : coveredTop;

// `bg-coral`, not `bg-primary`: primary is near-black in light and mid-grey in
// dark, which is invisible against a dark basemap. Coral is the one accent held
// constant across both themes.
//
// A fix inverts the same two colours rather than changing size or hue: same
// coral, same 12px, so the pair reads as one legend where a second colour would
// read as a second meaning. The tinted rather than transparent centre is what
// keeps the ring a ring over a busy coastline in either theme.
//
// The map renderer draws the same two into a card's picture
// (`map-renderer/pins.ts`), so a change here is a change there.
const markerClassName = (variant: "pin" | "fix") =>
  cn(
    "h-3 w-3 rounded-full border-2 shadow",
    variant === "fix"
      ? "border-coral bg-background/80"
      : "border-background bg-coral",
  );

export interface LocationsMapProps {
  locations: MappableLocation[];
  /**
   * What the map is of, for the label a screen reader reads when the places
   * turn out to have no usable names between them. Never seen otherwise - the
   * names themselves are the label whenever there are any.
   *
   * Required despite having an obvious default, because the path that reads it
   * has no visual tell: a caller who left it off would get a plausible but
   * wrong label that no screenshot and no test of theirs would catch.
   */
  subject: string;
  /**
   * Draw the frame even when nothing given has a position, showing the whole
   * world - the same view `MapPicker` opens on for a site with no pin yet.
   *
   * For a form that shows this map beside the field that fills it, where a
   * frame appearing only once the first place is picked shoves everything below
   * it down the dialog mid-edit, and for a trip card, whose map is the card's
   * backdrop and whose list would otherwise mix two layouts. Off by default,
   * because elsewhere the map answers "where is this?", and an empty world is a
   * worse answer than no map at all.
   */
  showWhenEmpty?: boolean;
  /**
   * Classes for the frame, merged over its own - for a caller that sets the map
   * into its own edges rather than as a bordered box inside them. The height
   * only where the caller also sizes the space the lazy wrapper's placeholder
   * is drawn in, which is `h-40 sm:h-48`.
   */
  className?: string;
  /**
   * Draw the map as the backdrop of whatever the caller lays over it: solid at
   * its top edge, fading into `--backdrop-fade` at its bottom - the card's
   * colour unless the caller sets another, as a card does for its hover. The
   * credit moves to the top-left, where the map it credits can be seen.
   */
  backdrop?: boolean;
  /**
   * How many pixels along the bottom the caller covers with content of its
   * own. The places are fitted into what is left above it, so a lone one sits
   * midway between the top edge and that content.
   */
  coveredBottom?: number;
  /**
   * How many pixels along the top the caller covers with controls of its own.
   * A backdrop's credit goes under them, and the places under the credit.
   */
  coveredTop?: number;
  /**
   * The caller draws the basemap's credit itself (`MapCredit`), on what it
   * lays over the map, so the map draws none.
   */
  creditElsewhere?: boolean;
  /**
   * Show a picture of the map rather than the map - for a list of maps. The
   * live map is drawn once, unseen, at `SNAPSHOT_WIDTH` by `SNAPSHOT_HEIGHT`,
   * pictured and let go; the frame then shows the part of the picture that
   * centres the places where the fit would have. A browser holds only so many
   * live WebGL maps per page, so a list has to let its off-screen ones go, and
   * without a picture each one would be drawn again from nothing on its way
   * back on screen, as it would on every resize. A picture is enough because
   * this map is never interacted with.
   */
  snapshot?: boolean;
  /**
   * Dissolve the picture's left and right edges into `--backdrop-fade` as well,
   * over `SIDE_FADE_WIDTH` of it each side, with the pins kept out of the fades.
   * For a `backdrop` `snapshot` in a frame that may be wider than the picture -
   * a page-wide hero - where the picture's edge would otherwise stand on the
   * page as a hard line. A frame narrower than the picture shows none of the
   * fade, since it lies past the frame's edges. Off by default: a card's frame
   * just under `lg` is nearly as wide as the picture and would show it.
   */
  sideFade?: boolean;
}

/**
 * Where a trip went, or where a dive site is: places drawn once and not touched
 * again.
 *
 * Deliberately not `MapPicker`: nearly all of that component's size is the
 * write-back problem - telling a position it emitted apart from one the diver
 * typed - and gesture handling for placing a pin. This map emits nothing, so
 * none of that exists here by construction, and it is built `interactive: false`
 * to say so to the renderer as well.
 */
export function LocationsMap({
  locations,
  subject,
  showWhenEmpty,
  className,
  backdrop,
  coveredBottom = 0,
  coveredTop = 0,
  creditElsewhere,
  snapshot,
  sideFade,
}: LocationsMapProps) {
  const { resolvedTheme } = useTheme();
  // From the instance's runtime configuration, so a published image can be
  // pointed at another basemap without a rebuild (`lib/runtime-config.ts`).
  const { basemap } = useConfig();

  const [map, setMap] = useState<MapLibreMap | null>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<{ marker: Marker; location: PlacedLocation }[]>([]);

  // What the places actually are, held stable across renders that did not change
  // them. Every effect below either moves the camera or rebuilds the markers, and
  // most callers hand this component a freshly built array on each of their own
  // renders - so depending on that array's identity would refit the map every
  // time the page around it re-rendered, which is a visible jump rather than a
  // wasted cycle.
  //
  // The dependency is the serialized *values* rather than the array, and the
  // round trip through JSON is what makes that honest: the memo really does
  // depend on nothing but `signature`, so there is no rule to suppress here.
  const signature = JSON.stringify(
    locations.map((location) => ({
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      variant: location.variant,
      bbox_south: location.bbox_south,
      bbox_north: location.bbox_north,
      bbox_west: location.bbox_west,
      bbox_east: location.bbox_east,
    })),
  );
  const placed = useMemo(
    () => placedLocations(JSON.parse(signature) as MappableLocation[]),
    [signature],
  );

  // A picture's frame, and the credit over a backdrop's top edge: what decides
  // where in the frame the places have to land.
  const [frame, setFrame] = useState<{
    width: number;
    height: number;
    creditBottom: number;
  } | null>(null);
  const frameRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !snapshot) return;
      const measure = () => {
        const credit = creditRef.current;
        const next = {
          width: element.clientWidth,
          height: element.clientHeight,
          creditBottom: creditBottom(credit, coveredTop),
        };
        setFrame((current) =>
          current &&
          current.width === next.width &&
          current.height === next.height &&
          current.creditBottom === next.creditBottom
            ? current
            : next,
        );
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [snapshot, coveredTop],
  );

  const band = useMemo(
    () =>
      frame &&
      bandIn(frame.height, backdrop ? frame.creditBottom : 0, coveredBottom),
    [frame, backdrop, coveredBottom],
  );
  const side = frame ? pictureSide(frame.width, sideFade) : FIT_PADDING;
  // The frame a picture is drawn for, which is what a resize has to change
  // before one that does not fit is drawn again - a trip too wide for a narrow
  // frame at any zoom would otherwise be drawn forever.
  const frameSignature =
    frame && band && JSON.stringify([frame.width, frame.height, band, side]);
  // The picture's top-left in the frame: its middle, where the pins are
  // centred, on the middle of the band.
  const pictureAt = frame &&
    band && {
      left: frame.width / 2 - SNAPSHOT_WIDTH / 2,
      top: (band.top + frame.height - band.bottom) / 2 - SNAPSHOT_HEIGHT / 2,
    };
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const snapshotKey = snapshot
    ? JSON.stringify([signature, theme, window.devicePixelRatio, backdrop])
    : null;
  const [fresh, setFresh] = useState<string | null>(null);
  const picture = snapshotKey ? findSnapshot(snapshotKey) : undefined;
  // Whether this frame can show the picture as drawn: every pin inside the
  // band, and in from the picture's sides as far as this frame keeps them. A
  // resize that breaks it is the one resize that draws the map again.
  const fits = (candidate: MapSnapshot) =>
    !!frame &&
    !!band &&
    !!pictureAt &&
    candidate.pins.every(({ x, y }) => {
      const top = pictureAt.top + y;
      return (
        x >= side - 1 &&
        x <= SNAPSHOT_WIDTH - side + 1 &&
        top >= band.top - 1 &&
        top <= frame.height - band.bottom + 1
      );
    });
  const needsDrawing =
    !!snapshot &&
    !!frameSignature &&
    (!picture || (!fits(picture) && picture.drawnFor !== frameSignature));
  // What is on screen while a new picture is drawn: the last one this frame
  // showed, so a theme switch or a pin-breaking resize swaps pictures rather
  // than blanking the map for the moment the new one takes.
  const [held, setHeld] = useState<MapSnapshot | null>(null);
  if (picture && picture !== held) setHeld(picture);
  const shown = picture ?? held;

  // The fit. `unionBounds` is what keeps a trip to Fiji and Samoa six degrees
  // wide rather than 354 - MapLibre's own `LngLatBounds.extend()` unions raw
  // longitudes with `Math.min`/`Math.max`, and its repair of a finished box
  // cannot undo a union built the long way round. The camera arithmetic from
  // there is MapLibre's, including the `maxZoom` cap that opens a lone place
  // where the surrounding coast is recognisable rather than at street level.
  useEffect(() => {
    if (!map) return;
    const bounds = unionBounds(placed.map((location) => location.bounds));

    const fit = () => {
      if (!bounds) {
        // Nothing placed, which only happens under `showWhenEmpty`: the whole
        // world, centred a little north of the equator because that is where
        // the land - and most of the world's diving - is.
        map.jumpTo({
          center: [WORLD_CENTER.longitude, WORLD_CENTER.latitude],
          zoom: MIN_ZOOM,
        });
        return;
      }
      // Measured, since the credit is whatever the basemap says and wraps
      // where it is long. A picture is fitted for the frame it will be shown
      // in, a live map for the frame it is.
      const container = map.getContainer();
      const credit = backdrop ? creditRef.current : null;
      const shownIn = snapshot
        ? frame
        : {
            width: container.clientWidth,
            height: container.clientHeight,
            creditBottom: creditBottom(credit, coveredTop),
          };
      if (!shownIn) return;
      const shownBand = bandIn(
        shownIn.height,
        backdrop ? shownIn.creditBottom : 0,
        coveredBottom,
      );

      if (!backdrop && !snapshot) {
        map.fitBounds(corners(bounds), {
          padding: { ...shownBand, left: FIT_PADDING, right: FIT_PADDING },
          maxZoom: MAX_FIT_ZOOM,
          // This map is drawn once and not touched again; an animation on
          // first paint is a map that arrives already moving.
          animate: false,
        });
        return;
      }

      // A backdrop is map under the whole card, so the places are sized
      // against the whole frame - fitted into the band alone, a town's outline
      // opens at a zoom its own label does not appear at - and only their pins
      // are kept to the band, and centred in it. The pins rather than the
      // outlines, because a region's pin is rarely the middle of its outline
      // and the pin is what a reader looks at.
      //
      // One arithmetic for a live map and a picture, with the frame placed in
      // the map's own box: the whole of it for a live map, and for a picture
      // the part `pictureAt` shows, which has the band's middle at the box's.
      // Across, a picture's places are kept in from its own sides rather than
      // the frame's, which may lie beyond them.
      const bandMiddle =
        (shownBand.top + shownIn.height - shownBand.bottom) / 2;
      const sides = snapshot
        ? pictureSide(shownIn.width, sideFade)
        : FIT_PADDING;
      const top = snapshot ? container.clientHeight / 2 - bandMiddle : 0;
      const below = container.clientHeight - top - shownIn.height;

      // The pins' own extent, and their middle as the screen has it, which in
      // latitude is not the average of two degrees.
      const pins = unionBounds(
        placed.map(({ latitude, longitude }) => ({
          south: latitude,
          north: latitude,
          west: longitude,
          east: longitude,
        })),
      )!;
      const southWest = MercatorCoordinate.fromLngLat([pins.west, pins.south]);
      const northEast = MercatorCoordinate.fromLngLat([pins.east, pins.north]);
      const zoom = Math.min(
        map.cameraForBounds(corners(bounds), {
          padding: {
            left: sides,
            right: sides,
            top: top + FIT_PADDING,
            bottom: below + FIT_PADDING,
          },
          maxZoom: MAX_FIT_ZOOM,
        })?.zoom ?? MAX_FIT_ZOOM,
        map.cameraForBounds(corners(pins), {
          padding: {
            left: sides,
            right: sides,
            top: top + shownBand.top,
            bottom: below + shownBand.bottom,
          },
          maxZoom: MAX_FIT_ZOOM,
        })?.zoom ?? MAX_FIT_ZOOM,
      );
      map.easeTo({
        center: new MercatorCoordinate(
          (southWest.x + northEast.x) / 2,
          (southWest.y + northEast.y) / 2,
        ).toLngLat(),
        zoom,
        // From the box's middle to the band's.
        offset: [0, top + bandMiddle - container.clientHeight / 2],
        animate: false,
      });
    };

    fit();

    // **And again whenever the frame changes size**, which is not something
    // MapLibre does for us. Its `trackResize` calls `Map.resize()`, and that
    // recomputes the projection for the new box while keeping centre and zoom
    // exactly where they were - so a frame that *narrows* after the first fit,
    // on a rotation to portrait or a `sm:` breakpoint or a dialog re-laying
    // out, keeps a camera fitted to the wider one and pushes the outermost pins
    // outside it. Refitting is what the hand-rolled version did implicitly, by
    // recomputing from a measured size on every render; this is the same
    // behaviour hung on the event MapLibre does emit.
    map.on("resize", fit);
    return () => {
      map.off("resize", fit);
    };
    // A picture's frame and band rather than the live map's own size, which
    // never changes while it draws one.
  }, [
    map,
    placed,
    coveredBottom,
    coveredTop,
    backdrop,
    snapshot,
    sideFade,
    frame,
  ]);

  // Markers are MapLibre's rather than absolutely positioned children, which is
  // what hands it the job of drawing a place at 178E in the copy of the world
  // the view is actually showing when it has been fitted across the antimeridian
  // to reach one at 172W.
  useEffect(() => {
    if (!map) return;
    const markers = placed.map((location) => {
      const element = document.createElement("div");
      element.className = markerClassName(location.variant);
      // Which marker is which, on hover. Two same-shaped rings a few hundred
      // metres apart are one blob at this zoom, so "Entry" or "Exit" is worth an
      // attribute even though the names are also in the surface's own
      // aria-label.
      if (location.name.trim()) element.title = location.name;
      // How the tests count and tell them apart, now that the placement is a
      // transform MapLibre writes rather than one this component does.
      element.dataset.marker = location.variant;
      const marker = new Marker({ element })
        .setLngLat([location.longitude, location.latitude])
        .addTo(map);
      return { marker, location };
    });
    markersRef.current = markers;
    return () => {
      markers.forEach(({ marker }) => marker.remove());
      markersRef.current = [];
    };
  }, [map, placed]);

  // Taken in `idle`, which MapLibre fires in the same task as the frame it
  // follows: the canvas is built without `preserveDrawingBuffer`, so this is
  // the one moment its pixels can still be read. The pins are read off the
  // live markers rather than projected again, which keeps a trip across the
  // antimeridian on the copy of the world MapLibre chose to show. WebP, since
  // a picture this size as a PNG runs to megabytes and a list keeps dozens.
  useEffect(() => {
    if (!map || !snapshotKey || !frameSignature || !needsDrawing) return;
    const capture = () => {
      const box = map.getContainer().getBoundingClientRect();
      const pins = markersRef.current.map(({ marker, location }) => {
        const pin = marker.getElement().getBoundingClientRect();
        return {
          x: pin.left + pin.width / 2 - box.left,
          y: pin.top + pin.height / 2 - box.top,
          variant: location.variant,
          name: location.name,
        };
      });
      map.getCanvas().toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          rememberSnapshot(snapshotKey, {
            url,
            drawnFor: frameSignature,
            pins,
          });
          setFresh(url);
        },
        "image/webp",
        0.9,
      );
    };
    map.once("idle", capture);
    return () => {
      map.off("idle", capture);
    };
  }, [map, snapshotKey, frameSignature, needsDrawing]);

  // Nothing with a position is nothing to draw, and an empty grey box is worse
  // than no map at all - unless the caller asked for one anyway. Callers may
  // still gate on the same thing to avoid the dynamic import; this is so they
  // do not have to.
  if (placed.length === 0 && !showWhenEmpty) return null;

  // Every location has a name, but nothing stops one being blank, and "Map of
  // " reads as a bug to anyone hearing it - hence the caller's `subject` as the
  // fallback. `formatTripLocationNames` is the same joining rule the trip's own
  // header uses, and it drops the blanks.
  //
  // Uncapped, unlike every surface that is looked at: a cap withholds names
  // from a reader who cannot see the pins, which is the one reader this label
  // exists for. The separator is shared with those surfaces, because it is
  // about telling one place from the next and withholds nothing.
  const names = formatTripLocationNames(placed);
  // The empty frame says what it is rather than borrowing the label of the
  // places it doesn't have: "Map of the trip's locations" over a blank world is
  // wrong in exactly the place nobody looking at the screen can see it.
  const label =
    placed.length > 0
      ? `Map of ${names ?? subject}`
      : `Map of the world, awaiting ${subject}`;

  const unsupported = (
    <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
      This browser cannot display the map.
    </p>
  );

  return (
    <div
      ref={frameRef}
      className={cn(
        "relative h-40 w-full overflow-hidden rounded-md border sm:h-48",
        backdrop ? "bg-transparent" : "bg-muted",
        className,
      )}
    >
      {/* The label sits on the map rather than on the frame around it, so the
          attribution's links stay outside the image and reachable: a link
          inside `role="img"` is dropped from the accessibility tree, and a
          licence credit nobody can follow is not much of a credit. */}
      {/* `rounded-[inherit]` hands the frame's corners down to `MapCanvas`,
          which is what clips the map to them. */}
      <div
        role="img"
        aria-label={label}
        className="absolute inset-0 rounded-[inherit]"
      >
        {snapshot ? (
          // Nothing until the frame has been measured, which is one
          // synchronous re-render: the picture's place in it depends on that.
          pictureAt && (
            <div
              className="absolute"
              style={{
                left: pictureAt.left,
                top: pictureAt.top,
                width: SNAPSHOT_WIDTH,
                height: SNAPSHOT_HEIGHT,
              }}
            >
              {shown && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a
                      blob URL of this page's own drawing, which `next/image`
                      has nothing to optimise. */}
                  <img
                    src={shown.url}
                    alt=""
                    draggable={false}
                    className={cn(
                      "absolute inset-0 h-full w-full",
                      // Faded in the first time only; a picture coming back
                      // from the cache is simply there.
                      shown.url === fresh &&
                        "animate-in fade-in duration-300 motion-reduce:animate-none",
                    )}
                  />
                  {/* The sides' fade, over the picture and anchored to it
                      rather than to the frame, so a frame narrower than the
                      picture shows the map crisp to its edges. A gradient laid
                      over the picture, never a mask, for the reason the foot's
                      gives below. */}
                  {sideFade && (
                    <div
                      aria-hidden
                      data-backdrop-side-fade
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background: `linear-gradient(to right, var(--backdrop-fade, hsl(var(--card))), transparent ${SIDE_FADE_WIDTH}px, transparent ${SNAPSHOT_WIDTH - SIDE_FADE_WIDTH}px, var(--backdrop-fade, hsl(var(--card))))`,
                      }}
                    />
                  )}
                  {shown.pins.map((pin, index) => (
                    <div
                      key={index}
                      data-marker={pin.variant}
                      title={pin.name.trim() || undefined}
                      className={cn(
                        markerClassName(pin.variant),
                        "absolute -translate-x-1/2 -translate-y-1/2",
                      )}
                      style={{ left: pin.x, top: pin.y }}
                    />
                  ))}
                </>
              )}
              {/* Drawn unseen: it is only ever here to be pictured. The
                  unsupported message is its own element, so it still shows. */}
              {needsDrawing && (
                <MapCanvas
                  basemap={basemap}
                  theme={theme}
                  className="opacity-0"
                  onMap={setMap}
                  unsupported={unsupported}
                />
              )}
            </div>
          )
        ) : (
          <MapCanvas
            basemap={basemap}
            theme={theme}
            onMap={setMap}
            unsupported={unsupported}
          />
        )}
      </div>

      {/* A backdrop's fade, laid over the map rather than masking it: a
          gradient mask over the WebGL canvas - or a dithered image in its place
          - draws in visible light and dark strips in Chrome and Firefox alike,
          where a plain gradient on top of it is smooth. Fading into a colour
          rather than into transparency is the price, which is why the colour
          is the caller's to change. */}
      {backdrop && (
        <div
          aria-hidden
          data-backdrop-fade
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--backdrop-fade, hsl(var(--card))))",
          }}
        />
      )}

      {/* A licence condition of the basemap, so it is rendered over it.
          `target="_blank"` is not decoration: this map appears inside dialogs
          holding a half-filled form, and navigating away in the same tab would
          throw it away. */}
      {!creditElsewhere && (
        <MapCredit
          ref={creditRef}
          className={cn(
            "absolute z-10",
            // Inset from a backdrop's corner, which is rounded and would clip
            // it, and quieter, as it sits over the part of the map that shows.
            backdrop ? "rounded-sm opacity-75" : "bottom-0 right-0",
          )}
          style={
            backdrop
              ? { left: CREDIT_INSET, top: CREDIT_INSET + coveredTop }
              : undefined
          }
        />
      )}
    </div>
  );
}

export default LocationsMap;
