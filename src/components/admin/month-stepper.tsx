"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import {
  type StatsMonth,
  monthLabel,
  stepMonth,
} from "@/components/admin/daily-stats";

interface MonthStepperProps {
  month: StatsMonth;
  // The UTC month now; nothing has happened after it, so the stepper stops there.
  thisMonth: StatsMonth;
  onStep: (month: StatsMonth) => void;
}

/** The previous and next month buttons either side of the month an admin screen shows. */
export function MonthStepper({ month, thisMonth, onStep }: MonthStepperProps) {
  return (
    <div className="mb-4 flex items-center gap-1">
      <IconTooltip label="Previous month">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => onStep(stepMonth(month, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <span className="w-40 text-center text-sm font-medium" aria-live="polite">
        {monthLabel(month)}
      </span>
      <IconTooltip label="Next month">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          disabled={month >= thisMonth}
          onClick={() => onStep(stepMonth(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </IconTooltip>
    </div>
  );
}
