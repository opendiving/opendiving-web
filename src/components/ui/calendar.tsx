"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, useDayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// A day cell is 36px wide, so this clears the slop around a tap without asking
// for most of a month's width.
const SWIPE_THRESHOLD_PX = 48;

/**
 * The day grid, with a horizontal drag paging it a month at a time.
 *
 * Touch and pen only, since a mouse dragged across a grid means selecting.
 * Declared at module scope because `components` is read by identity - one
 * written inside `Calendar` would be a fresh type on every render, remounting
 * the grid and dropping focus out of whichever day held it.
 */
function SwipeableMonthGrid({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  const { goToMonth, nextMonth, previousMonth } = useDayPicker();
  const gesture = React.useRef<{
    id: number;
    x: number;
    y: number;
  } | null>(null);

  // A qualifying drag still ends over a day cell, and the browser fires a click
  // there as the finger lifts - so without this the page turn would also pick
  // whatever day happened to be under it.
  const swiped = React.useRef(false);

  return (
    <table
      {...props}
      // `pan-y`, not `none`: sideways movement is ours and vertical is still the
      // page scrolling past, which also abandons the gesture via `pointercancel`.
      className={cn("touch-pan-y", className)}
      onPointerDown={(event) => {
        swiped.current = false;
        if (event.pointerType === "mouse" || gesture.current) return;
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId || swiped.current) return;
        const dx = event.clientX - start.x;
        if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
        if (Math.abs(dx) <= Math.abs(event.clientY - start.y)) return;
        swiped.current = true;
        // Captured only now, never on the way down: the lift then arrives here
        // even if the finger has left the grid, while a tap - which never gets
        // this far - keeps the click on its day. Capturing on pointerdown would
        // retarget every tap's click to the table and no day could be picked.
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        gesture.current = null;
        if (!swiped.current) return;
        // Dragged back under the threshold before lifting: no page turn, but the
        // click stays swallowed - that finger was never picking a day.
        const dx = event.clientX - start.x;
        if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
        // Either is `undefined` at the far end of `startMonth`/`endMonth`.
        const target = dx < 0 ? nextMonth : previousMonth;
        if (target) goToMonth(target);
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
      onClickCapture={(event) => {
        if (!swiped.current) return;
        swiped.current = false;
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
      className={cn("p-3", className)}
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
