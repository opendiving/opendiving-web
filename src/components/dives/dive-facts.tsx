import type { ReactNode } from "react";
import { Ship } from "lucide-react";
import type { Dive } from "@/lib/api/dives";
import { DiveComputerIcon } from "@/components/icons/dive-computer-icon";
import { IconFact, LINE_ICON } from "@/components/ui/icon-fact";
import { formatDiveDateTime } from "@/lib/date-time";
import { recordingCount } from "@/lib/dive-recordings";

/**
 * The line under a dive's title, on its card and its page's hero alike: when,
 * in the dive's own timezone, and where - the title names the site, this says
 * where it is - then the boat, and a dive computer for each one that recorded
 * the dive. The water and the kind of dive are its title's chips.
 */
export function diveFacts(dive: Dive): ReactNode[] {
  const computers = recordingCount(dive);
  return [
    formatDiveDateTime(dive.start_time),
    dive.dive_sites[0]?.location?.name,
    dive.boat_name && (
      <IconFact icon={Ship} label="Boat">
        {dive.boat_name}
      </IconFact>
    ),
    computers > 0 && <DiveComputers count={computers} />,
  ].filter(Boolean);
}

function DiveComputers({ count }: { count: number }) {
  return (
    <span className="whitespace-nowrap">
      {Array.from({ length: count }, (_, index) => (
        <DiveComputerIcon key={index} aria-hidden className={LINE_ICON} />
      ))}
      <span className="sr-only">
        {count === 1 ? "1 dive computer" : `${count} dive computers`}
      </span>
    </span>
  );
}
