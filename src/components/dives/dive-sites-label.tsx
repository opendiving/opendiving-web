import Link from "next/link";
import { DiveSiteSummary } from "@/lib/api/dives";

export interface DiveSitesLabelProps {
  sites: DiveSiteSummary[];
  // Wrap the primary site's name in a link to its detail page.
  linked?: boolean;
  // Append the primary site's location (", Koh Tao, Thailand") after its name.
  showLocation?: boolean;
  className?: string;
}

// Renders a dive's site(s) as its primary (first-visited) site, plus a
// "+N" suffix when the dive includes additional sites (e.g. a drift dive that
// crosses several named sites). The extra sites' names are available as a
// hover tooltip on the "+N" badge.
export function DiveSitesLabel({
  sites,
  linked = false,
  showLocation = false,
  className,
}: DiveSitesLabelProps) {
  if (sites.length === 0) {
    return <span className={className}>-</span>;
  }

  const [primary, ...extra] = sites;

  return (
    <span className={className}>
      {linked ? (
        <Link href={`/sites/${primary.id}`} className="hover:underline">
          {primary.name}
        </Link>
      ) : (
        primary.name
      )}
      {showLocation && primary.location && `, ${primary.location}`}
      {extra.length > 0 && (
        <span
          className="text-muted-foreground"
          title={`Also: ${extra.map((site) => site.name).join(", ")}`}
        >
          {" "}
          +{extra.length}
        </span>
      )}
    </span>
  );
}
