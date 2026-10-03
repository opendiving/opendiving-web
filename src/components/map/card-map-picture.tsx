"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";

import { MapCredit } from "@/components/map/map-credit";
import {
  findCardPicture,
  requestCardPicture,
} from "@/components/map/card-pictures";
import {
  mapPicturesAPI,
  mapPictureUrl,
  type MapPictureKind,
} from "@/lib/api/map-pictures";
import { bandIn, SNAPSHOT_HEIGHT, SNAPSHOT_WIDTH } from "@/lib/map-picture";
import { cn } from "@/lib/utils";

// What a card shows of its picture: the object URL, and whether it fades in -
// only when it arrived from the network over water, never when it was already
// on the page or takes over from another picture.
interface Shown {
  src: string;
  fade: boolean;
}

// The picture at `url`, from the page's cache or asked for as the card mounts,
// and the last one shown until the next arrives: a theme switch swaps one
// picture for the other rather than passing through water. `null` is water -
// no picture to ask for, or none to be had. A card asks again only when it
// mounts again, never on a timer: what made the last request fail is a
// renderer that is down or busy, and asking on a schedule would add to it from
// every card on every open page.
function useCardPicture(url: string | null): Shown | null {
  const [arrived, setArrived] = useState<{
    url: string;
    src: string | null;
  } | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (!url || findCardPicture(url)) return;
    // Withdrawn on unmount, and when the URL changes under it: a request held
    // open for a draw nobody will see is a connection the page needs.
    return requestCardPicture(
      url,
      (signal) => mapPicturesAPI.getMapPicture(url, signal),
      (src) => setArrived({ url, src }),
    );
  }, [url]);

  const fromNetwork = arrived?.url === url ? arrived.src : undefined;
  // Undefined while the request is out, which holds whatever is shown.
  const outcome = url ? (findCardPicture(url) ?? fromNetwork) : null;
  if (outcome === null && shown !== null) setShown(null);
  if (typeof outcome === "string" && outcome !== shown?.src) {
    setShown({ src: outcome, fade: shown === null && outcome === fromNetwork });
  }
  return shown;
}

interface CardMapPictureProps {
  kind: MapPictureKind;
  uuid: string;
  // The digest the record names its picture by - none where this instance
  // draws it none, which is water at once and no request at all.
  digest?: string | null;
  // What the picture is of, for a screen reader (`mapLabel`).
  label: string;
  // How many pixels of the frame's foot the card covers - its details, and a
  // dive's depth outline over them.
  coveredBottom: number;
  // What the card shows with no picture: the map's water, faded as a map is.
  water: ReactNode;
}

/**
 * A card's map: the picture the server drew of the record, placed with its
 * middle on the middle of the band between the credit and what covers the
 * card's foot, under the card's fade.
 *
 * The picture was fitted for the smallest card (`DIVE_CARD_FRAME`,
 * `TRIP_CARD_FRAME`) with its pins' middle at its own, so a card at least that
 * wide and with a band at least that tall keeps every pin inside its band, and
 * a wider one shows more of the map around them.
 */
export function CardMapPicture({
  kind,
  uuid,
  digest,
  label,
  coveredBottom,
  water,
}: CardMapPictureProps) {
  // Nothing is asked for until the theme is known, which on the client is from
  // the first render: a light picture asked for on a dark page is a draw the
  // diver never sees.
  const { resolvedTheme } = useTheme();
  const url =
    digest && resolvedTheme
      ? mapPictureUrl(
          kind,
          uuid,
          resolvedTheme === "dark" ? "dark" : "light",
          digest,
        )
      : null;
  const shown = useCardPicture(url);

  // The frame, and the credit over its top edge, which wraps where the
  // basemap's is long: what decides where the band is.
  const creditRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{
    width: number;
    height: number;
    creditBottom: number;
  } | null>(null);
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

  if (!shown) return water;

  const band = frame && bandIn(frame.height, frame.creditBottom, coveredBottom);

  return (
    <div
      ref={frameRef}
      className="absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      {/* What it fades in over, so it arrives on the water rather than on
          the card's colour. */}
      {shown.fade && water}
      {/* The label sits on the picture rather than on the frame, so the
          credit's links stay outside the image and reachable: a link inside
          `role="img"` is dropped from the accessibility tree. */}
      <div role="img" aria-label={label} className="absolute inset-0">
        {/* Nothing until the frame has been measured, which is one
            synchronous re-render: the picture's place in it depends on that. */}
        {frame && band && (
          // eslint-disable-next-line @next/next/no-img-element -- a blob URL
          // of a private picture, which `next/image` has nothing to optimise.
          <img
            src={shown.src}
            alt=""
            draggable={false}
            data-card-map-picture
            className={cn(
              "absolute max-w-none",
              shown.fade &&
                "animate-in fade-in duration-300 motion-reduce:animate-none",
            )}
            style={{
              left: frame.width / 2 - SNAPSHOT_WIDTH / 2,
              top:
                (band.top + frame.height - band.bottom) / 2 -
                SNAPSHOT_HEIGHT / 2,
              width: SNAPSHOT_WIDTH,
              height: SNAPSHOT_HEIGHT,
            }}
          />
        )}
      </div>
      {/* Laid over the picture rather than masking it, as a live backdrop's
          fade is, into the card's colour - its hover's included. */}
      <div
        aria-hidden
        data-backdrop-fade
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent, var(--backdrop-fade))",
        }}
      />
      {/* A licence condition of the basemap the picture is drawn from, so it
          is rendered over it - inset from the card's rounded corner, and
          quieter, as it sits over the part of the map that shows. */}
      <MapCredit
        ref={creditRef}
        className="absolute left-1 top-1 z-10 rounded-sm opacity-75"
      />
    </div>
  );
}
