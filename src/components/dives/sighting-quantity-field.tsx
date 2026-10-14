"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RepeatableRowField } from "@/components/ui/repeatable-row";
import {
  ABUNDANCES,
  ABUNDANCE_LABELS,
  ABUNDANCE_RANGES,
  abundanceOfCount,
  type SightingAbundance,
  type SightingWrite,
} from "@/lib/api/dives";
import { cn } from "@/lib/utils";

/** How many were seen: a count, a band, or - neither key present - not counted. */
export type SightingQuantity = Pick<SightingWrite, "count" | "abundance">;

// A sighting with its quantity replaced whole, so a row never carries a count and a
// band at once: the API refuses one that does. Neither is "seen, not counted", spelled
// by leaving both keys off - never with a `0` or a `1`.
export function withQuantity(
  sighting: SightingWrite,
  quantity: SightingQuantity,
): SightingWrite {
  const next = { ...sighting };
  delete next.count;
  delete next.abundance;
  return { ...next, ...quantity };
}

// What a count box takes: a positive whole number and nothing else. A keystroke that
// would leave anything else in it is refused rather than committed, so a count is never
// a `0` or a fraction waiting for the schema to object.
const COUNT_TEXT = /^[1-9]\d*$/;

interface QuickChoice {
  key: "one" | SightingAbundance;
  label: string;
  range: string;
}

const QUICK_CHOICES: QuickChoice[] = [
  { key: "one", label: "One", range: "1" },
  ...ABUNDANCES.map((band) => ({
    key: band,
    label: ABUNDANCE_LABELS[band],
    range: ABUNDANCE_RANGES[band],
  })),
];

interface SightingQuantityFieldProps {
  id: string;
  // The species' display name, which names the box and the choices to a screen reader.
  speciesLabel: string;
  value: SightingQuantity;
  onChange: (quantity: SightingQuantity) => void;
  countError?: string;
  abundanceError?: string;
  disabled?: boolean;
}

/**
 * One question, how many: the count box, and one, few, many and abundant as quick
 * choices beside it. Each choice is a toggle, and every way in leaves the row carrying
 * one answer - a typed count clears the band, a chosen band clears the box, and
 * choosing the chosen one again takes the answer off. A typed count marks the band it
 * falls in without choosing it, so one tap turns "37" into "many".
 */
export function SightingQuantityField({
  id,
  speciesLabel,
  value,
  onChange,
  countError,
  abundanceError,
  disabled,
}: SightingQuantityFieldProps) {
  const countErrorId = `${id}-error`;
  const abundanceErrorId = `${id}-abundance-error`;
  const countsBand =
    value.count === undefined ? null : abundanceOfCount(value.count);

  const setCountText = (text: string) => {
    if (text === "") onChange({});
    else if (COUNT_TEXT.test(text)) onChange({ count: Number(text) });
  };

  const choose = (key: QuickChoice["key"]) => {
    if (key === "one") onChange(value.count === 1 ? {} : { count: 1 });
    else onChange(value.abundance === key ? {} : { abundance: key });
  };

  return (
    <RepeatableRowField
      id={id}
      label="Count"
      labelSuffix={`of ${speciesLabel}`}
    >
      {/* Text with a numeric keypad rather than `type="number"`, which lets "e", "-"
          and "1.5" into the box and reports them as an empty value - so a refused
          keystroke would read as a cleared count. */}
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={countError ? true : undefined}
        aria-describedby={countError ? countErrorId : undefined}
        disabled={disabled}
        value={value.count === undefined ? "" : value.count}
        onChange={(event) => setCountText(event.target.value)}
      />
      <div
        role="group"
        aria-label={`How many ${speciesLabel}`}
        aria-describedby={abundanceError ? abundanceErrorId : undefined}
        className="grid grid-cols-4 gap-1"
      >
        {QUICK_CHOICES.map(({ key, label, range }) => {
          const chosen =
            key === "one" ? value.count === 1 : value.abundance === key;
          // The band a typed count falls in: shown, not chosen, so it is no
          // pressed state to assistive technology - choosing it stores the band.
          const counted = !chosen && countsBand === key;
          return (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={chosen ? "default" : "outline"}
              aria-pressed={chosen}
              aria-label={key === "one" ? label : `${label}, ${range}`}
              disabled={disabled}
              className={cn(
                "h-auto flex-col gap-0 px-1 py-1 leading-tight",
                counted && "border-dashed border-teal",
              )}
              onClick={() => choose(key)}
            >
              {label}
              <span
                className={cn(
                  "text-xs font-normal",
                  !chosen && "text-muted-foreground",
                )}
              >
                {range}
              </span>
            </Button>
          );
        })}
      </div>
      {countError && (
        <p id={countErrorId} className="text-sm font-medium text-destructive">
          {countError}
        </p>
      )}
      {abundanceError && (
        <p
          id={abundanceErrorId}
          className="text-sm font-medium text-destructive"
        >
          {abundanceError}
        </p>
      )}
    </RepeatableRowField>
  );
}
