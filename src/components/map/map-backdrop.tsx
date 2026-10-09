"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";

import { MapCredit } from "@/components/map/map-credit";
import { mapLabel } from "@/components/map/map-label";
import { markerClassName } from "@/components/map/marker";
import { findTile, requestTile } from "@/components/map/tile-requests";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import {
  mapTilesAPI,
  mapTileUrl,
  type MapTileTheme,
} from "@/lib/api/map-tiles";
import {
  frameCamera,
  projectFrom,
  tileLayout,
  worldCamera,
} from "@/lib/map-camera";
import {
  bandIn,
  mapCanvas,
  placedLocations,
  SIDE_FADE_WIDTH,
  type MappableLocation,
  type PlacedLocation,
} from "@/lib/map-frame";
import { TILE_SIZE } from "@/lib/map-grid";
import { cn } from "@/lib/utils";

/**
 * Whether this instance draws map tiles, as `GET /config` says - or `undefined`
 * while that is not known, which is also what a config that could not be read
 * leaves it.
 */
export function useMapTiles(): boolean | undefined {
  const { config } = useInstanceConfig();
  return config ? config.map_tiles === true : undefined;
}

// What a frame shows, everything placed in CSS pixels from the point where the
// frame shows the camera's centre - so a set held through a resize moves with
// that point, its pins with it.
interface TileSet {
  key: string;
  tiles: { url: string; left: number; top: number }[];
  pins: { left: number; top: number; variant: "pin" | "fix"; name: string }[];
}

interface Shown extends TileSet {
  srcs: string[];
  // Only when it arrived from the network over water, never when the page
  // already held it or it takes over from another set.
  fade: boolean;
}

interface Measured {
  width: number;
  height: number;
  creditBottom: number;
}

// Where a frame's map goes: the band its pins are kept to, the point where it
// shows the camera's centre - across, the frame's middle; down, the band's; on
// whole pixels, so the tiles meet without a seam - and the canvas it is drawn
// across.
function frameGeometry(
  frame: Measured,
  coveredTop: number,
  coveredBottom: number,
  hero: boolean,
) {
  const band = bandIn(
    frame.height,
    Math.max(frame.creditBottom, coveredTop),
    coveredBottom,
  );
  const canvas = mapCanvas(frame.width, hero);
  return {
    band,
    anchor: {
      x: Math.round(frame.width / 2),
      y: Math.round((band.top + frame.height - band.bottom) / 2),
    },
    canvas: { ...canvas, left: Math.floor(canvas.left) },
  };
}

// The static picture of the whole world `world` draws, per theme: the grid's
// one square at zoom 0, which `scripts/generate-world-map.mjs` renders from the
// shipped styles without their lettering or borders.
const WORLD_MAP: Record<MapTileTheme, { src: string; pinRing?: string }> = {
  light: { src: "/world-map/light.webp" },
  // Its land's commonest colour rings the pins, where the page's colour stands
  // in for the land everywhere else: at zoom 0 the dark style lays its relief
  // over the land at 0.6 opacity, which lifts it well off the dark tiles' land,
  // and the page's near-black drew every pin on it in a hard outline.
  dark: { src: "/world-map/dark.webp", pinRing: "rgb(81 85 86)" },
};

// The tiles and pins `placed` shows in `frame`, fitted for it and floored - or,
// for `world`, the world picture at its own size (`worldCamera`).
function tileSetFor(
  placed: readonly PlacedLocation[],
  frame: Measured,
  theme: MapTileTheme,
  { band, anchor, canvas }: ReturnType<typeof frameGeometry>,
  world: boolean,
): TileSet {
  const fit = {
    width: frame.width,
    height: frame.height,
    band,
    inset: canvas.inset,
  };
  const camera = world ? worldCamera(placed, fit) : frameCamera(placed, fit);
  const layout = tileLayout(camera, {
    left: Math.max(0, canvas.left) - anchor.x,
    right: Math.min(frame.width, canvas.left + canvas.width) - anchor.x,
    top: -anchor.y,
    bottom: frame.height - anchor.y,
  });
  const tiles = layout.tiles.map(({ z, x, y, left, top }) => ({
    url: world ? WORLD_MAP[theme].src : mapTileUrl(theme, z, x, y),
    left,
    top,
  }));
  const pins = placed.map((location) => ({
    ...projectFrom(layout, location),
    variant: location.variant,
    name: location.name,
  }));
  return { key: JSON.stringify([tiles, pins]), tiles, pins };
}

// The set a frame shows: `want` once every tile of it is on the page, and the
// last complete one until then - so a theme switch, or a resize that needs
// other tiles, swaps one set for the next rather than passing through water.
// `null` is water: nothing complete yet, or a tile that could not be had. A
// failed set is asked again only when the frame mounts again, never on a
// timer: what made it fail is a renderer that is down or busy, and asking on a
// schedule would add to it from every map on every open page.
function useTileSet(want: TileSet | null, mayAsk: boolean): Shown | null {
  const [arrived, setArrived] = useState({ key: "", count: 0 });
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState<Shown | null>(null);

  const key = want?.key ?? null;
  const hasFailed = key !== null && failed.has(key);
  // One request per tile, however many times the set shows it - the world at
  // zoom 0 across a wide frame is one tile, three times.
  const wanted = want
    ? [...new Set(want.tiles.map(({ url }) => url))].join("\n")
    : "";

  useEffect(() => {
    if (key === null || !mayAsk || hasFailed) return;
    const missing = wanted.split("\n").filter((url) => url && !findTile(url));
    // Withdrawn on unmount, and when the set changes under it: a request held
    // open for a draw nobody will see is a connection the page needs. A set
    // with one tile gone is water, so the rest of it is let go too.
    const withdrawals = missing.map((url) =>
      requestTile(
        url,
        (signal) => mapTilesAPI.getMapTile(url, signal),
        (src) =>
          src === null
            ? setFailed((previous) => new Set(previous).add(key))
            : setArrived((previous) => ({ key, count: previous.count + 1 })),
      ),
    );
    return () => withdrawals.forEach((withdraw) => withdraw());
  }, [key, wanted, mayAsk, hasFailed]);

  if (hasFailed) {
    if (shown !== null) setShown(null);
    return null;
  }
  const srcs = want?.tiles.map(({ url }) => findTile(url));
  if (want && srcs!.every((src) => src !== undefined) && shown?.key !== key) {
    setShown({
      ...want,
      srcs: srcs as string[],
      fade: shown === null && arrived.key === key,
    });
  }
  return shown;
}

export interface MapBackdropProps {
  locations: readonly MappableLocation[];
  // What the map is of, for a screen reader when its places have no usable
  // names between them (`mapLabel`).
  subject: string;
  // Draw a record with no place too, as the whole world - a trip's map.
  showWhenEmpty?: boolean;
  // How many pixels of the frame's foot the caller covers - a card's details,
  // and a dive's depth outline over them - and of its top, a hero's top row.
  coveredBottom: number;
  coveredTop?: number;
  // Laid out as a detail page's hero: a canvas `HERO_CANVAS_WIDTH` wide centred
  // in the frame, its sides dissolving into the page, and the basemap's credit
  // left to the hero, which carries it on its details.
  hero?: boolean;
  // What shows with no map: the map's water, faded as a map is.
  water: ReactNode;
  // Draw the static picture of the whole world this app ships rather than this
  // instance's tiles - so on any instance, renderer or none - for a map of
  // every place a diver went, which reads as a world map does: unlettered and
  // unbordered, placed by `worldCamera`. It owes the shipped styles' credit,
  // not the instance's (`DEFAULT_BASEMAP_ATTRIBUTION`).
  world?: boolean;
}

/**
 * A card's or a page head's map: the tiles of this instance's map that cover
 * its frame, fitted for that frame - the places' extents over the frame and the
 * pins inside the band between the credit and what covers the frame's foot,
 * the zoom floored to the tiles' - with the pins drawn over them and the
 * caller's fade laid on top.
 *
 * Nothing is asked for while this instance draws no tiles, or before it has
 * said whether it does; a frame whose tiles the page already holds shows them
 * at once either way.
 */
export function MapBackdrop({
  locations,
  subject,
  showWhenEmpty,
  coveredBottom,
  coveredTop = 0,
  hero = false,
  water,
  world = false,
}: MapBackdropProps) {
  const tiles = useMapTiles();
  const drawsTiles = world || tiles !== false;
  // Nothing is asked for until the theme is known, which on the client is from
  // the first render: a light tile asked for on a dark page is a draw the diver
  // never sees.
  const { resolvedTheme } = useTheme();
  const theme: MapTileTheme | null = resolvedTheme
    ? resolvedTheme === "dark"
      ? "dark"
      : "light"
    : null;

  // Held stable by value: callers build the array afresh on every render.
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
  const drawn = placed.length > 0 || !!showWhenEmpty;

  // The frame, and the credit over its top edge, which wraps where the
  // basemap's is long: what decides where the band is.
  const creditRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Measured | null>(null);
  const frameRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const measure = () => {
      const credit = creditRef.current;
      const next = {
        width: element.clientWidth,
        height: element.clientHeight,
        creditBottom: credit ? credit.offsetTop + credit.offsetHeight : 0,
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
    if (creditRef.current) observer.observe(creditRef.current);
    return () => observer.disconnect();
  }, []);

  const geometry =
    frame && frameGeometry(frame, coveredTop, coveredBottom, hero);
  const want = useMemo(
    () =>
      // A frame with no size yet - not laid out, or hidden - has no tiles to
      // ask for, and is not a frame showing nothing.
      drawn && drawsTiles && theme && frame?.width && frame.height
        ? tileSetFor(
            placed,
            frame,
            theme,
            frameGeometry(frame, coveredTop, coveredBottom, hero),
            world,
          )
        : null,
    [
      drawn,
      drawsTiles,
      theme,
      placed,
      frame,
      coveredTop,
      coveredBottom,
      hero,
      world,
    ],
  );
  const fetched = useTileSet(world ? null : want, tiles === true);
  // The world picture is a file of this app's, which an `<img>` loads itself.
  const shown: Shown | null =
    world && want
      ? { ...want, srcs: want.tiles.map(({ url }) => url), fade: false }
      : fetched;

  if (!drawn || !drawsTiles) return water;

  return (
    <div
      ref={frameRef}
      className="absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      {/* Water until the map is whole, and under it while it fades in - fading
          out as it does, since a hero's canvas leaves the page's own colour at
          its sides. */}
      {(!shown || shown.fade) && (
        <div
          className={cn(
            "absolute inset-0 rounded-[inherit]",
            shown &&
              "animate-out fade-out fill-mode-forwards duration-300 motion-reduce:hidden",
          )}
        >
          {water}
        </div>
      )}
      {shown && geometry && (
        // The label sits on the map rather than on the frame, so the credit's
        // links stay outside the image and reachable: a link inside
        // `role="img"` is dropped from the accessibility tree.
        <div
          role="img"
          aria-label={mapLabel(placed, subject)}
          data-map-canvas
          className={cn(
            // The water past the world's top or bottom edge, where there is no
            // tile to draw.
            "absolute inset-y-0 overflow-hidden bg-[var(--map-water)]",
            shown.fade &&
              "animate-in fade-in duration-300 motion-reduce:animate-none",
          )}
          style={
            {
              left: geometry.canvas.left,
              width: geometry.canvas.width,
              "--marker-ring":
                world && theme ? WORLD_MAP[theme].pinRing : undefined,
            } as CSSProperties
          }
        >
          {shown.tiles.map(({ left, top }, index) => (
            // A blob URL of a tile this page fetched, or the world picture,
            // neither of which `next/image` has anything to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${index}:${left}:${top}`}
              src={shown.srcs[index]}
              alt=""
              draggable={false}
              data-map-tile
              className="absolute max-w-none"
              style={{
                left: geometry.anchor.x - geometry.canvas.left + left,
                top: geometry.anchor.y + top,
                width: TILE_SIZE,
                height: TILE_SIZE,
              }}
            />
          ))}
          {shown.pins.map(({ left, top, variant, name }, index) => (
            <div
              key={index}
              data-marker={variant}
              title={name.trim() || undefined}
              className={cn(
                markerClassName(variant),
                "absolute -translate-x-1/2 -translate-y-1/2",
              )}
              style={{
                left: geometry.anchor.x - geometry.canvas.left + left,
                top: geometry.anchor.y + top,
              }}
            />
          ))}
          {/* A hero's sides, dissolving into the page over the canvas's outer
              quarters - so a frame half the canvas's width or narrower shows
              the map crisp to its edges. A gradient laid over the tiles, never
              a mask, for the reason the foot's gives below. */}
          {hero && (
            <div
              aria-hidden
              data-backdrop-side-fade
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(to right, var(--backdrop-fade), transparent ${SIDE_FADE_WIDTH}px, transparent ${geometry.canvas.width - SIDE_FADE_WIDTH}px, var(--backdrop-fade))`,
              }}
            />
          )}
        </div>
      )}
      {/* Laid over the map rather than masking it, into the caller's colour -
          a card's hover included: a gradient mask draws in visible strips. */}
      {shown && (
        <div
          aria-hidden
          data-backdrop-fade
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--backdrop-fade))",
          }}
        />
      )}
      {/* A licence condition of the basemap, so it is rendered over the map -
          inset from the card's rounded corner, and quieter, as it sits over
          the part of the map that shows. Laid out but unseen over water,
          since where the band starts depends on its height. */}
      {!hero && (
        <MapCredit
          ref={creditRef}
          className={cn(
            "absolute left-1 top-1 z-10 rounded-sm opacity-75",
            !shown && "invisible",
          )}
        />
      )}
    </div>
  );
}
