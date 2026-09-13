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
 * What every switch's label wears, in place of `Label`'s own `leading-none`.
 *
 * At 14px that line box is 14px and the text's ink is 17px, so anything with a
 * descender hangs ~1.5px below the element's own box. That is invisible until
 * the box is *painted on its own*, which is what a row whose switch is
 * `disabled` arranges: `Label` dims itself through `peer-disabled:opacity-70`,
 * and iOS rasterises an opacity layer to the element's box and throws away what
 * pokes out of it. The subscript in "O₂" came back with its bottom sliced off
 * flat, while the identical glyph one row down in "ppO₂ limit" - enabled, so
 * never composited - was untouched. "Volume" beside it is dimmed too and looked
 * fine, having nothing below the baseline to lose, which is what makes this
 * read as a font bug rather than a layout one.
 *
 * `leading-5` is 20px, which contains the ink and is exactly the switch's `h-5`,
 * so no row in this list changes height by gaining it.
 */
const SWITCH_LABEL = "font-normal leading-5";

/**
 * The hideable field a group lists ahead of everything else, where it has one.
 *
 * Only `mixtures` does. It is the switch that decides whether the Gas Mixtures section
 * is on the form at all, and every other row in that group is downstream of it - the
 * always-on cylinder columns as much as the per-cylinder ones, which this list disables
 * outright while it is off. Listing it after them would put the reason
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
          <Label htmlFor={fieldId} className={SWITCH_LABEL}>
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
    // Two columns from `md` up, and it is the *sections* that are dealt into them:
    // a section's own switches stay stacked, so a group still reads as one list top
    // to bottom rather than as a pair of half-lists to scan across.
    //
    // CSS multi-column rather than a grid, because the sections are wildly different
    // heights - one row under "Species", nine under "Gas mixtures" - and a grid would
    // make every row as tall as its tallest cell and leave the short sections sitting
    // in holes. Multi-column packs by height instead. `break-inside-avoid` is what
    // stops a section being split down the middle of itself, which is the one thing
    // this layout must never do; the margin is per-section rather than `space-y-*` on
    // the parent, since a top margin at the head of a column would misalign it.
    <div className="md:columns-2 md:gap-8">
      {DIVE_FORM_FIELD_GROUPS.map((group) => {
        const { leading, fields, alwaysOn } = rowsFor(group);
        if (leading.length + fields.length + alwaysOn.length === 0) return null;

        return (
          <fieldset
            key={group}
            className="mb-6 space-y-3 break-inside-avoid last:mb-0"
          >
            <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group}
            </legend>
            {leading.map(fieldRow)}
            {alwaysOn.map(({ entry, id: rowId }) => (
              <div key={rowId} className="flex items-center gap-2">
                <Switch id={rowId} checked disabled />
                <Label htmlFor={rowId} className={SWITCH_LABEL}>
                  {entry.label}
                </Label>
              </div>
            ))}
            {fields.map(fieldRow)}
          </fieldset>
        );
      })}
    </div>
  );
}
