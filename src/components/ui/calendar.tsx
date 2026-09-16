"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { flushSync } from "react-dom";
import { DayPicker, MonthGrid, useDayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// A day cell is 36px wide, so this clears the slop around a tap without asking
// for most of a month's width.
const SWIPE_THRESHOLD_PX = 48;

// Under this the finger is still tapping a day. Past it the grid is following
// it, and the lift that ends the drag can no longer pick anything.
const DRAG_SLOP_PX = 10;

const SLIDE_MS = 140;

// Daylight between one month and the next, so a drag reads as two pages passing
// rather than as one grid that has grown extra columns.
const MONTH_GAP_PX = 16;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Renders one neighbouring month's grid, for the track below to slide in.
 *
 * Supplied by `Calendar`, which is the only thing that knows how this calendar
 * is configured; a second copy of that configuration is a second thing to keep
 * in step, and the neighbour has to be the same grid as the one it replaces.
 */
const RenderNeighbour = React.createContext<
  ((month: Date) => React.ReactNode) | null
>(null);

/**
 * The day grid, as a three-month track: the month on screen with its
 * neighbours waiting either side of it.
 *
 * Every month change slides, whichever control asked for it - an arrow, the
 * dropdowns, or a drag - and the month being replaced leaves as its replacement
 * arrives. A drag moves the track under the finger, so the month it is pulling
 * in is on screen the whole way rather than following a blank gap.
 *
 * The neighbours are mounted only while something is moving. At rest the track
 * has nothing either side of it and needs no clipping, which is what keeps a
 * focused day's ring from being cut off at the first and last columns.
 *
 * The drag is touch and pen only, since a mouse dragged across a grid means
 * selecting. Declared at module scope because `components` is read by identity
 * - one written inside `Calendar` would be a fresh type on every render,
 * remounting the grid and dropping focus out of whichever day held it.
 */
function SwipeableMonthGrid({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  const { goToMonth, months, nextMonth, previousMonth } = useDayPicker();
  const renderNeighbour = React.useContext(RenderNeighbour);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const gesture = React.useRef<{
    id: number;
    x: number;
    y: number;
  } | null>(null);

  // A drag still ends over a day cell, and the browser fires a click there as
  // the finger lifts - so without this the page turn would also pick whatever
  // day happened to be under it.
  const dragging = React.useRef(false);

  // Mounts the neighbours and clips the track to one month.
  const [sliding, setSliding] = React.useState(false);

  // A drag arrives at the new month itself, so the arrival below has nothing
  // left to play when the swap it made lands.
  const swiped = React.useRef(false);

  // The leg currently playing. Its continuation runs after an await, so an
  // unmount mid-slide has to stop it rather than let it write to a track that
  // has left the page.
  const playing = React.useRef<Animation | null>(null);

  React.useEffect(() => () => playing.current?.cancel(), []);

  // Where the track rests between legs. A finished animation falls back to the
  // inline transform, so that is set before the animation's fill is dropped.
  const settleAt = (px: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transform = px === 0 ? "" : `translateX(${px}px)`;
    playing.current?.cancel();
  };

  // One month's travel, which is exactly where the neighbours are pinned: the
  // grid's own width and the gap it keeps from them.
  const step = () => (trackRef.current?.offsetWidth ?? 0) + MONTH_GAP_PX;

  // What the track moves under the finger. Free travel while there is a month
  // that way, rubber-banded to a fraction of it when there is not, so the end
  // of `startMonth`/`endMonth` reads as an end rather than a dead gesture.
  const resist = (dx: number) => {
    if (!(dx < 0 ? nextMonth : previousMonth)) {
      return Math.sign(dx) * Math.sqrt(Math.abs(dx)) * 3;
    }
    return Math.max(-step(), Math.min(step(), dx));
  };

  // One leg. `false` means it was cancelled and whatever follows it is off.
  const slide = async (from: number, to: number) => {
    const el = trackRef.current;
    if (!el) return false;
    const at = (px: number) => (px === 0 ? "none" : `translateX(${px}px)`);
    playing.current = el.animate(
      [{ transform: at(from) }, { transform: at(to) }],
      { duration: SLIDE_MS, easing: "ease-out", fill: "forwards" },
    );
    try {
      await playing.current.finished;
    } catch {
      return false;
    }
    return true;
  };

  // The arrival, for every month change a drag did not make itself. The track
  // opens one month away, which puts the month being replaced - now a
  // neighbour of the one that replaced it - where it already was, and the two
  // travel together.
  //
  // Positioned in a layout effect so the track is already off the edge when the
  // frame paints; after paint it would show one frame of the new month in place
  // before jumping.
  const shown = months.length === 1 ? months[0].date.getTime() : undefined;
  const previousShown = React.useRef(shown);
  React.useLayoutEffect(() => {
    const from = previousShown.current;
    previousShown.current = shown;
    const bySwipe = swiped.current;
    swiped.current = false;
    if (bySwipe) return;
    if (from === undefined || shown === undefined || from === shown) return;
    if (prefersReducedMotion()) return;
    // Arrow keys move the month by moving focus into the new one, and a focused
    // day sliding in and out of a clipped box is worse than no animation.
    if (trackRef.current?.contains(document.activeElement)) return;
    setSliding(true);
    const away = shown > from ? step() : -step();
    settleAt(away);
    void slide(away, 0).then((finished) => {
      if (!finished) return;
      settleAt(0);
      setSliding(false);
    });
  }, [shown]);

  // Ends a drag: the month the track has pulled into view becomes the month on
  // screen, or the track goes back where it started when there is nothing to
  // turn to.
  const release = async (target: Date | undefined, offset: number) => {
    if (prefersReducedMotion()) {
      if (target) goToMonth(target);
      settleAt(0);
      setSliding(false);
      return;
    }
    if (!target) {
      if (!(await slide(offset, 0))) return;
      settleAt(0);
      setSliding(false);
      return;
    }
    const away = target.getTime() > (shown ?? 0) ? -step() : step();
    if (!(await slide(offset, away))) return;
    // The neighbour is already sitting where the month on screen belongs, so
    // the swap is a re-base rather than a second animation: the new grid takes
    // the position its copy is holding. Both happen in this task, before a
    // frame can paint the track a month out of place.
    swiped.current = true;
    flushSync(() => goToMonth(target));
    settleAt(0);
    setSliding(false);
  };

  return (
    <div
      // Clipped only while the neighbours are mounted - at rest nothing sits
      // outside this box, and clipping it anyway would cut the focus ring off
      // the first and last columns.
      className={cn("relative", sliding && "overflow-hidden", className)}
      // `pan-y`, not `none`: sideways movement is ours and vertical is still the
      // page scrolling past, which also abandons the gesture via `pointercancel`.
      style={{ touchAction: "pan-y" }}
      onPointerDown={(event) => {
        // Below the guard, not above it: a second finger landing mid-drag is
        // ignored here, and clearing the flag on the way past would stop the
        // first finger's lift ending the drag it is still holding.
        if (event.pointerType === "mouse" || gesture.current) return;
        dragging.current = false;
        // A slide already in flight owns the transform. Let it finish rather
        // than race it - cancelling a leg abandons the month change with it.
        if (playing.current?.playState === "running") return;
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        if (!dragging.current) {
          if (Math.abs(dx) < DRAG_SLOP_PX) return;
          if (Math.abs(dx) <= Math.abs(event.clientY - start.y)) return;
          dragging.current = true;
          setSliding(true);
          // Captured only now, never on the way down: the lift then arrives here
          // even if the finger has left the grid, while a tap - which never gets
          // this far - keeps the click on its day. Capturing on pointerdown would
          // retarget every tap's click to the table and no day could be picked.
          // It throws for a pointer that is no longer active, which costs the
          // drag nothing that is worth abandoning it over.
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Tracked without it.
          }
        }
        settleAt(resist(dx));
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        gesture.current = null;
        if (!dragging.current) return;
        const dx = event.clientX - start.x;
        // Short of the threshold, or at the far end of `startMonth`/`endMonth`:
        // the track goes back where it was. The click stays swallowed either
        // way, since that finger was never picking a day.
        const target =
          Math.abs(dx) < SWIPE_THRESHOLD_PX
            ? undefined
            : dx < 0
              ? nextMonth
              : previousMonth;
        void release(target, resist(dx));
      }}
      onPointerCancel={(event) => {
        const start = gesture.current;
        // A pinch or a scroll taking over cancels every pointer that is down,
        // in an order nobody chose, so the same identity check the lift makes:
        // another finger's cancel carries another finger's `clientX`, and the
        // track would slide home from an offset it was never at.
        if (!start || start.id !== event.pointerId) return;
        gesture.current = null;
        if (!dragging.current) return;
        void release(undefined, resist(event.clientX - start.x));
      }}
      onClickCapture={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        event.stopPropagation();
      }}
    >
      <div ref={trackRef} className="relative">
        <table {...props} className="w-full border-collapse" />
        {sliding && previousMonth && (
          <Neighbour month={previousMonth} side="right">
            {renderNeighbour}
          </Neighbour>
        )}
        {sliding && nextMonth && (
          <Neighbour month={nextMonth} side="left">
            {renderNeighbour}
          </Neighbour>
        )}
      </div>
    </div>
  );
}

/** A month pinned one width to the side of the track, out of everyone's way. */
function Neighbour({
  month,
  side,
  children,
}: {
  month: Date;
  side: "left" | "right";
  children: ((month: Date) => React.ReactNode) | null;
}) {
  if (!children) return null;
  return (
    <div
      inert
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-full"
      // A computed key and a computed value, so there is no class name for
      // Tailwind to have scanned.
      style={{ [side]: `calc(100% + ${MONTH_GAP_PX}px)` }}
    >
      {children(month)}
    </div>
  );
}

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

// Shared so the month waiting either side of the track is the same grid as the
// one it slides in to replace, down to the class on every cell.
function calendarClassNames(
  overrides: CalendarProps["classNames"],
): CalendarProps["classNames"] {
  return {
    months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
    // Previous arrow, caption and next arrow share the first row; the day
    // grid spans all three columns on the second. The arrows used to be
    // `absolute`, which resolved against whichever ancestor happened to be
    // positioned - never this month - and dropped them somewhere unrelated
    // to the caption they steer. Laying the row out in flow keeps them on
    // the caption's baseline at any width, and keeps them off the month and
    // year selects rather than merely near-missing them.
    month: "grid grid-cols-[auto_1fr_auto] items-center gap-y-4",
    month_caption: "flex justify-center items-center",
    caption_label: "text-sm font-medium",
    dropdowns: "flex gap-1",
    dropdown:
      "border border-input bg-background text-base md:text-sm rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring appearance-none",
    button_previous: cn(
      buttonVariants({ variant: "outline" }),
      "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
    ),
    button_next: cn(
      buttonVariants({ variant: "outline" }),
      "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
    ),
    month_grid: "col-span-3 w-full border-collapse space-y-1",
    weekdays: "flex",
    weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
    week: "flex w-full mt-2",
    day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
    day_button: cn(
      buttonVariants({ variant: "ghost" }),
      "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
    ),
    range_end: "day-range-end",
    selected:
      "bg-teal text-primary-foreground hover:bg-teal hover:text-primary-foreground focus:bg-teal focus:text-primary-foreground",
    today: "bg-accent text-accent-foreground",
    outside:
      "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
    disabled: "text-muted-foreground opacity-50",
    range_middle:
      "aria-selected:bg-accent aria-selected:text-accent-foreground",
    hidden: "invisible",
    ...overrides,
  };
}

function Chevron({
  orientation,
  className,
}: {
  orientation?: "up" | "down" | "left" | "right";
  className?: string;
}) {
  const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
  return <Icon className={cn("h-4 w-4", className)} />;
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const merged = calendarClassNames(classNames);

  // The same calendar, for a month that is not the one on screen: no caption to
  // duplicate, no navigation to reach, and the plain grid rather than the one
  // that would render neighbours of its own.
  const renderNeighbour = React.useCallback(
    (month: Date) => (
      <DayPicker
        {...props}
        showOutsideDays={showOutsideDays}
        navLayout="around"
        month={month}
        defaultMonth={undefined}
        autoFocus={false}
        className="p-0"
        classNames={{
          ...merged,
          month_caption: "hidden",
          button_previous: "hidden",
          button_next: "hidden",
        }}
        components={{ MonthGrid, Chevron }}
      />
    ),
    // `merged` is rebuilt every render from `classNames`, which is the only
    // part of it that moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props, showOutsideDays, classNames],
  );

  return (
    <RenderNeighbour.Provider value={renderNeighbour}>
      <DayPicker
        showOutsideDays={showOutsideDays}
        // Puts the two arrows inside the month, flanking the caption, instead
        // of in a `<nav>` above it. See `month` for why they are laid out in
        // flow.
        navLayout="around"
        className={cn("p-3", className)}
        classNames={merged}
        components={{ MonthGrid: SwipeableMonthGrid, Chevron }}
        {...props}
      />
    </RenderNeighbour.Provider>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
