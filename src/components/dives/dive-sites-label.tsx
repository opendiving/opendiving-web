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
// crosses several named sites). Every name is available as a hover tooltip on
// the whole label whenever the "+N" is hiding some of them.
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
    <span
      className={className}
      // The whole list, not just the hidden tail: the tooltip reads as the
      // expansion of what is on screen, and a diver hovering "+2" to see what
      // it stands for gets the same answer as one hovering the name. Left off
      // entirely for a single site, where it would only repeat the label - and
      // `title` on the wrapper still shows over the primary site's link, since
      // the link carries none of its own.
      //
      // Joined without the blank-dropping `TripLocationsLabel` needs: a dive
      // site is a saved row whose `name` the API holds to `min_length=1`, while
      // a trip location is a snapshot that can arrive as free text.
      title={
        extra.length > 0 ? sites.map((site) => site.name).join(", ") : undefined
      }
    >
      {linked ? (
        <Link href={`/sites/${primary.uuid}`} className="hover:underline">
          {primary.name}
        </Link>
      ) : (
        primary.name
      )}
      {showLocation && primary.location && `, ${primary.location}`}
      {extra.length > 0 && (
        <span className="text-muted-foreground"> +{extra.length}</span>
      )}
    </span>
  );
}
