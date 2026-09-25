"use client";

import { useEffect, useState } from "react";
import { contactsAPI, type Contact } from "@/lib/api/contacts";

/**
 * The contact a record names by uuid, for a surface that prints the one name - a
 * course's dive center, a certification's. `null` while it loads, when there is
 * no uuid, and when the lookup failed: a missing name leaves its row out rather
 * than failing the page, as the dive page's trip link does.
 *
 * Held with the uuid it was read for, so a record relinked to another contact
 * never shows the previous one's name for the round trip in between.
 */
export function useContact(uuid: string | null | undefined): Contact | null {
  const [loaded, setLoaded] = useState<{
    uuid: string;
    contact: Contact;
  } | null>(null);

  useEffect(() => {
    if (!uuid) return;
    let cancelled = false;

    contactsAPI
      .getContact(uuid)
      .then((contact) => {
        if (!cancelled) setLoaded({ uuid, contact });
      })
      .catch((error) => console.error("Failed to fetch contact:", error));

    return () => {
      cancelled = true;
    };
  }, [uuid]);

  return uuid && loaded?.uuid === uuid ? loaded.contact : null;
}
