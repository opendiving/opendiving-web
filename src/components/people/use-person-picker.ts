"use client";

import { useCallback, useState } from "react";
import type {
  ComboboxItem,
  ComboboxSearchResult,
} from "@/components/ui/creatable-combobox";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";
import { peopleAPI, type Person } from "@/lib/api/people";

// How many people the dropdown asks for at a time. Enough to scroll through
// before typing, far short of the API's 100 cap.
const PEOPLE_PER_SEARCH = 25;

/**
 * A person as a picker's menu row: the name, and the linked account's
 * `@username` as the hint - the second field the search matches, so a row found
 * by its username says why it is there.
 */
export function personItem(
  person: Pick<Person, "uuid" | "name" | "username">,
): ComboboxItem {
  return {
    id: person.uuid,
    name: person.name,
    hint: person.username ? `@${person.username}` : undefined,
  };
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What both people pickers share: the records they have seen, a server search
 * over name and username, and the create-on-Enter a typed name gets.
 */
export function usePersonPicker() {
  const { toast } = useToast();
  // Every person this picker has seen - its own search results and whatever it
  // created - kept whole, so a picked row is labelled without a request.
  const [people, setPeople] = useState<Record<string, Person>>({});

  const remember = useCallback(
    (person: Person) =>
      setPeople((previous) => ({ ...previous, [person.uuid]: person })),
    [],
  );

  // Never re-filtered by the combobox: a match on the username has to survive a
  // name filter it would fail - see DECISIONS.md, "Every dive form picker
  // searches server-side".
  const search = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const response = await peopleAPI.getPeople(1, PEOPLE_PER_SEARCH, query);
      response.data.forEach(remember);
      return {
        items: response.data.map(personItem),
        hasMore: response.has_more,
      };
    },
    [remember],
  );

  // An unmatched name on Enter is a person: a name is all a person needs, where
  // a name-only contact would be filed with no role. The dialog is still there
  // for a username, an email or a phone.
  const createNamed = useCallback(
    async (name: string): Promise<ComboboxItem> => {
      try {
        const created = await peopleAPI.createPerson({ name: name.trim() });
        remember(created);
        return personItem(created);
      } catch (error) {
        // Names are unique per diver, so a refusal is most often the person the
        // diver meant, typed out before the search had answered with them.
        const existing = await peopleAPI
          .getPeople(1, PEOPLE_PER_SEARCH, name.trim())
          .then((response) =>
            response.data.find((person) => sameName(person.name, name)),
          )
          .catch(() => undefined);
        if (existing) {
          remember(existing);
          return personItem(existing);
        }
        toast({
          title: `Couldn't add ${name.trim()}`,
          description: getApiErrorMessage(error, "Please try again."),
          variant: "destructive",
        });
        throw error;
      }
    },
    [remember, toast],
  );

  return { people, remember, search, createNamed };
}
