"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { CARD_TITLE_ACTION } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { NativeSelect } from "@/components/ui/native-select";
import {
  CHART_SCOPES,
  CHART_SCOPE_LABELS,
  periodLabel,
  periodRange,
} from "@/lib/chart-period";
import type { ChartPeriodState } from "@/hooks/useChartPeriodView";
import { cn } from "@/lib/utils";

export interface ChartPeriodControlsProps {
  // The card's name as every control's accessible name leads with it -
  // "Dive activity", "Gas consumption".
  name: string;
  view: ChartPeriodState<unknown>;
}

// A Home trend card's period stepper and All/Year/Month toggle. Two siblings
// rather than one box, laid out by the `CARD_TITLE_ROW` they sit in after the
// card's title, which is an `@container`: below its `2xl` the stepper wraps onto
// a line of its own.
//
// Every control here names its own card, because the two cards draw the same row
// and `Card` is a plain `div` - so nothing scopes them to each other. Read in
// place the heading is all the context you need, but a screen reader's controls
// list is flat names and nothing else, and four arrows reading "Previous period
// with dives" in it are four coin flips. The card name leads rather than trails
// so the list groups by chart when it is scanned or sorted. Same ambiguity
// `screenshots.mjs` hit from the automation side, where the fix was to scope by
// the card's own heading, which is exactly the context a controls list drops.
export function ChartPeriodControls({ name, view }: ChartPeriodControlsProps) {
  const { scope, anchor, setAnchor, setScope, previous, next, periods } = view;

  return (
    <>
      {/* Only the bounded scopes have a period to navigate. "All" already shows
          everything there is, so arrows on it would have nowhere to go. */}
      {scope !== "all" && (
        <div
          className={cn(
            "flex items-center gap-1 @max-2xl:order-last @max-2xl:basis-full @max-2xl:justify-center",
            CARD_TITLE_ACTION,
          )}
        >
          <IconTooltip label={`${name}: previous period with dives`}>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              disabled={previous === null}
              onClick={() => setAnchor(previous)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </IconTooltip>
          {/* The label is also the jump-to control - stepping one period at a
              time is fine for "the trip before this one", and useless for
              reaching one several seasons back.

              Its value is the *period's* start, never the anchor itself: the
              anchor is whichever dive or day you happened to land on, which
              usually matches no option, and a `<select>` whose value matches no
              option shows the first one instead. Fixed width so the chart
              doesn't shift sideways between "May 2026" and "September 2026",
              and wider once it wraps onto a line of its own. */}
          <div className="w-40 shrink-0 @max-2xl:w-56">
            <NativeSelect
              aria-label={`${name}: period`}
              className="h-9 pl-2 font-medium"
              value={String(periodRange(anchor, scope).start)}
              onChange={(event) => {
                const picked = periods.find(
                  (period) => String(period.start) === event.target.value,
                );
                if (picked) setAnchor(picked.anchor);
              }}
            >
              {periods.map((period) => (
                <option key={period.start} value={String(period.start)}>
                  {periodLabel(period.start, scope, "long")}
                </option>
              ))}
            </NativeSelect>
          </div>
          <IconTooltip label={`${name}: next period with dives`}>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              disabled={next === null}
              onClick={() => setAnchor(next)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </IconTooltip>
        </div>
      )}

      {/* A segmented control built from plain buttons - the app has no
          tabs/toggle-group primitive, and three buttons in a bordered row is the
          whole of it. */}
      <div
        className={cn(
          "flex h-9 items-stretch rounded-md border p-1 touch:h-11",
          CARD_TITLE_ACTION,
        )}
        role="group"
        aria-label={`${name}: time range`}
      >
        {CHART_SCOPES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setScope(option)}
            aria-pressed={scope === option}
            className={cn(
              "relative rounded px-2.5 text-xs font-medium transition-colors touch:min-w-11 touch:tap-target",
              scope === option
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {CHART_SCOPE_LABELS[option]}
          </button>
        ))}
      </div>
    </>
  );
}
