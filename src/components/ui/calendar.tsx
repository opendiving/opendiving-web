"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { flushSync } from "react-dom";
import { DayPicker, useDayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// A day cell is 36px wide, so this clears the slop around a tap without asking
// for most of a month's width.
const SWIPE_THRESHOLD_PX = 48;

// Under this the finger is still tapping a day. Past it the grid is following
// it, and the lift that ends the drag can no longer pick anything.
const DRAG_SLOP_PX = 10;

// One leg of a page turn - a month arriving, or the swiped one leaving first.
const SLIDE_MS = 140;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The day grid, sliding between months and following a horizontal drag.
 *
 * Every month change arrives from the side it came from, whichever control
 * asked for it - an arrow, the dropdowns, or a swipe. A swipe adds the other
 * half, carrying the month the finger is already holding off the far edge
 * first; nothing else has anything on screen to carry.
 *
 * The drag itself is touch and pen only, since a mouse dragged across a grid
 * means selecting. Declared at module scope because `components` is read by
 * identity - one written inside `Calendar` would be a fresh type on every
 * render, remounting the grid and dropping focus out of whichever day held it.
 */
function SwipeableMonthGrid({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  const { goToMonth, months, nextMonth, previousMonth } = useDayPicker();
  const tableRef = React.useRef<HTMLTableElement>(null);
  const gesture = React.useRef<{
    id: number;
    x: number;
    y: number;
  } | null>(null);

  // A drag still ends over a day cell, and the browser fires a click there as
  // the finger lifts - so without this the page turn would also pick whatever
  // day happened to be under it.
  const dragging = React.useRef(false);

  // The leg currently playing. Its continuation runs after an await, so an
  // unmount mid-turn has to stop it rather than let it write to a table that
  // has left the page.
  const playing = React.useRef<Animation | null>(null);

  React.useEffect(() => () => playing.current?.cancel(), []);

  // Where the grid rests between legs. A finished animation falls back to the
  // inline transform, so that is set before the animation's fill is dropped.
  const settleAt = (px: number) => {
    const el = tableRef.current;
    if (!el) return;
    el.style.transform = px === 0 ? "" : `translateX(${px}px)`;
    playing.current?.cancel();
  };

  // Far enough that the grid also clears the calendar's padding; past that it
  // is behind the clipped edge and costs nothing.
  const offscreen = () => (tableRef.current?.offsetWidth ?? 0) + 32;

  // What the grid actually moves under the finger. Free travel while there is a
  // month that way, rubber-banded to a fraction of it when there is not, so the
  // end of `startMonth`/`endMonth` reads as an end rather than a dead gesture.
  const resist = (dx: number) => {
    if (!(dx < 0 ? nextMonth : previousMonth)) {
      return Math.sign(dx) * Math.sqrt(Math.abs(dx)) * 3;
    }
    const width = tableRef.current?.offsetWidth ?? 0;
    return Math.max(-width, Math.min(width, dx));
  };

  // One leg. `false` means it was cancelled and whatever follows it is off.
  const slide = async (from: number, to: number) => {
    const el = tableRef.current;
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

  // The arrival, for every route into a new month. Positioned in a layout
  // effect so the grid is already off the edge when the frame paints - after
  // paint it would show one frame of the new month in place before jumping.
  const shown = months.length === 1 ? months[0].date.getTime() : undefined;
  const previousShown = React.useRef(shown);
  React.useLayoutEffect(() => {
    const from = previousShown.current;
    previousShown.current = shown;
    if (from === undefined || shown === undefined || from === shown) return;
    if (prefersReducedMotion()) return;
    const away = shown > from ? offscreen() : -offscreen();
    settleAt(away);
    void slide(away, 0).then((finished) => {
      if (finished) settleAt(0);
    });
  }, [shown]);

  // Ends a drag: the page turns to `target`, or the grid goes back where it
  // started when there is nothing to turn to.
  const release = async (target: Date | undefined, offset: number) => {
    if (prefersReducedMotion()) {
      if (target) goToMonth(target);
      settleAt(0);
      return;
    }
    if (!target) {
      if (await slide(offset, 0)) settleAt(0);
      return;
    }
    // Which way it leaves is the same fact the arrival reads, so the two legs
    // cannot disagree - the finger's own direction would, once the rubber band
    // at the end of the range has flattened it.
    const away =
      shown !== undefined && target.getTime() > shown
        ? -offscreen()
        : offscreen();
    if (!(await slide(offset, away))) return;
    // Flushed, so the arrival is positioned in this task rather than after a
    // tick in which the grid sits parked off the edge.
    flushSync(() => goToMonth(target));
  };

  return (
    <table
      {...props}
      ref={tableRef}
      // `pan-y`, not `none`: sideways movement is ours and vertical is still the
      // page scrolling past, which also abandons the gesture via `pointercancel`.
      className={cn("touch-pan-y", className)}
      onPointerDown={(event) => {
        dragging.current = false;
        if (event.pointerType === "mouse" || gesture.current) return;
        // A turn already in flight owns the transform. Let it finish rather than
        // race it - cancelling a leg abandons the month change with it.
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
        // the grid goes back where it was. The click stays swallowed either way,
        // since that finger was never picking a day.
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
        gesture.current = null;
        if (!start || !dragging.current) return;
        void release(undefined, resist(event.clientX - start.x));
      }}
      onClickCapture={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        event.stopPropagation();
      }}
    />
  );
}

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      // Puts the two arrows inside the month, flanking the caption, instead of
      // in a `<nav>` above it. See `month` for why they are laid out in flow.
      navLayout="around"
      className={cn("overflow-hidden p-3", className)}
      classNames={{
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
        weekday:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
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
        ...classNames,
      }}
      components={{
        MonthGrid: SwipeableMonthGrid,
        Chevron: ({ orientation, className: chevronClassName }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("h-4 w-4", chevronClassName)} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
