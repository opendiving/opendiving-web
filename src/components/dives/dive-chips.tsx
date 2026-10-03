import type { ReactNode } from "react";
import {
  DIVE_TYPE_ABBREVIATIONS,
  DIVE_TYPE_LABELS,
  vocabularyLabel,
  WATER_TYPE_ABBREVIATIONS,
  WATER_TYPE_LABELS,
  type Dive,
} from "@/lib/api/dives";

// One chip: what it says, and what a screen reader and a hover hear in full.
// Without the text's glow, as a map's credit chip is: its fill lifts it.
function Chip({ text, label }: { text: string; label: string }) {
  return (
    <span
      title={label}
      className="rounded-sm bg-background/80 px-1 text-[10px] font-semibold leading-4 tracking-wide [text-shadow:none] md:text-xs md:leading-5"
    >
      <span aria-hidden>{text}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The chips over a dive's title, on its card and its page's hero alike: the
 * water, then the kind of dive. Salt water and open circuit have none - each
 * goes without saying - and a dive with neither has no row.
 */
export function diveChips(dive: Dive): ReactNode {
  const water = dive.water_type && WATER_TYPE_ABBREVIATIONS[dive.water_type];
  const type = dive.type && DIVE_TYPE_ABBREVIATIONS[dive.type];
  if (!water && !type) return null;
  return (
    <div className="flex gap-1">
      {water && (
        <Chip
          text={water}
          label={vocabularyLabel(WATER_TYPE_LABELS, dive.water_type!)}
        />
      )}
      {type && (
        <Chip
          text={type}
          label={vocabularyLabel(DIVE_TYPE_LABELS, dive.type!)}
        />
      )}
    </div>
  );
}
