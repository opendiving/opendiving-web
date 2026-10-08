"use client";

import {
  useCallback,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IconTooltip } from "@/components/ui/tooltip";
import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { MapCredit } from "@/components/map/map-credit";
import {
  useMapTiles,
  type MapBackdropProps,
} from "@/components/map/map-backdrop";
import { cn } from "@/lib/utils";

// The band's frame, shared with its skeleton so the page lands without moving:
// a constant height per breakpoint - about a third of a laptop's viewport, less
// on a phone - that details taller than it, a name wrapping onto three lines,
// grow from the top, where `pt-36` keeps a band of map above them under the top
// row.
const FRAME =
  "relative isolate flex min-h-72 flex-col justify-end pt-36 sm:min-h-80 lg:min-h-88";

// The page's column, so the details line up with the body under them.
const COLUMN = "mx-auto w-full max-w-6xl px-2.5 sm:px-6 lg:px-8";

// The body's column under the hero, which spans the window: the hero's own
// details sit in the same column, so they line up with it. On a phone it starts
// the gap between two cards under the hero.
export const HERO_BODY =
  "max-w-6xl mx-auto px-2.5 sm:px-6 lg:px-8 pt-6 max-sm:pt-2.5 pb-6";

// A form page's body: the hero's column, with the form at a field's readable
// width against its left edge, under the title.
export const FORM_BODY = cn(HERO_BODY, "[&>*]:max-w-2xl");

// The figures, as many to a line as fit - three on a phone - and the map's
// credit at the row's far end, at the details' foot. Where the figures leave it
// no room, it wraps onto a line of its own under them, still at the right.
const FIGURES_ROW = "mt-3 flex flex-wrap items-end gap-x-6 gap-y-2 md:mt-4";
const FIGURES = "flex flex-wrap gap-x-3 gap-y-3";

// The figures at a card's sizes below `md`, where a phone's width would
// otherwise put one on a line of its own, and at the dive page's above it. The
// title and its line a step under the page's sizes there rather than at a
// card's: they head a page. On paper, where `md:` measures the sheet rather
// than the window and a printed page falls short of it, the title is at the
// page's size. In the text's own colour at every width, as a card's are: the
// glow behind them is what lifts them off the map.
const TITLE = "text-xl font-bold md:text-3xl print:text-3xl";
const SUBTITLE = "text-sm md:mt-1 md:text-base";
const LABEL = "text-xs md:mb-1 md:text-sm md:font-medium";
const VALUE = "text-base md:text-2xl";

// Every figure at least as wide as the widest short one, so they line up. A
// date is wider, and its record lists it last.
const FIGURE = "min-w-22 md:min-w-26";

// The band's top row, at the column's edges rather than the window's, where a
// wide screen would put it far from everything else. Above the details and the
// map, with the credit.
const TOP_ROW = "absolute inset-x-0 top-2.5 z-10";

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

// The icon and the title block beside it, closer where the details are small.
// Aligned at the top rather than centred, so a line that wraps does not pull
// the icon down off the title.
const HEADING = "flex items-start gap-3 md:gap-4";

// Over the title rather than over the icon, which stays level with the title:
// in by the icon's width and the heading's gap.
const OVERLINE = "mb-1 pl-13 md:pl-18";

// The kind's icon before the title and the line under it, its drawing reaching
// from the title's capitals to the line's first baseline at both sizes: the box
// sits a few pixels down the title's line and is a little taller than the
// drawing, which a 24-unit icon keeps inside 2-22. It glows as their text does
// - through a filter, since `text-shadow` stops at an SVG.
const ICON =
  "mt-1.5 size-10 shrink-0 stroke-[1.5] md:mt-1 md:size-14 [filter:drop-shadow(0_0_2px_var(--backdrop-fade))_drop-shadow(0_0_5px_var(--backdrop-fade))]";

// Known before the record is, so the skeleton's is the real one. Padded as the
// actions opposite it are: over the map it is a button among buttons.
function HeroBackLink({
  backHref,
  backLabel,
}: Pick<Known, "backHref" | "backLabel">) {
  return (
    <Button variant="ghost" size="sm" asChild className={HERO_CONTROL}>
      <Link href={backHref}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        {backLabel}
      </Link>
    </Button>
  );
}

// What every hero's map is, beside its places: a canvas centred in the band,
// faded at its foot and at its sides - which a window wider than half the
// canvas starts to show - fitted between the top row and the details, and
// leaving its credit to the hero's details.
type HeroMap = Pick<MapBackdropProps, "hero" | "coveredTop" | "coveredBottom">;

export interface MapHeroFigure {
  label: string;
  value: ReactNode;
}

interface MapHeroProps extends Known {
  // What fills the band behind the details: a `MapBackdrop` spreading `map`,
  // with water told how many pixels of its top the top row covers and of its
  // foot the details do.
  backdrop: (frame: {
    map: HeroMap;
    covered: { top: number; bottom: number };
  }) => ReactNode;
  // Edit and the menu, in the band's top-right corner as a card's menu is,
  // opposite the way back.
  actions?: ReactNode;
  // Usually the record's name; a node for a dive's, which links its sites.
  title: ReactNode;
  // One line under the title, as the record's card has under its name.
  subtitle?: ReactNode;
  // A tag above the title, as the record's card has above its name.
  overline?: ReactNode;
  figures: MapHeroFigure[];
  // Whether the backdrop is a map where this instance draws them, whose credit
  // `map` leaves to the hero's details' corner - unset for a record drawn
  // without one.
  mapCredit?: boolean;
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
  overline,
  figures,
  mapCredit,
}: MapHeroProps) {
  // A map only where this instance draws its tiles: anywhere else every
  // backdrop is water, and there is nothing to credit.
  const tiles = useMapTiles();
  const credited = mapCredit && tiles === true;
  // How much of the map lies under the details, so its places centre between
  // the top row and the name - read as the ref attaches and followed after
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
      {/* Out of flow, under the top row and the details. */}
      <div className="absolute inset-0">
        {backdrop({
          map: {
            hero: true,
            coveredTop: topRowBottom,
            coveredBottom: detailsHeight,
          },
          covered: { top: topRowBottom, bottom: detailsHeight },
        })}
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
        <HeroDetails
          className={COLUMN}
          icon={Icon}
          title={title}
          subtitle={subtitle}
          overline={overline}
          figures={figures}
        >
          {/* A chip as it is over a card's map, so without the details'
              glow. */}
          {credited && (
            <MapCredit className="ml-auto rounded-sm opacity-75 [text-shadow:none]" />
          )}
        </HeroDetails>
      </div>
    </div>
  );
}

// The icon, the name, its line and its figures. `info` follows the name and
// `aside` ends its line; `children` closes the figures' row.
function HeroDetails({
  className,
  icon: Icon,
  title,
  subtitle,
  overline,
  figures = [],
  headingRef,
  info,
  aside,
  children,
}: Pick<MapHeroProps, "title" | "subtitle" | "overline"> &
  Partial<Pick<MapHeroProps, "icon" | "figures">> & {
    className?: string;
    headingRef?: Ref<HTMLHeadingElement>;
    info?: ReactNode;
    aside?: ReactNode;
    children?: ReactNode;
  }) {
  const heading = (
    <h1
      ref={headingRef}
      tabIndex={headingRef ? -1 : undefined}
      className={TITLE}
    >
      {title}
    </h1>
  );
  return (
    <div className={className}>
      {overline && <div className={OVERLINE}>{overline}</div>}
      <div className={HEADING}>
        {Icon && <Icon aria-hidden className={ICON} />}
        <div className="min-w-0 flex-1">
          {info || aside ? (
            <div className="flex items-center gap-1">
              {heading}
              {info}
              {aside && <div className="ml-auto pl-2">{aside}</div>}
            </div>
          ) : (
            heading
          )}
          {subtitle && <p className={SUBTITLE}>{subtitle}</p>}
        </div>
      </div>
      {(figures.length > 0 || children) && (
        <div className={FIGURES_ROW}>
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
          {children}
        </div>
      )}
    </div>
  );
}

// A map hero's top row, in the flow rather than over the band, at the height
// the band puts it.
const PLAIN_TOP_ROW = "flex items-center gap-4 pt-2.5";
const PLAIN_DETAILS = "mt-3 md:mt-4";

// The heading of a record with no place to map, laid out as a map hero's: the
// top row, then the details straight under it, with no band between them.
export function PlainHero({
  backHref,
  backLabel,
  icon,
  actions,
  title,
  subtitle,
  overline,
  figures,
}: Omit<MapHeroProps, "backdrop" | "mapCredit">) {
  return (
    // The actions' glow is drawn in the page's colour, so it shows nothing here.
    <div className="[--backdrop-fade:hsl(var(--background))]">
      <div className={cn(COLUMN, PLAIN_TOP_ROW, "justify-between")}>
        <HeroBackLink backHref={backHref} backLabel={backLabel} />
        {actions && <div className="flex shrink-0 gap-1">{actions}</div>}
      </div>
      <HeroDetails
        className={cn(COLUMN, PLAIN_DETAILS)}
        icon={icon}
        title={title}
        subtitle={subtitle}
        overline={overline}
        figures={figures}
      />
    </div>
  );
}

// What a page is for, behind an icon after its title: a reader needs it once,
// and every visit after that it is only a line between the title and the page.
// A popover rather than a hover hint, so a tap opens it on a phone.
function PageInfo({ children }: { children: ReactNode }) {
  return (
    <Popover>
      <IconTooltip label="About this page">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground print:hidden"
          >
            <Info className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
      </IconTooltip>
      <PopoverContent align="start" className="text-sm">
        {children}
      </PopoverContent>
    </Popover>
  );
}

// The heading of a page reached from the navigation rather than from a record:
// a plain hero with nothing to go back to, so no top row - the page's actions
// end the title's line instead, as far from the header above and the body below
// as from the window's edge - the column's gutter, which the body's top padding
// falls short of from `lg` - and its description is behind an icon after the
// title. Controls, so paper goes without them.
export function IndexHero({
  icon,
  title,
  description,
  subtitle,
  actions,
  headingRef,
  className,
}: Pick<MapHeroProps, "title" | "subtitle" | "actions"> &
  Partial<Pick<MapHeroProps, "icon">> & {
    // What the page is for, behind the icon. `subtitle` is for what a reader
    // must see without asking, under the title.
    description?: ReactNode;
    // Makes the heading a focus target, for a page that moves focus to it.
    headingRef?: Ref<HTMLHeadingElement>;
    className?: string;
  }) {
  return (
    <div className={cn(COLUMN, "pt-2.5 sm:pt-6 lg:pt-8 lg:pb-2", className)}>
      <HeroDetails
        icon={icon}
        title={title}
        subtitle={subtitle}
        headingRef={headingRef}
        info={description && <PageInfo>{description}</PageInfo>}
        aside={
          actions && (
            <div className="flex shrink-0 gap-1 print:hidden">{actions}</div>
          )
        }
      />
    </div>
  );
}

// The band's place while the record loads, at the band's own height: one box
// where the map will be, and the heading's bar inside the `h1` so the header
// is the same height before and after the record lands. The bars are a step
// lighter than the box they lie on, which is the one place a bar is drawn on
// a bar.
function MapHeroSkeleton({ backHref, backLabel, icon }: Known) {
  return (
    <div className={FRAME}>
      <Skeleton className="absolute inset-0 rounded-none" />
      <div className={TOP_ROW}>
        <div className={COLUMN}>
          <HeroBackLink backHref={backHref} backLabel={backLabel} />
        </div>
      </div>
      <HeroDetailsSkeleton
        className="relative z-[1]"
        icon={icon}
        bar="bg-background/60"
      />
    </div>
  );
}

export function PlainHeroSkeleton({
  backHref,
  backLabel,
  icon,
  figureless,
}: Known & { figureless?: boolean }) {
  return (
    <div>
      <div className={cn(COLUMN, PLAIN_TOP_ROW)}>
        <HeroBackLink backHref={backHref} backLabel={backLabel} />
      </div>
      <HeroDetailsSkeleton
        className={PLAIN_DETAILS}
        icon={icon}
        figureless={figureless}
      />
    </div>
  );
}

function HeroDetailsSkeleton({
  className,
  icon: Icon,
  bar,
  figureless,
}: Pick<Known, "icon"> & {
  className: string;
  bar?: string;
  figureless?: boolean;
}) {
  return (
    <div className={cn(COLUMN, className)}>
      <div className={HEADING}>
        <Icon aria-hidden className={cn(ICON, "text-muted-foreground")} />
        <div className="min-w-0">
          <h1 className={TITLE}>
            <Skeleton className={cn("h-7 w-48 md:h-9 md:w-64", bar)} />
          </h1>
          <p className="md:mt-1">
            <Skeleton className={cn("h-5 w-36 md:h-6 md:w-44", bar)} />
          </p>
        </div>
      </div>
      {!figureless && (
        <div className={cn(FIGURES_ROW, FIGURES)}>
          {[0, 1, 2].map((figure) => (
            <div key={figure} className={FIGURE}>
              <Skeleton className={cn("h-4 w-16 md:mb-1 md:h-5", bar)} />
              <Skeleton className={cn("h-6 w-12 md:h-8", bar)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A hero page's place while its record loads: the hero's skeleton at the hero's
// height, and the body's at the body's, so nothing moves when the record lands.
// `plain` for a page whose hero is a `PlainHero`, and `figureless` for one
// drawn with no figures.
export function MapHeroPageSkeleton({
  plain,
  figureless,
  ...known
}: Known & { plain?: boolean; figureless?: boolean }) {
  return (
    <div aria-busy>
      {plain ? (
        <PlainHeroSkeleton {...known} figureless={figureless} />
      ) : (
        <MapHeroSkeleton {...known} />
      )}
      <div className={HERO_BODY}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-sm:gap-2.5">
          <div className="lg:col-span-2">
            <CardSkeleton lines={7} />
          </div>
          <div className="space-y-6 max-sm:space-y-2.5">
            <CardSkeleton lines={4} />
          </div>
        </div>
      </div>
    </div>
  );
}
