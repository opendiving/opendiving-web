import type { ReactNode } from "react";
import { Dive, DiveMixture } from "@/lib/api/dives";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GAS_ROLE_LABELS,
  TANK_USAGE_LABELS,
  diveModWarning,
  gasName,
  isNameableMix,
  isSingleGasParallelSet,
  mod,
  ppO2Limit,
  tankGas,
} from "@/lib/dive-mixtures";
import { AlertTriangle } from "lucide-react";
import {
  LeftTankIcon,
  TankIcon,
  TwinTankIcon,
} from "@/components/icons/tank-icon";
import { FactsLine } from "@/components/ui/icon-fact";
import { isTwinSetVolume } from "@/components/dives/volume-combobox";
import { useUnits } from "@/hooks/useUnits";
import { cn } from "@/lib/utils";
import {
  formatComparableDepth,
  formatPressure,
  type UnitSystem,
} from "@/lib/units";

interface DiveMixturesCardProps {
  dive: Dive;
}

// A figure a cylinder may not record, muted where it records none: an absence at
// full contrast reads as a value.
function Figure({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs">{label}</dt>
      <dd
        className={cn(
          "whitespace-nowrap text-base font-bold",
          value == null && "text-muted-foreground",
        )}
      >
        {value ?? "-"}
      </dd>
    </div>
  );
}

interface TankCardProps {
  mixture: DiveMixture;
  // Its 1-based position, which the consumption card below numbers its rows by.
  number: number;
  units: UnitSystem;
  showHelium: boolean;
  // The dive's MOD warning is about this cylinder's gas, so its MOD is marked.
  warned: boolean;
  // The first cylinder flagged parallel, drawn as the left of the pair.
  left: boolean;
}

// One cylinder, drawn as a dive's card is - its name, a line under it and its
// figures - without the backdrop, and with its icon where the dive's hero puts the
// dive's own: beside the name and the line, as tall as the two.
function TankCard({
  mixture,
  number,
  units,
  showHelium,
  warned,
  left,
}: TankCardProps) {
  const name = gasName(mixture.oxygen, mixture.helium);
  // A MOD only means something for a mix that could exist - the rule `gasHintParts`
  // applies to the form hint, shared through `isNameableMix`.
  const limit = ppO2Limit(mixture);
  const workingMod = isNameableMix(mixture.oxygen, mixture.helium)
    ? mod(mixture.oxygen, limit)
    : null;

  // The fractions unrounded, matching the API's two decimals: the name is the
  // rounded shorthand. Litres in both systems: a cylinder's litres are its water
  // capacity, and its cubic feet would be gas at a rated pressure it does not record.
  const facts: ReactNode[] = [];
  if (mixture.volume != null) facts.push(`${mixture.volume} L`);
  if (mixture.oxygen != null) facts.push(`O₂ ${mixture.oxygen}%`);
  if (showHelium && mixture.helium != null) facts.push(`He ${mixture.helium}%`);
  // The wire value where `TANK_USAGE_LABELS` has not caught up with the API's
  // `TankUsage`, as the role badge falls back.
  if (mixture.usage) {
    facts.push(TANK_USAGE_LABELS[mixture.usage] ?? mixture.usage);
  }
  // A twin set is recorded as one cylinder holding a twin-set preset's litres.
  const Icon = left
    ? LeftTankIcon
    : isTwinSetVolume(mixture.volume)
      ? TwinTankIcon
      : TankIcon;

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <Icon
          gas={tankGas(mixture.oxygen, mixture.helium)}
          aria-hidden
          className="size-10 shrink-0 stroke-[1.5]"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-medium">
              #{number}{" "}
              {name ?? (
                <span className="text-muted-foreground">Gas not recorded</span>
              )}
            </h3>
            {mixture.role && (
              // The wire value where `GAS_ROLE_LABELS`, kept in step with the API's
              // `GasRole` by hand, has not caught up yet.
              <Badge variant="teal">
                {GAS_ROLE_LABELS[mixture.role] ?? mixture.role}
              </Badge>
            )}
          </div>
          {facts.length > 0 && (
            <p className="text-xs">
              <FactsLine facts={facts} />
            </p>
          )}
        </div>
      </div>
      {/* Columns as wide as "211.44 bar" and no wider, so a card spanning the
          slot keeps its figures together, as a dive card's are. */}
      <dl className="mt-3 grid grid-cols-[repeat(3,minmax(0,6.5rem))] gap-2">
        <Figure
          label="Start"
          value={
            mixture.start_pressure != null
              ? formatPressure(mixture.start_pressure, units)
              : null
          }
        />
        <Figure
          label="End"
          value={
            mixture.end_pressure != null
              ? formatPressure(mixture.end_pressure, units)
              : null
          }
        />
        {/* The limit beside the label rather than the depth, so the depth is the
            figure: muted, as the condition the depth holds under. */}
        <Figure
          label={
            <>
              MOD
              {workingMod != null && (
                <span className="text-muted-foreground">{` @ ${limit}`}</span>
              )}
            </>
          }
          value={
            workingMod != null ? (
              <span
                className={cn(warned && "flex items-center gap-1 text-warning")}
              >
                {warned && (
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                )}
                {/* Rounded down and at the scale the warning under the cards
                    uses, so where the two differ for one gas it is the ppO₂
                    each was computed at - see `formatComparableDepth`. */}
                {formatComparableDepth(workingMod, units, { floor: true })}
              </span>
            ) : null
          }
        />
      </dl>
    </li>
  );
}

/**
 * The dive's tanks, one card per cylinder. Renders nothing when the dive has none,
 * which is the common case for a dive logged by hand.
 *
 * Sits between the depth figures and the gas-consumption card on the detail page: the
 * pressures here are the inputs that card's RMV/SAC are derived from.
 *
 * Each card carries its gas's name, role and maximum operating depth alongside the
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
  // single-gas set that is the exception. Spelled out under the cards
  // rather than hidden in a `title`, which would put a safety note behind a hover and
  // out of reach on touch entirely.
  const warning = diveModWarning(dive.mixtures, dive.max_depth, units);

  // The amber MOD is only meaningful when the warning is actually about that
  // cylinder's gas. That is the single-cylinder case, and a parallel set holding one
  // gas: `diveModWarning` judges that as the single mix it is, every cylinder holds
  // that mix, so marking every one points at exactly what the sentence is about.
  // With any other multi-cylinder dive the sentence is about the dive, and marking a
  // cylinder would be pointing at the wrong thing.
  const attributable =
    warning !== null &&
    (dive.mixtures.length === 1 || isSingleGasParallelSet(dive.mixtures));

  // Helium is the exception among the fractions: air and nitrox record a flat 0, so
  // it is stated only on a dive where some cylinder has any - and then on every card,
  // since the 0 of an air cylinder carried alongside a trimix is a real contrast.
  // `> 0` rather than `!== 0` so a NaN fraction can't summon it.
  const showHelium = dive.mixtures.some(
    (mixture) => mixture.helium != null && mixture.helium > 0,
  );

  const firstParallel = dive.mixtures.findIndex(
    (mixture) => mixture.usage === "parallel",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <TwinTankIcon className="h-5 w-5" />
          Tanks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Columns from the card's own width rather than the window's: the slot
            this card sits in is narrowest at `lg`, and 19rem is what three
            figures as wide as "211.44 bar" take. */}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-3">
          {dive.mixtures.map((mixture, index) => (
            <TankCard
              key={mixture.id ?? index}
              mixture={mixture}
              number={index + 1}
              units={units}
              showHelium={showHelium}
              warned={attributable}
              left={index === firstParallel}
            />
          ))}
        </ul>

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
