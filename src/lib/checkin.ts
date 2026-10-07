import type { User } from "@/lib/api/auth";
import type {
  CheckinDetails,
  EmergencyContact,
  InsurancePolicy,
} from "@/lib/api/checkin-details";
import type { UserDiveStats } from "@/lib/api/dive-stats";
import { splitStartTime } from "@/lib/date-time";

/**
 * What the summary prints about the diver: the name and portrait the account carries,
 * and the check-in details. The signed-in page builds it from the session and the
 * shared copy (`ownCheckInDiver`), and a shared link's page takes the summary the link
 * answers with, so both are this shape and neither is the other.
 */
export interface CheckInDiver {
  name: string;
  portrait_sha256?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  emergency_contacts?: EmergencyContact[];
  insurance_policies?: InsurancePolicy[];
}

/** The signed-in diver's own sheet: the details, once the shared copy has them. */
export function ownCheckInDiver(
  user: Pick<User, "name" | "portrait_sha256">,
  details: CheckinDetails | null,
): CheckInDiver {
  return {
    name: user.name,
    portrait_sha256: user.portrait_sha256,
    ...details,
  };
}

/**
 * The three figures the summary's "Diving" section prints.
 *
 * `maxDepth` is metric, like every depth this app holds outside `UnitNumberInput`.
 * `lastDiveOn` is a bare "YYYY-MM-DD" rather than the dive's `start_time`: the sheet
 * prints a date, and normalising here is what lets one line render whether the figure
 * came off `/user/dive-stats` or out of the diver's own correction.
 */
export interface DivingFigures {
  totalDives: number | null;
  maxDepth: number | null;
  lastDiveOn: string | null;
}

/** What the log itself says, which is what the dialog opens on. */
export function loggedDivingFigures(
  stats: UserDiveStats | null,
  lastDiveAt: string | null,
): DivingFigures {
  return {
    totalDives: stats?.total_dives ?? null,
    maxDepth: stats?.max_depth ?? null,
    // The dive's own calendar day, in the offset it was logged in - never the
    // reader's. `formatDiveDateTime` is the other half of the same rule.
    lastDiveOn: lastDiveAt
      ? splitStartTime(lastDiveAt).localDateTime.slice(0, 10)
      : null,
  };
}

/** The three as `POST /user/checkin-link` takes them and `GET /checkin/{token}` answers. */
export interface DivingFiguresWire {
  total_dives: number | null;
  max_depth: number | null;
  last_dive_on: string | null;
}

export function divingFiguresToWire(figures: DivingFigures): DivingFiguresWire {
  return {
    total_dives: figures.totalDives,
    max_depth: figures.maxDepth,
    last_dive_on: figures.lastDiveOn,
  };
}

export function divingFiguresFromWire(wire: DivingFiguresWire): DivingFigures {
  return {
    totalDives: wire.total_dives,
    maxDepth: wire.max_depth,
    lastDiveOn: wire.last_dive_on,
  };
}

/** Whether any of the three has something to print. */
export function hasDivingFigures(figures: DivingFigures): boolean {
  return (
    figures.totalDives !== null ||
    figures.maxDepth !== null ||
    figures.lastDiveOn !== null
  );
}
