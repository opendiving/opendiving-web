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

// The record's link, stretched over the whole card rather than wrapping it: a
// button inside an anchor is invalid, and so is a map's attribution link.
export const BACKDROP_CARD_LINK =
  "block font-medium text-foreground after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring";

// A card's place while its list loads, at the card's measured height - its
// backdrop band, a name, one line under it and a row of figures, 238px - so the
// cards land without moving anything. A list item, like the card.
export function BackdropCardSkeleton() {
  return (
    <li aria-hidden>
      <Skeleton className="h-59.5 rounded-lg" />
    </li>
  );
}

// A record with no map to show: the map's open water, where this instance has
// drawn no picture of it - nowhere on a map yet, no map renderer, or a picture
// that could not be had - and on a hero, a dive or a site with no position.
// Faded as a map is, and the record's icon centred in what the details leave of
// it: the colour the map names a sea in, muted as the map's own colours are so
// it sits in the water rather than on it, and below whatever covers the top.
export function UnplacedBackdrop({
  coveredBottom,
  coveredTop = 0,
  icon: Icon,
}: {
  coveredBottom: number;
  coveredTop?: number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 rounded-[inherit] bg-[var(--map-water)]"
    >
      {/* The map's own fade, in the same colour space as its. */}
      <div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background:
            "linear-gradient(to bottom, transparent, var(--backdrop-fade))",
        }}
      />
      <div
        className="absolute inset-x-0 flex items-center justify-center"
        style={{ top: coveredTop, bottom: coveredBottom }}
      >
        <Icon className="h-10 w-10 text-[var(--map-water-foreground)] opacity-60 saturate-50" />
      </div>
    </div>
  );
}

interface BackdropCardProps {
  // What fills the card behind its details, handed how many pixels of its foot
  // the details cover. Rendered only while the card is on or near the screen.
  backdrop: (coveredBottom: number) => ReactNode;
  // The menu's items; the corner is empty without them.
  actions?: ReactNode;
  // Names the menu after its card, as every list's row actions are.
  actionsLabel: string;
  // The details, from a link styled `BACKDROP_CARD_LINK` down. Anything in them
  // that has to stay reachable past that link is lifted with `relative z-10`.
  children: ReactNode;
}

// One record as a card, as /trips, /dives, /sites and the lists of recent ones
// draw them: a backdrop - a map, or whatever stands in for one - its details over
// the foot of it, and its actions in the corner. A list item, so a caller
// renders it in a list.
export function BackdropCard({
  backdrop,
  actions,
  actionsLabel,
  children,
}: BackdropCardProps) {
  // How much of the backdrop lies under the details, from the name down, so a
  // picture's places centre between the credit and the name. Read as the ref
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
  // screen asks for nothing: its picture is requested as it comes near, and
  // the request let go if it leaves first, which keeps a long list's requests
  // to the cards a diver is looking at. Coming back costs nothing once a
  // picture has arrived: the page keeps it.
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
        // The card's own colour, set a step off the page's so the card reads
        // as one: in dark the theme's card colour is that step, and in light
        // this grey is the same contrast against white - about 1.11:1 - where
        // the card colour would be none. Hover steps the other way from the
        // page in each theme. The backdrop's fade meets it, and the text's and
        // the menu's glows are drawn in it.
        "bg-[var(--backdrop-card)] [--backdrop-fade:var(--backdrop-card)]",
        "[--backdrop-card:hsl(240_4%_95.5%)] hover:[--backdrop-card:hsl(240_4%_92.5%)]",
        "dark:[--backdrop-card:hsl(var(--card))] dark:hover:[--backdrop-card:hsl(var(--muted))]",
        // A fixed band of backdrop above the name, with the details over its
        // faded foot: however tall they grow, the backdrop shows as much of
        // itself, at every width. The details' own top padding is part of the
        // band, so what they measure starts at the name.
        "pt-33",
      )}
    >
      {isNear && (
        // Out of flow, under the details. The radius is the card's less the
        // border it sits inside, which the backdrop clips itself to.
        <div className="absolute inset-0 rounded-[calc(var(--radius)-1px)]">
          {backdrop(detailsHeight)}
        </div>
      )}
      {/* As far in from the corner as a map's credit is, its hover takes the
          credit's chip rather than a colour the map would swallow, and its
          icon glows as the details' text does - through a filter, since
          `text-shadow` stops at an SVG. Two close layers, as the text's:
          `drop-shadow`s chain, each blurring the last one's 8-bit output, and
          more of them drew the halo in visible rings. */}
      {actions && (
        <div className="absolute right-1 top-1 z-10">
          <ItemActionsMenu
            label={actionsLabel}
            variant="ghost"
            size="sm"
            className="hover:bg-background/80 [&_svg]:[filter:drop-shadow(0_0_2px_var(--backdrop-card))_drop-shadow(0_0_5px_var(--backdrop-card))]"
          >
            {actions}
          </ItemActionsMenu>
        </div>
      )}
      {/* Above the backdrop by a flex item's z-index rather than by
          `relative`, which would make this the box the link's overlay
          stretches over and leave the backdrop outside it. Under the menu and
          the credit, which are lifted higher. Every line is lifted off
          whatever the backdrop still shows beneath it by a glow in the card's
          own colour: two soft layers close together, since more of them - or
          wider ones - drew each layer's edge as a visible ring. */}
      <div
        ref={detailsRef}
        className="z-[1] px-3 pb-3 [text-shadow:0_0_2px_var(--backdrop-card),0_0_5px_var(--backdrop-card)]"
      >
        {children}
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
// to card; three of them fit a dashboard card from a 370px screen. Narrower
// phones take columns as wide as their contents instead, which keep the figures
// on one line down to 320px, where a wrapped label would outgrow the card's
// skeleton. A value never breaks, so "1h 11min" is one figure.
export function BackdropCardFigures({
  figures,
}: {
  figures: BackdropCardFigure[];
}) {
  return (
    <dl className="mt-3 grid w-fit grid-flow-col auto-cols-[5rem] gap-3 max-[370px]:auto-cols-auto">
      {figures.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs">{label}</dt>
          <dd className="whitespace-nowrap text-base font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
