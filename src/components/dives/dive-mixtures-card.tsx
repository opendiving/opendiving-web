import { Dive } from "@/lib/api/dives";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GAS_ROLE_LABELS,
  diveModWarning,
  gasName,
  isNameableMix,
  mod,
  ppO2Limit,
  sharedPpO2Limit,
} from "@/lib/dive-mixtures";
import { AlertTriangle, Wind } from "lucide-react";

interface DiveMixturesCardProps {
  dive: Dive;
}

/**
 * The dive's gas mixtures, one row per cylinder. Renders nothing when the dive has none,
 * which is the common case for a dive logged by hand.
 *
 * Sits between the depth figures and the gas-consumption card on the detail page: the
 * pressures here are the inputs that card's RMV/SAC are derived from.
 *
 * Each row carries its gas's name, role and maximum operating depth alongside the
 * recorded fractions, and says so when the dive went past that depth. The name and the
 * MOD are derived rather than stored, so they are computed here from
 * `lib/dive-mixtures.ts` rather than asked of the API - see that module's header for
 * why the maths lives client-side.
 */
export function DiveMixturesCard({ dive }: DiveMixturesCardProps) {
  if (!dive.mixtures || dive.mixtures.length === 0) return null;

  // One warning for the dive, not one per cylinder - see `diveModWarning` for why a
  // multi-cylinder dive cannot blame any single mix. Spelled out under the table
  // rather than hidden in a `title`, which would put a safety note behind a hover and
  // out of reach on touch entirely.
  const warning = diveModWarning(dive.mixtures, dive.max_depth);

  // The amber MOD cell is only meaningful when the warning is actually about that
  // row's gas, which is exactly the single-cylinder case. With several cylinders the
  // sentence is about the dive, so marking a row would be pointing at the wrong thing.
  const attributable = warning !== null && dive.mixtures.length === 1;

  // Where every cylinder was planned to the same ppO₂ - which is every recreational
  // dive, and every dive imported before the limit was recorded - the qualifier
  // belongs in the header rather than repeated down the column. It moves into the
  // rows only when the dive genuinely mixes limits, which is what a back gas at 1.4
  // and a deco bottle at 1.6 looks like.
  const shared = sharedPpO2Limit(dive.mixtures);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wind className="h-5 w-5" />
          Gas Mixtures
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Gas</TableHead>
                <TableHead>Volume</TableHead>
                {/* "Start"/"End" rather than "Start Pressure"/"End Pressure": every
                    cell under them already carries the bar unit, and the two long
                    headers were the widest columns in the table by some way. */}
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>O₂</TableHead>
                <TableHead>He</TableHead>
                {/* Qualified wherever it can be, because the warning under the table
                    cites the 1.6 ceiling while this column is usually the 1.4 working
                    limit - a bare "MOD" left two different numbers on screen for the
                    same gas with nothing saying why. Matches the form hint's phrasing. */}
                <TableHead>
                  {shared !== null ? `MOD @ ppO₂ ${shared}` : "MOD"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dive.mixtures.map((mixture, index) => {
                const name = gasName(mixture.oxygen, mixture.helium);
                // A MOD only means something for a mix that could exist: the oxygen
                // fraction of an impossible one is not a gas property to derive from.
                // Same rule `gasHintParts` applies to the form hint - shared through
                // `isNameableMix` so the two cannot drift apart.
                const limit = ppO2Limit(mixture);
                const workingMod = isNameableMix(mixture.oxygen, mixture.helium)
                  ? mod(mixture.oxygen, limit)
                  : null;

                return (
                  // Nothing in a body row wraps: a broken "212 bar" or "56.7 m" reads
                  // as two values, and a cylinder name split across lines ("Back /
                  // Gas") just made every row a line taller. The table scrolls
                  // instead, inside the wrapper shadcn's `Table` already provides.
                  // Set once here rather than on seven cells, since `white-space`
                  // inherits. The headers stay wrappable - they are the only slack
                  // left if a column ever gets long again.
                  <TableRow
                    key={mixture.id ?? index}
                    className="whitespace-nowrap"
                  >
                    <TableCell className="font-medium">
                      {mixture.name || `Tank ${index + 1}`}
                    </TableCell>
                    <TableCell>
                      {/* Role sits beside the gas rather than in a column of its own:
                          most cylinders have none recorded, so a ninth column would be
                          mostly dashes, and the two answer one question together -
                          "EAN50, the deco bottle". `outline` rather than `secondary`
                          keeps the gas name the louder of the pair. */}
                      {/* A `div`, not a `span`: `Badge` renders a `div`, and flow
                          content inside a phrasing element is invalid markup. The
                          cell is a `td`, so a block-level wrapper is fine here. */}
                      <div className="flex items-center gap-1.5">
                        {name ? (
                          <Badge variant="secondary">{name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                        {mixture.role && (
                          // Falls back to the wire value because `GAS_ROLE_LABELS`
                          // is kept in step with the API's `GasRole` by hand: a
                          // role added there before this map catches up would
                          // otherwise render as an empty bordered badge beside the
                          // gas name. "diluent" unlabelled beats nothing at all.
                          <Badge variant="outline">
                            {GAS_ROLE_LABELS[mixture.role] ?? mixture.role}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{mixture.volume} L</TableCell>
                    <TableCell>
                      {mixture.start_pressure != null
                        ? `${mixture.start_pressure} bar`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {mixture.end_pressure != null
                        ? `${mixture.end_pressure} bar`
                        : "-"}
                    </TableCell>
                    {/* Deliberately unrounded, matching the API's 2-decimal precision -
                        see DECISIONS.md. The `Gas` badge is the rounded shorthand. */}
                    <TableCell>{mixture.oxygen}%</TableCell>
                    <TableCell>{mixture.helium}%</TableCell>
                    <TableCell>
                      {workingMod != null ? (
                        <span
                          className={
                            attributable
                              ? "flex items-center gap-1.5 text-warning"
                              : undefined
                          }
                        >
                          {attributable && (
                            <AlertTriangle
                              className="h-3.5 w-3.5 shrink-0"
                              aria-hidden
                            />
                          )}
                          {workingMod.toFixed(1)} m
                          {/* `@ 1.6`, not `@ ppO₂ 1.6`, and only in the mixed case.
                              The unit is spelled out in the header wherever the
                              header can carry it; here it would be repeated on
                              every row of an eight-column table that is already
                              wider than its card, and "@" in a MOD column is not
                              ambiguous. */}
                          {shared === null && ` @ ${limit}`}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {warning && (
          <p className="mt-4 flex items-start gap-2 text-sm text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <span>{warning}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
