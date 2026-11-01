import type { ReactNode } from "react";
import Link from "next/link";
import { Dive, DiveMixture } from "@/lib/api/dives";
import { gearItemLabel } from "@/lib/api/gear";
import { labelOrFallback } from "@/lib/api/labels";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { Badge } from "@/components/ui/badge";
import { CARD_SECTION_CONTENT, Card, CardContent } from "@/components/ui/card";
import {
  GAS_ROLE_LABELS,
  TANK_USAGE_LABELS,
  diveModWarning,
  gasName,
  isNameableMix,
  isSingleGasParallelSet,
  mod,
  ppO2Limit,
} from "@/lib/dive-mixtures";
import { AlertTriangle } from "lucide-react";
import { MixtureTankIcon } from "@/components/dives/mixture-tank-icon";
import { CardFigure, CardFigures } from "@/components/dives/card-figure";
import { DiveCardHeader } from "@/components/dives/dive-card-header";
import { FactsLine } from "@/components/ui/icon-fact";
import { useUnits } from "@/hooks/useUnits";
import { cn } from "@/lib/utils";
import {
  formatComparableDepth,
  formatPressure,
  type UnitSelection,
} from "@/lib/units";

interface DiveMixturesCardProps {
  dive: Dive;
  /** Opens the Tanks edit dialog; absent, the card has no edit control. */
  onEdit?: () => void;
}

interface TankCardProps {
  mixture: DiveMixture;
  // Its 1-based position, which the consumption card below numbers its rows by.
  number: number;
  units: UnitSelection;
  showHelium: boolean;
  // The dive's MOD warning is about this cylinder's gas, so its MOD is marked.
  warned: boolean;
  // The first cylinder flagged parallel, drawn as the left of the pair.
  left: boolean;
  // A path with the way back to this dive attached - see `useWithReturnTo`.
  withReturnTo: (href: string) => string;
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
  withReturnTo,
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
  // The vessel leads, by name, where the tank links one of the diver's own.
  const facts: ReactNode[] = [];
  if (mixture.gear_item) {
    facts.push(
      <Link
        href={withReturnTo(`/gear/${mixture.gear_item.uuid}`)}
        className="relative hover:underline touch:tap-target"
      >
        {gearItemLabel(mixture.gear_item)}
      </Link>,
    );
  }
  if (mixture.volume != null) facts.push(`${mixture.volume} L`);
  if (mixture.oxygen != null) facts.push(`O₂ ${mixture.oxygen}%`);
  if (showHelium && mixture.helium != null) facts.push(`He ${mixture.helium}%`);
  if (mixture.usage) {
    facts.push(labelOrFallback(TANK_USAGE_LABELS, mixture.usage));
  }
  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <MixtureTankIcon
          volume={mixture.volume}
          oxygen={mixture.oxygen}
          helium={mixture.helium}
          left={left}
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
              // De-snaked where `GAS_ROLE_LABELS`, kept in step with the API's
              // `GasRole` by hand, has not caught up yet.
              <Badge variant="teal">
                {labelOrFallback(GAS_ROLE_LABELS, mixture.role)}
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
      <CardFigures className="mt-3">
        <CardFigure
          label="Start"
          value={
            mixture.start_pressure != null
              ? formatPressure(mixture.start_pressure, units)
              : null
          }
        />
        <CardFigure
          label="End"
          value={
            mixture.end_pressure != null
              ? formatPressure(mixture.end_pressure, units)
              : null
          }
        />
        {/* The limit beside the label rather than the depth, so the depth is the
            figure: muted, as the condition the depth holds under. */}
        <CardFigure
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
      </CardFigures>
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
export function DiveMixturesCard({ dive, onEdit }: DiveMixturesCardProps) {
  const { preferences: units } = useUnits();
  const withReturnTo = useWithReturnTo();

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
      <DiveCardHeader group="Tanks" title="Tanks" onEdit={onEdit} />
      <CardContent className={CARD_SECTION_CONTENT}>
        {/* Columns from the card's own width rather than the window's: the slot
            this card sits in is narrowest at `lg`, and 19rem holds a card's
            three figures on one line. One column never outgrows the card. */}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-3">
          {dive.mixtures.map((mixture, index) => (
            <TankCard
              key={mixture.id ?? index}
              mixture={mixture}
              number={index + 1}
              units={units}
              showHelium={showHelium}
              warned={attributable}
              left={index === firstParallel}
              withReturnTo={withReturnTo}
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
