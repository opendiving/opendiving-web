"use client";

import { CardHeader, CardTitle } from "@/components/ui/card";
import { EditControl } from "@/components/ui/edit-control";
import { DiveSectionIcon } from "@/components/dives/dive-section-icon";
import type { DiveFormFieldGroup } from "@/lib/dive-form-fields";

interface DiveCardHeaderProps {
  /** The dive form's section the card shows, which names its glyph. */
  group: DiveFormFieldGroup;
  title: string;
  /** Opens the section's edit dialog; absent, the card has no control. */
  onEdit?: () => void;
}

// A dive page card's heading, set as the form's section heading is: the title on the
// card's own padding, and the pencil's glyph centred where the section's chevron is.
// The button is square and overhangs the title's line by its lift above and below,
// so it never sets the heading's height, and overhangs the padding on the right by
// half of what it is wider than the chevron's 20px - 36px, or 44px on touch.
export function DiveCardHeader({ group, title, onEdit }: DiveCardHeaderProps) {
  return (
    <CardHeader>
      <div className="flex items-center justify-between gap-2">
        <CardTitle as="h2" className="flex items-center gap-2">
          <DiveSectionIcon group={group} />
          {title}
        </CardTitle>
        {onEdit && (
          <EditControl
            label={`Edit ${title.toLowerCase()}`}
            className="-my-(--card-title-lift) -mr-2 w-9 px-0 touch:-mr-3"
            onClick={onEdit}
          />
        )}
      </div>
    </CardHeader>
  );
}
