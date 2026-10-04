"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import {
  contactsAPI,
  type Contact,
  type ContactLookupItem,
  type ContactRole,
} from "@/lib/api/contacts";
import { formatContactPlace } from "@/lib/contact";
import { ContactDialog } from "@/components/contacts/contact-dialog";

// How many contacts the dropdown asks for at a time. Enough to scroll through
// before typing, far short of the API's 100 cap.
const CONTACTS_PER_SEARCH = 25;

export interface ContactComboboxProps extends FormControlSlotProps {
  value?: string | null;
  // `null`, not `undefined`, for "no contact", for the reason `TripCombobox`
  // gives: an edit form skips `undefined` fields when it builds its PATCH, so a
  // cleared picker has to be a value the diver chose or the link survives the save.
  onChange: (contactId: string | null) => void;
  // The date of the record being edited - see `TripCombobox.until`.
  until?: string;
  // Contacts listed ahead of the lookup's rows, in this order - the dive form's
  // course's contact. Each is read by uuid, and shown while its name contains
  // the query.
  pinnedUuids?: readonly string[];
  // What a contact made from here starts as - see `ContactDialog.initialRoles`.
  // The list itself is never filtered by role: a dive center that also has rooms
  // is still the one the diver slept at.
  initialRoles?: readonly ContactRole[];
  // The host's own words for what it picks - a dive form says "dive center", a
  // trip part "accommodation" - while the record behind them is a contact.
  placeholder?: string;
  addNewLabel?: string;
  disabled?: boolean;
}

// Picks (or creates) one of the diver's contacts. The dropdown searches the
// contact lookup server-side, over name and city, rather than fetching every
// contact.
//
// No inline create-on-Enter: a name-only contact would be filed with no role, so
// "Add..." opens the dialog instead, carrying the typed name and the host's role.
export function ContactCombobox({
  value,
  onChange,
  until,
  pinnedUuids,
  initialRoles,
  placeholder = "Select a contact...",
  addNewLabel = "Add contact...",
  disabled,
  ...slotProps
}: ContactComboboxProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  // What the field held when "Add..." was pressed, frozen for the dialog: the
  // field's own text moves on as it loses focus, and a dialog seeded from a live
  // value would reset itself under the diver's typing.
  const [newName, setNewName] = useState("");
  const textRef = useRef("");
  const trackText = useCallback((text: string) => {
    textRef.current = text;
  }, []);
  // Every contact this picker has seen - its own search results, whatever it
  // created, and a read for a `value` that arrived from the form or a pin.
  const [contacts, setContacts] = useState<Record<string, ContactLookupItem>>(
    {},
  );
  // Fired-for uuids, so a failed read isn't retried on every render.
  const requestedRef = useRef<Set<string>>(new Set());

  const remember = useCallback(
    (contact: ContactLookupItem) =>
      setContacts((prev) => ({ ...prev, [contact.uuid]: contact })),
    [],
  );

  // No cancellation flag, for the reason `TripCombobox` gives: the request fires
  // once per uuid, and writing to a uuid-keyed map is idempotent.
  const pinnedKey = (pinnedUuids ?? []).join(",");
  useEffect(() => {
    const wanted = [value, ...(pinnedKey ? pinnedKey.split(",") : [])];
    for (const uuid of wanted) {
      if (!uuid || contacts[uuid] || requestedRef.current.has(uuid)) continue;
      requestedRef.current.add(uuid);

      contactsAPI
        .getContact(uuid)
        .then(remember)
        .catch((error) => console.error("Failed to fetch contact:", error));
    }
  }, [value, pinnedKey, contacts, remember]);

  const searchContacts = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const response = await contactsAPI.lookupContacts(
        1,
        CONTACTS_PER_SEARCH,
        { search: query, until },
      );
      response.data.forEach(remember);
      // The pins whose name holds the query go first; a pin the lookup found by
      // its city alone stays where the lookup put it.
      const needle = query.trim().toLowerCase();
      const pinned = [...new Set(pinnedKey ? pinnedKey.split(",") : [])]
        .map((uuid) => contacts[uuid])
        .filter(
          (contact): contact is ContactLookupItem =>
            !!contact && contact.name.toLowerCase().includes(needle),
        );
      const shown = new Set(pinned.map((contact) => contact.uuid));
      return {
        // Where the contact is as the hint, as a dive site's location is in
        // its picker: what tells two branches of one shop apart.
        items: [
          ...pinned,
          ...response.data.filter((contact) => !shown.has(contact.uuid)),
        ].map((contact) => ({
          id: contact.uuid,
          name: contact.name,
          hint: formatContactPlace(contact.address),
        })),
        hasMore: response.has_more,
      };
    },
    [remember, until, pinnedKey, contacts],
  );

  const handleCreated = (created: Contact) => {
    remember(created);
    onChange(created.uuid);
  };

  const selected = value ? contacts[value] : undefined;

  return (
    <>
      <CreatableCombobox
        {...slotProps}
        onSearch={searchContacts}
        value={value ?? undefined}
        selectedItem={
          value && selected ? { id: value, name: selected.name } : undefined
        }
        onChange={(contactId) => onChange(contactId ?? null)}
        onTextChange={trackText}
        disabled={disabled}
        placeholder={placeholder}
        noItemsLabel="No contacts yet."
        noMatchesLabel="No contacts match."
        addNewLabel={addNewLabel}
        onAddNew={() => {
          // The field's text is a name only when the diver typed it; the label
          // of the contact already picked is not one to file again.
          const text = textRef.current.trim();
          setNewName(text && text !== selected?.name ? text : "");
          setShowNewDialog(true);
        }}
      />

      {/* Its own mount, as the other pickers keep theirs: the created contact has
          to come back here to be selected. Inside the certification dialog's
          course dialog that is a third dialog deep - see DECISIONS.md. */}
      <ContactDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSaved={handleCreated}
        initialName={newName}
        initialRoles={initialRoles}
      />
    </>
  );
}
