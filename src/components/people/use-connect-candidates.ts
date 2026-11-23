"use client";

import { useEffect, useState } from "react";
import { fetchAllPeople, type Person } from "@/lib/api/people";
import type { ConnectTarget } from "@/components/people/connected-account-head";

interface ConnectCandidates {
  // The diver's people who are not connected to an account, by name.
  people: Person[];
  // The one of them named as the account is, which the form opens on: the buddy
  // logged by name before they showed a code.
  suggested: string | null;
}

const NONE: ConnectCandidates = { people: [], suggested: null };

const nameKey = (name: string) => name.trim().toLocaleLowerCase();

// The people a connection could go to instead of a new one, read once per
// account the form is opened for. Read failing leaves the choice out, so the form
// still makes a new person.
export function useConnectCandidates(
  target: ConnectTarget | null | undefined,
): ConnectCandidates {
  const [loaded, setLoaded] = useState<{
    name: string;
    found: ConnectCandidates;
  } | null>(null);
  const name = target?.name ?? null;

  useEffect(() => {
    if (name === null) return;
    const controller = new AbortController();
    // A promise chain for `react-hooks/set-state-in-effect`.
    fetchAllPeople(controller.signal)
      .then((all) => {
        if (controller.signal.aborted) return;
        // Not connected means no username: a read joins the account's username
        // for every tie that stands.
        const people = all.filter((person) => !person.username);
        const suggested =
          people.find((person) => nameKey(person.name) === nameKey(name))
            ?.uuid ?? null;
        setLoaded({ name, found: { people, suggested } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Couldn't read your people to connect one.", error);
        setLoaded({ name, found: NONE });
      });
    return () => controller.abort();
  }, [name]);

  if (name === null || loaded?.name !== name) return NONE;
  return loaded.found;
}
