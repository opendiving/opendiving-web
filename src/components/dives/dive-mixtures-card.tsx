import { Dive } from "@/lib/api/dives";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GAS_BADGE_CLASS,
  GAS_ROLE_LABELS,
  TANK_USAGE_LABELS,
  diveModWarning,
  gasName,
  isNameableMix,
  isSingleGasParallelSet,
  mod,
  ppO2Limit,
} from "@/lib/dive-mixtures";
import { AlertTriangle, Wind } from "lucide-react";
import { useUnits } from "@/hooks/useUnits";
import { formatDepth, formatPressure } from "@/lib/units";

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
  const units = useUnits();

  if (!dive.mixtures || dive.mixtures.length === 0) return null;

  // One warning for the dive, not one per cylinder - see `diveModWarning` for why a
  // multi-cylinder dive usually cannot blame any single mix, and for the parallel
  // single-gas set that is the exception. Spelled out under the table
  // rather than hidden in a `title`, which would put a safety note behind a hover and
  // out of reach on touch entirely.
  const warning = diveModWarning(dive.mixtures, dive.max_depth, units);

  // The amber MOD cell is only meaningful when the warning is actually about that
  // row's gas. That is the single-cylinder case, and now also a parallel set holding
  // one gas: `diveModWarning` judges that as the single mix it is, every row holds
  // that mix, so marking every row points at exactly what the sentence is about.
  // With any other multi-cylinder dive the sentence is about the dive, and marking a
  // row would be pointing at the wrong thing.
  const attributable =
    warning !== null &&
    (dive.mixtures.length === 1 || isSingleGasParallelSet(dive.mixtures));

  // Helium is the exception among the fractions: air and nitrox record a flat 0, and
  // a column of zeroes down every recreational dive is width spent saying nothing.
  // Dropped only when no cylinder has any, so a trimix dive still shows all of them -
  // including the 0 of an air cylinder carried alongside, which is a real contrast.
  // `> 0` rather than `!== 0` so a NaN fraction can't summon the column. Deliberately
  // no null guard: `DiveMixture.helium` is non-null and the cell below prints it
  // unguarded, so a check here would be defending against a value the row it controls
  // would render as a bare "%" anyway. The two lines agree or neither is honest.
  const showHelium = dive.mixtures.some((mixture) => mixture.helium > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Wind className="h-5 w-5" />
          Gas Mixtures
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* No `overflow-x-auto` wrapper here: shadcn's `Table` already renders
            itself inside a `relative w-full overflow-auto` div, and that inner one
            is what actually scrolls. The outer copy this card used to carry never
            scrolled - and it made the table look like it fitted when measured,
            since its own `scrollWidth` equalled its `clientWidth`.

            `tabular-nums` because all but the gas column hold numbers read down
            rather than across, and proportional digits leave them visibly ragged. */}
        <Table className="tabular-nums">
          {/* The card title names this table on screen but not to a screen reader,
              which announces the `table` element itself with no name at all. */}
          <TableCaption className="sr-only">
            Gas mixtures, one row per cylinder
          </TableCaption>
          <TableHeader>
            <TableRow>
              {/* Position, not a name - cylinders have none. It is the column the
                  consumption card below joins to, which numbers its own rows the
                  same way and heads them the same character.

                  `#` is punctuation to a screen reader, which reads it out or skips
                  it and either way leaves the column unnamed, so the word it stands
                  in for is spelled out for one. Both tables do this identically. */}
              <TableHead>
                <span aria-hidden>#</span>
                <span className="sr-only">Tank</span>
              </TableHead>
              {/* A column of its own rather than a badge pinned to the number,
                  and the consumption table below now matches it. The pair reads
                  as two facts - which cylinder, and what was in it - so a column
                  each keeps the badges in one vertical line instead of starting
                  wherever the number ended. It costs ~26 px against sharing the
                  cell, which the tighter cell padding more than covers. */}
              <TableHead>Gas</TableHead>
              <TableHead>Volume</TableHead>
              {/* "Start"/"End" rather than "Start Pressure"/"End Pressure": every
                  cell under them already carries the bar unit, and the two long
                  headers were the widest columns in the table by some way. */}
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>O₂</TableHead>
              {showHelium && <TableHead>He</TableHead>}
              {/* Bare, with the limit stated per row instead. The header could
                  only carry it on a dive where every cylinder shares one, so it
                  was a qualifier that appeared and vanished depending on the dive
                  - and the two spellings it alternated between made the same
                  column look like two different columns. */}
              <TableHead>MOD</TableHead>
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
                // as two values. The table scrolls instead, inside the wrapper
                // shadcn's `Table` already provides.
                // Set once here rather than on seven cells, since `white-space`
                // inherits. The headers stay wrappable - they are the only slack
                // left if a column ever gets long again.
                <TableRow
                  key={mixture.id ?? index}
                  className="whitespace-nowrap"
                >
                  <TableCell className="text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    {/* Role sits beside the gas rather than in a column of its own:
                        most cylinders have none recorded, so a column would be
                        mostly dashes, and the two answer one question together -
                        "EAN50, the deco bottle". `outline` rather than `secondary`
                        keeps the gas name the louder of the pair. */}
                    {/* A `div`, not a `span`: `Badge` renders a `div`, and flow
                        content inside a phrasing element is invalid markup. The
                        cell is a `td`, so a block-level wrapper is fine here. */}
                    <div className="flex items-center gap-1.5">
                      {name ? (
                        <Badge variant="secondary" className={GAS_BADGE_CLASS}>
                          {name}
                        </Badge>
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
                      {mixture.usage && (
                        // Beside the role badge rather than in the Volume cell,
                        // which was the sanctioned fallback if the width had not
                        // held. It does: see DECISIONS.md for the number. The Gas
                        // cell is where the badges already line up down the
                        // column, and a diver reading "EAN32, the bottom gas,
                        // breathed in parallel" is reading one sentence.
                        //
                        // Same wire-value fallback as the role badge above and
                        // for the same reason: `TANK_USAGE_LABELS` mirrors the
                        // API's `TankUsage` by hand, so a value added there
                        // before this map catches up renders as itself rather
                        // than as an empty bordered badge.
                        <Badge variant="outline">
                          {TANK_USAGE_LABELS[mixture.usage] ?? mixture.usage}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{mixture.volume} L</TableCell>
                  {/* Muted dashes throughout, as the consumption card below already
                      writes its own: an absence at full contrast reads as a value.
                      The class goes on the cell rather than round a `-` in a span,
                      which is how that card spells the same thing. */}
                  <TableCell
                    className={
                      mixture.start_pressure == null
                        ? "text-muted-foreground"
                        : undefined
                    }
                  >
                    {mixture.start_pressure != null
                      ? formatPressure(mixture.start_pressure, units)
                      : "-"}
                  </TableCell>
                  <TableCell
                    className={
                      mixture.end_pressure == null
                        ? "text-muted-foreground"
                        : undefined
                    }
                  >
                    {mixture.end_pressure != null
                      ? formatPressure(mixture.end_pressure, units)
                      : "-"}
                  </TableCell>
                  {/* Deliberately unrounded, matching the API's 2-decimal precision -
                      see DECISIONS.md. The gas badge is the rounded shorthand. */}
                  <TableCell>{mixture.oxygen}%</TableCell>
                  {showHelium && <TableCell>{mixture.helium}%</TableCell>}
                  <TableCell
                    className={
                      workingMod == null ? "text-muted-foreground" : undefined
                    }
                  >
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
                        <span>
                          {formatDepth(workingMod, units, { decimals: 1 })}
                        </span>
                        {/* `@ 1.4`, not `@ ppO₂ 1.4`: "@" in a MOD column is not
                            ambiguous, and the long form cost 36 px on every row
                            of a table that has none to spare. Muted, and muted
                            even inside the warning colour above, because the depth
                            is the figure and this is the condition it holds under -
                            a limit at the same weight as the number competes with
                            it down the column.

                            The leading space is load-bearing in the ordinary case,
                            where this span is inline and nothing else separates the
                            two, and it is written into the string rather than left
                            as JSX text so that a reflow can't quietly drop it. In
                            the warning case the flex gap separates them and the
                            space is trimmed. */}
                        <span className="text-muted-foreground">{` @ ${limit}`}</span>
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
