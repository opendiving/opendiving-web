import { GraduationCap } from "lucide-react";
import { DiveSiteSummary } from "@/lib/api/dives";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";
import { RatingStars } from "@/components/dives/rating-input";
import { LINE_ICON } from "@/components/ui/icon-fact";

export interface DiveTitleProps {
  diveNumber: number;
  sites: DiveSiteSummary[];
  // The dive was part of a training course, which the title marks with the
  // course's icon after the name.
  course?: boolean;
  // The diver's rating, drawn as stars after the name and its marks.
  rating?: number | null;
}

// A step under the name's size and level with its capitals, glowing off the
// map as the line's icons do.
const RATING =
  "align-[-0.0625em] text-[0.75em] [filter:drop-shadow(0_0_2px_var(--backdrop-fade))_drop-shadow(0_0_5px_var(--backdrop-fade))]";

// `DiveTitle` as plain text, for where no markup can go - the tab's title.
export function diveTitleText(diveNumber: number, sites: DiveSiteSummary[]) {
  if (sites.length === 0) return `Dive #${diveNumber}`;
  const extra = sites.length > 1 ? ` +${sites.length - 1}` : "";
  return `#${diveNumber} ${sites[0].name}${extra}`;
}

// What a dive is called wherever one is named: "#212 Blue Hole", or "Dive #212"
// for a dive with no site to name it by - a bare "#212" names nothing on its own.
export function DiveTitle({
  diveNumber,
  sites,
  course,
  rating,
}: DiveTitleProps) {
  return (
    <>
      {sites.length === 0 ? (
        <>Dive #{diveNumber}</>
      ) : (
        <>
          #{diveNumber} <DiveSitesLabel sites={sites} />
        </>
      )}
      {course && (
        <>
          {" "}
          <GraduationCap aria-hidden className={LINE_ICON} />
          <span className="sr-only">(training dive)</span>
        </>
      )}
      {rating != null && (
        <>
          {" "}
          <RatingStars rating={rating} className={RATING} />
        </>
      )}
    </>
  );
}
