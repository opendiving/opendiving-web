"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAllContacts, type Contact } from "@/lib/api/contacts";

/**
 * The contacts behind a set of uuids, for a surface that prints several names -
 * a gear item's service history, a trip's parts and the dives on it. The records
 * store the uuid and nothing else, so the names are read here.
 *
 * One read of the whole list rather than one request per uuid: a diver keeps tens
 * of contacts, and a trip naming five would otherwise cost five. It is read again
 * only when a uuid turns up that the last read did not hold - a contact created
 * from a dialog on the same page - and never for one that read already answered,
 * so a contact deleted since is not asked for on every render.
 *
 * Non-fatal: a failed read leaves the names out, as the dive page leaves out a
 * trip it could not look up.
 */
export function useContactsByUuid(
  uuids: readonly (string | null | undefined)[],
): Record<string, Contact> {
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  // Every uuid a finished read has answered for, whether or not it found it.
  const answeredRef = useRef<Set<string>>(new Set());

  // A string rather than the array, so a caller building its list inline does not
  // re-run the effect on every render.
  const wanted = [...new Set(uuids.filter((uuid): uuid is string => !!uuid))]
    .sort()
    .join(",");

  useEffect(() => {
    if (!wanted) return;
    const missing = wanted
      .split(",")
      .filter((uuid) => !answeredRef.current.has(uuid));
    if (missing.length === 0) return;

    const controller = new AbortController();
    fetchAllContacts(controller.signal)
      .then((all) => {
        for (const uuid of missing) answeredRef.current.add(uuid);
        for (const contact of all) answeredRef.current.add(contact.uuid);
        setContacts(
          Object.fromEntries(all.map((contact) => [contact.uuid, contact])),
        );
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch contacts:", error);
      });
    return () => controller.abort();
  }, [wanted]);

  return contacts;
}
