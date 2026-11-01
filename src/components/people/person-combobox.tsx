"use client";

import { useCallback, useRef, useState } from "react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import type { FormControlA11yProps } from "@/components/ui/form";
import type { Person } from "@/lib/api/people";
import { usePeopleByUuid } from "@/hooks/usePeopleByUuid";
import { PersonDialog } from "@/components/people/person-dialog";
import {
  personItem,
  usePersonPicker,
} from "@/components/people/use-person-picker";

export interface PersonComboboxProps extends FormControlA11yProps {
  value?: string | null;
  // `null`, not `undefined`, for "nobody", for the reason `TripCombobox` gives:
  // an edit form sends every field, and a cleared picker has to be a value.
  onChange: (personUuid: string | null) => void;
  // The date of the record being edited - see `TripCombobox.until`.
  until?: string;
  placeholder?: string;
  addNewLabel?: string;
  disabled?: boolean;
}

// Picks (or creates) one of the diver's people for a field that names one - a
// course's or a certification's instructor. The dropdown searches the people
// lookup server-side over name and username.
//
// A typed name nobody has becomes a person on Enter, so naming a new instructor
// is still type and Enter, as it was while the field was text. Leaving the field
// commits nothing, so a half-typed name is never filed.
export function PersonCombobox({
  value,
  onChange,
  until,
  placeholder = "Select a person...",
  addNewLabel = "Add person...",
  disabled,
  ...slotProps
}: PersonComboboxProps) {
  const { people, remember, search, createNamed } = usePersonPicker(until);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const textRef = useRef("");
  const trackText = useCallback((text: string) => {
    textRef.current = text;
  }, []);
  // The name for a `value` that arrived from the form, read only when no search
  // has answered it - as `PeopleMultiSelect` reads its rows.
  const resolved = usePeopleByUuid(value && !people[value] ? [value] : []);

  const handleCreated = (created: Person) => {
    remember(created);
    onChange(created.uuid);
  };

  const selected = value ? (people[value] ?? resolved[value]) : undefined;

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
