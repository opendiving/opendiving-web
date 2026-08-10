"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { GasUseChart } from "@/components/dives/gas-use-chart";
import { diveStatsAPI, DiveGasUsePoint } from "@/lib/api/dive-stats";
import {
  GAS_USE_SCOPES,
  GAS_USE_SCOPE_LABELS,
  type GasUseScope,
  RMV_TREND_WINDOW,
  availablePeriods,
  periodLabel,
  periodRange,
  stepPeriod,
} from "@/lib/dive-gas";
import { diveWallClockTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";

// The dashboard's air-consumption trend.
//
// Unlike `ServiceDueCard`, this renders even with nothing to plot: an empty
// service list means nothing needs attention, which is genuinely nothing to say,
// whereas an empty series here means the dives are missing pressures or an
// average depth - something the diver can act on, and won't discover otherwise.
// `GasUseChart` owns that message, since it's the component that knows two
// points are the minimum.
export function GasUseCard() {
  const [points, setPoints] = useState<DiveGasUsePoint[] | null>(null);
  const [scope, setScope] = useState<GasUseScope>("year");
  // A timestamp inside the visible period, and always one of the dives' own
  // times rather than an arbitrary date - which is what makes switching scope
  // land somewhere useful (the month *containing* the dive you were looking at)
  // instead of on an empty period.
  const [anchor, setAnchor] = useState<number | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setPoints(await diveStatsAPI.getGasUseHistory());
      } catch (error) {
        console.error("Failed to fetch gas use history:", error);
        // An empty series renders the same prompt as "no qualifying dives",
        // which is a better failure than a card stuck spinning forever.
        setPoints([]);
      }
    };

    fetchHistory();
  }, []);

  const times = useMemo(
    () => (points ?? []).map((point) => diveWallClockTime(point.start_time)),
    [points],
  );

  // Opens on the most recent dive, not the oldest: the interesting question is
  // how you're diving now, and the older periods are one click back.
  const activeAnchor = anchor ?? times[times.length - 1] ?? 0;

  const steppable = scope === "all" ? null : scope;
  const previous = steppable
    ? stepPeriod(activeAnchor, steppable, -1, times)
    : null;
  const next = steppable ? stepPeriod(activeAnchor, steppable, 1, times) : null;
  const periods = useMemo(
    () => (steppable ? availablePeriods(times, steppable) : []),
    [times, steppable],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Air Consumption
            </CardTitle>
            <CardDescription>
              Surface-equivalent consumption per dive, with a {RMV_TREND_WINDOW}
              -dive trend. Lower is better.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {scope !== "all" && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={previous === null}
                  onClick={() => setAnchor(previous)}
                  aria-label="Previous period with dives"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {/* The label is also the jump-to control - stepping one period
                    at a time is fine for "the trip before this one", but useless
                    for reaching a specific year several seasons back.

                    Its value is the *period's* start, never `activeAnchor`
                    itself: the anchor is whichever dive you happened to land on,
                    which usually matches no option, and a `Select` whose value
                    has no registered item renders an empty trigger. Fixed width
                    so the chart doesn't shift sideways between "May 2026" and
                    "September 2026". */}
                <Select
                  value={String(periodRange(activeAnchor, scope).start)}
                  onValueChange={(value) => {
                    const picked = periods.find(
                      (period) => String(period.start) === value,
                    );
                    if (picked) setAnchor(picked.anchor);
                  }}
                >
                  <SelectTrigger className="h-8 w-40 px-2 text-sm font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((period) => (
                      <SelectItem
                        key={period.start}
                        value={String(period.start)}
                      >
                        {periodLabel(period.start, scope)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={next === null}
                  onClick={() => setAnchor(next)}
                  aria-label="Next period with dives"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* A segmented control built from plain buttons - the app has no
                tabs/toggle-group primitive, and three buttons in a bordered row
                is the whole of it. */}
            <div
              className="flex items-center rounded-md border p-0.5"
              role="group"
              aria-label="Time range"
            >
              {GAS_USE_SCOPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setScope(option)}
                  aria-pressed={scope === option}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    scope === option
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {GAS_USE_SCOPE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {points === null ? (
          <SectionSpinner />
        ) : (
          <GasUseChart points={points} scope={scope} anchor={activeAnchor} />
        )}
      </CardContent>
    </Card>
  );
}
