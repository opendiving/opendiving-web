"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { IconTooltip } from "@/components/ui/tooltip";
import {
  CreatableCombobox,
  type ComboboxItem,
} from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import { TAG_NAME_MAX, tagKey } from "@/lib/api/tags";
import { useTags } from "@/hooks/useTags";

export interface TagsMultiSelectProps extends FormControlSlotProps {
  /** The dive's or the site's tags by name, in the diver's order. */
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

// A tag as a menu row. Its name is its id: the form holds names, and a pick hands
// back the stored spelling for the record to carry.
const tagItem = (name: string): ComboboxItem => ({ id: name, name });

// The API's bound, counted in code points as it counts them - what `tagsField`
// checks again on submit for a tag that arrived some other way.
const tagNameError = (name: string): string | null =>
  [...name.trim()].length > TAG_NAME_MAX
    ? `A tag can be at most ${TAG_NAME_MAX} characters`
    : null;

/**
 * Picks a dive's tags, or a dive site's - one vocabulary serves both: the ones
 * already on it as a row of chips, each with its own remove button, above the
 * combobox that adds to them.
 *
 * The menu completes from every tag the diver has, filtered here as they type -
 * a diver keeps a handful, so the whole vocabulary is one read and needs no
 * search round trip. Typing a name that is not among them and pressing Enter
 * adds it as typed, with nothing sent: the dive or site write creates the tag.
 * A name the API would refuse is not added: it stays in the field with the
 * reason under it, to be corrected.
 *
 * **The match is advisory.** Typing `NIGHT` beside a stored `night` picks the
 * stored spelling, and a name already on the record in any case is not added
 * twice - but this compares lowercased, and the API compares Unicode
 * case-folded, so where the two disagree the API decides and the chip takes its
 * spelling once the record is saved.
 */
export function TagsMultiSelect({
  value,
  onChange,
  disabled,
  // Forwarded to the combobox - the field's one control a label can name. The
  // chips above it name their own remove buttons.
  ...slotProps
}: TagsMultiSelectProps) {
  const { tags } = useTags();

  const items = useMemo(
    () => (tags ?? []).map((tag) => tagItem(tag.name)),
    [tags],
  );

  // Every stored tag the record already carries in some spelling, so the menu
  // stops offering it the moment it is picked or typed.
  const excludeIds = useMemo(() => {
    const carried = new Set(value.map(tagKey));
    return items
      .filter((item) => carried.has(tagKey(item.name)))
      .map((item) => item.id);
  }, [items, value]);

  const addTag = (name: string | undefined) => {
    const trimmed = name?.trim();
    if (!trimmed || value.some((tag) => tagKey(tag) === tagKey(trimmed))) {
      return;
    }
    onChange([...value, trimmed]);
  };

  // Resolves at once: the record's write is what creates the tag, so the picker only
  // has to hand the name on.
  const createNamed = async (name: string) => tagItem(name.trim());

  const removeTag = (name: string) =>
    onChange(value.filter((tag) => tag !== name));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((name) => (
            <li
              key={name}
              className="flex items-center rounded-md border border-transparent bg-teal pl-3 text-sm text-teal-foreground"
            >
              <span className="min-w-0 break-all">{name}</span>
              <IconTooltip label={`Remove ${name}`}>
                <button
                  type="button"
                  disabled={disabled}
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center text-teal-foreground/80 touch:tap-target hover:text-teal-foreground"
                  onClick={() => removeTag(name)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </IconTooltip>
            </li>
          ))}
        </ul>
      )}

      <CreatableCombobox
        {...slotProps}
        items={items}
        excludeIds={excludeIds}
        value={undefined}
        onChange={addTag}
        onCreate={createNamed}
        validateCreate={tagNameError}
        disabled={disabled}
        placeholder={value.length ? "Add another tag..." : "Add a tag..."}
        noItemsLabel="No tags yet. Type one and press Enter to add it."
        noMatchesLabel="No tag matches. Press Enter to add it."
        keepOpenOnSelect
      />
    </div>
  );
}
