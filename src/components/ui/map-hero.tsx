"use client";

import {
  useCallback,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

// The band's frame, shared with its skeleton so the page lands without moving:
// a constant height per breakpoint - about a third of a laptop's viewport, less
// on a phone - that details taller than it, a name wrapping onto three lines,
// grow from the top, where `pt-36` keeps a band of map above them under the top
// row and the credit beneath it.
const FRAME =
  "relative isolate flex min-h-72 flex-col justify-end pt-36 sm:min-h-80 lg:min-h-88";

// The page's column, so the details line up with the body under them.
const COLUMN = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

// The figures' row, as many to a line as fit - three on a phone.
const FIGURES = "mt-3 flex flex-wrap gap-x-3 gap-y-3 md:mt-4";

// The details at a card's sizes below `md`, where a phone's width would
// otherwise wrap the title and put a figure on a line of its own, and at the
// dive page's above it. In the text's own colour at every width, as a card's
// are: the glow behind them is what lifts them off the map.
const TITLE = "text-base font-medium md:text-3xl md:font-bold";
const SUBTITLE = "text-xs md:mt-1 md:text-base";
const LABEL = "text-xs md:mb-1 md:text-sm md:font-medium";
const VALUE = "text-base md:text-2xl";

// Every figure at least as wide as the widest short one, "Average rating", so
// they line up. A date is wider, and its record lists it last.
const FIGURE = "min-w-22 md:min-w-26";

// The band's top row, at the column's edges rather than the window's, where a
// wide screen would put it far from everything else. Above the details and the
// map, with the credit.
const TOP_ROW = "absolute inset-x-0 top-2 z-10";

// A control on the band's top row: ghost over the map, as a card's menu is,
// and glowing as the details' text does - the icons through a filter, since
// `text-shadow` stops at an SVG. Two close layers, as the text's:
// `drop-shadow`s chain, each blurring the last one's 8-bit output, and more of
// them drew the halo in rings.
export const HERO_CONTROL =
  "hover:bg-background/80 [text-shadow:0_0_2px_var(--backdrop-fade),0_0_5px_var(--backdrop-fade)] [&_svg]:[filter:drop-shadow(0_0_2px_var(--backdrop-fade))_drop-shadow(0_0_5px_var(--backdrop-fade))]";

// What a hero knows before its record has loaded, so its skeleton draws them
// for real: the way back, and the record's kind.
interface Known {
  backHref: string;
  backLabel: string;
  // The kind's icon, as the header's New menu marks it.
  icon: ComponentType<{ className?: string }>;
}

// The kind's icon before the title and the line under it, as tall as the two
// together, glowing as their text does - through a filter, since `text-shadow`
// stops at an SVG.
// The icon and the title block beside it, as close as a card sets them below
// `md`.
const HEADING = "flex items-center gap-2.5 md:gap-4";

const ICON =
  "size-10 shrink-0 stroke-[1.5] md:size-14 [filter:drop-shadow(0_0_2px_var(--backdrop-fade))_drop-shadow(0_0_5px_var(--backdrop-fade))]";

// Known before the record is, so the skeleton's is the real one. Padded as the
// actions opposite it are, rather than flush as a plain page's back link is:
// over the map it is a button among buttons.
function HeroBackLink({
  backHref,
  backLabel,
}: Pick<Known, "backHref" | "backLabel">) {
  return (
    <BackLink
      href={backHref}
      label={backLabel}
      className={cn("px-3", HERO_CONTROL)}
    />
  );
}

export interface MapHeroFigure {
  label: string;
  value: ReactNode;
}

interface MapHeroProps extends Known {
  // What fills the band behind the details, handed how many pixels of its top
  // the top row covers and of its foot the details do.
  backdrop: (covered: { top: number; bottom: number }) => ReactNode;
  // Edit and the menu, in the band's top-right corner as a card's menu is,
  // opposite the way back.
  actions?: ReactNode;
  title: string;
  // One line under the title, as the record's card has under its name.
  subtitle?: ReactNode;
  figures: MapHeroFigure[];
}

// A detail page's heading: the record's card drawn the width of the window, its
// map across the whole band and the name, its line and its figures over the
// map's faded foot. Not a `BackdropCard`, which is a list item under a stretched
// link with a hover colour of its own; this is a page surface, and it fades
// into the page.
export function MapHero({
  backHref,
  backLabel,
  icon: Icon,
  backdrop,
  actions,
  title,
  subtitle,
  figures,
}: MapHeroProps) {
  // How much of the map lies under the details, so its places centre between
  // the credit and the name - read as the ref attaches and followed after
  // that, as a card does it.
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

  // And how much the top row covers, which the credit goes under.
  const [topRowBottom, setTopRowBottom] = useState(0);
  const topRowRef = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const measure = () =>
      setTopRowBottom(element.offsetTop + element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        FRAME,
        // The map fades into the page's own colour, and the text's and the
        // actions' glows are drawn in it.
        "bg-background [--backdrop-fade:hsl(var(--background))]",
      )}
    >
      {/* Out of flow, so the lazy map's placeholder takes no room of its own. */}
      <div className="absolute inset-0">
        {backdrop({ top: topRowBottom, bottom: detailsHeight })}
      </div>
      <div ref={topRowRef} className={TOP_ROW}>
        <div className={cn(COLUMN, "flex items-center justify-between gap-4")}>
          <HeroBackLink backHref={backHref} backLabel={backLabel} />
          {actions && <div className="flex shrink-0 gap-1">{actions}</div>}
        </div>
      </div>
      {/* Above the map by a flex item's z-index, as a card's details are.
          Every line is lifted off what the map still shows beneath it by a glow
          in the page's colour: two soft layers close together, since more of
          them - or wider ones - draw each layer's edge as a visible ring. */}
      <div
        ref={detailsRef}
        className="z-[1] [text-shadow:0_0_2px_var(--backdrop-fade),0_0_5px_var(--backdrop-fade)]"
      >
        <div className={cn(COLUMN, "pb-5")}>
          <div className={HEADING}>
            <Icon aria-hidden className={ICON} />
            <div className="min-w-0">
              <h1 className={TITLE}>{title}</h1>
              {subtitle && <p className={SUBTITLE}>{subtitle}</p>}
            </div>
          </div>
          {/* Every figure the record has, at the dive page's size. A value
              never breaks, so "30 m" is one figure. */}
          <dl className={FIGURES}>
            {figures.map(({ label, value }) => (
              <div key={label} className={FIGURE}>
                <dt className={LABEL}>{label}</dt>
                <dd className={cn(VALUE, "whitespace-nowrap font-bold")}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

// The band's place while the record loads, at the band's own height: one box
// where the map will be, and the heading's bar inside the `h1` so the header
// is the same height before and after the record lands. The bars are a step
// lighter than the box they lie on, which is the one place a bar is drawn on
// a bar.
export function MapHeroSkeleton({ backHref, backLabel, icon: Icon }: Known) {
  const bar = "bg-background/60";
  return (
    <div className={FRAME}>
      <Skeleton className="absolute inset-0 rounded-none" />
      <div className={TOP_ROW}>
        <div className={COLUMN}>
          <HeroBackLink backHref={backHref} backLabel={backLabel} />
        </div>
      </div>
      <div className={cn(COLUMN, "relative z-[1] pb-5")}>
        <div className={HEADING}>
          <Icon aria-hidden className={cn(ICON, "text-muted-foreground")} />
          <div className="min-w-0">
            <h1 className={TITLE}>
              <Skeleton className={cn("h-6 w-48 md:h-9 md:w-64", bar)} />
            </h1>
            <p className="md:mt-1">
              <Skeleton className={cn("h-4 w-36 md:h-6 md:w-44", bar)} />
            </p>
          </div>
        </div>
        <div className={FIGURES}>
          {[0, 1, 2].map((figure) => (
            <div key={figure} className={FIGURE}>
              <Skeleton className={cn("h-4 w-16 md:mb-1 md:h-5", bar)} />
              <Skeleton className={cn("h-6 w-12 md:h-8", bar)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
