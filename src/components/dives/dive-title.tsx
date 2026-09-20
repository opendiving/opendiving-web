import { DiveSiteSummary } from "@/lib/api/dives";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";

export interface DiveTitleProps {
  diveNumber: number;
  sites: DiveSiteSummary[];
}

// What a dive is called wherever one is named: "#212 Blue Hole", or "Dive #212"
// for a dive with no site to name it by - a bare "#212" names nothing on its own.
export function DiveTitle({ diveNumber, sites }: DiveTitleProps) {
  if (sites.length === 0) {
    return <>Dive #{diveNumber}</>;
  }

  return (
    <>
      #{diveNumber} <DiveSitesLabel sites={sites} />
    </>
  );
}
