"use client";

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import { IconTooltip } from "@/components/ui/tooltip";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { NativeSelect } from "@/components/ui/native-select";
import type { FormControlSlotProps } from "@/components/ui/form";
import {
  PERSON_ROLES,
  personRoleLabel,
  type Person,
  type PersonReference,
  type PersonRole,
} from "@/lib/api/people";
import { usePeopleByUuid } from "@/hooks/usePeopleByUuid";
import { PersonDialog } from "@/components/people/person-dialog";
import { usePersonPicker } from "@/components/people/use-person-picker";

// The role control's option for a reference with no role, which means "was
// there". `""` because an `<option>` has to carry a string.
const NO_ROLE = "";

export interface PeopleMultiSelectProps extends FormControlSlotProps {
  // The people on the record, in the diver's order, each with their role.
  value: PersonReference[];
  onChange: (people: PersonReference[]) => void;
  // What a person added here starts as - the host's word for the common case: a
  // buddy on a dive, a student on a course, nothing on a trip. The diver changes
  // it on the row. See DECISIONS.md, "People take their host's role".
  defaultRole: PersonRole | null;
  // People to leave out of the menu because the host names them elsewhere - a
  // course's instructor, picked in a field of its own.
  excludeIds?: string[];
  placeholder?: string;
  disabled?: boolean;
}

// Picks the people on a dive, a trip or a course: an append-only list of rows,
// each carrying the person's name, their linked `@username` and a role control,
// above the one combobox that adds to it. The dropdown searches server-side
// over name and username, so typing either lists the person.
//
// Typing a name nobody has and pressing Enter adds a person of that name; "Add
// person..." opens the dialog, seeded with what was typed, for a username, an
// email or a phone.
export function PeopleMultiSelect({
  value,
  onChange,
  defaultRole,
  excludeIds,
  placeholder,
  disabled,
  // Forwarded to the "add a person" combobox - the field's one control a label
  // can name. The rows above it name their own controls.
  ...slotProps
}: PeopleMultiSelectProps) {
  const { people, remember, search, createNamed } = usePersonPicker();
  const [showNewDialog, setShowNewDialog] = useState(false);
  // What the field held when "Add..." was pressed, frozen for the dialog - the
  // shape `ContactCombobox` has, and for its reason.
  const [newName, setNewName] = useState("");
  const textRef = useRef("");
  const trackText = useCallback((text: string) => {
    textRef.current = text;
  }, []);

  // Names for the people already on the record that this picker has not seen in
  // a search - an edit form's, or a course's carried onto a new dive. One read
  // of the whole list for all of them rather than one per row, and only for the
  // uuids nothing here answers yet, so picking a row fetches nothing.
  const resolved = usePeopleByUuid(
    value
      .map((reference) => reference.person_uuid)
      .filter((uuid) => !people[uuid]),
  );
  const personFor = (uuid: string): Person | undefined =>
    people[uuid] ?? resolved[uuid];

  const addPerson = (uuid: string | undefined) => {
    if (
      uuid === undefined ||
      value.some((reference) => reference.person_uuid === uuid)
    ) {
      return;
    }
    onChange([...value, { person_uuid: uuid, role: defaultRole }]);
  };

  const setRole = (uuid: string, role: string | null) =>
    onChange(
      value.map((reference) =>
        reference.person_uuid === uuid ? { ...reference, role } : reference,
      ),
    );

  const removePerson = (uuid: string) =>
    onChange(value.filter((reference) => reference.person_uuid !== uuid));

  const handleCreated = (person: Person) => {
    remember(person);
    addPerson(person.uuid);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((reference) => {
            const person = personFor(reference.person_uuid);
            // The fallback is only ever visible for the moment between a person
            // being on the list and their name being read.
            const label = person ? person.name : "Person...";
            const role = reference.role ?? NO_ROLE;
            const knownRole = (PERSON_ROLES as readonly string[]).includes(
              role,
            );
            return (
              <li
                key={reference.person_uuid}
                className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {label}
                  {person?.username && (
                    <span className="text-muted-foreground">
                      {" "}
                      @{person.username}
                    </span>
                  )}
                </span>
                <div className="w-32 shrink-0 sm:w-36">
                  <NativeSelect
                    aria-label={`Role of ${label}`}
                    className="h-9"
                    value={role}
                    disabled={disabled}
                    onChange={(event) =>
                      setRole(
                        reference.person_uuid,
                        event.target.value === NO_ROLE
                          ? null
                          : event.target.value,
                      )
                    }
                  >
                    <option value={NO_ROLE}>No role</option>
                    {PERSON_ROLES.map((option) => (
                      <option key={option} value={option}>
                        {personRoleLabel(option)}
                      </option>
                    ))}
                    {/* A role a newer API stored that this build has no word
                        for is kept, and offered as itself, rather than read as
                        "No role" and cleared by the next save. */}
                    {role !== NO_ROLE && !knownRole && (
                      <option value={role}>{personRoleLabel(role)}</option>
                    )}
                  </NativeSelect>
                </div>
                <IconTooltip label={`Remove ${label}`}>
                  <button
                    type="button"
                    disabled={disabled}
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => removePerson(reference.person_uuid)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </IconTooltip>
              </li>
            );
          })}
        </ul>
      )}

      <CreatableCombobox
        {...slotProps}
        onSearch={search}
        // Already-listed people are hidden from the menu so nobody is added
        // twice - after the search rather than in it, as the site picker does,
        // so `has_more` keeps its meaning.
        excludeIds={[
          ...value.map((reference) => reference.person_uuid),
          ...(excludeIds ?? []),
        ]}
        value={undefined}
        onChange={addPerson}
        onTextChange={trackText}
        onCreate={createNamed}
        disabled={disabled}
        placeholder={
          placeholder ??
          (value.length ? "Add another person..." : "Select a person...")
        }
        noItemsLabel="No people yet. Type a name and press Enter to add one."
        noMatchesLabel="Nobody matches. Press Enter to add a person of that name."
        searchErrorLabel="Search is unavailable right now. Press Enter to add a person of that name."
        addNewLabel="Add person..."
        keepOpenOnSelect
        onAddNew={() => {
          setNewName(textRef.current.trim());
          setShowNewDialog(true);
        }}
      />

      <PersonDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSaved={handleCreated}
        initialName={newName}
      />
    </div>
  );
}
