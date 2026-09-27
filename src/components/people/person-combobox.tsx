"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import { peopleAPI, type Person } from "@/lib/api/people";
import { PersonDialog } from "@/components/people/person-dialog";
import {
  personItem,
  usePersonPicker,
} from "@/components/people/use-person-picker";

export interface PersonComboboxProps extends FormControlSlotProps {
  value?: string | null;
  // `null`, not `undefined`, for "nobody", for the reason `TripCombobox` gives:
  // an edit form sends every field, and a cleared picker has to be a value.
  onChange: (personUuid: string | null) => void;
  placeholder?: string;
  addNewLabel?: string;
  disabled?: boolean;
}

// Picks (or creates) one of the diver's people for a field that names one - a
// course's or a certification's instructor. The dropdown searches server-side
// over name and username.
//
// A typed name nobody has becomes a person on Enter, so naming a new instructor
// is still type and Enter, as it was while the field was text. Leaving the field
// commits nothing, so a half-typed name is never filed.
export function PersonCombobox({
  value,
  onChange,
  placeholder = "Select a person...",
  addNewLabel = "Add person...",
  disabled,
  ...slotProps
}: PersonComboboxProps) {
  const { people, remember, search, createNamed } = usePersonPicker();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const textRef = useRef("");
  const trackText = useCallback((text: string) => {
    textRef.current = text;
  }, []);
  // Fired-for uuids, so a failed lookup isn't retried on every render.
  const requestedRef = useRef<Set<string>>(new Set());

  // The name for a `value` that arrived from the form. No cancellation flag,
  // for the reason `TripCombobox` gives: the request fires once per uuid, and
  // writing to a uuid-keyed map is idempotent.
  useEffect(() => {
    if (!value || people[value] || requestedRef.current.has(value)) return;
    requestedRef.current.add(value);

    peopleAPI
      .getPerson(value)
      .then(remember)
      .catch((error) => console.error("Failed to fetch person:", error));
  }, [value, people, remember]);

  const handleCreated = (created: Person) => {
    remember(created);
    onChange(created.uuid);
  };

  const selected = value ? people[value] : undefined;

  return (
    <>
      <CreatableCombobox
        {...slotProps}
        onSearch={search}
        value={value ?? undefined}
        selectedItem={selected ? personItem(selected) : undefined}
        onChange={(personUuid) => onChange(personUuid ?? null)}
        onTextChange={trackText}
        onCreate={createNamed}
        commitOnEnterOnly
        disabled={disabled}
        placeholder={placeholder}
        noItemsLabel="No people yet. Type a name and press Enter to add one."
        noMatchesLabel="Nobody matches. Press Enter to add a person of that name."
        searchErrorLabel="Search is unavailable right now. Press Enter to add a person of that name."
        addNewLabel={addNewLabel}
        onAddNew={() => {
          // The field's text is a name only when the diver typed it; the label
          // of the person already picked is not one to file again.
          const text = textRef.current.trim();
          setNewName(text && text !== selected?.name ? text : "");
          setShowNewDialog(true);
        }}
      />

      <PersonDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSaved={handleCreated}
        initialName={newName}
      />
    </>
  );
}
