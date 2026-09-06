"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DIVE_FORM_ALWAYS_ON_FIELDS,
  DIVE_FORM_FIELD_GROUPS,
  DIVE_FORM_FIELD_REGISTRY,
  isMixtureField,
  type DiveFormFieldEntry,
  type DiveFormFieldGroup,
  type DiveFormFieldKey,
} from "@/lib/dive-form-fields";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";

/**
 * The hideable field a group lists ahead of everything else, where it has one.
 *
 * Only `mixtures` does. It is the switch that decides whether the Gas Mixtures section
 * is on the form at all, and every other row in that group is downstream of it - the
 * three always-on cylinder columns as much as the five per-cylinder ones, which this
 * list disables outright while it is off. Listing it after them would put the reason
 * they are unavailable below the rows it explains. It is the form's own order too: the
 * section exists before any cylinder in it does.
 *
 * The registry stays in form order for the guard's sake; presentation order is this
 * file's business, which is why the exception lives here and not beside it.
 */
const LEADING_GROUP_FIELD: Partial<
  Record<DiveFormFieldGroup, DiveFormFieldKey>
> = {
  "Gas mixtures": "mixtures",
};

/**
 * Every input the dive form can render, grouped as the form groups them, one switch
 * each.
 *
 * **A switch shows the _effective_ state and edits the _stored_ one.** Turning one on
 * stores the key visible; turning it off stores it hidden *and* drops it from the
 * revealed set, so a field an edit load put on screen can still be put away from here.
 * A key visible only because it was revealed says so beside its label.
 *
 * **The always-shown rows read like every other row** - same label colour, no note -
 * because the switch being on and unavailable is the whole of what marks them, and a
 * diver looking for Duration should find it where they would look rather than in a gap.
 */
export function DiveFormFieldSwitches({
  visibility,
}: {
  visibility: DiveFormVisibility;
}) {
  const toggleField = (key: DiveFormFieldKey, shouldShow: boolean) => {
    const next = new Set(visibility.hidden);
    if (shouldShow) next.delete(key);
    else next.add(key);
    visibility.setHidden([...next]);
  };

  const gasOnScreen = visibility.isVisible("mixtures");

  // The always-on rows carry no key, so their switches are identified by position in
  // the one list they come from - stable for as long as the list is, which is what an
  // id has to be.
  const alwaysOnRows = DIVE_FORM_ALWAYS_ON_FIELDS.map((entry, index) => ({
    entry,
    id: `dive-form-field-always-${index}`,
  }));

  const rowsFor = (group: DiveFormFieldGroup) => {
    const hideable = DIVE_FORM_FIELD_REGISTRY.filter(
      (entry) => entry.group === group,
    );
    const leadingKey = LEADING_GROUP_FIELD[group];
    return {
      leading: hideable.filter((entry) => entry.key === leadingKey),
      fields: hideable.filter((entry) => entry.key !== leadingKey),
      alwaysOn: alwaysOnRows.filter((row) => row.entry.group === group),
    };
  };

  const fieldRow = (entry: DiveFormFieldEntry) => {
    const fieldId = `dive-form-field-${entry.key}`;
    const perCylinder = isMixtureField(entry.key);
    const revealed =
      visibility.isHidden(entry.key) && visibility.isRevealed(entry.key);
    return (
      <div key={entry.key}>
        <div className="flex items-center gap-2">
          <Switch
            id={fieldId}
            checked={visibility.isVisible(entry.key)}
            // Per-cylinder switches keep their state while the section they
            // belong to is off screen, but there is nothing on screen for them
            // to govern, so they are not offered.
            disabled={perCylinder && !gasOnScreen}
            onCheckedChange={(next) => toggleField(entry.key, next)}
          />
          <Label htmlFor={fieldId} className="font-normal">
            {entry.label}
          </Label>
        </div>
        {revealed && (
          <p className="pl-11 text-xs text-muted-foreground">
            shown because it holds a value
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {DIVE_FORM_FIELD_GROUPS.map((group) => {
        const { leading, fields, alwaysOn } = rowsFor(group);
        if (leading.length + fields.length + alwaysOn.length === 0) return null;

        return (
          <fieldset key={group} className="space-y-3">
            <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group}
            </legend>
            {/* Two columns from `md` up. The rows are a switch and a short label, so
                one column per row leaves most of the dialog empty and makes the list
                long enough to scroll past what a diver came to change. Flows
                row-major, which keeps the reading order the form's order - the whole
                point of the grouping. */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {leading.map(fieldRow)}
              {alwaysOn.map(({ entry, id: rowId }) => (
                <div key={rowId} className="flex items-center gap-2">
                  <Switch id={rowId} checked disabled />
                  <Label htmlFor={rowId} className="font-normal">
                    {entry.label}
                  </Label>
                </div>
              ))}
              {fields.map(fieldRow)}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
