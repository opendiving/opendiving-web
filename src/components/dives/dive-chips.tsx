"use client";

import { type ReactNode, useRef, useState } from "react";
import {
  HINT_DELAY_MS,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DIVE_TYPE_ABBREVIATIONS,
  DIVE_TYPE_LABELS,
  vocabularyLabel,
  WATER_TYPE_ABBREVIATIONS,
  WATER_TYPE_LABELS,
  type Dive,
} from "@/lib/api/dives";

// One chip, bordered in its text's colour, with what it stands for in full as
// its hover hint and in a screen reader's words. Without the text's glow, as a
// map's credit chip is: its fill lifts it.
//
// A finger has no hover, so a tap shows the hint, until a press elsewhere. Its
// hit area grows to 44px up and down only, so two chips side by side keep their
// own.
function Chip({ text, label }: { text: string; label: string }) {
  const [hovered, setHovered] = useState(false);
  const [tapped, setTapped] = useState(false);
  const finger = useRef(false);
  return (
    <Tooltip
      open={hovered || tapped}
      onOpenChange={(open) => {
        setHovered(open);
        if (!open) setTapped(false);
      }}
    >
      {/* The name is already in the chip's words, so the hint describes
          nothing a screen reader has not heard: `IconTooltip`'s override. */}
      <TooltipTrigger
        asChild
        aria-describedby={undefined}
        onPointerDown={(event) => {
          finger.current = event.pointerType !== "mouse";
        }}
        onClick={() => {
          if (finger.current) setTapped(true);
        }}
      >
        <span className="relative rounded-sm border border-current bg-background/80 px-1 text-[10px] font-semibold leading-4 tracking-wide [text-shadow:none] touch:after:absolute touch:after:inset-x-0 touch:after:-inset-y-[13px] md:text-xs md:leading-5 md:touch:after:-inset-y-[11px]">
          <span aria-hidden>{text}</span>
          <span className="sr-only">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// One of the diver's tags, in the brand's teal, its words its own: there is
// nothing shorter to show and nothing longer to hint at. A name too long for
// the row ends in an ellipsis rather than overflowing it.
function TagChip({ tag }: { tag: string }) {
  return (
    <span className="max-w-full truncate rounded-sm border border-teal bg-teal px-1 text-[10px] font-semibold leading-4 tracking-wide text-teal-foreground [text-shadow:none] md:text-xs md:leading-5">
      {tag}
    </span>
  );
}

/**
 * The chips over a dive's title, on its card and its page's hero alike: the
 * water, then the kind of dive, then the diver's tags in their order. Salt
 * water and open circuit have none - each goes without saying - and a dive
 * with none of the three has no row. Lifted over a card's link, so its hints
 * are reachable by a mouse; on a card a finger's tap goes through them to the
 * link (`DiveCard`).
 */
export function diveChips(dive: Dive): ReactNode {
  const water = dive.water_type && WATER_TYPE_ABBREVIATIONS[dive.water_type];
  const type = dive.type && DIVE_TYPE_ABBREVIATIONS[dive.type];
  const tags = dive.tags ?? [];
  if (!water && !type && tags.length === 0) return null;
  return (
    <TooltipProvider delayDuration={HINT_DELAY_MS} disableHoverableContent>
      <div className="relative z-10 flex w-fit max-w-full flex-wrap gap-1">
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
        {tags.map((tag) => (
          <TagChip key={tag} tag={tag} />
        ))}
      </div>
    </TooltipProvider>
  );
}
