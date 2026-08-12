import { Dive } from "@/lib/api/dives";
import { gasUseUnavailableReason } from "@/lib/dive-gas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

interface DiveGasConsumptionCardProps {
  dive: Dive;
}

/**
 * Gas consumption for the dive, derived by the API from duration, average depth and
 * cylinder pressures.
 *
 * Unlike the other optional cards on the detail page, this one still renders when the
 * figure couldn't be derived — and says why. The others are absent because the diver
 * didn't record something they'd know they hadn't; this one can be absent despite the
 * pressures being filled in (a missing average depth, a second tank), where silence would
 * read as a bug.
 */
export function DiveGasConsumptionCard({ dive }: DiveGasConsumptionCardProps) {
  // Null both when the figure is present and when the dive was never a candidate for
  // one, so `dive.gas_use || reason` is the whole "is there anything to show" test.
  const reason = gasUseUnavailableReason(dive);
  if (!dive.gas_use && !reason) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Gas Consumption
        </CardTitle>
      </CardHeader>
      <CardContent>
        {dive.gas_use ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* The two rates named for what they each are, rather than the old
                  "SAC / RMV" over the litres and "Pressure Rate" over the bar - which
                  had the hedged label on the one figure that is unambiguous. RMV is the
                  volume you breathe and is the same number whatever cylinder you were
                  on; SAC is how fast *this* cylinder emptied, and is the field the API
                  already calls `sac_bar_per_min`. Units stay with the values, never
                  doubled in the label. */}
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  RMV
                </div>
                <div className="text-2xl font-bold">
                  {dive.gas_use.rmv} L/min
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  SAC
                </div>
                <div className="text-2xl font-bold">
                  {dive.gas_use.sac_bar_per_min} bar/min
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Gas Used
                </div>
                <div className="text-2xl font-bold">
                  {dive.gas_use.gas_used} L
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              What you&apos;d have breathed doing the same dive at the surface,
              from an average depth of {dive.avg_depth}m. Assumes salt water at
              sea level. Lower is better.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{reason}</p>
        )}
      </CardContent>
    </Card>
  );
}
