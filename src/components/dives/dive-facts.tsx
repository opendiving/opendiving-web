import type { ReactNode } from "react";
import { Shapes, Ship, Waves } from "lucide-react";
import {
  DIVE_TYPE_LABELS,
  vocabularyLabel,
  WATER_TYPE_LABELS,
  type Dive,
} from "@/lib/api/dives";
import { IconFact } from "@/components/ui/icon-fact";
import { formatDiveDateTime } from "@/lib/date-time";

/**
 * The line under a dive's title, on its card and its page's hero alike: when,
 * in the dive's own timezone, and where - the title names the site, this says
 * where it is - then the water, the boat and the kind of dive. The water only
 * where it is not the sea's and the kind only where it is not open circuit:
 * each goes without saying.
 */
export function diveFacts(dive: Dive): ReactNode[] {
  return [
    formatDiveDateTime(dive.start_time),
    dive.dive_sites[0]?.location?.name,
    dive.water_type != null && dive.water_type !== "salt" && (
      <IconFact icon={Waves} label="Water type">
        {vocabularyLabel(WATER_TYPE_LABELS, dive.water_type)}
      </IconFact>
    ),
    dive.boat_name && (
      <IconFact icon={Ship} label="Boat">
        {dive.boat_name}
      </IconFact>
    ),
    dive.type != null && dive.type !== "open_circuit" && (
      <IconFact icon={Shapes} label="Dive type">
        {vocabularyLabel(DIVE_TYPE_LABELS, dive.type)}
      </IconFact>
    ),
  ].filter(Boolean);
}
