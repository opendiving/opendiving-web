import type { ReactNode } from "react";
import {
  DIVE_TYPE_ABBREVIATIONS,
  DIVE_TYPE_LABELS,
  vocabularyLabel,
  type DiveType,
} from "@/lib/api/dives";

// The kind of dive as a chip over its title, on its card and its page's hero
// alike, and nothing for open circuit. A screen reader hears the kind in full.
// Without the text's glow, as a map's credit chip is: its fill lifts it.
export function diveTypeChip(type?: DiveType | null): ReactNode {
  const abbreviation = type && DIVE_TYPE_ABBREVIATIONS[type];
  if (!type || !abbreviation) return null;
  const label = vocabularyLabel(DIVE_TYPE_LABELS, type);
  return (
    <span
      title={label}
      className="inline-block rounded-sm bg-background/80 px-1 text-[10px] font-semibold leading-4 tracking-wide [text-shadow:none] md:text-xs md:leading-5"
    >
      <span aria-hidden>{abbreviation}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
