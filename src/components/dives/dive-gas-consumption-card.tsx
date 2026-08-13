import { Dive } from "@/lib/api/dives";
import {
  gasAttributionNote,
  gasUseUnavailableReason,
  tankGasUseRows,
} from "@/lib/dive-gas";
import { GAS_ROLE_LABELS } from "@/lib/dive-mixtures";
import { formatDurationHoursMinutes } from "@/lib/date-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity } from "lucide-react";

interface DiveGasConsumptionCardProps {
  dive: Dive;
}

/**
 * Gas consumption for the dive, derived by the API from duration, depth and cylinder
 * pressures.
 *
 * Two shapes, chosen by whether the API attributed the dive per cylinder. One tank is
 * three headline figures, as it always was. Several is a table with a row per cylinder
 * and a total beneath, because the per-tank numbers *are* the answer there - a deco
 * bottle emptied at 6 m and a back gas breathed at 40 m have almost nothing to say to
 * each other, and a single averaged RMV would hide exactly the comparison a technical
 * diver opened the page for.
 *
 * Unlike the other optional cards on the detail page, this one still renders when the
 * figures couldn't be derived — and says why. The others are absent because the diver
 * didn't record something they'd know they hadn't; this one can be absent despite the
 * pressures being filled in (a missing average depth, an import that can't say which
 * tank was breathed when), where silence would read as a bug.
 */
export function DiveGasConsumptionCard({ dive }: DiveGasConsumptionCardProps) {
  // Null both when the figures are present and when the dive was never a candidate for
  // any, so `dive.gas_use || reason` is the whole "is there anything to show" test.
  const reason = gasUseUnavailableReason(dive);
  const gasUse = dive.gas_use;
  if (!gasUse && !reason) return null;

  // Empty on every single-tank dive, so this is also the switch between the two
  // layouts. Deliberately not `tanks.length > 1`: one attributed cylinder on a
  // two-cylinder dive is the commonest multi-gas shape in the corpus, and it
  // still needs the table to show the cylinder that got nothing.
  const rows = gasUse ? tankGasUseRows(dive) : [];
  const attributionNote = gasUse ? gasAttributionNote(gasUse) : null;

  // The total is only worth a row when it totals more than one thing. With a
  // single attributed cylinder it restates that row's figures verbatim and
  // dashes a SAC the row above prints - a line that adds nothing and casts
  // doubt on a number that is right there.
  const attributedCount = rows.filter((row) => row.use).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Gas Consumption
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!gasUse ? (
          <p className="text-sm text-muted-foreground">{reason}</p>
        ) : rows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tank</TableHead>
                    {/* The two inputs of the split, before the three figures
                        derived from them, so a row reads left to right as the
                        arithmetic it is: this long, this deep, therefore this
                        much. */}
                    <TableHead>Time</TableHead>
                    <TableHead>Avg Depth</TableHead>
                    <TableHead>Gas Used</TableHead>
                    <TableHead>RMV</TableHead>
                    <TableHead>SAC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    // Nothing in a body row wraps, for the reason the mixtures
                    // table gives: a broken "18.4 L/min" reads as two values.
                    <TableRow key={row.key} className="whitespace-nowrap">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {row.label}
                          {row.gas && (
                            <Badge variant="secondary">{row.gas}</Badge>
                          )}
                          {row.role && (
                            // Same hand-maintained map and same fallback as the
                            // mixtures card - a role the API has and this build
                            // hasn't renders as its wire value rather than as an
                            // empty badge.
                            <Badge variant="outline">
                              {GAS_ROLE_LABELS[row.role] ?? row.role}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      {row.use ? (
                        <>
                          <TableCell>
                            {formatTimeOnGas(row.use.seconds_on_gas)}
                          </TableCell>
                          <TableCell>{row.use.mean_depth} m</TableCell>
                          <TableCell>{row.use.gas_used} L</TableCell>
                          <TableCell className="font-medium">
                            {row.use.rmv} L/min
                          </TableCell>
                          <TableCell>
                            {row.use.sac_bar_per_min} bar/min
                          </TableCell>
                        </>
                      ) : (
                        // Spelled out rather than left as five blank cells,
                        // which reads as a rendering fault.
                        //
                        // Not "Not attributed", which names only one of the two
                        // states behind an empty `use` (see `TankGasUseRow`) and
                        // would be contradicted by the coverage note three lines
                        // below on the other. Where the cylinder records no
                        // pressures the browser can say something both certain
                        // and useful — that is the corpus's deco bottle with no
                        // transmitter, and the only unattributed row any dive
                        // here actually renders. Otherwise it says what it
                        // knows, which is that there are no figures.
                        <TableCell
                          colSpan={5}
                          className="text-muted-foreground"
                        >
                          {row.hasPressures
                            ? "No figures"
                            : "No pressures recorded"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                {/* "Which of these is the dive's RMV" is the question a table of
                    per-tank rates raises, and it deserves an answer on screen
                    rather than a mental sum - but only once there is more than
                    one rate to reconcile.

                    A `tfoot`, not a seventh body row: this summarizes the rows
                    above rather than joining them, and `TableFooter` brings the
                    separator and weight that were otherwise hand-applied. */}
                {attributedCount > 1 && (
                  <TableFooter>
                    <TotalRow gasUse={gasUse} />
                  </TableFooter>
                )}
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Each tank&apos;s figures cover the stretch of the dive it was
              breathed for, at that stretch&apos;s average depth — which is what
              makes them comparable with each other and with a single-tank dive.
              Assumes salt water at sea level. Lower is better.
            </p>
            {/* Attribution is inferred from the profile, so a dive it only
                partly covers has to say so; figures presented as the whole dive
                when they describe 38 of its 42 minutes understate every one of
                them. */}
            {attributionNote && (
              <p className="text-xs text-muted-foreground mt-2">
                {attributionNote}
              </p>
            )}
          </>
        ) : (
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
                <div className="text-2xl font-bold">{gasUse.rmv} L/min</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  SAC
                </div>
                {/* Guarded, though the API pairs a null SAC with a non-empty
                    `tanks` and so never reaches this branch today. The layout
                    switch is `rows.length > 0` while the nullability lives on
                    the wire type, so the two can decouple - and an unguarded
                    null renders as nothing, leaving a bare "bar/min" under the
                    heading rather than an obvious absence. */}
                <div className="text-2xl font-bold">
                  {gasUse.sac_bar_per_min != null
                    ? `${gasUse.sac_bar_per_min} bar/min`
                    : "-"}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Gas Used
                </div>
                <div className="text-2xl font-bold">{gasUse.gas_used} L</div>
              </div>
            </div>
            {/* Gated on the same signal as the SAC above, and it has to be:
                this sentence *names the denominator*, so on a figure derived
                per cylinder it would assert the dive's average depth produced a
                rate that was never divided by it. That is the exact claim this
                branch's own PR deleted from the dashboard chart, and it is the
                worse failure of the two here - a bare "bar/min" looks broken,
                where this looks right. Both halves of the layout now make the
                same assumption about which derivation they are describing. */}
            {gasUse.sac_bar_per_min != null && (
              <p className="text-xs text-muted-foreground mt-4">
                What you&apos;d have breathed doing the same dive at the
                surface, from an average depth of {dive.avg_depth}m. Assumes
                salt water at sea level. Lower is better.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A stretch of time on one cylinder, for the table's Time column.
 *
 * `formatDurationHoursMinutes` rounds to whole minutes, which is right for a dive and
 * wrong at the bottom of this column: a cylinder breathed for twenty seconds — two gas
 * switches close together, which nothing stops a diver making — would print `0min` beside
 * real litres and an RMV derived from that stretch, and a row reading "0 minutes, 40
 * litres" looks broken rather than brief.
 *
 * `<1min` says the same thing honestly. Deliberately not a change to the shared formatter,
 * which is also what prints the dive's own duration, where a sub-minute value is not a
 * shape worth spending a special case on.
 */
function formatTimeOnGas(seconds: number): string {
  return seconds < 30 ? "<1min" : formatDurationHoursMinutes(seconds);
}

/**
 * The dive-wide total under the per-tank rows. Rendered only where two or more cylinders
 * were attributed — see the caller for why one makes it redundant.
 *
 * Time is the attributed span rather than the dive's duration, so it adds up with the
 * column above it. Depth and SAC are dashed rather than filled: a mean depth across
 * cylinders would be a fourth kind of average on a card that already has three, and a
 * bar/min summed over an 11 L stage and a 22 L twinset is not a rate of anything - the
 * API sends `sac_bar_per_min: null` on precisely these dives for that reason, which is
 * what the dash is rendering.
 */
function TotalRow({ gasUse }: { gasUse: NonNullable<Dive["gas_use"]> }) {
  const attributed = gasUse.attributed_seconds;

  return (
    // No `font-medium` here - `TableFooter` already carries it, along with the
    // separator this row used to lack.
    <TableRow className="whitespace-nowrap">
      <TableCell>All tanks</TableCell>
      <TableCell
        className={attributed == null ? "text-muted-foreground" : undefined}
      >
        {attributed != null ? formatTimeOnGas(attributed) : "-"}
      </TableCell>
      <TableCell className="text-muted-foreground">-</TableCell>
      <TableCell>{gasUse.gas_used} L</TableCell>
      <TableCell>{gasUse.rmv} L/min</TableCell>
      <TableCell
        className={
          gasUse.sac_bar_per_min == null ? "text-muted-foreground" : undefined
        }
      >
        {gasUse.sac_bar_per_min != null
          ? `${gasUse.sac_bar_per_min} bar/min`
          : "-"}
      </TableCell>
    </TableRow>
  );
}
