"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { useCheckinDetails } from "@/contexts/CheckinDetailsContext";
import {
  certificationsAPI,
  type CertificationExpiringEntry,
} from "@/lib/api/certifications";
import {
  gearServiceAPI,
  scheduleFromDueEntry,
  type GearServiceDueEntry,
} from "@/lib/api/gear-service";
import {
  certificationRenewals,
  renewables,
  type CertificationRenewal,
  type Renewable,
} from "@/lib/certification";
import { serviceStatus } from "@/lib/gear-service";

/** One source of notifications, as its last read left it. */
export interface NotificationFeed<T> {
  rows: T[];
  /** The API's row cap was hit, so `rows` may not be all of them. */
  truncated: boolean;
  /** The last read failed, and `rows` is empty rather than stale. */
  failed: boolean;
}

export interface NotificationsState {
  /** False until the reads and the shared check-in details have all settled. */
  isLoaded: boolean;
  /** Gear schedules due soon or overdue, in the API's order. */
  serviceDue: NotificationFeed<GearServiceDueEntry>;
  /**
   * Certifications and insurance policies running out or run out, soonest first.
   * `failed` is the certifications read's.
   */
  renewals: NotificationFeed<CertificationRenewal<Renewable>>;
  /** The check-in details failed to load, so no policy can be said to be due. */
  policiesFailed: boolean;
  /** How many rows the two hold between them. */
  count: number;
  /** Reads both again, and the check-in details if their read failed. */
  reload: () => void;
}

interface Reads {
  serviceDue: NotificationFeed<GearServiceDueEntry>;
  certifications: NotificationFeed<CertificationExpiringEntry>;
}

const EMPTY: NotificationFeed<never> = {
  rows: [],
  truncated: false,
  failed: false,
};

function feedFrom<T>(
  result: PromiseSettledResult<{ data: T[]; truncated?: boolean }>,
  what: string,
): NotificationFeed<T> {
  if (result.status === "fulfilled") {
    return {
      rows: result.value.data,
      truncated: result.value.truncated === true,
      failed: false,
    };
  }
  console.error(`Failed to load ${what}:`, result.reason);
  return { rows: [], truncated: false, failed: true };
}

/**
 * What the diver has to act on: gear due a service, and certifications or insurance
 * policies about to run out. Both endpoints return every dated row with no
 * horizon, so the bucketing into "worth saying" happens here.
 *
 * Read again on every navigation. The header that asks for this outlives the
 * pages, and those pages are where a service gets logged or an expiry date
 * moves; both reads are cached by the API, so the repeat is cheap. The
 * policies' rows are derived during render from the shared check-in details, so a
 * policy saved anywhere shows here without a read at all.
 */
export function useNotifications(): NotificationsState {
  const {
    details,
    loadFailed: policiesFailed,
    reload: reloadDetails,
  } = useCheckinDetails();
  const pathname = usePathname();
  const [reads, setReads] = useState<Reads | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // `allSettled`, so one failed source still lets the other say its piece.
    void Promise.allSettled([
      gearServiceAPI.getDue(),
      certificationsAPI.getExpiring(),
    ]).then(([service, certifications]) => {
      if (cancelled) return;
      const due = feedFrom(service, "service due");
      setReads({
        serviceDue: {
          ...due,
          rows: due.rows.filter(
            (entry) =>
              serviceStatus(
                scheduleFromDueEntry(entry),
                entry.gear_item_dive_count,
              ) !== "ok",
          ),
        },
        certifications: feedFrom(certifications, "certifications"),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, reloadKey]);

  // The details are one copy for the whole tab and are not read per navigation, so a
  // failed read is retried where the bell retries its own: on the next page, and on
  // `reload`.
  useEffect(() => {
    if (policiesFailed) reloadDetails();
  }, [pathname, reloadKey, policiesFailed, reloadDetails]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const serviceDue = reads?.serviceDue ?? EMPTY;
  const renewals = reads
    ? {
        ...reads.certifications,
        rows: certificationRenewals(
          renewables(
            reads.certifications.rows,
            details?.insurance_policies ?? [],
          ),
        ),
      }
    : EMPTY;

  return {
    // The policies' rows wait for the details too, so the panel never answers
    // "nothing due" while they are on their way.
    isLoaded: reads !== null && (details !== null || policiesFailed),
    serviceDue,
    renewals,
    policiesFailed,
    count: serviceDue.rows.length + renewals.rows.length,
    reload,
  };
}
