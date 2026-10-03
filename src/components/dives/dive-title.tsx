import { GraduationCap } from "lucide-react";
import { DiveSiteSummary } from "@/lib/api/dives";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";
import { LINE_ICON } from "@/components/ui/icon-fact";
import { cn } from "@/lib/utils";

export interface DiveTitleProps {
  diveNumber: number;
  sites: DiveSiteSummary[];
  // The dive was part of a training course, which the title marks with the
  // course's icon after the name.
  course?: boolean;
}

// `DiveTitle` as plain text, for where no markup can go - the tab's title.
export function diveTitleText(diveNumber: number, sites: DiveSiteSummary[]) {
  if (sites.length === 0) return `Dive #${diveNumber}`;
  const extra = sites.length > 1 ? ` +${sites.length - 1}` : "";
  return `#${diveNumber} ${sites[0].name}${extra}`;
}

// What a dive is called wherever one is named: "#212 Blue Hole", or "Dive #212"
// for a dive with no site to name it by - a bare "#212" names nothing on its own.
export function DiveTitle({ diveNumber, sites, course }: DiveTitleProps) {
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
          <GraduationCap
            aria-hidden
            className={cn(LINE_ICON, "text-muted-foreground")}
          />
          <span className="sr-only">(training dive)</span>
        </>
      )}
    </>
  );
}
