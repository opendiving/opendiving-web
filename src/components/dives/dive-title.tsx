import { DiveSiteSummary } from "@/lib/api/dives";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";

export interface DiveTitleProps {
  diveNumber: number;
  sites: DiveSiteSummary[];
}

// `DiveTitle` as plain text, for where no markup can go - the tab's title.
export function diveTitleText(diveNumber: number, sites: DiveSiteSummary[]) {
  if (sites.length === 0) return `Dive #${diveNumber}`;
  const extra = sites.length > 1 ? ` +${sites.length - 1}` : "";
  return `#${diveNumber} ${sites[0].name}${extra}`;
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
