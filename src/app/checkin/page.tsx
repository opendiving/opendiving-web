"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { CheckInPageFrame } from "@/components/checkin/checkin-page-frame";
import {
  fetchAllCertifications,
  type Certification,
} from "@/lib/api/certifications";
import { diveStatsAPI, type UserDiveStats } from "@/lib/api/dive-stats";
import { divesAPI } from "@/lib/api/dives";
import { fetchAllContacts, type Contact } from "@/lib/api/contacts";
import { PageSpinner } from "@/components/ui/page-spinner";

// The summary a diver hands to a dive shop. `CheckInPageFrame` draws it; this reads
// what the page does not already hold, the profile itself arriving with the
// signed-in user.
export default function CheckInPage() {
  const { user, isAuthenticated, isLoading } = useAuthGuard();
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<UserDiveStats | null>(null);
  const [lastDiveAt, setLastDiveAt] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Keyed on the uuid rather than on `user`: the auth context replaces that object
  // whenever anything on the account is saved, and a re-fetch of the whole summary
  // on each of those would be a round of requests for values none of them changed.
  //
  // A plain effect, not `useEffectOnChange`: this one starts requests and abandons
  // them in its cleanup, so guarding on deps would cancel on hide and skip on show
  // and the page would never load. Re-reading when a hidden route comes back is what
  // the data hooks do deliberately - a dive logged elsewhere has already made these
  // three figures stale.
  const userUuid = user?.uuid;
  useEffect(() => {
    if (!userUuid) return;

    const controller = new AbortController();

    // Settled rather than `all`: they answer different questions, and one of them
    // failing must not take the ones that arrived off the page with it. The c-cards
    // are the half a desk actually reads, and they do not depend on the dive count.
    const load = async () => {
      const [cards, diveStats, recent, people] = await Promise.allSettled([
        // Every page of them: a diver holds a handful of cards, and a summary that
        // stopped at ten would leave one off the page at the desk.
        fetchAllCertifications(controller.signal),
        diveStatsAPI.getDiveStats(),
        // The last dive is read off the list rather than stored: `GET /dives` is
        // sorted by start time descending, so the first row of the first page is
        // it. Same read the new-dive form makes to carry a dive forward.
        divesAPI.getDives(1, 1),
        // The dive centres the cards name, which a card holds only by uuid. The
        // whole list in one read rather than one per card, and alongside the
        // rest rather than after the cards: a diver keeps tens.
        fetchAllContacts(controller.signal),
      ]);
      if (controller.signal.aborted) return;

      if (cards.status === "fulfilled") setCertifications(cards.value);
      if (people.status === "fulfilled") setContacts(people.value);
      if (diveStats.status === "fulfilled") setStats(diveStats.value);
      if (recent.status === "fulfilled") {
        setLastDiveAt(recent.value.data[0]?.start_time ?? null);
      }

      // Said out loud rather than swallowed the way the dashboard's supplementary
      // cards swallow theirs: this page is handed to somebody else, and a summary
      // quietly missing its certifications is worse than one that says so. What
      // did arrive stays on screen regardless.
      const failed = [cards, diveStats, recent, people].filter(
        (result) => result.status === "rejected",
      );
      for (const result of failed) {
        console.error("Failed to load part of the check-in summary:", result);
      }
      setLoadFailed(failed.length > 0);
      setIsSummaryLoading(false);
    };

    load();
    return () => controller.abort();
  }, [userUuid, attempt]);

  // After a card is edited from the summary itself. Only the lists are re-read -
  // the cards, and the contacts, since the edit may have made one to name - and the
  // stats and the last dive cannot have moved. The loading flag is left alone,
  // so the cards already on screen stay put rather than flashing back to skeletons.
  // A re-read rather than patching the saved card in place: the order is
  // `GET /certifications`' (`certified_on` descending, nulls last), and an edited
  // `certified_on` has to land where that puts it.
  const refreshCertifications = useCallback(async () => {
    try {
      const [cards, people] = await Promise.all([
        fetchAllCertifications(),
        fetchAllContacts(),
      ]);
      setCertifications(cards);
      setContacts(people);
    } catch (error) {
      console.error("Failed to re-read the certifications:", error);
      setLoadFailed(true);
    }
  }, []);

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect to signin
  }

  const contactNames = contactNamesByCertification(certifications, contacts);

  return (
    <CheckInPageFrame
      certifications={certifications}
      contactNames={contactNames}
      stats={stats}
      lastDiveAt={lastDiveAt}
      isLoading={isSummaryLoading}
      loadFailed={loadFailed}
      onCertificationsChanged={refreshCertifications}
      onRetry={() => {
        setIsSummaryLoading(true);
        setLoadFailed(false);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

// Each card's dive centre by the card's own uuid, the shape the frame takes - a
// card naming a contact the list no longer holds simply has no row.
function contactNamesByCertification(
  certifications: Certification[],
  contacts: Contact[],
): Record<string, string> {
  const names = new Map(
    contacts.map((contact) => [contact.uuid, contact.name]),
  );
  const byCard: Record<string, string> = {};
  for (const certification of certifications) {
    const name = certification.contact_uuid
      ? names.get(certification.contact_uuid)
      : undefined;
    if (name) byCard[certification.uuid] = name;
  }
  return byCard;
}
