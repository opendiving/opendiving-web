"use client";

import {
  useCallback,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useNearViewport } from "@/hooks/useNearViewport";
import { ItemActionsMenu } from "@/components/ui/item-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// A list's card's own colour, set a step off the page's so the card reads as
// one: in dark the theme's card colour is that step, and in light this grey is
// the same contrast against white - about 1.11:1 - where the card colour would
// be none. Hover steps the other way from the page in each theme, for a card
// that is a link.
export const LIST_CARD_SURFACE =
  "bg-[var(--backdrop-card)] [--backdrop-card:hsl(var(--backdrop-surface))]";
export const LIST_CARD_HOVER =
  "hover:[--backdrop-card:hsl(var(--backdrop-surface-hover))]";

// The record's link, stretched over the whole card rather than wrapping it: a
// button inside an anchor is invalid, and so is a map's attribution link.
export const BACKDROP_CARD_LINK =
  "block font-medium text-foreground after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring";

// A card's place while its list loads, at the card's measured height - its
// backdrop band, a name, one line under it and a row of figures, 238px - or in
// the shape its cards are drawn in, so the cards land without moving anything.
// A list item, like the card.
function BackdropCardSkeleton({ shape }: { shape?: string }) {
  return (
    <li aria-hidden>
      <Skeleton className={cn("rounded-lg", shape ?? "h-59.5")} />
    </li>
  );
}

// A list of backdrop cards, laid out by `layout` and stacked unless given one.
// Until it holds a card it draws `placeholders` skeletons in that same layout,
// busy on the outside and hidden on each placeholder within - the split
// `ListRowsSkeleton` documents, so a reader meets a list that is loading rather
// than one that is silently empty.
export function BackdropCardList({
  layout = "space-y-3 max-sm:space-y-2.5",
  className,
  placeholders = 0,
  shape,
  children = [],
}: {
  layout?: string;
  className?: string;
  placeholders?: number;
  shape?: string;
  children?: ReactNode[];
}) {
  const isLoading = children.length === 0 && placeholders > 0;
  return (
    <ul className={cn(layout, className)} aria-busy={isLoading || undefined}>
      {isLoading
        ? Array.from({ length: placeholders }, (_, index) => (
            <BackdropCardSkeleton key={index} shape={shape} />
          ))
        : children}
    </ul>
  );
}

// A record with no map to show: the map's open water, where this instance draws
// no map of it - nowhere on a map yet, no map renderer, or a tile that could not
// be had - on a card and on a hero alike.
// Faded as a map is on a hero, and the record's icon centred in what the
// details leave of it: the colour the map names a sea in, muted as the map's
// own colours are so it sits in the water rather than on it, and below whatever
// covers the top.
export function UnplacedBackdrop({
  coveredBottom,
  coveredTop = 0,
  hero = false,
  icon: Icon,
}: {
  coveredBottom: number;
  coveredTop?: number;
  hero?: boolean;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 rounded-[inherit] bg-map-water"
    >
      {/* The map's own fade, in the same colour space as its. */}
      {hero && (
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--backdrop-fade))",
          }}
        />
      )}
      <div
        className="absolute inset-x-0 flex items-center justify-center"
        style={{ top: coveredTop, bottom: coveredBottom }}
      >
        <Icon className="h-10 w-10 text-map-water-foreground opacity-60 saturate-50" />
      </div>
    </div>
  );
}

// The menu's items, and the name that goes with them, as every list's row
// actions are named after their row. A record with nothing to do to it - a
// species - passes neither, and its corner is empty.
type BackdropCardActions =
  | { actions: ReactNode; actionsLabel: string }
  | { actions?: never; actionsLabel?: never };

type BackdropCardProps = BackdropCardActions & {
  // What fills the card behind its details, handed how many pixels of its foot
  // the details cover. Rendered only while the card is on or near the screen.
  backdrop: (coveredBottom: number) => ReactNode;
  // A control of the caller's own in the corner, in place of the menu.
  corner?: ReactNode;
  // Draws the record as one that is shown but not yet the list's own: the
  // backdrop faded towards the card's colour, the border dashed, and the text -
  // the link's included - in `text-muted-foreground`, which clears AA on the
  // card's colour in both themes, hovered or not. A colour step rather than an
  // opacity: see "The unit toggle's off half" in DECISIONS.md.
  muted?: boolean;
  // An `aspect-*` class drawing the whole card in its backdrop's own shape, in
  // place of the band of backdrop above the details.
  shape?: string;
  // The details, from a link styled `BACKDROP_CARD_LINK` down. Anything in them
  // that has to stay reachable past that link is lifted with `relative z-10`.
  children: ReactNode;
};

// One record as a card, as /trips, /dives, /sites and the lists of recent ones
// draw them: a backdrop - a map, or whatever stands in for one - its details over
// the foot of it, and its actions in the corner. A list item, so a caller
// renders it in a list.
export function BackdropCard({
  backdrop,
  actions,
  actionsLabel,
  corner,
  muted = false,
  shape,
  children,
}: BackdropCardProps) {
  // How much of the backdrop lies under the details, from the name down, so a
  // map's places centre between the credit and the name. Read as the ref
  // attaches and followed after that, as `useChartWidth` does: a name that
  // wraps grows the block.
  const [detailsHeight, setDetailsHeight] = useState(0);
  const detailsRef = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    setDetailsHeight(element.offsetHeight);
    const observer = new ResizeObserver(() =>
      setDetailsHeight(element.offsetHeight),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The backdrop only while the card is on or near the screen, so a card off
  // screen asks for nothing: its tiles are requested as it comes near, and the
  // requests let go if it leaves first, which keeps a long list's requests to
  // the cards a diver is looking at. Coming back costs nothing once its tiles
  // have arrived: the page keeps them.
  const [nearRef, isNear] = useNearViewport<HTMLLIElement>({
    rootMargin: "100px",
  });

  return (
    // What has to stay reachable over the stretched link - the actions, a
    // map's attribution, anything the details lift - is lifted above it;
    // `isolate` keeps those lifts inside the card.
    <li
      ref={nearRef}
      className={cn(
        // `justify-end` for a card stretched taller than its content by a
        // grid row: the details stay at its foot, under the menu's corner.
        "relative isolate flex flex-col justify-end rounded-lg border transition-colors",
        // The details' glass is tinted the card's colour, and the menu's glow
        // is drawn in it.
        LIST_CARD_SURFACE,
        LIST_CARD_HOVER,
        "[--backdrop-fade:var(--backdrop-card)]",
        // A fixed band of backdrop above the details, which lie over the rest
        // of it behind glass: however tall they grow, the backdrop shows as
        // much of itself, at every width. What they measure starts at the
        // glass's top edge. A shape replaces the band, and only details taller
        // than it stretch the card past it.
        shape ?? "pt-30",
        muted && "border-dashed",
      )}
    >
      {isNear && (
        // Out of flow, under the details. The radius is the card's less the
        // border it sits inside, which the backdrop clips itself to.
        <div
          className={cn(
            "absolute inset-0 rounded-[calc(var(--radius)-1px)]",
            muted && "opacity-40 saturate-50",
          )}
        >
          {backdrop(detailsHeight)}
        </div>
      )}
      {/* As far in from the corner as a map's credit is, its hover takes the
          credit's chip rather than a colour the map would swallow, and its
          icon glows as the details' text does. */}
      {corner ? (
        <div className="absolute right-1 top-1 z-10">{corner}</div>
      ) : (
        actions &&
        actionsLabel && (
          <div className="absolute right-1 top-1 z-10">
            <ItemActionsMenu
              label={actionsLabel}
              variant="ghost"
              size="sm"
              className="hover:bg-background/80 [&_svg]:glow-icon"
            >
              {actions}
            </ItemActionsMenu>
          </div>
        )
      )}
      {/* Above the backdrop by a flex item's z-index rather than by
          `relative`, which would make this the box the link's overlay
          stretches over and leave the backdrop outside it. Under the menu and
          the credit, which are lifted higher. */}
      <div ref={detailsRef} className="z-[1] grid">
        {/* The glass is a layer of its own, sharing the details' one grid
            cell: a `backdrop-filter` makes its element the box absolute
            descendants are placed against, as `relative` would. Its top edge
            is soft, the glass coming in from above the details and whole by
            the name. */}
        <div
          aria-hidden
          className="[grid-area:1/1] -mt-12 rounded-b-[calc(var(--radius)-1px)] bg-(--backdrop-card)/55 backdrop-blur-[2px] backdrop-saturate-150 transition-colors [mask-image:linear-gradient(transparent,#000_5rem)]"
        />
        {/* A stacking context of its own, or the glass - which is one -
            paints over its text whatever the order. The glass is what lifts
            the text off the backdrop, so the glows its icons carry are drawn
            in nothing here. */}
        <div
          className={cn(
            "[grid-area:1/1] isolate p-3 [--backdrop-fade:transparent]",
            muted && "text-muted-foreground [&_a]:text-muted-foreground",
          )}
        >
          {children}
        </div>
      </div>
    </li>
  );
}

export interface BackdropCardFigure {
  label: string;
  value: ReactNode;
}

// A card's figures, up to three, a size down from the dive page's. Equal
// columns, as wide as "Species seen" or "1h 59min", so figures line up from card
// to card; three of them fit a Home card from a 370px screen. Narrower
// phones take columns as wide as their contents instead, which keep the figures
// on one line down to 320px, where a wrapped label would outgrow the card's
// skeleton. A value never breaks, so "1h 11min" is one figure.
export function BackdropCardFigures({
  figures,
  className,
}: {
  figures: BackdropCardFigure[];
  // Columns of the card's own, for figures wider than these.
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "mt-3 grid w-fit grid-flow-col auto-cols-[5rem] gap-3 max-[370px]:auto-cols-auto",
        className,
      )}
    >
      {figures.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs">{label}</dt>
          <dd className="whitespace-nowrap text-base font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
