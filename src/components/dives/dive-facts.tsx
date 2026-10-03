import type { ReactNode } from "react";
import { Ship } from "lucide-react";
import type { Dive } from "@/lib/api/dives";
import { IconFact } from "@/components/ui/icon-fact";
import { formatDiveDateTime } from "@/lib/date-time";

/**
 * The line under a dive's title, on its card and its page's hero alike: when,
 * in the dive's own timezone, and where - the title names the site, this says
 * where it is - then the boat. The water and the kind of dive are its title's
 * chips.
 */
export function diveFacts(dive: Dive): ReactNode[] {
  return [
    formatDiveDateTime(dive.start_time),
    dive.dive_sites[0]?.location?.name,
    dive.boat_name && (
      <IconFact icon={Ship} label="Boat">
        {dive.boat_name}
      </IconFact>
    ),
  ].filter(Boolean);
}
